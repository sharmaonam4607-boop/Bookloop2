import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.book import BookListing
from app.models.book_request import BookRequest
from app.models.conversation import Conversation, Message
from app.models.notification import Notification
from app.models.user import User
from app.schemas.messaging import (
    ConversationCreate,
    ConversationDetailResponse,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
    NotificationListResponse,
    NotificationResponse,
)
from app.services.notifications import create_notification

router = APIRouter(prefix="/api/v1", tags=["Chat & Notifications"])


def _display_name(user: User) -> str:
    return user.profile.full_name if user.profile else user.email


def _conversation_query(db: Session):
    return db.query(Conversation).options(
        joinedload(Conversation.participant_one).joinedload(User.profile),
        joinedload(Conversation.participant_two).joinedload(User.profile),
        joinedload(Conversation.book),
        joinedload(Conversation.request),
    )


def _is_member(conversation: Conversation, user_id: str) -> bool:
    return user_id in {conversation.participant_one_id, conversation.participant_two_id}


def _other_user(conversation: Conversation, user_id: str) -> User:
    return conversation.participant_two if conversation.participant_one_id == user_id else conversation.participant_one


def _unread_messages(db: Session, conversation_id: str, user_id: str) -> int:
    return db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.sender_id != user_id,
        Message.read_at.is_(None),
    ).count()


def _conversation_response(db: Session, conversation: Conversation, user_id: str) -> ConversationResponse:
    latest = db.query(Message).filter(Message.conversation_id == conversation.id).order_by(Message.created_at.desc()).first()
    other = _other_user(conversation, user_id)
    return ConversationResponse(
        id=conversation.id,
        other_user_id=other.id,
        other_user_name=_display_name(other),
        book_id=conversation.book_id,
        book_title=conversation.book.title if conversation.book else None,
        request_id=conversation.request_id,
        latest_message=latest.body if latest else None,
        latest_message_at=latest.created_at if latest else conversation.created_at,
        unread_count=_unread_messages(db, conversation.id, user_id),
        created_at=conversation.created_at,
    )


def _message_response(message: Message) -> MessageResponse:
    return MessageResponse(
        id=message.id,
        sender_id=message.sender_id,
        sender_name=_display_name(message.sender),
        body=message.body,
        read_at=message.read_at,
        created_at=message.created_at,
    )


@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversations = _conversation_query(db).filter(
        or_(Conversation.participant_one_id == current_user.id, Conversation.participant_two_id == current_user.id)
    ).order_by(Conversation.updated_at.desc()).all()
    return [_conversation_response(db, conversation, current_user.id) for conversation in conversations]


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def create_conversation(payload: ConversationCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not payload.book_id and not payload.request_id:
        raise HTTPException(status_code=422, detail="A book or request link is required")

    request = None
    book = None
    if payload.request_id:
        request = db.query(BookRequest).options(joinedload(BookRequest.book)).filter(BookRequest.id == payload.request_id).first()
        if not request:
            raise HTTPException(status_code=404, detail="Book request not found")
        if current_user.id not in {request.requester_id, request.book.seller_id}:
            raise HTTPException(status_code=403, detail="You are not part of this book request")
        book = request.book
        if payload.book_id and payload.book_id != book.id:
            raise HTTPException(status_code=400, detail="Book does not match the linked request")
    else:
        book = db.query(BookListing).filter(BookListing.id == payload.book_id).first()
        if not book:
            raise HTTPException(status_code=404, detail="Book listing not found")
        if book.status == "deleted" or not book.seller_id:
            raise HTTPException(status_code=409, detail="This listing cannot start a conversation")
        if current_user.id not in {book.seller_id} and book.status != "active":
            raise HTTPException(status_code=409, detail="This listing is no longer available")

    owner_id = book.seller_id
    if not owner_id or owner_id == current_user.id and not request:
        raise HTTPException(status_code=400, detail="A conversation requires two different students")
    participant_ids = sorted({owner_id, request.requester_id if request else current_user.id})
    if len(participant_ids) != 2:
        raise HTTPException(status_code=400, detail="A conversation requires two different students")
    participant_one_id, participant_two_id = participant_ids

    existing_query = db.query(Conversation).filter(
        Conversation.participant_one_id == participant_one_id,
        Conversation.participant_two_id == participant_two_id,
    )
    if request:
        existing_query = existing_query.filter(Conversation.request_id == request.id)
    else:
        existing_query = existing_query.filter(Conversation.book_id == book.id, Conversation.request_id.is_(None))
    existing = existing_query.first()
    if existing:
        return _conversation_response(db, _conversation_query(db).filter(Conversation.id == existing.id).first(), current_user.id)

    conversation = Conversation(
        participant_one_id=participant_one_id,
        participant_two_id=participant_two_id,
        book_id=book.id,
        request_id=request.id if request else None,
    )
    db.add(conversation)
    db.commit()
    conversation = _conversation_query(db).filter(Conversation.id == conversation.id).first()
    return _conversation_response(db, conversation, current_user.id)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(conversation_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = _conversation_query(db).filter(Conversation.id == conversation_id).first()
    if not conversation or not _is_member(conversation, current_user.id):
        raise HTTPException(status_code=404, detail="Conversation not found")

    now = datetime.datetime.now(datetime.timezone.utc)
    db.query(Message).filter(
        Message.conversation_id == conversation.id,
        Message.sender_id != current_user.id,
        Message.read_at.is_(None),
    ).update({Message.read_at: now}, synchronize_session=False)
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.conversation_id == conversation.id,
        Notification.read_at.is_(None),
    ).update({Notification.read_at: now}, synchronize_session=False)
    db.commit()

    messages = db.query(Message).options(joinedload(Message.sender).joinedload(User.profile)).filter(
        Message.conversation_id == conversation.id
    ).order_by(Message.created_at.asc()).all()
    summary = _conversation_response(db, conversation, current_user.id)
    return ConversationDetailResponse(**summary.model_dump(), messages=[_message_response(message) for message in messages])


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def send_message(conversation_id: str, payload: MessageCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = _conversation_query(db).filter(Conversation.id == conversation_id).first()
    if not conversation or not _is_member(conversation, current_user.id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="Message cannot be blank")
    message = Message(conversation_id=conversation.id, sender_id=current_user.id, body=body)
    conversation.updated_at = datetime.datetime.now(datetime.timezone.utc)
    recipient_id = conversation.participant_two_id if conversation.participant_one_id == current_user.id else conversation.participant_one_id
    db.add(message)
    db.flush()
    notification = create_notification(
        db,
        recipient_id,
        "new_message",
        "New message",
        f"{_display_name(current_user)} sent you a message.",
        conversation_id=conversation.id,
        message_id=message.id,
        book_id=conversation.book_id,
        request_id=conversation.request_id,
    )
    db.commit()
    message = db.query(Message).options(joinedload(Message.sender).joinedload(User.profile)).filter(Message.id == message.id).first()
    return _message_response(message)


@router.get("/notifications", response_model=NotificationListResponse)
def list_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).limit(100).all()
    unread_count = db.query(Notification).filter(Notification.user_id == current_user.id, Notification.read_at.is_(None)).count()
    return NotificationListResponse(
        items=[NotificationResponse(
            id=item.id,
            notification_type=item.notification_type,
            title=item.title,
            body=item.body,
            conversation_id=item.conversation_id,
            book_id=item.book_id,
            request_id=item.request_id,
            is_read=item.read_at is not None,
            created_at=item.created_at,
        ) for item in items],
        unread_count=unread_count,
    )


@router.patch("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(notification_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    if item.read_at is None:
        item.read_at = datetime.datetime.now(datetime.timezone.utc)
        db.commit()
        db.refresh(item)
    return NotificationResponse(
        id=item.id, notification_type=item.notification_type, title=item.title, body=item.body,
        conversation_id=item.conversation_id, book_id=item.book_id, request_id=item.request_id,
        is_read=item.read_at is not None, created_at=item.created_at,
    )


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read_at.is_(None),
    ).update({Notification.read_at: datetime.datetime.now(datetime.timezone.utc)}, synchronize_session=False)
    db.commit()