import re
import uuid
from email import policy
from email.parser import BytesParser
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, asc, desc, func, or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.config import UPLOAD_DIR
from app.database.session import get_db
from app.models.book import BookListing
from app.models.book_request import BookRequest
from app.models.review import Review
from app.models.user import User, UserProfile
from app.schemas.book import BookResponse, BookSearchResponse, BookSeller
from app.schemas.listing import ListingCreate, ListingUpdate
from app.services.statistics import sync_user_profile_stats

router = APIRouter(prefix="/api/v1/books", tags=["Books & Discovery"])

CONDITION_LABELS = {
    "like_new": "Like New",
    "good": "Good",
    "worn": "Worn / Usable",
}
LISTING_LABELS = {
    "sell": "For Sale",
    "exchange": "Exchange",
    "donate": "Free Donation",
    "lend": "For Lending",
}

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


def _validate_image_bytes(data: bytes) -> tuple[bool, str]:
    """Check file magic bytes to ensure valid image format (JPEG, PNG, WebP)."""
    if len(data) < 12:
        return False, "File is too small to be a valid image."
    if data.startswith(b"\xff\xd8\xff"):
        return True, ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return True, ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True, ".webp"
    return False, "Unsupported file format. Please upload a valid JPEG, PNG, or WebP image."


def _review_summaries(db: Session, user_ids: list[str]) -> dict[str, tuple[Optional[float], int]]:
    if not user_ids:
        return {}
    rows = db.query(
        Review.reviewed_user_id,
        func.avg(Review.rating),
        func.count(Review.id),
    ).filter(Review.reviewed_user_id.in_(user_ids)).group_by(Review.reviewed_user_id).all()
    return {user_id: (round(float(average), 2), count) for user_id, average, count in rows}


def serialize_book(book: BookListing, review_summaries: Optional[dict[str, tuple[Optional[float], int]]] = None) -> BookResponse:
    seller = None
    if book.seller:
        profile = book.seller.profile
        trust_score, reviews_count = (review_summaries or {}).get(book.seller.id, (None, 0))
        seller = BookSeller(
            id=book.seller.id,
            name=profile.full_name if profile else book.seller.email,
            city=profile.city if profile else None,
            university=profile.university if profile else None,
            course=profile.course if profile else None,
            year=profile.year if profile else None,
            trust_score=trust_score,
            reviews_count=reviews_count,
            avatar_emoji=profile.avatar_emoji if profile else "👨‍🎓",
        )

    return BookResponse(
        id=book.id,
        title=book.title,
        author=book.author,
        isbn=book.isbn,
        edition=book.edition,
        course=book.course,
        course_code=book.course_code,
        category=book.category,
        condition=book.condition,
        condition_label=CONDITION_LABELS.get(book.condition, book.condition.title()),
        listing_type=book.listing_type,
        listing_type_label=LISTING_LABELS.get(book.listing_type, book.listing_type.title()),
        status=book.status,
        price=book.price,
        price_unit=book.price_unit,
        original_price=book.original_price,
        description=book.description,
        image_urls=book.image_urls or [],
        cover_gradient=book.cover_gradient,
        distance_km=book.distance_km,
        listing_city=book.listing_city,
        safe_meeting_point=book.safe_meeting_point,
        latitude=book.latitude,
        longitude=book.longitude,
        exchange_wish=book.exchange_wish,
        is_seed_data=book.is_seed_data,
        created_at=book.created_at,
        seller=seller,
    )


@router.get("", response_model=BookSearchResponse)
def search_books(
    q: Optional[str] = Query(default=None, min_length=1),
    listing_type: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    condition: Optional[str] = Query(default=None),
    city: Optional[str] = Query(default=None),
    location: Optional[str] = Query(default=None),
    sort: str = Query(default="newest", pattern="^(newest|nearest|price-low|price-high|rating)$"),
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(BookListing).filter(BookListing.status == "active").options(
        joinedload(BookListing.seller).joinedload(User.profile)
    )

    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(
            BookListing.title.ilike(term),
            BookListing.author.ilike(term),
            BookListing.isbn.ilike(term),
            BookListing.course.ilike(term),
            BookListing.course_code.ilike(term),
            BookListing.category.ilike(term),
        ))
    if listing_type and listing_type != "all":
        query = query.filter(BookListing.listing_type == listing_type)
    if category and category != "all":
        cat_key = category.strip().lower()
        CATEGORY_ALIASES = {
            "electrical and electronics": ["Electrical and Electronics", "ece-ee", "electrical & electronics"],
            "mechanical and civil": ["Mechanical and Civil", "mech-civil", "mechanical & civil"],
            "medical and health": ["Medical and Health", "Medical&Health", "medical", "medical & health"],
            "commerce": ["Commerce", "commerce", "commerce & mba"],
            "gate": ["GATE", "GATE&Exams", "exams", "gate & exams"],
            "other": ["Other", "other", "Engineering", "cse", "Computer Science", "Others", "General"],
        }
        if cat_key in CATEGORY_ALIASES:
            aliases = CATEGORY_ALIASES[cat_key]
            query = query.filter(or_(*[func.lower(BookListing.category) == a.lower() for a in aliases]))
        else:
            query = query.filter(func.lower(BookListing.category) == cat_key)
    if condition and condition != "all":
        query = query.filter(BookListing.condition == condition)

    if city and city.strip():
        # Exact city match (case-insensitive) on listing_city or seller's profile city
        clean_city = city.strip()
        query = query.outerjoin(BookListing.seller).outerjoin(User.profile).filter(
            or_(
                func.lower(BookListing.listing_city) == clean_city.lower(),
                and_(
                    BookListing.listing_city.is_(None),
                    or_(
                        func.lower(UserProfile.city) == clean_city.lower(),
                        func.lower(BookListing.safe_meeting_point) == clean_city.lower(),
                    )
                )
            )
        )

    if location and location.strip():
        raw_loc = location.strip()
        parts = [p.strip() for p in re.split(r"[,;/]+", raw_loc) if p.strip()]
        if not parts:
            parts = [raw_loc]

        part_conditions = []
        for p in parts:
            pattern = f"%{p}%"
            part_conditions.append(or_(
                BookListing.safe_meeting_point.ilike(pattern),
                UserProfile.location.ilike(pattern),
                UserProfile.university.ilike(pattern),
            ))
        query = query.outerjoin(BookListing.seller).outerjoin(User.profile).filter(and_(*part_conditions))

    if sort == "nearest":
        query = query.order_by(asc(BookListing.distance_km).nullslast(), desc(BookListing.created_at))
    elif sort == "price-low":
        query = query.order_by(asc(BookListing.price).nullslast(), desc(BookListing.created_at))
    elif sort == "price-high":
        query = query.order_by(desc(BookListing.price).nullslast(), desc(BookListing.created_at))
    elif sort == "rating":
        review_averages = db.query(
            Review.reviewed_user_id.label("user_id"),
            func.avg(Review.rating).label("average_rating"),
        ).group_by(Review.reviewed_user_id).subquery()
        query = query.outerjoin(review_averages, review_averages.c.user_id == BookListing.seller_id).order_by(
            desc(review_averages.c.average_rating).nullslast(), desc(BookListing.created_at)
        )
    else:
        query = query.order_by(desc(BookListing.created_at))

    total = query.order_by(None).count()
    books = query.offset(offset).limit(limit).all()
    categories = [row[0] for row in db.query(BookListing.category).distinct().order_by(BookListing.category).all()]
    summaries = _review_summaries(db, list({book.seller_id for book in books if book.seller_id}))
    return BookSearchResponse(items=[serialize_book(book, summaries) for book in books], total=total, categories=categories)


@router.post("/upload-image")
async def upload_book_image(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Upload a book photo directly with file type and size validation."""
    content_type = request.headers.get("content-type", "").lower()
    body = await request.body()

    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty request body. Please select an image to upload."
        )

    if len(body) > MAX_IMAGE_SIZE + 65536:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image file size exceeds maximum allowed limit (5 MB)."
        )

    raw_bytes = None
    if "multipart/form-data" in content_type:
        raw_msg = f"Content-Type: {request.headers.get('content-type')}\r\n\r\n".encode("utf-8") + body
        msg = BytesParser(policy=policy.default).parsebytes(raw_msg)
        for part in msg.iter_parts():
            part_bytes = part.get_payload(decode=True)
            if part_bytes:
                raw_bytes = part_bytes
                break
    else:
        raw_bytes = body

    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No image data found in upload. Please select a photo."
        )

    if len(raw_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image file size exceeds maximum allowed limit (5 MB)."
        )

    valid, ext_or_err = _validate_image_bytes(raw_bytes)
    if not valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ext_or_err)

    extension = ext_or_err
    books_upload_dir = UPLOAD_DIR / "books"
    books_upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{extension}"
    file_path = books_upload_dir / filename

    with open(file_path, "wb") as f:
        f.write(raw_bytes)

    return {"image_url": f"/uploads/books/{filename}"}


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)):
    return [row[0] for row in db.query(BookListing.category).distinct().order_by(BookListing.category).all()]


@router.get("/mine", response_model=list[BookResponse])
def list_my_books(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    books = (
        db.query(BookListing)
        .options(joinedload(BookListing.seller).joinedload(User.profile))
        .filter(BookListing.seller_id == current_user.id, BookListing.status != "deleted")
        .order_by(desc(BookListing.created_at))
        .all()
    )
    summaries = _review_summaries(db, list({book.seller_id for book in books if book.seller_id}))
    return [serialize_book(book, summaries) for book in books]


@router.post("", response_model=BookResponse, status_code=201)
def create_listing(
    listing_in: ListingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = listing_in.model_dump()
    if data.get("listing_type") in ["donate", "exchange"]:
        data["price"] = 0
        data["price_unit"] = None
    # Normalize listing_city
    if not data.get("listing_city"):
        # Check safe_meeting_point or user profile city
        loc = data.get("safe_meeting_point") or ""
        # If comma-separated (e.g. "Raikot, Ludhiana"), last part is often city or whole thing
        if loc:
            parts = [p.strip() for p in loc.split(",") if p.strip()]
            data["listing_city"] = parts[-1] if len(parts) > 1 else parts[0]
        elif current_user.profile and current_user.profile.city:
            data["listing_city"] = current_user.profile.city
    listing = BookListing(**data, seller_id=current_user.id, is_seed_data=False, status="active")
    db.add(listing)
    db.commit()
    db.refresh(listing)
    listing.seller = current_user
    summaries = _review_summaries(db, [current_user.id])
    return serialize_book(listing, summaries)


@router.put("/{book_id}", response_model=BookResponse)
def update_listing(
    book_id: str,
    listing_in: ListingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = db.query(BookListing).filter(BookListing.id == book_id, BookListing.seller_id == current_user.id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    status_changed = "status" in listing_in.model_dump(exclude_unset=True)
    update_data = listing_in.model_dump(exclude_unset=True)
    if update_data.get("listing_type") in ["donate", "exchange"]:
        update_data["price"] = 0
        update_data["price_unit"] = None
    if "listing_city" not in update_data and "safe_meeting_point" in update_data:
        loc = update_data.get("safe_meeting_point") or ""
        if loc:
            parts = [p.strip() for p in loc.split(",") if p.strip()]
            update_data["listing_city"] = parts[-1] if len(parts) > 1 else parts[0]
    for field, value in update_data.items():
        setattr(listing, field, value)
    if listing.listing_type in ["donate", "exchange"]:
        listing.price = 0
        listing.price_unit = None
    if (listing.latitude is None) != (listing.longitude is None):
        raise HTTPException(status_code=422, detail="Both approximate coordinates are required")
    if listing.latitude is not None and not listing.safe_meeting_point:
        raise HTTPException(status_code=422, detail="Set a safe public meeting point when providing coordinates")
    if status_changed:
        if listing.status in ["donated", "exchanged", "lent", "sold"]:
            open_requests = db.query(BookRequest).filter(
                BookRequest.book_id == listing.id,
                BookRequest.status.in_(["accepted", "pending"])
            ).all()
            for req in open_requests:
                req.status = "completed"
        sync_user_profile_stats(db, current_user.id)
    db.commit()
    db.refresh(listing)
    listing.seller = current_user
    summaries = _review_summaries(db, [current_user.id])
    return serialize_book(listing, summaries)


@router.delete("/{book_id}", status_code=204)
def delete_listing(
    book_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = db.query(BookListing).filter(BookListing.id == book_id, BookListing.seller_id == current_user.id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    db.delete(listing)
    db.commit()


@router.get("/{book_id}", response_model=BookResponse)
def get_book(book_id: str, db: Session = Depends(get_db)):
    book = (
        db.query(BookListing)
        .options(joinedload(BookListing.seller).joinedload(User.profile))
        .filter(BookListing.id == book_id)
        .first()
    )
    if not book:
        raise HTTPException(status_code=404, detail="Book listing not found")
    summaries = _review_summaries(db, [book.seller_id] if book.seller_id else [])
    return serialize_book(book, summaries)
