import os
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/.."))

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
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_community_membership_books_feed_and_moderation(client):
    owner_headers = create_student(client, "community-owner@student.edu", "Community Owner")
    member_headers = create_student(client, "community-member@student.edu", "Community Member")
    outsider_headers = create_student(client, "community-outsider@student.edu", "Community Outsider")

    created = client.post("/api/v1/communities", headers=owner_headers, json={
        "name": "CSE Book Exchange",
        "description": "A place to discuss and share books for computer science courses.",
        "category": "Computer Science",
    })
    assert created.status_code == 201
    community_id = created.json()["id"]
    assert created.json()["member_count"] == 1
    assert created.json()["is_member"] is True
    duplicate = client.post("/api/v1/communities", headers=owner_headers, json={
        "name": "  cse book exchange  ",
        "description": "A second copy under a differently cased name.",
        "category": "Computer Science",
    })
    assert duplicate.status_code == 409
    assert client.get("/api/v1/communities").json()[0]["is_member"] is False
    assert client.get("/api/v1/communities", headers=owner_headers).json()[0]["is_member"] is True

    joined = client.post(f"/api/v1/communities/{community_id}/join", headers=member_headers)
    assert joined.status_code == 200
    assert joined.json()["member_count"] == 2
    assert client.post(f"/api/v1/communities/{community_id}/join", headers=member_headers).status_code == 409
    assert len(client.get(f"/api/v1/communities/{community_id}/members").json()) == 2

    book = client.post("/api/v1/books", headers=owner_headers, json={
        "title": "Community Shared Algorithms",
        "author": "Test Author",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
    })
    assert book.status_code == 201
    book_id = book.json()["id"]
    shared = client.post(f"/api/v1/communities/{community_id}/books/{book_id}", headers=owner_headers)
    assert shared.status_code == 201
    assert client.get(f"/api/v1/communities/{community_id}/books").json()[0]["id"] == book_id
    assert client.post(f"/api/v1/communities/{community_id}/books/{book_id}", headers=owner_headers).status_code == 409

    post = client.post(f"/api/v1/communities/{community_id}/posts", headers=member_headers, json={
        "post_type": "book_request",
        "content": "Looking for a copy before next semester starts.",
        "requested_title": "Database System Concepts",
        "course": "B.Tech CSE",
    })
    assert post.status_code == 201
    post_id = post.json()["id"]
    assert post.json()["post_type"] == "book_request"
    assert client.get(f"/api/v1/communities/{community_id}/posts").json()[0]["requested_title"] == "Database System Concepts"
    assert client.post(f"/api/v1/communities/{community_id}/posts", headers=outsider_headers, json={
        "content": "Should not be allowed",
    }).status_code == 403

    comment = client.post(f"/api/v1/communities/{community_id}/posts/{post_id}/comments", headers=owner_headers, json={
        "content": "I can check with my class group.",
    })
    assert comment.status_code == 201
    assert comment.json()["author_name"] == "Community Owner"
    assert client.post(f"/api/v1/communities/{community_id}/posts/{post_id}/comments", headers=outsider_headers, json={
        "content": "Outside comment",
    }).status_code == 403

    reacted = client.post(f"/api/v1/communities/{community_id}/posts/{post_id}/reactions", headers=owner_headers)
    assert reacted.status_code == 200
    assert reacted.json() == {"reaction_count": 1, "reacted": True}
    assert client.post(f"/api/v1/communities/{community_id}/posts/{post_id}/reactions", headers=owner_headers).json()["reaction_count"] == 1
    unreacted = client.delete(f"/api/v1/communities/{community_id}/posts/{post_id}/reactions", headers=owner_headers)
    assert unreacted.json() == {"reaction_count": 0, "reacted": False}

    report = client.post(f"/api/v1/communities/{community_id}/reports", headers=owner_headers, json={
        "target_type": "post",
        "target_id": post_id,
        "reason": "This post needs moderator review.",
    })
    assert report.status_code == 201
    assert report.json()["status"] == "open"
    assert client.post(f"/api/v1/communities/{community_id}/reports", headers=owner_headers, json={
        "target_type": "post",
        "target_id": post_id,
        "reason": "Duplicate report test.",
    }).status_code == 409

    assert client.delete(f"/api/v1/communities/{community_id}/leave", headers=member_headers).status_code == 204
    assert client.get(f"/api/v1/communities/{community_id}/posts", headers=outsider_headers).status_code == 200
    assert client.post(f"/api/v1/communities/{community_id}/posts/{post_id}/reactions", headers=outsider_headers).status_code == 403
    assert client.delete(f"/api/v1/communities/{community_id}/leave", headers=owner_headers).status_code == 409