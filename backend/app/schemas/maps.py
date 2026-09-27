from typing import Literal, Optional

from pydantic import BaseModel


class MapConfigResponse(BaseModel):
    google_maps_enabled: bool
    google_maps_api_key: Optional[str] = None


class MapPointResponse(BaseModel):
    id: str
    point_type: Literal["book", "community"]
    title: str
    subtitle: str
    latitude: float
    longitude: float
    location_name: str
    book_listing_type: Optional[str] = None
    is_seed_data: bool = False