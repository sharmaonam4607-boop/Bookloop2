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


def test_wishlist_request_permissions_and_lending_lifecycle(client):
    owner_headers = create_student(client, "phase5-owner@student.edu", "Book Owner")
    borrower_headers = create_student(client, "phase5-borrower@student.edu", "Book Borrower")
    other_borrower_headers = create_student(client, "phase5-other@student.edu", "Another Borrower")
    listing = client.post("/api/v1/books", headers=owner_headers, json={
        "title": "Phase Five Database Systems",
        "author": "Test Author",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "lend",
        "price": 10,
        "price_unit": "/month",
    })
    assert listing.status_code == 201
    book_id = listing.json()["id"]

    saved = client.post(f"/api/v1/wishlist/{book_id}", headers=borrower_headers)
    assert saved.status_code == 201
    assert saved.json()["is_available"] is True
    assert client.get("/api/v1/wishlist", headers=borrower_headers).json()[0]["book_id"] == book_id
    assert client.post(f"/api/v1/wishlist/{book_id}", headers=borrower_headers).status_code == 409

    created_request = client.post(f"/api/v1/books/{book_id}/requests", headers=borrower_headers, json={
        "message": "I would like to borrow this for the semester."
    })
    assert created_request.status_code == 201
    request_id = created_request.json()["id"]
    assert created_request.json()["direction"] == "outgoing"
    assert created_request.json()["status"] == "pending"
    assert client.patch(f"/api/v1/requests/{request_id}", headers=borrower_headers, json={"status": "accepted"}).status_code == 403
    competing_request = client.post(f"/api/v1/books/{book_id}/requests", headers=other_borrower_headers, json={})
    assert competing_request.status_code == 201

    incoming = client.get("/api/v1/requests", headers=owner_headers).json()
    assert incoming[0]["direction"] == "incoming"
    accepted = client.patch(f"/api/v1/requests/{request_id}", headers=owner_headers, json={"status": "accepted"})
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"
    assert client.get("/api/v1/requests", headers=other_borrower_headers).json()[0]["status"] == "rejected"
    completed = client.patch(f"/api/v1/requests/{request_id}", headers=owner_headers, json={"status": "completed"})
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    owner_library = client.get("/api/v1/library", headers=owner_headers).json()
    borrower_library = client.get("/api/v1/library", headers=borrower_headers).json()
    assert any(item["category"] == "lent" for item in owner_library)
    assert any(item["category"] == "borrowed" for item in borrower_library)
    assert client.get("/api/v1/wishlist", headers=borrower_headers).json()[0]["is_available"] is False

    removed = client.delete(f"/api/v1/wishlist/{book_id}", headers=borrower_headers)
    assert removed.status_code == 204
    assert client.get("/api/v1/wishlist", headers=borrower_headers).json() == []