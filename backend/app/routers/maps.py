from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.models.book import BookListing
from app.models.community import Community
from app.schemas.maps import MapConfigResponse, MapPointResponse

router = APIRouter(prefix="/api/v1/maps", tags=["Maps & Nearby"])


@router.get("/config", response_model=MapConfigResponse)
def map_config():
    key = settings.GOOGLE_MAPS_API_KEY.strip() if settings.GOOGLE_MAPS_API_KEY else None
    return MapConfigResponse(google_maps_enabled=bool(key), google_maps_api_key=key or None)


@router.get("/points", response_model=list[MapPointResponse])
def list_map_points(db: Session = Depends(get_db)):
    points = []
    listings = db.query(BookListing).filter(
        BookListing.status == "active",
        BookListing.latitude.is_not(None),
        BookListing.longitude.is_not(None),
        BookListing.safe_meeting_point.is_not(None),
    ).all()
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

    communities = db.query(Community).filter(
        Community.is_active.is_(True),
        Community.latitude.is_not(None),
        Community.longitude.is_not(None),
        Community.location_name.is_not(None),
    ).all()
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