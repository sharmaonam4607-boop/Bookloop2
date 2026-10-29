import re
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.database.session import get_db
from app.models.book import BookListing
from app.models.community import Community
from app.models.user import User, UserProfile
from app.schemas.maps import MapConfigResponse, MapPointResponse

router = APIRouter(prefix="/api/v1/maps", tags=["Maps & Nearby"])


@router.get("/config", response_model=MapConfigResponse)
def map_config():
    key = settings.GOOGLE_MAPS_API_KEY.strip() if settings.GOOGLE_MAPS_API_KEY else None
    return MapConfigResponse(google_maps_enabled=bool(key), google_maps_api_key=key or None)


@router.get("/points", response_model=list[MapPointResponse])
def list_map_points(
    city: Optional[str] = Query(default=None),
    location: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    points = []
    book_query = db.query(BookListing).filter(
        BookListing.status == "active",
        BookListing.safe_meeting_point.is_not(None),
        BookListing.safe_meeting_point != "",
    ).options(joinedload(BookListing.seller).joinedload(User.profile))

    comm_query = db.query(Community).filter(
        Community.is_active.is_(True),
        Community.location_name.is_not(None),
        Community.location_name != "",
    )

    if city and city.strip():
        clean_city = city.strip().lower()
        # Exact city match for city parameter
        book_filters = [
            func.lower(BookListing.listing_city) == clean_city,
            func.lower(UserProfile.city) == clean_city,
            func.lower(BookListing.safe_meeting_point) == clean_city,
        ]
        comm_filters = [
            func.lower(Community.location_name) == clean_city,
        ]
        book_query = book_query.outerjoin(BookListing.seller).outerjoin(User.profile).filter(or_(*book_filters))
        comm_query = comm_query.filter(or_(*comm_filters))
    elif location and location.strip():
        raw_loc = location.strip()
        parts = [p.strip() for p in re.split(r"[,;/]+", raw_loc) if p.strip()]
        if not parts:
            parts = [raw_loc]

        book_filters = []
        comm_filters = []
        for p in parts:
            pattern = f"%{p}%"
            book_filters.append(BookListing.safe_meeting_point.ilike(pattern))
            book_filters.append(BookListing.listing_city.ilike(pattern))
            book_filters.append(UserProfile.location.ilike(pattern))
            book_filters.append(UserProfile.city.ilike(pattern))
            book_filters.append(UserProfile.university.ilike(pattern))
            comm_filters.append(Community.location_name.ilike(pattern))

        full_pattern = f"%{raw_loc}%"
        book_filters.append(BookListing.safe_meeting_point.ilike(full_pattern))
        book_filters.append(BookListing.listing_city.ilike(full_pattern))
        book_filters.append(UserProfile.location.ilike(full_pattern))
        book_filters.append(UserProfile.city.ilike(full_pattern))
        book_filters.append(UserProfile.university.ilike(full_pattern))
        comm_filters.append(Community.location_name.ilike(full_pattern))

        book_query = book_query.outerjoin(BookListing.seller).outerjoin(User.profile).filter(or_(*book_filters))
        comm_query = comm_query.filter(or_(*comm_filters))
        raw_loc = location.strip()
        parts = [p.strip() for p in re.split(r"[,;/]+", raw_loc) if p.strip()]
        if not parts:
            parts = [raw_loc]

        book_filters = []
        comm_filters = []
        for p in parts:
            pattern = f"%{p}%"
            book_filters.append(BookListing.safe_meeting_point.ilike(pattern))
            book_filters.append(UserProfile.location.ilike(pattern))
            book_filters.append(UserProfile.university.ilike(pattern))
            comm_filters.append(Community.location_name.ilike(pattern))

        full_pattern = f"%{raw_loc}%"
        book_filters.append(BookListing.safe_meeting_point.ilike(full_pattern))
        book_filters.append(UserProfile.location.ilike(full_pattern))
        book_filters.append(UserProfile.university.ilike(full_pattern))
        comm_filters.append(Community.location_name.ilike(full_pattern))

        book_query = book_query.outerjoin(BookListing.seller).outerjoin(User.profile).filter(or_(*book_filters))
        comm_query = comm_query.filter(or_(*comm_filters))

    # Order by newest so recently listed books by current user and others show at top
    book_query = book_query.order_by(BookListing.created_at.desc())
    comm_query = comm_query.order_by(Community.created_at.desc())

    listings = book_query.all()
    points.extend(MapPointResponse(
        id=book.id,
        point_type="book",
        title=book.title,
        subtitle=f"{book.author} · {book.listing_type.title()}",
        latitude=book.latitude,
        longitude=book.longitude,
        location_name=book.safe_meeting_point,
        book_listing_type=book.listing_type,
        is_seed_data=book.is_seed_data,
    ) for book in listings)

    communities = comm_query.all()
    points.extend(MapPointResponse(
        id=community.id,
        point_type="community",
        title=community.name,
        subtitle=community.category,
        latitude=community.latitude,
        longitude=community.longitude,
        location_name=community.location_name,
        is_seed_data=community.is_seed_data,
    ) for community in communities)
    return points
