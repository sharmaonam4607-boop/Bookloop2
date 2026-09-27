from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    book_id: Optional[str] = None
    request_id: Optional[str] = None


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class MessageResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    body: str
    read_at: Optional[datetime] = None
    created_at: datetime


class ConversationResponse(BaseModel):
    id: str
    other_user_id: str
    other_user_name: str
    book_id: Optional[str] = None
    book_title: Optional[str] = None
    request_id: Optional[str] = None
    latest_message: Optional[str] = None
    latest_message_at: Optional[datetime] = None
    unread_count: int = 0
    created_at: datetime


class ConversationDetailResponse(ConversationResponse):
    messages: list[MessageResponse] = Field(default_factory=list)


class NotificationResponse(BaseModel):
    id: str
    notification_type: str
    title: str
    body: str
    conversation_id: Optional[str] = None
    book_id: Optional[str] = None
    request_id: Optional[str] = None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int