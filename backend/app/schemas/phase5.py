from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


RequestStatus = Literal["pending", "accepted", "rejected", "cancelled", "completed"]


class RequestCreate(BaseModel):
    message: Optional[str] = Field(default=None, max_length=1000)


class RequestStatusUpdate(BaseModel):
    status: Literal["accepted", "rejected", "cancelled", "completed"]


class BookRequestResponse(BaseModel):
    id: str
    book_id: str
    title: str
    author: str
    listing_type: str
    status: RequestStatus
    message: Optional[str] = None
    requester_id: str
    requester_name: str
    owner_id: str
    owner_name: str
    direction: Literal["incoming", "outgoing"]
    created_at: datetime


class WishlistBookResponse(BaseModel):
    id: str
    book_id: str
    title: str
    author: str
    listing_type: str
    listing_type_label: str
    status: str
    price: Optional[float] = None
    condition: str
    category: str
    is_available: bool
    is_seed_data: bool
    created_at: datetime


class LibraryItemResponse(BaseModel):
    book_id: str
    title: str
    author: str
    category: Literal["listed", "owned", "borrowed", "lent", "sold", "donated", "exchanged"]
    status: str
    listing_type: str
    request_id: Optional[str] = None
    other_student: Optional[str] = None
    is_seed_data: bool = False
    created_at: datetime