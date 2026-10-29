
from app.models.community import (
    Community,
    CommunityBook,
    CommunityComment,
    CommunityMembership,
    CommunityPost,
    CommunityReaction,
    CommunityReport,
)
from app.models.book_request import BookRequest
from app.models.wishlist import WishlistItem
from app.models.conversation import Conversation, Message
from app.models.notification import Notification
from app.services.statistics import sync_user_profile_stats
from datetime import datetime

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session, joinedload

from app.api.deps import security_scheme
from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
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

logger = logging.getLogger("bookloop.admin")
router = APIRouter(prefix="/api/v1/admin", tags=["Administration"])


def _ensure_phase10_schema(db: Session) -> None:
    try:
        bind = db.get_bind()
        inspector = inspect(bind)
        table_names = inspector.get_table_names()

        if "communities" in table_names:
            cols = {c["name"] for c in inspector.get_columns("communities")}
            if "is_active" not in cols:
                is_sqlite = bind.dialect.name == "sqlite"
                db.execute(text(
                    "ALTER TABLE communities ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"
                    if is_sqlite
                    else "ALTER TABLE communities ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"
                ))
                try:
                    db.execute(text("CREATE INDEX ix_communities_is_active ON communities (is_active)"))
                except Exception:
                    pass
                db.commit()

        if "reviews" in table_names:
            cols = {c["name"] for c in inspector.get_columns("reviews")}
            if "is_hidden" not in cols:
                is_sqlite = bind.dialect.name == "sqlite"
                db.execute(text(
                    "ALTER TABLE reviews ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT 0"
                    if is_sqlite
                    else "ALTER TABLE reviews ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT FALSE"
                ))
                try:
                    db.execute(text("CREATE INDEX ix_reviews_is_hidden ON reviews (is_hidden)"))
                except Exception:
                    pass
                db.commit()
    except Exception as e:
        logger.warning(f"Phase 10 schema check skipped: {e}")


def _safe_count(query):
    try:
        return query.count()
    except Exception:
        return 0


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
    if email in allowed_emails and not user:
        if payload.password == settings.ADMIN_PASSWORD:
            user = User(
                email=email,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                is_active=True,
                is_verified=True,
            )
            db.add(user)
            db.flush()
            db.add(UserProfile(
                user_id=user.id,
                full_name="BookLoop Administrator",
                university="Central Campus",
                course="System Administration",
                year="Admin",
                location="Admin Portal",
                bio="Official BookLoop System Administrator"
            ))
            db.commit()
    if email not in allowed_emails or not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    token = create_access_token({"sub": user.id, "email": user.email, "role": "admin"})
    return AdminTokenResponse(access_token=token, email=user.email)


@router.get("/auth/me")
def admin_me(current_admin: User = Depends(get_current_admin)):
    return {"id": current_admin.id, "email": current_admin.email, "name": _name(current_admin)}


@router.get("/analytics", response_model=AdminAnalyticsResponse)
def admin_analytics(_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    _ensure_phase10_schema(db)
    completed_rows = db.query(BookRequest, BookListing).join(BookListing).filter(BookRequest.status == "completed").all()
    participants = {
        user_id
        for request, listing in completed_rows
        for user_id in (request.requester_id, listing.seller_id)
        if user_id is not None
    }
    communities_active = _safe_count(db.query(Community.id).filter(Community.is_active.is_(True)))
    reviews_total = _safe_count(db.query(Review.id).filter(Review.is_hidden.is_(False)))

    users_total = db.query(User.id).count()
    users_active = db.query(User.id).filter(User.is_active.is_(True)).count()
    users_suspended = db.query(User.id).filter(User.is_active.is_(False)).count()

    # Circulation breakdown by transaction/listing type from completed handoffs
    circ_donated = 0
    circ_exchanged = 0
    circ_lent = 0
    circ_sold = 0
    for req, listing in completed_rows:
        ltype = (listing.listing_type or "").lower() if listing else ""
        if ltype == "donate":
            circ_donated += 1
        elif ltype == "exchange":
            circ_exchanged += 1
        elif ltype == "lend":
            circ_lent += 1
        elif ltype == "sell":
            circ_sold += 1

    circ_total = len(completed_rows)

    # Breakdown of active catalog listings by type
    active_listings = db.query(BookListing.listing_type).filter(BookListing.status == "active").all()
    list_donated = sum(1 for (lt,) in active_listings if (lt or "").lower() == "donate")
    list_exchanged = sum(1 for (lt,) in active_listings if (lt or "").lower() == "exchange")
    list_lent = sum(1 for (lt,) in active_listings if (lt or "").lower() == "lend")
    list_sold = sum(1 for (lt,) in active_listings if (lt or "").lower() == "sell")

    return AdminAnalyticsResponse(
        users_total=users_total,
        users_active=users_active,
        users_suspended=users_suspended,
        listings_total=db.query(BookListing.id).filter(BookListing.status != "deleted").count(),
        listings_active=db.query(BookListing.id).filter(BookListing.status == "active").count(),
        communities_total=db.query(Community.id).count(),
        communities_active=communities_active,
        open_reports=db.query(CommunityReport.id).filter(CommunityReport.status == "open").count(),
        reviews_total=reviews_total,
        completed_interactions=len(completed_rows),
        books_given_second_chance=len({request.book_id for request, _listing in completed_rows}),
        students_connected=len(participants),
        circulation_donated=circ_donated,
        circulation_exchanged=circ_exchanged,
        circulation_lent=circ_lent,
        circulation_sold=circ_sold,
        circulation_total=circ_total,
        listings_donated=list_donated,
        listings_exchanged=list_exchanged,
        listings_lent=list_lent,
        listings_sold=list_sold,
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
    _ensure_phase10_schema(db)
    query = db.query(Review).options(
        joinedload(Review.reviewer).joinedload(User.profile),
        joinedload(Review.reviewed_user).joinedload(User.profile),
        joinedload(Review.request).joinedload(BookRequest.book),
    )
    if not include_hidden:
        try:
            query = query.filter(Review.is_hidden.is_(False))
        except Exception:
            pass
    rows = query.order_by(Review.created_at.desc()).limit(500).all()
    return [AdminReviewResponse(
        id=review.id, request_id=review.request_id,
        reviewer_id=review.reviewer_id, reviewer_name=_name(review.reviewer) or "Unknown",
        reviewed_user_id=review.reviewed_user_id, reviewed_user_name=_name(review.reviewed_user) or "Unknown",
        book_title=review.request.book.title if review.request and review.request.book else "Deleted Book",
        rating=review.rating, comment=review.comment,
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
        book_title=review.request.book.title if review.request and review.request.book else "Deleted Book",
        rating=review.rating, comment=review.comment,
        is_hidden=review.is_hidden, created_at=review.created_at,
    )

@router.post('/restore-production-data')
def restore_production_data(
    payload: dict,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    def parse_dt(val):
        if not val:
            return None
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val.replace('Z', '+00:00'))
            except Exception:
                return None
        return val

    # 1. Clean out dummy seed listings and dummy demo users first
    try:
        db.query(BookListing).filter(
            or_(
                BookListing.is_seed_data == True,
                BookListing.seller_id.in_(
                    db.query(User.id).filter(User.email.like('seed.%@bookloop.demo'))
                )
            )
        ).delete(synchronize_session=False)

        db.query(UserProfile).filter(
            UserProfile.user_id.in_(
                db.query(User.id).filter(User.email.like('seed.%@bookloop.demo'))
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(User.email.like('seed.%@bookloop.demo')).delete(synchronize_session=False)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f'Seed cleanup warning: {e}')

    # 2. Users
    users_data = payload.get('users', [])
    for u in users_data:
        existing = db.query(User).filter(User.id == u['id']).first()
        if not existing and u.get('email'):
            existing = db.query(User).filter(User.email == u['email'].lower()).first()
        if existing:
            if u.get('hashed_password'):
                existing.hashed_password = u['hashed_password']
            existing.is_active = u.get('is_active', True)
            existing.is_verified = u.get('is_verified', True)
            if u.get('created_at'):
                existing.created_at = parse_dt(u['created_at']) or existing.created_at
        else:
            db.add(User(
                id=u['id'],
                email=u['email'].lower(),
                hashed_password=u['hashed_password'],
                is_active=u.get('is_active', True),
                is_verified=u.get('is_verified', True),
                created_at=parse_dt(u.get('created_at')),
                updated_at=parse_dt(u.get('updated_at')),
            ))
    db.commit()

    # 3. UserProfiles
    profiles_data = payload.get('user_profiles', [])
    for p in profiles_data:
        existing = db.query(UserProfile).filter(UserProfile.user_id == p['user_id']).first()
        if existing:
            existing.full_name = p.get('full_name') or existing.full_name
            existing.university = p.get('university') or existing.university
            existing.course = p.get('course') or existing.course
            existing.year = p.get('year') or existing.year
            existing.location = p.get('location') or existing.location
            existing.bio = p.get('bio') or existing.bio
            existing.avatar_emoji = p.get('avatar_emoji') or existing.avatar_emoji
            existing.avatar_url = p.get('avatar_url') or existing.avatar_url
            existing.books_listed = p.get('books_listed', 0)
            existing.books_donated = p.get('books_donated', 0)
            existing.books_exchanged = p.get('books_exchanged', 0)
            existing.books_lent = p.get('books_lent', 0)
            existing.books_sold = p.get('books_sold', 0)
        else:
            db.add(UserProfile(
                id=p.get('id'),
                user_id=p['user_id'],
                full_name=p.get('full_name', 'Student'),
                university=p.get('university', 'Campus'),
                course=p.get('course', 'General'),
                year=p.get('year', '1st Year'),
                location=p.get('location', 'Campus'),
                bio=p.get('bio'),
                avatar_emoji=p.get('avatar_emoji'),
                avatar_url=p.get('avatar_url'),
                books_listed=p.get('books_listed', 0),
                books_donated=p.get('books_donated', 0),
                books_exchanged=p.get('books_exchanged', 0),
                books_lent=p.get('books_lent', 0),
                books_sold=p.get('books_sold', 0),
            ))
    db.commit()

    # 4. Communities
    comm_data = payload.get('communities', [])
    for c in comm_data:
        existing = db.query(Community).filter(Community.id == c['id']).first()
        if not existing:
            db.add(Community(
                id=c['id'],
                name=c['name'],
                description=c.get('description'),
                category=c.get('category', 'General'),
                creator_id=c.get('creator_id'),
                is_active=c.get('is_active', True),
                created_at=parse_dt(c.get('created_at')),
                updated_at=parse_dt(c.get('updated_at')),
            ))
    db.commit()

    # 5. Community Memberships
    m_data = payload.get('community_memberships', [])
    for m in m_data:
        existing = db.query(CommunityMembership).filter(CommunityMembership.id == m['id']).first()
        if not existing:
            db.add(CommunityMembership(
                id=m['id'],
                community_id=m['community_id'],
                user_id=m['user_id'],
                role=m.get('role', 'member'),
                status=m.get('status', 'approved'),
                joined_at=parse_dt(m.get('joined_at')),
            ))
    db.commit()

    # 6. Book Listings
    listings_data = payload.get('book_listings', [])
    for b in listings_data:
        existing = db.query(BookListing).filter(BookListing.id == b['id']).first()
        if existing:
            existing.seller_id = b.get('seller_id')
            existing.title = b['title']
            existing.author = b['author']
            existing.isbn = b.get('isbn')
            existing.edition = b.get('edition')
            existing.course = b.get('course')
            existing.course_code = b.get('course_code')
            existing.category = b.get('category', 'Other')
            existing.condition = b.get('condition', 'good')
            existing.listing_type = b.get('listing_type', 'sell')
            existing.status = b.get('status', 'active')
            existing.price = b.get('price')
            existing.price_unit = b.get('price_unit')
            existing.description = b.get('description')
            existing.image_urls = b.get('image_urls') or []
            existing.cover_gradient = b.get('cover_gradient')
            existing.distance_km = b.get('distance_km')
            existing.listing_city = b.get('listing_city')
            existing.safe_meeting_point = b.get('safe_meeting_point')
            existing.latitude = b.get('latitude')
            existing.longitude = b.get('longitude')
            existing.original_price = b.get('original_price')
            existing.exchange_wish = b.get('exchange_wish')
            existing.is_seed_data = b.get('is_seed_data', False)
            if b.get('created_at'):
                existing.created_at = parse_dt(b['created_at']) or existing.created_at
        else:
            db.add(BookListing(
                id=b['id'],
                seller_id=b.get('seller_id'),
                title=b['title'],
                author=b['author'],
                isbn=b.get('isbn'),
                edition=b.get('edition'),
                course=b.get('course'),
                course_code=b.get('course_code'),
                category=b.get('category', 'Other'),
                condition=b.get('condition', 'good'),
                listing_type=b.get('listing_type', 'sell'),
                status=b.get('status', 'active'),
                price=b.get('price'),
                price_unit=b.get('price_unit'),
                description=b.get('description'),
                image_urls=b.get('image_urls') or [],
                cover_gradient=b.get('cover_gradient'),
                distance_km=b.get('distance_km'),
                listing_city=b.get('listing_city'),
                safe_meeting_point=b.get('safe_meeting_point'),
                latitude=b.get('latitude'),
                longitude=b.get('longitude'),
                original_price=b.get('original_price'),
                exchange_wish=b.get('exchange_wish'),
                is_seed_data=b.get('is_seed_data', False),
                created_at=parse_dt(b.get('created_at')),
                updated_at=parse_dt(b.get('updated_at')),
            ))
    db.commit()

    # 7. Community Books
    for cb in payload.get('community_books', []):
        if not db.query(CommunityBook).filter(CommunityBook.id == cb['id']).first():
            db.add(CommunityBook(
                id=cb['id'],
                community_id=cb['community_id'],
                book_id=cb['book_id'],
                added_by=cb.get('added_by'),
                created_at=parse_dt(cb.get('created_at')),
            ))
    db.commit()

    # 8. Community Posts
    for cp in payload.get('community_posts', []):
        if not db.query(CommunityPost).filter(CommunityPost.id == cp['id']).first():
            db.add(CommunityPost(
                id=cp['id'],
                community_id=cp['community_id'],
                user_id=cp['user_id'],
                content=cp['content'],
                created_at=parse_dt(cp.get('created_at')),
                updated_at=parse_dt(cp.get('updated_at')),
            ))
    db.commit()

    # 9. Book Requests
    for br in payload.get('book_requests', []):
        existing = db.query(BookRequest).filter(BookRequest.id == br['id']).first()
        if not existing:
            db.add(BookRequest(
                id=br['id'],
                requester_id=br['requester_id'],
                book_id=br['book_id'],
                status=br.get('status', 'pending'),
                note=br.get('note'),
                meetup_location=br.get('meetup_location'),
                created_at=parse_dt(br.get('created_at')),
                updated_at=parse_dt(br.get('updated_at')),
            ))
    db.commit()

    # 10. Reviews
    for rev in payload.get('reviews', []):
        existing = db.query(Review).filter(Review.id == rev['id']).first()
        if not existing:
            db.add(Review(
                id=rev['id'],
                reviewer_id=rev['reviewer_id'],
                reviewed_user_id=rev['reviewed_user_id'],
                request_id=rev.get('request_id'),
                rating=rev['rating'],
                comment=rev.get('comment'),
                is_hidden=rev.get('is_hidden', False),
                created_at=parse_dt(rev.get('created_at')),
            ))
    db.commit()

    # 11. Conversations & Messages
    for conv in payload.get('conversations', []):
        if not db.query(Conversation).filter(Conversation.id == conv['id']).first():
            db.add(Conversation(
                id=conv['id'],
                participant_one_id=conv['participant_one_id'],
                participant_two_id=conv['participant_two_id'],
                book_id=conv.get('book_id'),
                created_at=parse_dt(conv.get('created_at')),
                updated_at=parse_dt(conv.get('updated_at')),
            ))
    db.commit()

    for msg in payload.get('messages', []):
        if not db.query(Message).filter(Message.id == msg['id']).first():
            db.add(Message(
                id=msg['id'],
                conversation_id=msg['conversation_id'],
                sender_id=msg['sender_id'],
                body=msg.get('body') or msg.get('content', ''),
                read_at=parse_dt(msg.get('read_at')),
                created_at=parse_dt(msg.get('created_at')),
            ))
    db.commit()

    # 12. Notifications
    for notif in payload.get('notifications', []):
        if not db.query(Notification).filter(Notification.id == notif['id']).first():
            db.add(Notification(
                id=notif['id'],
                user_id=notif['user_id'],
                notification_type=notif.get('notification_type') or notif.get('type', 'system'),
                title=notif.get('title', ''),
                body=notif.get('body') or notif.get('message', ''),
                conversation_id=notif.get('conversation_id'),
                message_id=notif.get('message_id'),
                book_id=notif.get('book_id'),
                request_id=notif.get('request_id'),
                read_at=parse_dt(notif.get('read_at')),
                created_at=parse_dt(notif.get('created_at')),
            ))
    db.commit()

    # 13. Wishlist Items
    for wish in payload.get('wishlist_items', []):
        if not db.query(WishlistItem).filter(WishlistItem.id == wish['id']).first():
            db.add(WishlistItem(
                id=wish['id'],
                user_id=wish['user_id'],
                book_id=wish['book_id'],
                created_at=parse_dt(wish.get('created_at')),
            ))
    db.commit()

    # Recalculate stats for all users
    try:
        all_user_ids = [u.id for u in db.query(User.id).all()]
        for uid in all_user_ids:
            sync_user_profile_stats(db, uid)
        db.commit()
    except Exception as e:
        logger.warning(f'Stats sync warning: {e}')

    return {
        'status': 'success',
        'message': 'Genuine production data successfully restored',
        'counts': {
            'users': db.query(User).count(),
            'user_profiles': db.query(UserProfile).count(),
            'communities': db.query(Community).count(),
            'book_listings': db.query(BookListing).count(),
            'book_requests': db.query(BookRequest).count(),
            'reviews': db.query(Review).count(),
            'conversations': db.query(Conversation).count(),
            'messages': db.query(Message).count(),
            'notifications': db.query(Notification).count(),
        }
    }
