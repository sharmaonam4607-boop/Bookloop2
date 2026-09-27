import os
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/.."))

from app.core.config import settings
from app.database.base import Base
from app.database.session import get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    if previous_override is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous_override
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def create_student(client, email, name):
    response = client.post("/api/v1/auth/signup", json={
        "email": email,
        "password": "Password123!",
        "full_name": name,
        "university": "BookLoop University",
        "course": "B.Tech CSE",
        "year": "3rd Year",
        "location": "Campus",
    })
    assert response.status_code == 201
    return response.json()


def test_admin_allowlist_moderation_and_analytics(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "admin@test.edu")
    admin_user = create_student(client, "admin@test.edu", "Site Administrator")
    student = create_student(client, "student@test.edu", "Campus Student")
    admin_headers = {"Authorization": f"Bearer {admin_user['access_token']}"}
    student_headers = {"Authorization": f"Bearer {student['access_token']}"}

    assert client.get("/api/v1/admin/users").status_code == 401
    assert client.post("/api/v1/admin/auth/login", json={"email": "student@test.edu", "password": "Password123!"}).status_code == 401
    admin_login = client.post("/api/v1/admin/auth/login", json={"email": "admin@test.edu", "password": "Password123!"})
    assert admin_login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
    assert client.get("/api/v1/admin/auth/me", headers=admin_headers).json()["email"] == "admin@test.edu"
    assert client.get("/api/v1/admin/users", headers=student_headers).status_code == 403

    book = client.post("/api/v1/books", headers=student_headers, json={
        "title": "Admin Moderation Textbook",
        "author": "Admin Test Author",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
    })
    book_id = book.json()["id"]
    paused = client.patch(f"/api/v1/admin/listings/{book_id}", headers=admin_headers, json={"status": "paused"})
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"
    assert client.patch(f"/api/v1/admin/listings/{book_id}", headers=admin_headers, json={"status": "active"}).status_code == 200

    community = client.post("/api/v1/communities", headers=student_headers, json={
        "name": "Admin Moderation Circle",
        "description": "A community used to verify moderation tools.",
        "category": "Other",
    })
    community_id = community.json()["id"]
    hidden_community = client.patch(f"/api/v1/admin/communities/{community_id}", headers=admin_headers, json={"is_active": False})
    assert hidden_community.status_code == 200
    assert client.get(f"/api/v1/communities/{community_id}").status_code == 404

    post = client.post(f"/api/v1/communities/{community_id}/posts", headers=student_headers, json={"content": "A reportable post"})
    assert post.status_code == 404
    community = client.post("/api/v1/communities", headers=student_headers, json={
        "name": "Admin Report Circle",
        "description": "A community used to verify reports moderation.",
        "category": "Other",
    })
    community_id = community.json()["id"]
    post = client.post(f"/api/v1/communities/{community_id}/posts", headers=student_headers, json={"content": "A reportable post"})
    report = client.post(f"/api/v1/communities/{community_id}/reports", headers=student_headers, json={
        "target_type": "post",
        "target_id": post.json()["id"],
        "reason": "Needs moderator review.",
    })
    assert report.status_code == 201
    resolved = client.patch(f"/api/v1/admin/reports/{report.json()['id']}", headers=admin_headers, json={"status": "resolved"})
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"

    request = client.post(f"/api/v1/books/{book_id}/requests", headers=admin_headers, json={})
    assert request.status_code == 201
    assert client.patch(f"/api/v1/requests/{request.json()['id']}", headers=student_headers, json={"status": "accepted"}).status_code == 200
    assert client.patch(f"/api/v1/requests/{request.json()['id']}", headers=student_headers, json={"status": "completed"}).status_code == 200
    review = client.post("/api/v1/reviews", headers=admin_headers, json={"request_id": request.json()["id"], "rating": 2, "comment": "Needs review"})
    assert review.status_code == 201
    hidden_review = client.patch(f"/api/v1/admin/reviews/{review.json()['id']}", headers=admin_headers, json={"is_hidden": True})
    assert hidden_review.status_code == 200
    assert hidden_review.json()["is_hidden"] is True
    assert client.get(f"/api/v1/reviews/users/{student['user']['id']}").json()["review_count"] == 0

    assert client.patch(f"/api/v1/admin/users/{student['user']['id']}", headers=admin_headers, json={"is_active": False}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=student_headers).status_code == 401
    analytics = client.get("/api/v1/admin/analytics", headers=admin_headers)
    assert analytics.status_code == 200
    assert analytics.json()["completed_interactions"] == 1