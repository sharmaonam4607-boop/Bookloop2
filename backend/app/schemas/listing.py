from typing import Optional, Literal

from pydantic import BaseModel, Field, model_validator


ListingType = Literal["sell", "exchange", "donate", "lend"]
ListingStatus = Literal["active", "paused", "sold", "exchanged", "donated", "lent", "deleted"]


class ListingCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    author: str = Field(..., min_length=2, max_length=255)
    isbn: Optional[str] = Field(default=None, max_length=32)
    edition: Optional[str] = Field(default=None, max_length=150)
    course: Optional[str] = Field(default=None, max_length=150)
    course_code: Optional[str] = Field(default=None, max_length=50)
    category: str = Field(..., min_length=2, max_length=80)
    condition: Literal["like_new", "good", "worn"]
    listing_type: ListingType
    price: Optional[float] = Field(default=None, ge=0)
    price_unit: Optional[str] = Field(default=None, max_length=30)
    description: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list, max_length=8)
    cover_gradient: Optional[str] = Field(default=None, max_length=255)
    distance_km: Optional[float] = Field(default=None, ge=0)
    safe_meeting_point: Optional[str] = Field(default=None, max_length=180)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    original_price: Optional[float] = Field(default=None, ge=0)
    exchange_wish: Optional[str] = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_terms(self):
        if self.listing_type == "sell" and self.price is None:
            raise ValueError("A sale listing requires a price")
        if self.listing_type == "lend" and self.price is None:
            raise ValueError("A lending listing requires a rate")
        if self.listing_type != "sell" and self.listing_type != "lend":
            self.price = 0
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Both approximate coordinates are required")
        if self.latitude is not None and not self.safe_meeting_point:
            raise ValueError("Set a safe public meeting point when providing coordinates")
        return self


class ListingUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=255)
    author: Optional[str] = Field(default=None, min_length=2, max_length=255)
    isbn: Optional[str] = Field(default=None, max_length=32)
    edition: Optional[str] = Field(default=None, max_length=150)
    course: Optional[str] = Field(default=None, max_length=150)
    course_code: Optional[str] = Field(default=None, max_length=50)
    category: Optional[str] = Field(default=None, min_length=2, max_length=80)
    condition: Optional[Literal["like_new", "good", "worn"]] = None
    listing_type: Optional[ListingType] = None
    price: Optional[float] = Field(default=None, ge=0)
    price_unit: Optional[str] = Field(default=None, max_length=30)
    description: Optional[str] = None
    image_urls: Optional[list[str]] = Field(default=None, max_length=8)
    cover_gradient: Optional[str] = Field(default=None, max_length=255)
    distance_km: Optional[float] = Field(default=None, ge=0)
    safe_meeting_point: Optional[str] = Field(default=None, max_length=180)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    original_price: Optional[float] = Field(default=None, ge=0)
    exchange_wish: Optional[str] = Field(default=None, max_length=255)
    status: Optional[ListingStatus] = None
