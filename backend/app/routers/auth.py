# BookLoop Authentication Router
# Signup, Login, Password Reset, and Current Session User verification.

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid
import datetime

from app.database.session import get_db
from app.models.user import User, UserProfile
from app.schemas.user import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    PasswordResetRequest, PasswordResetConfirm
)
from app.core.security import hash_password, verify_password, create_access_token
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(user_in: UserCreate, db: Session = Depends(get_db)):
    """Register a new student account with profile details."""
    existing_user = db.query(User).filter(User.email == user_in.email.lower()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists"
        )
    
    user = User(
        id=str(uuid.uuid4()),
        email=user_in.email.lower(),
        hashed_password=hash_password(user_in.password),
        is_active=True,
        is_verified=False
    )
    db.add(user)
    db.flush()

    profile = UserProfile(
        id=str(uuid.uuid4()),
        user_id=user.id,
        full_name=user_in.full_name,
        university=user_in.university,
        course=user_in.course,
        year=user_in.year,
        location=user_in.location,
        avatar_emoji="👨‍🎓",
        trust_score=5.0
    )
    db.add(profile)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email})
    return TokenResponse(access_token=token, token_type="bearer", user=user)

@router.post("/login", response_model=TokenResponse)
def login(login_in: UserLogin, db: Session = Depends(get_db)):
    """Authenticate student and return JWT access token."""
    user = db.query(User).filter(User.email == login_in.email.lower()).first()
    if not user or not verify_password(login_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is deactivated"
        )

    token = create_access_token({"sub": user.id, "email": user.email})
    return TokenResponse(access_token=token, token_type="bearer", user=user)

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get profile information for currently authenticated user."""
    return current_user

@router.post("/password-reset-request")
def password_reset_request(req: PasswordResetRequest, db: Session = Depends(get_db)):
    """Generate password reset token for student architecture."""
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user:
        return {"message": "If account exists, password reset instructions have been dispatched."}
    
    reset_token = str(uuid.uuid4())[:8].upper()
    user.reset_token = reset_token
    user.reset_token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    db.commit()

    return {
        "message": "Password reset token generated successfully",
        "demo_reset_token": reset_token,
        "instructions": "In production, an email with this reset code will be sent to your student inbox."
    }

@router.post("/password-reset")
def password_reset_confirm(confirm: PasswordResetConfirm, db: Session = Depends(get_db)):
    """Reset student password using reset token."""
    user = db.query(User).filter(User.email == confirm.email.lower()).first()
    if (
        not user
        or not user.reset_token
        or user.reset_token != confirm.reset_token
        or not user.reset_token_expires_at
        or user.reset_token_expires_at < datetime.datetime.utcnow()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email or password reset token"
        )
    
    user.hashed_password = hash_password(confirm.new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()

    return {"message": "Password updated successfully. You can now log in with your new password."}
