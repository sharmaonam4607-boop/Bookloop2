"""
BookLoop Phase 2 Unit and Integration Tests - Authentication & User Profile
"""
import sys, os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/.."))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.user import User, UserProfile
from app.database.base import Base
from app.main import app
from app.database.session import get_db

# Use SQLite in-memory with StaticPool to retain tables across test threads
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def test_signup_login_profile_flow():
    Base.metadata.create_all(bind=engine)

    # 1. Signup test
    signup_payload = {
        "email": "amanpreet@gndec.ac.in",
        "password": "Password123!",
        "full_name": "Amanpreet Singh",
        "university": "GNDEC Engineering College",
        "course": "B.Tech CSE",
        "year": "3rd Year",
        "location": "Ludhiana"
    }
    res = client.post("/api/v1/auth/signup", json=signup_payload)
    assert res.status_code == 201, f"Signup failed: {res.text}"
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "amanpreet@gndec.ac.in"
    assert data["user"]["profile"]["full_name"] == "Amanpreet Singh"

    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get Me test
    res_me = client.get("/api/v1/auth/me", headers=headers)
    assert res_me.status_code == 200
    assert res_me.json()["email"] == "amanpreet@gndec.ac.in"

    # 3. Login test
    login_payload = {
        "email": "amanpreet@gndec.ac.in",
        "password": "Password123!"
    }
    res_login = client.post("/api/v1/auth/login", json=login_payload)
    assert res_login.status_code == 200
    assert "access_token" in res_login.json()

    # 4. Profile update test
    update_payload = {
        "bio": "Passionate CSE student into algorithms & web dev.",
        "location": "Ludhiana Campus"
    }
    res_update = client.put("/api/v1/profile/me", json=update_payload, headers=headers)
    assert res_update.status_code == 200
    assert res_update.json()["bio"] == "Passionate CSE student into algorithms & web dev."
    assert res_update.json()["location"] == "Ludhiana Campus"

    # 5. Password reset request architecture test
    res_reset_req = client.post("/api/v1/auth/password-reset-request", json={"email": "amanpreet@gndec.ac.in"})
    assert res_reset_req.status_code == 200
    assert "demo_reset_token" in res_reset_req.json()
    reset_token = res_reset_req.json()["demo_reset_token"]

    # 6. Password reset confirm test
    reset_confirm_payload = {
        "email": "amanpreet@gndec.ac.in",
        "reset_token": reset_token,
        "new_password": "NewSecretPassword123!"
    }
    res_reset_confirm = client.post("/api/v1/auth/password-reset", json=reset_confirm_payload)
    assert res_reset_confirm.status_code == 200

    # 7. Login with new password
    res_login_new = client.post("/api/v1/auth/login", json={
        "email": "amanpreet@gndec.ac.in",
        "password": "NewSecretPassword123!"
    })
    assert res_login_new.status_code == 200

    Base.metadata.drop_all(bind=engine)

if __name__ == "__main__":
    test_signup_login_profile_flow()
    print("[SUCCESS] ALL PHASE 2 AUTHENTICATION & PROFILE TESTS PASSED SUCCESSFULLY!")
