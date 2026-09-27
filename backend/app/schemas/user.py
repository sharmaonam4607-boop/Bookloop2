# BookLoop Pydantic Schemas for User Authentication & Profile

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="User password")
    full_name: str = Field(..., min_length=2, max_length=100)
    university: Optional[str] = "GNDEC Engineering College"
    course: Optional[str] = "B.Tech CSE"
    year: Optional[str] = "3rd Year"
    location: Optional[str] = "Ludhiana"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    email: EmailStr
    reset_token: str
    new_password: str = Field(..., min_length=6)

class ProfileResponse(BaseModel):
    id: str
    user_id: str
    full_name: str
    university: Optional[str] = None
    course: Optional[str] = None
    year: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    avatar_emoji: str = "👨‍🎓"
    avatar_url: Optional[str] = None
    trust_score: float = 5.0
    books_shared: int = 0
    books_sold: int = 0
    books_donated: int = 0
    books_exchanged: int = 0

    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: str
    email: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    profile: Optional[ProfileResponse] = None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    university: Optional[str] = None
    course: Optional[str] = None
    year: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    avatar_emoji: Optional[str] = None
    avatar_url: Optional[str] = None
