from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.book import BookListing
from app.models.book_request import BookRequest
from app.models.user import User
from app.models.wishlist import WishlistItem
from app.services.notifications import create_notification
from app.schemas.phase5 import (
    BookRequestResponse,
    LibraryItemResponse,
    RequestCreate,
    RequestStatusUpdate,
    WishlistBookResponse,
)

router = APIRouter(prefix="/api/v1", tags=["Wishlist, Requests & Library"])
REQUEST_TRANSITIONS = {
    "pending": {"accepted", "rejected", "cancelled"},
    "accepted": {"completed", "cancelled"},
    "rejected": set(),
    "cancelled": set(),
    "completed": set(),
}
TERMINAL_LISTING_STATUS = {"sell": "sold", "exchange": "exchanged", "donate": "donated", "lend": "lent"}
LISTING_LABELS = {"sell": "For Sale", "exchange": "Exchange", "donate": "Free Donation", "lend": "For Lending"}


def _request_query(db: Session):
    return db.query(BookRequest).options(
        joinedload(BookRequest.book).joinedload(BookListing.seller).joinedload(User.profile),
        joinedload(BookRequest.requester).joinedload(User.profile),
    )


def _request_response(request: BookRequest, current_user: User) -> BookRequestResponse:
    book = request.book
    owner = book.seller
    requester = request.requester
    owner_profile = owner.profile if owner else None
    requester_profile = requester.profile
    return BookRequestResponse(
        id=request.id,
        book_id=book.id,
        title=book.title,
        author=book.author,
        listing_type=book.listing_type,
        status=request.status,
        message=request.message,
        requester_id=requester.id,
        requester_name=requester_profile.full_name if requester_profile else requester.email,
        owner_id=owner.id if owner else "",
        owner_name=owner_profile.full_name if owner_profile else (owner.email if owner else "Unavailable"),
        direction="outgoing" if request.requester_id == current_user.id else "incoming",
        created_at=request.created_at,
    )


def _wishlist_response(item: WishlistItem, book: BookListing) -> WishlistBookResponse:
    return WishlistBookResponse(
        id=item.id, book_id=book.id, title=book.title, author=book.author,
        listing_type=book.listing_type, listing_type_label=LISTING_LABELS.get(book.listing_type, book.listing_type.title()),
        status=book.status, price=book.price, condition=book.condition, category=book.category,
        is_available=book.status == "active", is_seed_data=book.is_seed_data, created_at=item.created_at,
    )


@router.get("/wishlist", response_model=list[WishlistBookResponse])
def get_wishlist(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(WishlistItem, BookListing)
        .join(BookListing, WishlistItem.book_id == BookListing.id)
        .filter(WishlistItem.user_id == current_user.id)
        .order_by(WishlistItem.created_at.desc())
        .all()
    )
    return [_wishlist_response(item, book) for item, book in rows]


@router.post("/wishlist/{book_id}", response_model=WishlistBookResponse, status_code=status.HTTP_201_CREATED)
def add_to_wishlist(book_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    book = db.query(BookListing).filter(BookListing.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book listing not found")
    item = db.query(WishlistItem).filter_by(user_id=current_user.id, book_id=book_id).first()
    if item:
        raise HTTPException(status_code=409, detail="Book is already in your wishlist")
    item = WishlistItem(user_id=current_user.id, book_id=book_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _wishlist_response(item, book)


@router.delete("/wishlist/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_wishlist(book_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(WishlistItem).filter_by(user_id=current_user.id, book_id=book_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Wishlist item not found")
    db.delete(item)
    db.commit()


@router.get("/requests", response_model=list[BookRequestResponse])
def list_requests(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = _request_query(db).join(BookListing).filter(
        (BookRequest.requester_id == current_user.id) | (BookListing.seller_id == current_user.id)
    ).order_by(BookRequest.created_at.desc()).all()
    return [_request_response(row, current_user) for row in rows]


@router.post("/books/{book_id}/requests", response_model=BookRequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(book_id: str, payload: RequestCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    book = db.query(BookListing).filter(BookListing.id == book_id, BookListing.status == "active").first()
    if not book:
        raise HTTPException(status_code=404, detail="Active book listing not found")
    if book.seller_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot request your own listing")
    existing = db.query(BookRequest).filter(
        BookRequest.book_id == book_id,
        BookRequest.requester_id == current_user.id,
        BookRequest.status.in_(["pending", "accepted"]),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You already have an open request for this listing")
    request = BookRequest(book_id=book.id, requester_id=current_user.id, message=payload.message)
    db.add(request)
    create_notification(
        db,
        book.seller_id,
        "book_request",
        "New book request",
        f"{current_user.profile.full_name if current_user.profile else current_user.email} requested {book.title}.",
        book_id=book.id,
        request_id=request.id,
    )
    db.commit()
    request = _request_query(db).filter(BookRequest.id == request.id).first()
    return _request_response(request, current_user)


@router.patch("/requests/{request_id}", response_model=BookRequestResponse)
def update_request(request_id: str, payload: RequestStatusUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    request = _request_query(db).filter(BookRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Book request not found")
    is_owner = request.book.seller_id == current_user.id
    is_requester = request.requester_id == current_user.id
    if payload.status in {"accepted", "rejected", "completed"} and not is_owner:
        raise HTTPException(status_code=403, detail="Only the listing owner can perform this action")
    if payload.status == "cancelled" and not is_requester:
        raise HTTPException(status_code=403, detail="Only the requester can cancel this request")
    if payload.status not in REQUEST_TRANSITIONS[request.status]:
        raise HTTPException(status_code=409, detail=f"Cannot change request from {request.status} to {payload.status}")
    if payload.status == "accepted":
        if request.book.status != "active":
            raise HTTPException(status_code=409, detail="This listing is no longer available")
        other_accepted = db.query(BookRequest).filter(
            BookRequest.book_id == request.book_id,
            BookRequest.status == "accepted",
            BookRequest.id != request.id,
        ).first()
        if other_accepted:
            raise HTTPException(status_code=409, detail="Another request has already been accepted")
        competing = db.query(BookRequest).filter(
            BookRequest.book_id == request.book_id,
            BookRequest.status == "pending",
            BookRequest.id != request.id,
        ).all()
        for competing_request in competing:
            competing_request.status = "rejected"
            create_notification(
                db,
                competing_request.requester_id,
                "request_rejected",
                "Book request update",
                f"Another request was accepted for {request.book.title}.",
                book_id=request.book_id,
                request_id=competing_request.id,
            )
    request.status = payload.status
    if payload.status == "completed":
        request.book.status = TERMINAL_LISTING_STATUS[request.book.listing_type]
    notification_user_id = request.requester_id if is_owner else request.book.seller_id
    notification_titles = {
        "accepted": "Book request accepted",
        "rejected": "Book request declined",
        "cancelled": "Book request cancelled",
        "completed": "Book handoff completed",
    }
    create_notification(
        db,
        notification_user_id,
        f"request_{payload.status}",
        notification_titles[payload.status],
        f"The request for {request.book.title} is now {payload.status}.",
        book_id=request.book_id,
        request_id=request.id,
    )
    db.commit()
    db.refresh(request)
    return _request_response(request, current_user)


@router.get("/library", response_model=list[LibraryItemResponse])
def get_library(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    library = []
    listings = db.query(BookListing).filter(BookListing.seller_id == current_user.id, BookListing.status != "deleted").all()
    for book in listings:
        category = {
            "active": "listed", "paused": "listed", "sold": "sold",
            "exchanged": "exchanged", "donated": "donated", "lent": "lent",
        }.get(book.status)
        if category:
            library.append(LibraryItemResponse(
                book_id=book.id, title=book.title, author=book.author, category=category,
                status=book.status, listing_type=book.listing_type, is_seed_data=book.is_seed_data,
                created_at=book.created_at,
            ))
    completed_requests = _request_query(db).filter(
        BookRequest.requester_id == current_user.id,
        BookRequest.status == "completed",
    ).all()
    for request in completed_requests:
        category = {"sell": "owned", "exchange": "exchanged", "donate": "donated", "lend": "borrowed"}[request.book.listing_type]
        owner = request.book.seller
        library.append(LibraryItemResponse(
            book_id=request.book.id, title=request.book.title, author=request.book.author,
            category=category, status=request.status, listing_type=request.book.listing_type,
            request_id=request.id, other_student=owner.profile.full_name if owner and owner.profile else None,
            is_seed_data=request.book.is_seed_data, created_at=request.created_at,
        ))
    return library