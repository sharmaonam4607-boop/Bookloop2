from sqlalchemy.orm import Session

from app.models.book import BookListing
from app.models.book_request import BookRequest
from app.models.user import User


def sync_user_profile_stats(db: Session, user_id: str | None) -> None:
    """
    Recalculates and updates the persisted UserProfile statistics in the database
    (books_shared, books_donated, books_exchanged, books_lent, books_sold)
    for the given user based on completed book handoffs and terminal listings.
    """
    if not user_id:
        return
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.profile:
        return

    # 1. Completed requests where this user is the listing owner
    completed_requests = (
        db.query(BookRequest, BookListing)
        .join(BookListing, BookRequest.book_id == BookListing.id)
        .filter(BookRequest.status == "completed", BookListing.seller_id == user_id)
        .all()
    )
    completed_book_ids = {req.book_id for req, _ in completed_requests}

    # 2. Standalone listings marked terminal directly by this seller
    terminal_listings = (
        db.query(BookListing)
        .filter(
            BookListing.seller_id == user_id,
            BookListing.status.in_(["donated", "exchanged", "lent", "sold"]),
            ~BookListing.id.in_(completed_book_ids) if completed_book_ids else True,
        )
        .all()
    )

    donated = (
        sum(1 for _req, book in completed_requests if book.listing_type == "donate")
        + sum(1 for b in terminal_listings if b.status == "donated" or b.listing_type == "donate")
    )
    exchanged = (
        sum(1 for _req, book in completed_requests if book.listing_type == "exchange")
        + sum(1 for b in terminal_listings if b.status == "exchanged" or b.listing_type == "exchange")
    )
    lent = (
        sum(1 for _req, book in completed_requests if book.listing_type == "lend")
        + sum(1 for b in terminal_listings if b.status == "lent" or b.listing_type == "lend")
    )
    sold = (
        sum(1 for _req, book in completed_requests if book.listing_type == "sell")
        + sum(1 for b in terminal_listings if b.status == "sold" or b.listing_type == "sell")
    )

    user.profile.books_donated = donated
    user.profile.books_exchanged = exchanged
    if hasattr(user.profile, "books_lent"):
        user.profile.books_lent = lent
    user.profile.books_sold = sold
    user.profile.books_shared = donated + exchanged + lent + sold
