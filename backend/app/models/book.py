from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship
import datetime
import uuid

from app.database.base import Base


def generate_book_id():
    return str(uuid.uuid4())


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


class BookListing(Base):
    __tablename__ = "book_listings"

    id = Column(String(36), primary_key=True, default=generate_book_id, index=True)
    seller_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String(255), nullable=False, index=True)
    author = Column(String(255), nullable=False, index=True)
    isbn = Column(String(32), nullable=True, index=True)
    edition = Column(String(150), nullable=True)
    course = Column(String(150), nullable=True, index=True)
    course_code = Column(String(50), nullable=True, index=True)
    category = Column(String(80), nullable=False, index=True)
    condition = Column(String(30), nullable=False, default="good")
    listing_type = Column(String(30), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="active", index=True)
    price = Column(Float, nullable=True)
    price_unit = Column(String(30), nullable=True)
    description = Column(Text, nullable=True)
    image_urls = Column(JSON, nullable=False, default=list)
    cover_gradient = Column(String(255), nullable=True)
    distance_km = Column(Float, nullable=True)
    safe_meeting_point = Column(String(180), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    original_price = Column(Float, nullable=True)
    exchange_wish = Column(String(255), nullable=True)
    is_seed_data = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    seller = relationship("User", back_populates="book_listings")
