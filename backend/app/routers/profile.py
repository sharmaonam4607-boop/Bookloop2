# BookLoop User Profile Router
# View & Edit student profile, university, course, and trust statistics.

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User, UserProfile
from app.schemas.user import ProfileResponse, ProfileUpdate
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/v1/profile", tags=["User Profile"])

@router.get("/me", response_model=ProfileResponse)
def get_my_profile(current_user: User = Depends(get_current_user)):
    """Retrieve profile details for currently authenticated user."""
    if not current_user.profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return current_user.profile

@router.put("/me", response_model=ProfileResponse)
def update_my_profile(
    profile_in: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update student profile details (name, university, course, year, location, bio, avatar)."""
    profile = current_user.profile
    if not profile:
        profile = UserProfile(user_id=current_user.id, full_name=current_user.email.split('@')[0])
        db.add(profile)
        db.flush()

    update_data = profile_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return profile

@router.get("/{user_id}", response_model=ProfileResponse)
def get_public_profile(user_id: str, db: Session = Depends(get_db)):
    """View public profile of another student."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return profile
