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
    return response.json()


def test_reviews_only_after_completion_and_impact_uses_records(client):
    owner = create_student(client, "phase9-owner@student.edu", "Book Owner")
    requester = create_student(client, "phase9-requester@student.edu", "Book Requester")
    outsider = create_student(client, "phase9-outsider@student.edu", "Outside Student")
    owner_headers = {"Authorization": f"Bearer {owner['access_token']}"}
    requester_headers = {"Authorization": f"Bearer {requester['access_token']}"}
    outsider_headers = {"Authorization": f"Bearer {outsider['access_token']}"}

    listing = client.post("/api/v1/books", headers=owner_headers, json={
        "title": "Phase Nine Impact Book",
        "author": "Trust Test Author",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
    })
    book_id = listing.json()["id"]
    request = client.post(f"/api/v1/books/{book_id}/requests", headers=requester_headers, json={})
    request_id = request.json()["id"]

    assert client.get("/api/v1/reviews/eligible", headers=owner_headers).json() == []
    assert client.post("/api/v1/reviews", headers=requester_headers, json={
        "request_id": request_id,
        "rating": 5,
        "comment": "Great handoff.",
    }).status_code == 409

    assert client.patch(f"/api/v1/requests/{request_id}", headers=owner_headers, json={"status": "accepted"}).status_code == 200
    assert client.patch(f"/api/v1/requests/{request_id}", headers=owner_headers, json={"status": "completed"}).status_code == 200
    assert len(client.get("/api/v1/reviews/eligible", headers=owner_headers).json()) == 1
    assert len(client.get("/api/v1/reviews/eligible", headers=requester_headers).json()) == 1
    book_without_review = client.get(f"/api/v1/books/{book_id}").json()
    assert book_without_review["seller"]["trust_score"] is None
    assert book_without_review["seller"]["reviews_count"] == 0

    assert client.post("/api/v1/reviews", headers=outsider_headers, json={"request_id": request_id, "rating": 1}).status_code == 403
    owner_review = client.post("/api/v1/reviews", headers=requester_headers, json={
        "request_id": request_id,
        "rating": 4,
        "comment": "Book was as described.",
    })
    assert owner_review.status_code == 201
    assert owner_review.json()["reviewed_user_id"] == owner["user"]["id"]
    assert client.post("/api/v1/reviews", headers=requester_headers, json={"request_id": request_id, "rating": 5}).status_code == 409
    requester_review = client.post("/api/v1/reviews", headers=owner_headers, json={
        "request_id": request_id,
        "rating": 5,
    })
    assert requester_review.status_code == 201
    book_with_review = client.get(f"/api/v1/books/{book_id}").json()
    assert book_with_review["seller"]["trust_score"] == 4.0
    assert book_with_review["seller"]["reviews_count"] == 1

    owner_summary = client.get(f"/api/v1/reviews/users/{owner['user']['id']}").json()
    requester_summary = client.get(f"/api/v1/reviews/users/{requester['user']['id']}").json()
    assert owner_summary["average_rating"] == 4.0
    assert owner_summary["review_count"] == 1
    assert owner_summary["completed_interactions"] == 1
    assert requester_summary["average_rating"] == 5.0

    global_impact = client.get("/api/v1/impact").json()
    owner_impact = client.get("/api/v1/impact/me", headers=owner_headers).json()
    requester_impact = client.get("/api/v1/impact/me", headers=requester_headers).json()
    assert global_impact["completed_interactions"] == 1
    assert global_impact["books_given_second_chance"] == 1
    assert global_impact["books_donated"] == 1
    assert global_impact["students_connected"] == 2
    assert owner_impact["books_passed_on"] == 1
    assert requester_impact["books_received"] == 1