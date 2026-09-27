from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.book import BookListing
from app.models.book_request import BookRequest
from app.models.community import Community, CommunityBook, CommunityMembership, CommunityPost
from app.models.review import Review
from app.models.user import User
from app.schemas.phase9 import (
    EligibleReview,
    ImpactSummary,
    PersonalImpact,
    ReviewCreate,
    ReviewResponse,
    ReviewSummary,
)

router = APIRouter(tags=["Trust, Reviews & Impact"])


def _display_name(user: User) -> str:
    return user.profile.full_name if user.profile else user.email


def _review_response(review: Review) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        request_id=review.request_id,
        reviewed_user_id=review.reviewed_user_id,
        reviewer_name=_display_name(review.reviewer),
        rating=review.rating,
        comment=review.comment,
        book_title=review.request.book.title,
        created_at=review.created_at,
    )


@router.get("/api/v1/reviews/eligible", response_model=list[EligibleReview])
def eligible_reviews(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    requests = db.query(BookRequest).options(
        joinedload(BookRequest.book).joinedload(BookListing.seller).joinedload(User.profile),
        joinedload(BookRequest.requester).joinedload(User.profile),
    ).join(BookListing).filter(
        BookRequest.status == "completed",
        or_(BookRequest.requester_id == current_user.id, BookListing.seller_id == current_user.id),
    ).order_by(BookRequest.updated_at.desc()).all()

    eligible = []
    for request in requests:
        if request.requester_id == current_user.id:
            other = request.book.seller
            direction = "received"
        else:
            other = request.requester
            direction = "provided"
        if other is None or other.id == current_user.id:
            continue
        existing = db.query(Review.id).filter_by(request_id=request.id, reviewer_id=current_user.id).first()
        if existing:
            continue
        eligible.append(EligibleReview(
            request_id=request.id,
            book_title=request.book.title,
            other_user_id=other.id,
            other_user_name=_display_name(other),
            direction=direction,
            created_at=request.updated_at,
        ))
    return eligible


@router.post("/api/v1/reviews", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
def create_review(
    payload: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    request = db.query(BookRequest).options(
        joinedload(BookRequest.book).joinedload(BookListing.seller),
        joinedload(BookRequest.requester),
    ).filter(BookRequest.id == payload.request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Completed interaction not found")
    if request.status != "completed":
        raise HTTPException(status_code=409, detail="Reviews are available after an interaction is completed")
    owner_id = request.book.seller_id
    if current_user.id == request.requester_id:
        reviewed_user_id = owner_id
    elif current_user.id == owner_id:
        reviewed_user_id = request.requester_id
    else:
        raise HTTPException(status_code=403, detail="Only students in this interaction can leave a review")
    if not reviewed_user_id or reviewed_user_id == current_user.id:
        raise HTTPException(status_code=409, detail="This interaction has no eligible review recipient")
    existing = db.query(Review.id).filter_by(request_id=request.id, reviewer_id=current_user.id).first()
    if existing:
        raise HTTPException(status_code=409, detail="You already reviewed this interaction")
    review = Review(
        request_id=request.id,
        reviewer_id=current_user.id,
        reviewed_user_id=reviewed_user_id,
        rating=payload.rating,
        comment=payload.comment.strip() if payload.comment and payload.comment.strip() else None,
    )
    db.add(review)
    db.commit()
    review = db.query(Review).options(
        joinedload(Review.reviewer).joinedload(User.profile),
        joinedload(Review.request).joinedload(BookRequest.book),
    ).filter(Review.id == review.id).first()
    return _review_response(review)


@router.get("/api/v1/reviews/users/{user_id}", response_model=ReviewSummary)
def reviews_for_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Student not found")
    reviews = db.query(Review).options(
        joinedload(Review.reviewer).joinedload(User.profile),
        joinedload(Review.request).joinedload(BookRequest.book),
    ).filter(Review.reviewed_user_id == user_id, Review.is_hidden.is_(False)).order_by(Review.created_at.desc()).all()
    completed_count = db.query(BookRequest.id).join(BookListing).filter(
        BookRequest.status == "completed",
        or_(BookRequest.requester_id == user_id, BookListing.seller_id == user_id),
    ).count()
    average = db.query(func.avg(Review.rating)).filter(Review.reviewed_user_id == user_id, Review.is_hidden.is_(False)).scalar()
    review_count = db.query(Review.id).filter(Review.reviewed_user_id == user_id, Review.is_hidden.is_(False)).count()
    return ReviewSummary(
        user_id=user_id,
        average_rating=round(float(average), 2) if average is not None else None,
        review_count=review_count,
        completed_interactions=completed_count,
        reviews=[_review_response(review) for review in reviews],
    )


def _completed_request_rows(db: Session):
    return db.query(BookRequest, BookListing).join(BookListing).filter(BookRequest.status == "completed").all()


def _impact_counts(db: Session, user_id: str | None = None):
    query = db.query(BookRequest, BookListing).join(BookListing).filter(BookRequest.status == "completed")
    if user_id:
        query = query.filter(or_(BookRequest.requester_id == user_id, BookListing.seller_id == user_id))
    rows = query.all()
    unique_books = {request.book_id for request, _book in rows}
    sold = sum(1 for _request, book in rows if book.listing_type == "sell")
    donated = sum(1 for _request, book in rows if book.listing_type == "donate")
    exchanged = sum(1 for _request, book in rows if book.listing_type == "exchange")
    lent = sum(1 for _request, book in rows if book.listing_type == "lend")
    connected_students = {
        participant_id
        for request, book in rows
        for participant_id in (request.requester_id, book.seller_id)
        if participant_id is not None
    }
    return rows, unique_books, sold, donated, exchanged, lent, connected_students


@router.get("/api/v1/impact", response_model=ImpactSummary)
def global_impact(db: Session = Depends(get_db)):
    rows, unique_books, sold, donated, exchanged, lent, connected = _impact_counts(db)
    return ImpactSummary(
        completed_interactions=len(rows),
        books_given_second_chance=len(unique_books),
        books_sold=sold,
        books_donated=donated,
        books_exchanged=exchanged,
        books_lent=lent,
        students_connected=len(connected),
        communities=db.query(Community.id).count(),
        community_memberships=db.query(CommunityMembership.id).count(),
        community_books_shared=db.query(CommunityBook.id).count(),
        community_posts=db.query(CommunityPost.id).count(),
    )


@router.get("/api/v1/impact/me", response_model=PersonalImpact)
def personal_impact(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows, unique_books, sold, donated, exchanged, lent, connected = _impact_counts(db, current_user.id)
    memberships = db.query(CommunityMembership.community_id).filter_by(user_id=current_user.id).all()
    community_ids = [row[0] for row in memberships]
    return PersonalImpact(
        completed_interactions=len(rows),
        books_given_second_chance=len(unique_books),
        books_sold=sold,
        books_donated=donated,
        books_exchanged=exchanged,
        books_lent=lent,
        students_connected=len(connected),
        communities=len(community_ids),
        community_memberships=len(community_ids),
        community_books_shared=db.query(CommunityBook.id).filter(CommunityBook.community_id.in_(community_ids)).count() if community_ids else 0,
        community_posts=db.query(CommunityPost.id).filter(CommunityPost.author_id == current_user.id).count(),
        books_passed_on=len({request.book_id for request, book in rows if book.seller_id == current_user.id}),
        books_received=len({request.book_id for request, _book in rows if request.requester_id == current_user.id}),
        communities_joined=len(community_ids),
        posts_created=db.query(CommunityPost.id).filter(CommunityPost.author_id == current_user.id).count(),
    )