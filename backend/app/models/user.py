# BookLoop User & UserProfile SQLAlchemy Models

from sqlalchemy import Column, String, Boolean, Integer, Float, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
import datetime
import uuid

from app.database.base import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    reset_token = Column(String(255), nullable=True)
    reset_token_expires_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    full_name = Column(String(100), nullable=False)
    university = Column(String(150), nullable=True)
    course = Column(String(100), nullable=True)
    year = Column(String(50), nullable=True)
    location = Column(String(150), nullable=True)
    bio = Column(Text, nullable=True)
    avatar_emoji = Column(String(20), default="👨‍🎓")
    avatar_url = Column(String(500), nullable=True)

    trust_score = Column(Float, default=5.0)
    books_shared = Column(Integer, default=0)
    books_sold = Column(Integer, default=0)
    books_donated = Column(Integer, default=0)
    books_exchanged = Column(Integer, default=0)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="profile")
