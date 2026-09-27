from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, or_
from sqlalchemy.orm import Session, joinedload

from app.database.session import get_db
from app.models.book import BookListing
from app.models.user import User, UserProfile
from app.models.review import Review
from app.api.deps import get_current_user
from app.schemas.book import BookResponse, BookSearchResponse, BookSeller
from app.schemas.listing import ListingCreate, ListingUpdate

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
        query = query.filter(BookListing.category == category)
    if condition and condition != "all":
        query = query.filter(BookListing.condition == condition)

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
    listing = BookListing(**listing_in.model_dump(), seller_id=current_user.id, is_seed_data=False, status="active")
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
    for field, value in listing_in.model_dump(exclude_unset=True).items():
        setattr(listing, field, value)
    if (listing.latitude is None) != (listing.longitude is None):
        raise HTTPException(status_code=422, detail="Both approximate coordinates are required")
    if listing.latitude is not None and not listing.safe_meeting_point:
        raise HTTPException(status_code=422, detail="Set a safe public meeting point when providing coordinates")
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
