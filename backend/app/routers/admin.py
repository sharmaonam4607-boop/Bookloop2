from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import security_scheme
from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, verify_password
from app.database.session import get_db
from app.models.book import BookListing
from app.models.book_request import BookRequest
from app.models.community import Community, CommunityComment, CommunityMembership, CommunityPost, CommunityReport
from app.models.review import Review
from app.models.user import User, UserProfile
from app.schemas.admin import (
    AdminAnalyticsResponse,
    AdminCommunityResponse,
    AdminCommunityStatusUpdate,
    AdminListingResponse,
    AdminListingStatusUpdate,
    AdminLogin,
    AdminReportResponse,
    AdminReportStatusUpdate,
    AdminReviewResponse,
    AdminReviewStatusUpdate,
    AdminTokenResponse,
    AdminUserResponse,
    AdminUserStatusUpdate,
)

router = APIRouter(prefix="/api/v1/admin", tags=["Administration"])


def _admin_allowlist() -> set[str]:
    return {email.strip().lower() for email in settings.ADMIN_EMAILS.split(",") if email.strip()}


def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    payload = decode_access_token(credentials.credentials)
    if not payload or payload.get("role") != "admin" or not payload.get("sub"):
        raise HTTPException(status_code=403, detail="Admin access required")
    user = db.query(User).filter(User.id == payload["sub"], User.is_active.is_(True)).first()
    if not user or user.email.lower() not in _admin_allowlist():
        raise HTTPException(status_code=403, detail="Admin access is not enabled for this account")
    return user


def _name(user: Optional[User]) -> Optional[str]:
    if user is None:
        return None
    return user.profile.full_name if user.profile else user.email


@router.post("/auth/login", response_model=AdminTokenResponse)
def admin_login(payload: AdminLogin, db: Session = Depends(get_db)):
    allowed_emails = _admin_allowlist()
    if not allowed_emails:
        raise HTTPException(status_code=503, detail="Admin access is not configured. Set ADMIN_EMAILS in the backend environment.")
    email = payload.email.lower()
    user = db.query(User).filter(User.email == email, User.is_active.is_(True)).first()
    if email not in allowed_emails or not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    token = create_access_token({"sub": user.id, "email": user.email, "role": "admin"})
    return AdminTokenResponse(access_token=token, email=user.email)


@router.get("/auth/me")
def admin_me(current_admin: User = Depends(get_current_admin)):
    return {"id": current_admin.id, "email": current_admin.email, "name": _name(current_admin)}


@router.get("/analytics", response_model=AdminAnalyticsResponse)
def admin_analytics(_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    completed_rows = db.query(BookRequest, BookListing).join(BookListing).filter(BookRequest.status == "completed").all()
    participants = {
        user_id
        for request, listing in completed_rows
        for user_id in (request.requester_id, listing.seller_id)
        if user_id is not None
    }
    return AdminAnalyticsResponse(
        users_total=db.query(User.id).count(),
        users_active=db.query(User.id).filter(User.is_active.is_(True)).count(),
        listings_total=db.query(BookListing.id).filter(BookListing.status != "deleted").count(),
        listings_active=db.query(BookListing.id).filter(BookListing.status == "active").count(),
        communities_total=db.query(Community.id).count(),
        communities_active=db.query(Community.id).filter(Community.is_active.is_(True)).count(),
        open_reports=db.query(CommunityReport.id).filter(CommunityReport.status == "open").count(),
        reviews_total=db.query(Review.id).filter(Review.is_hidden.is_(False)).count(),
        completed_interactions=len(completed_rows),
        books_given_second_chance=len({request.book_id for request, _listing in completed_rows}),
        students_connected=len(participants),
    )


@router.get("/users", response_model=list[AdminUserResponse])
def admin_users(
    q: Optional[str] = Query(default=None, min_length=1, max_length=180),
    limit: int = Query(default=100, ge=1, le=250),
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User).options(joinedload(User.profile))
    if q:
        term = f"%{q.strip()}%"
        query = query.outerjoin(User.profile).filter(or_(User.email.ilike(term), UserProfile.full_name.ilike(term)))
    users = query.order_by(User.created_at.desc()).limit(limit).all()
    return [AdminUserResponse(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_verified=user.is_verified,
        full_name=user.profile.full_name if user.profile else None,
        university=user.profile.university if user.profile else None,
        created_at=user.created_at,
        listings_count=db.query(BookListing.id).filter(BookListing.seller_id == user.id, BookListing.status != "deleted").count(),
    ) for user in users]


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def update_user_status(
    user_id: str,
    payload: AdminUserStatusUpdate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if user_id == current_admin.id and not payload.is_active:
        raise HTTPException(status_code=409, detail="You cannot deactivate your own admin account")
    user = db.query(User).options(joinedload(User.profile)).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = payload.is_active
    db.commit()
    return AdminUserResponse(
        id=user.id, email=user.email, is_active=user.is_active, is_verified=user.is_verified,
        full_name=user.profile.full_name if user.profile else None,
        university=user.profile.university if user.profile else None,
        created_at=user.created_at,
        listings_count=db.query(BookListing.id).filter(BookListing.seller_id == user.id, BookListing.status != "deleted").count(),
    )


@router.get("/listings", response_model=list[AdminListingResponse])
def admin_listings(
    listing_status: Optional[str] = Query(default=None, alias="status"),
    q: Optional[str] = Query(default=None, min_length=1, max_length=180),
    limit: int = Query(default=200, ge=1, le=500),
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(BookListing).options(joinedload(BookListing.seller).joinedload(User.profile))
    if listing_status:
        query = query.filter(BookListing.status == listing_status)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(BookListing.title.ilike(term) | BookListing.author.ilike(term))
    listings = query.order_by(BookListing.created_at.desc()).limit(limit).all()
    return [AdminListingResponse(
        id=listing.id, title=listing.title, author=listing.author,
        listing_type=listing.listing_type, status=listing.status,
        seller_id=listing.seller_id, seller_name=_name(listing.seller),
        is_seed_data=listing.is_seed_data, created_at=listing.created_at,
    ) for listing in listings]


@router.patch("/listings/{listing_id}", response_model=AdminListingResponse)
def moderate_listing(
    listing_id: str,
    payload: AdminListingStatusUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    listing = db.query(BookListing).options(joinedload(BookListing.seller).joinedload(User.profile)).filter(BookListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing.status = payload.status
    db.commit()
    return AdminListingResponse(
        id=listing.id, title=listing.title, author=listing.author,
        listing_type=listing.listing_type, status=listing.status,
        seller_id=listing.seller_id, seller_name=_name(listing.seller),
        is_seed_data=listing.is_seed_data, created_at=listing.created_at,
    )


@router.get("/communities", response_model=list[AdminCommunityResponse])
def admin_communities(
    q: Optional[str] = Query(default=None, min_length=1, max_length=180),
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Community)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(Community.name.ilike(term) | Community.description.ilike(term))
    rows = query.order_by(Community.created_at.desc()).limit(300).all()
    return [AdminCommunityResponse(
        id=community.id,
        name=community.name,
        category=community.category,
        is_active=community.is_active,
        is_seed_data=community.is_seed_data,
        created_at=community.created_at,
        member_count=db.query(CommunityMembership.id).filter_by(community_id=community.id).count(),
        post_count=db.query(CommunityPost.id).filter_by(community_id=community.id).count(),
    ) for community in rows]


@router.patch("/communities/{community_id}", response_model=AdminCommunityResponse)
def moderate_community(
    community_id: str,
    payload: AdminCommunityStatusUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    community.is_active = payload.is_active
    db.commit()
    return AdminCommunityResponse(
        id=community.id, name=community.name, category=community.category,
        is_active=community.is_active, is_seed_data=community.is_seed_data,
        created_at=community.created_at,
        member_count=db.query(CommunityMembership.id).filter_by(community_id=community.id).count(),
        post_count=db.query(CommunityPost.id).filter_by(community_id=community.id).count(),
    )


@router.get("/reports", response_model=list[AdminReportResponse])
def admin_reports(
    report_status: Optional[str] = Query(default=None, alias="status"),
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(CommunityReport, Community).join(Community, CommunityReport.community_id == Community.id)
    if report_status:
        query = query.filter(CommunityReport.status == report_status)
    rows = query.order_by(CommunityReport.created_at.desc()).limit(500).all()
    return [AdminReportResponse(
        id=report.id, community_id=report.community_id, community_name=community.name,
        reporter_id=report.reporter_id, target_type=report.target_type, target_id=report.target_id,
        reason=report.reason, status=report.status, created_at=report.created_at,
    ) for report, community in rows]


@router.patch("/reports/{report_id}", response_model=AdminReportResponse)
def moderate_report(
    report_id: str,
    payload: AdminReportStatusUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    result = db.query(CommunityReport, Community).join(Community, CommunityReport.community_id == Community.id).filter(CommunityReport.id == report_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Report not found")
    report, community = result
    report.status = payload.status
    db.commit()
    return AdminReportResponse(
        id=report.id, community_id=report.community_id, community_name=community.name,
        reporter_id=report.reporter_id, target_type=report.target_type, target_id=report.target_id,
        reason=report.reason, status=report.status, created_at=report.created_at,
    )


@router.get("/reviews", response_model=list[AdminReviewResponse])
def admin_reviews(
    include_hidden: bool = False,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Review).options(
        joinedload(Review.reviewer).joinedload(User.profile),
        joinedload(Review.reviewed_user).joinedload(User.profile),
        joinedload(Review.request).joinedload(BookRequest.book),
    )
    if not include_hidden:
        query = query.filter(Review.is_hidden.is_(False))
    rows = query.order_by(Review.created_at.desc()).limit(500).all()
    return [AdminReviewResponse(
        id=review.id, request_id=review.request_id,
        reviewer_id=review.reviewer_id, reviewer_name=_name(review.reviewer) or "Unknown",
        reviewed_user_id=review.reviewed_user_id, reviewed_user_name=_name(review.reviewed_user) or "Unknown",
        book_title=review.request.book.title, rating=review.rating, comment=review.comment,
        is_hidden=review.is_hidden, created_at=review.created_at,
    ) for review in rows]


@router.patch("/reviews/{review_id}", response_model=AdminReviewResponse)
def moderate_review(
    review_id: str,
    payload: AdminReviewStatusUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    review = db.query(Review).options(
        joinedload(Review.reviewer).joinedload(User.profile),
        joinedload(Review.reviewed_user).joinedload(User.profile),
        joinedload(Review.request).joinedload(BookRequest.book),
    ).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    review.is_hidden = payload.is_hidden
    db.commit()
    return AdminReviewResponse(
        id=review.id, request_id=review.request_id,
        reviewer_id=review.reviewer_id, reviewer_name=_name(review.reviewer) or "Unknown",
        reviewed_user_id=review.reviewed_user_id, reviewed_user_name=_name(review.reviewed_user) or "Unknown",
        book_title=review.request.book.title, rating=review.rating, comment=review.comment,
        is_hidden=review.is_hidden, created_at=review.created_at,
    )