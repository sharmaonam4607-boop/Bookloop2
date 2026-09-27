from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class BookSeller(BaseModel):
    id: Optional[str] = None
    name: str
    university: Optional[str] = None
    course: Optional[str] = None
    year: Optional[str] = None
    trust_score: Optional[float] = None
    reviews_count: int = 0
    avatar_emoji: str = "👨‍🎓"


class BookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    author: str
    isbn: Optional[str] = None
    edition: Optional[str] = None
    course: Optional[str] = None
    course_code: Optional[str] = None
    category: str
    condition: str
    condition_label: str
    listing_type: str
    listing_type_label: str
    status: str = "active"
    price: Optional[float] = None
    price_unit: Optional[str] = None
    original_price: Optional[float] = None
    description: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list)
    cover_gradient: Optional[str] = None
    distance_km: Optional[float] = None
    safe_meeting_point: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    exchange_wish: Optional[str] = None
    is_seed_data: bool = False
    created_at: datetime
    seller: Optional[BookSeller] = None


class BookSearchResponse(BaseModel):
    items: list[BookResponse]
    total: int
    categories: list[str]
