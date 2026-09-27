from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    request_id: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=2000)


class ReviewResponse(BaseModel):
    id: str
    request_id: str
    reviewed_user_id: str
    reviewer_name: str
    rating: int
    comment: Optional[str] = None
    book_title: str
    created_at: datetime


class ReviewSummary(BaseModel):
    user_id: str
    average_rating: Optional[float] = None
    review_count: int
    completed_interactions: int
    reviews: list[ReviewResponse] = Field(default_factory=list)


class EligibleReview(BaseModel):
    request_id: str
    book_title: str
    other_user_id: str
    other_user_name: str
    direction: str
    created_at: datetime


class ImpactSummary(BaseModel):
    completed_interactions: int
    books_given_second_chance: int
    books_sold: int
    books_donated: int
    books_exchanged: int
    books_lent: int
    students_connected: int
    communities: int
    community_memberships: int
    community_books_shared: int
    community_posts: int


class PersonalImpact(ImpactSummary):
    books_passed_on: int
    books_received: int
    communities_joined: int
    posts_created: int