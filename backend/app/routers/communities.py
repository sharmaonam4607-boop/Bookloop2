from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, security_scheme
from app.core.security import decode_access_token
from app.database.session import get_db
from app.models.book import BookListing
from app.models.community import (
    Community,
    CommunityBook,
    CommunityComment,
    CommunityMembership,
    CommunityPost,
    CommunityReaction,
    CommunityReport,
)
from app.models.user import User
from app.schemas.community import (
    CommunityBookResponse,
    CommunityCommentCreate,
    CommunityCommentResponse,
    CommunityCreate,
    CommunityMemberResponse,
    CommunityPostCreate,
    CommunityPostResponse,
    CommunityReportCreate,
    CommunityReportResponse,
    CommunityResponse,
    ReactionResponse,
)

router = APIRouter(prefix="/api/v1/communities", tags=["Communities"])


def optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    if not credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        return None
    return db.query(User).filter(User.id == payload["sub"], User.is_active.is_(True)).first()


def _community_or_404(db: Session, community_id: str) -> Community:
    community = db.query(Community).filter(Community.id == community_id, Community.is_active.is_(True)).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    return community


def _require_member(db: Session, community_id: str, user_id: str):
    member = db.query(CommunityMembership).filter_by(community_id=community_id, user_id=user_id).first()
    if not member:
        raise HTTPException(status_code=403, detail="Join this community to use this feature")
    return member


def _community_response(db: Session, community: Community, user_id: Optional[str]) -> CommunityResponse:
    member_count = db.query(CommunityMembership).filter_by(community_id=community.id).count()
    book_count = db.query(CommunityBook).filter_by(community_id=community.id).count()
    is_member = bool(user_id and db.query(CommunityMembership.id).filter_by(
        community_id=community.id, user_id=user_id
    ).first())
    return CommunityResponse(
        id=community.id,
        name=community.name,
        description=community.description,
        category=community.category,
        creator_id=community.creator_id,
        member_count=member_count,
        book_count=book_count,
        location_name=community.location_name,
        latitude=community.latitude,
        longitude=community.longitude,
        is_member=is_member,
        is_seed_data=community.is_seed_data,
        created_at=community.created_at,
    )


def _comment_response(comment: CommunityComment) -> CommunityCommentResponse:
    author = comment.author
    return CommunityCommentResponse(
        id=comment.id,
        author_id=comment.author_id,
        author_name=author.profile.full_name if author.profile else author.email,
        content=comment.content,
        created_at=comment.created_at,
    )


def _post_response(db: Session, post: CommunityPost, user_id: Optional[str]) -> CommunityPostResponse:
    author = post.author
    comments = db.query(CommunityComment).options(
        joinedload(CommunityComment.author).joinedload(User.profile)
    ).filter(CommunityComment.post_id == post.id).order_by(CommunityComment.created_at.asc()).all()
    reaction_count = db.query(CommunityReaction).filter_by(post_id=post.id).count()
    reacted = bool(user_id and db.query(CommunityReaction.id).filter_by(
        post_id=post.id, user_id=user_id, reaction="like"
    ).first())
    return CommunityPostResponse(
        id=post.id,
        community_id=post.community_id,
        author_id=post.author_id,
        author_name=author.profile.full_name if author.profile else author.email,
        post_type=post.post_type,
        content=post.content,
        requested_title=post.requested_title,
        course=post.course,
        linked_book_id=post.linked_book_id,
        reaction_count=reaction_count,
        reacted_by_me=reacted,
        comments=[_comment_response(comment) for comment in comments],
        created_at=post.created_at,
    )


@router.get("", response_model=list[CommunityResponse])
def list_communities(
    q: Optional[str] = Query(default=None, min_length=1, max_length=120),
    category: Optional[str] = Query(default=None, max_length=60),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(optional_current_user),
):
    query = db.query(Community).filter(Community.is_active.is_(True))
    if q:
        query = query.filter(Community.name.ilike(f"%{q.strip()}%") | Community.description.ilike(f"%{q.strip()}%"))
    if category and category != "all":
        query = query.filter(Community.category == category)
    communities = query.order_by(Community.name.asc()).all()
    return [_community_response(db, community, current_user.id if current_user else None) for community in communities]


@router.post("", response_model=CommunityResponse, status_code=status.HTTP_201_CREATED)
def create_community(
    payload: CommunityCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(Community.id).filter(
        Community.creator_id == current_user.id,
        func.lower(Community.name) == payload.name.strip().lower(),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You already created a community with this name")
    community = Community(
        creator_id=current_user.id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        category=payload.category.strip(),
        location_name=payload.location_name.strip() if payload.location_name else None,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(community)
    db.flush()
    db.add(CommunityMembership(community_id=community.id, user_id=current_user.id, role="owner"))
    db.commit()
    db.refresh(community)
    return _community_response(db, community, current_user.id)


@router.get("/{community_id}", response_model=CommunityResponse)
def get_community(
    community_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(optional_current_user),
):
    community = _community_or_404(db, community_id)
    return _community_response(db, community, current_user.id if current_user else None)


@router.post("/{community_id}/join", response_model=CommunityResponse)
def join_community(community_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    community = _community_or_404(db, community_id)
    existing = db.query(CommunityMembership).filter_by(community_id=community_id, user_id=current_user.id).first()
    if existing:
        raise HTTPException(status_code=409, detail="You already joined this community")
    db.add(CommunityMembership(community_id=community_id, user_id=current_user.id))
    db.commit()
    return _community_response(db, community, current_user.id)


@router.delete("/{community_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_community(community_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _community_or_404(db, community_id)
    membership = db.query(CommunityMembership).filter_by(community_id=community_id, user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    if membership.role == "owner":
        raise HTTPException(status_code=409, detail="The community owner cannot leave their own community")
    db.delete(membership)
    db.commit()


@router.get("/{community_id}/members", response_model=list[CommunityMemberResponse])
def list_members(community_id: str, db: Session = Depends(get_db)):
    _community_or_404(db, community_id)
    members = db.query(CommunityMembership).options(
        joinedload(CommunityMembership.user).joinedload(User.profile)
    ).filter_by(community_id=community_id).order_by(CommunityMembership.joined_at.asc()).all()
    return [CommunityMemberResponse(
        user_id=member.user_id,
        name=member.user.profile.full_name if member.user.profile else member.user.email,
        university=member.user.profile.university if member.user.profile else None,
        course=member.user.profile.course if member.user.profile else None,
        role=member.role,
        joined_at=member.joined_at,
    ) for member in members]


@router.get("/{community_id}/books", response_model=list[CommunityBookResponse])
def list_community_books(community_id: str, db: Session = Depends(get_db)):
    _community_or_404(db, community_id)
    rows = db.query(CommunityBook, BookListing, User).join(
        BookListing, CommunityBook.book_id == BookListing.id
    ).join(User, CommunityBook.added_by_id == User.id).options(
        joinedload(User.profile)
    ).filter(CommunityBook.community_id == community_id).order_by(CommunityBook.created_at.desc()).all()
    return [CommunityBookResponse(
        id=book.id,
        title=book.title,
        author=book.author,
        category=book.category,
        condition=book.condition,
        listing_type=book.listing_type,
        status=book.status,
        price=book.price,
        is_seed_data=book.is_seed_data,
        added_by=user.profile.full_name if user.profile else user.email,
        created_at=community_book.created_at,
    ) for community_book, book, user in rows]


@router.post("/{community_id}/books/{book_id}", response_model=CommunityBookResponse, status_code=status.HTTP_201_CREATED)
def add_community_book(
    community_id: str,
    book_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _community_or_404(db, community_id)
    _require_member(db, community_id, current_user.id)
    book = db.query(BookListing).filter(
        BookListing.id == book_id, BookListing.seller_id == current_user.id, BookListing.status == "active"
    ).first()
    if not book:
        raise HTTPException(status_code=404, detail="Active listing owned by you not found")
    existing = db.query(CommunityBook).filter_by(community_id=community_id, book_id=book_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="This book is already shared with the community")
    shared = CommunityBook(community_id=community_id, book_id=book_id, added_by_id=current_user.id)
    db.add(shared)
    db.commit()
    db.refresh(shared)
    return CommunityBookResponse(
        id=book.id, title=book.title, author=book.author, category=book.category,
        condition=book.condition, listing_type=book.listing_type, status=book.status,
        price=book.price, is_seed_data=book.is_seed_data,
        added_by=current_user.profile.full_name if current_user.profile else current_user.email,
        created_at=shared.created_at,
    )


@router.get("/{community_id}/posts", response_model=list[CommunityPostResponse])
def list_posts(
    community_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(optional_current_user),
):
    _community_or_404(db, community_id)
    posts = db.query(CommunityPost).options(
        joinedload(CommunityPost.author).joinedload(User.profile)
    ).filter_by(community_id=community_id).order_by(CommunityPost.created_at.desc()).all()
    return [_post_response(db, post, current_user.id if current_user else None) for post in posts]


@router.post("/{community_id}/posts", response_model=CommunityPostResponse, status_code=status.HTTP_201_CREATED)
def create_post(
    community_id: str,
    payload: CommunityPostCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _community_or_404(db, community_id)
    _require_member(db, community_id, current_user.id)
    if payload.linked_book_id:
        book = db.query(BookListing).filter(BookListing.id == payload.linked_book_id, BookListing.status == "active").first()
        if not book:
            raise HTTPException(status_code=404, detail="Active linked book listing not found")
    post = CommunityPost(
        community_id=community_id,
        author_id=current_user.id,
        post_type=payload.post_type,
        content=payload.content.strip(),
        requested_title=payload.requested_title.strip() if payload.requested_title else None,
        course=payload.course.strip() if payload.course else None,
        linked_book_id=payload.linked_book_id,
    )
    db.add(post)
    db.commit()
    post = db.query(CommunityPost).options(joinedload(CommunityPost.author).joinedload(User.profile)).filter(CommunityPost.id == post.id).first()
    return _post_response(db, post, current_user.id)


@router.post("/{community_id}/posts/{post_id}/comments", response_model=CommunityCommentResponse, status_code=status.HTTP_201_CREATED)
def add_comment(
    community_id: str,
    post_id: str,
    payload: CommunityCommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _community_or_404(db, community_id)
    _require_member(db, community_id, current_user.id)
    post = db.query(CommunityPost).filter_by(id=post_id, community_id=community_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Community post not found")
    comment = CommunityComment(post_id=post_id, author_id=current_user.id, content=payload.content.strip())
    db.add(comment)
    db.commit()
    comment = db.query(CommunityComment).options(joinedload(CommunityComment.author).joinedload(User.profile)).filter(CommunityComment.id == comment.id).first()
    return _comment_response(comment)


@router.post("/{community_id}/posts/{post_id}/reactions", response_model=ReactionResponse)
def add_reaction(
    community_id: str,
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _community_or_404(db, community_id)
    _require_member(db, community_id, current_user.id)
    post = db.query(CommunityPost).filter_by(id=post_id, community_id=community_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Community post not found")
    reaction = db.query(CommunityReaction).filter_by(post_id=post_id, user_id=current_user.id, reaction="like").first()
    if not reaction:
        db.add(CommunityReaction(post_id=post_id, user_id=current_user.id, reaction="like"))
        db.commit()
    return ReactionResponse(
        reaction_count=db.query(CommunityReaction).filter_by(post_id=post_id).count(),
        reacted=True,
    )


@router.delete("/{community_id}/posts/{post_id}/reactions", response_model=ReactionResponse)
def remove_reaction(
    community_id: str,
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _community_or_404(db, community_id)
    _require_member(db, community_id, current_user.id)
    post = db.query(CommunityPost).filter_by(id=post_id, community_id=community_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Community post not found")
    reaction = db.query(CommunityReaction).filter_by(post_id=post_id, user_id=current_user.id, reaction="like").first()
    if reaction:
        db.delete(reaction)
        db.commit()
    return ReactionResponse(
        reaction_count=db.query(CommunityReaction).filter_by(post_id=post_id).count(),
        reacted=False,
    )


@router.post("/{community_id}/reports", response_model=CommunityReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(
    community_id: str,
    payload: CommunityReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _community_or_404(db, community_id)
    _require_member(db, community_id, current_user.id)
    target_exists = False
    if payload.target_type == "community":
        target_exists = payload.target_id == community_id
    elif payload.target_type == "post":
        target_exists = db.query(CommunityPost.id).filter_by(id=payload.target_id, community_id=community_id).first() is not None
    elif payload.target_type == "comment":
        target_exists = db.query(CommunityComment.id).join(CommunityPost).filter(
            CommunityComment.id == payload.target_id, CommunityPost.community_id == community_id
        ).first() is not None
    elif payload.target_type == "book":
        target_exists = db.query(CommunityBook.id).filter_by(community_id=community_id, book_id=payload.target_id).first() is not None
    if not target_exists:
        raise HTTPException(status_code=404, detail="Report target not found in this community")
    duplicate = db.query(CommunityReport).filter_by(
        reporter_id=current_user.id, target_type=payload.target_type, target_id=payload.target_id
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="You have already reported this item")
    report = CommunityReport(
        community_id=community_id,
        reporter_id=current_user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason.strip(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return CommunityReportResponse(
        id=report.id, community_id=report.community_id, target_type=report.target_type,
        target_id=report.target_id, reason=report.reason, status=report.status, created_at=report.created_at,
    )