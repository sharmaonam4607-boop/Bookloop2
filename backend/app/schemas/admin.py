from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: EmailStr


class AdminUserResponse(BaseModel):
    id: str
    email: str
    is_active: bool
    is_verified: bool
    full_name: Optional[str] = None
    university: Optional[str] = None
    created_at: datetime
    listings_count: int


class AdminUserStatusUpdate(BaseModel):
    is_active: bool


class AdminListingResponse(BaseModel):
    id: str
    title: str
    author: str
    listing_type: str
    status: str
    seller_id: Optional[str] = None
    seller_name: Optional[str] = None
    is_seed_data: bool
    created_at: datetime


class AdminListingStatusUpdate(BaseModel):
    status: str = Field(pattern="^(active|paused|sold|exchanged|donated|lent|deleted)$")


class AdminCommunityResponse(BaseModel):
    id: str
    name: str
    category: str
    is_active: bool
    is_seed_data: bool
    created_at: datetime
    member_count: int
    post_count: int


class AdminCommunityStatusUpdate(BaseModel):
    is_active: bool


class AdminReportResponse(BaseModel):
    id: str
    community_id: str
    community_name: str
    reporter_id: str
    target_type: str
    target_id: str
    reason: str
    status: str
    created_at: datetime


class AdminReportStatusUpdate(BaseModel):
    status: str = Field(pattern="^(open|resolved|dismissed)$")


class AdminReviewResponse(BaseModel):
    id: str
    request_id: str
    reviewer_id: str
    reviewer_name: str
    reviewed_user_id: str
    reviewed_user_name: str
    book_title: str
    rating: int
    comment: Optional[str] = None
    is_hidden: bool
    created_at: datetime


class AdminReviewStatusUpdate(BaseModel):
    is_hidden: bool


class AdminAnalyticsResponse(BaseModel):
    users_total: int
    users_active: int
    listings_total: int
    listings_active: int
    communities_total: int
    communities_active: int
    open_reports: int
    reviews_total: int
    completed_interactions: int
    books_given_second_chance: int
    students_connected: int