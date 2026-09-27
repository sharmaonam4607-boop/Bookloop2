from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class CommunityCreate(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    category: str = Field(min_length=2, max_length=60)
    location_name: Optional[str] = Field(default=None, max_length=180)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def validate_location(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Both approximate coordinates are required")
        if self.latitude is not None and not self.location_name:
            raise ValueError("Set an approximate campus location when providing coordinates")
        return self


class CommunityResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    creator_id: Optional[str] = None
    member_count: int
    book_count: int
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_member: bool = False
    is_seed_data: bool = False
    created_at: datetime


class CommunityMemberResponse(BaseModel):
    user_id: str
    name: str
    university: Optional[str] = None
    course: Optional[str] = None
    role: str
    joined_at: datetime


class CommunityBookResponse(BaseModel):
    id: str
    title: str
    author: str
    category: str
    condition: str
    listing_type: str
    status: str
    price: Optional[float] = None
    is_seed_data: bool = False
    added_by: str
    created_at: datetime


class CommunityCommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class CommunityCommentResponse(BaseModel):
    id: str
    author_id: str
    author_name: str
    content: str
    created_at: datetime


class CommunityPostCreate(BaseModel):
    post_type: Literal["discussion", "book_request"] = "discussion"
    content: str = Field(min_length=1, max_length=4000)
    requested_title: Optional[str] = Field(default=None, max_length=255)
    course: Optional[str] = Field(default=None, max_length=150)
    linked_book_id: Optional[str] = None

    @model_validator(mode="after")
    def require_request_title(self):
        if self.post_type == "book_request" and not self.requested_title:
            raise ValueError("Book request posts require a requested title")
        return self


class CommunityPostResponse(BaseModel):
    id: str
    community_id: str
    author_id: str
    author_name: str
    post_type: Literal["discussion", "book_request"]
    content: str
    requested_title: Optional[str] = None
    course: Optional[str] = None
    linked_book_id: Optional[str] = None
    reaction_count: int
    reacted_by_me: bool
    comments: list[CommunityCommentResponse] = Field(default_factory=list)
    created_at: datetime


class ReactionResponse(BaseModel):
    reaction_count: int
    reacted: bool


class CommunityReportCreate(BaseModel):
    target_type: Literal["community", "post", "comment", "book"]
    target_id: str
    reason: str = Field(min_length=5, max_length=1000)


class CommunityReportResponse(BaseModel):
    id: str
    community_id: str
    target_type: str
    target_id: str
    reason: str
    status: str
    created_at: datetime