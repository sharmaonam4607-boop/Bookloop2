import datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database.base import Base


def new_id():
    return str(uuid.uuid4())


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


class Community(Base):
    __tablename__ = "communities"

    id = Column(String(36), primary_key=True, default=new_id)
    creator_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(120), nullable=False, index=True)
    description = Column(Text, nullable=False)
    category = Column(String(60), nullable=False, index=True)
    location_name = Column(String(180), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    is_seed_data = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    creator = relationship("User")


class CommunityMembership(Base):
    __tablename__ = "community_memberships"
    __table_args__ = (UniqueConstraint("community_id", "user_id", name="uq_community_member"),)

    id = Column(String(36), primary_key=True, default=new_id)
    community_id = Column(String(36), ForeignKey("communities.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="member")
    joined_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User")


class CommunityBook(Base):
    __tablename__ = "community_books"
    __table_args__ = (UniqueConstraint("community_id", "book_id", name="uq_community_book"),)

    id = Column(String(36), primary_key=True, default=new_id)
    community_id = Column(String(36), ForeignKey("communities.id", ondelete="CASCADE"), nullable=False, index=True)
    book_id = Column(String(36), ForeignKey("book_listings.id", ondelete="CASCADE"), nullable=False, index=True)
    added_by_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class CommunityPost(Base):
    __tablename__ = "community_posts"

    id = Column(String(36), primary_key=True, default=new_id)
    community_id = Column(String(36), ForeignKey("communities.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    linked_book_id = Column(String(36), ForeignKey("book_listings.id", ondelete="SET NULL"), nullable=True)
    post_type = Column(String(24), nullable=False, default="discussion")
    content = Column(Text, nullable=False)
    requested_title = Column(String(255), nullable=True)
    course = Column(String(150), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    author = relationship("User")


class CommunityComment(Base):
    __tablename__ = "community_comments"

    id = Column(String(36), primary_key=True, default=new_id)
    post_id = Column(String(36), ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    author = relationship("User")


class CommunityReaction(Base):
    __tablename__ = "community_reactions"
    __table_args__ = (UniqueConstraint("post_id", "user_id", "reaction", name="uq_community_reaction"),)

    id = Column(String(36), primary_key=True, default=new_id)
    post_id = Column(String(36), ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reaction = Column(String(20), nullable=False, default="like")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class CommunityReport(Base):
    __tablename__ = "community_reports"
    __table_args__ = (UniqueConstraint("reporter_id", "target_type", "target_id", name="uq_community_reporter_target"),)

    id = Column(String(36), primary_key=True, default=new_id)
    community_id = Column(String(36), ForeignKey("communities.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    target_type = Column(String(20), nullable=False)
    target_id = Column(String(36), nullable=False, index=True)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="open")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)