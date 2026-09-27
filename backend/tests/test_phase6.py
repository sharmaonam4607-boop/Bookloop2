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


def test_request_linked_chat_notifications_and_read_state(client):
    owner_headers = create_student(client, "phase6-owner@student.edu", "Book Owner")
    requester_headers = create_student(client, "phase6-requester@student.edu", "Book Requester")
    outsider_headers = create_student(client, "phase6-outsider@student.edu", "Outside Student")
    listing = client.post("/api/v1/books", headers=owner_headers, json={
        "title": "Phase Six Messaging Book",
        "author": "Test Author",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "sell",
        "price": 20,
    })
    assert listing.status_code == 201
    book_id = listing.json()["id"]
    book_request = client.post(f"/api/v1/books/{book_id}/requests", headers=requester_headers, json={})
    assert book_request.status_code == 201
    request_id = book_request.json()["id"]

    owner_notifications = client.get("/api/v1/notifications", headers=owner_headers)
    assert owner_notifications.status_code == 200
    assert owner_notifications.json()["unread_count"] == 1
    assert owner_notifications.json()["items"][0]["notification_type"] == "book_request"
    accepted = client.patch(f"/api/v1/requests/{request_id}", headers=owner_headers, json={"status": "accepted"})
    assert accepted.status_code == 200
    requester_notifications = client.get("/api/v1/notifications", headers=requester_headers).json()
    assert requester_notifications["unread_count"] == 1
    assert requester_notifications["items"][0]["notification_type"] == "request_accepted"

    created = client.post("/api/v1/conversations", headers=requester_headers, json={"request_id": request_id})
    assert created.status_code == 201
    conversation_id = created.json()["id"]
    assert created.json()["book_id"] == book_id
    assert created.json()["request_id"] == request_id
    assert client.post("/api/v1/conversations", headers=owner_headers, json={"request_id": request_id}).json()["id"] == conversation_id

    outsider_result = client.get(f"/api/v1/conversations/{conversation_id}", headers=outsider_headers)
    assert outsider_result.status_code == 404
    sent = client.post(f"/api/v1/conversations/{conversation_id}/messages", headers=requester_headers, json={"body": "Can we meet at the campus library?"})
    assert sent.status_code == 201
    assert sent.json()["body"] == "Can we meet at the campus library?"

    unread = client.get("/api/v1/conversations", headers=owner_headers).json()[0]
    assert unread["unread_count"] == 1
    notifications = client.get("/api/v1/notifications", headers=owner_headers).json()
    assert notifications["unread_count"] == 2
    new_message_notification = next(item for item in notifications["items"] if item["notification_type"] == "new_message")
    assert client.patch(f"/api/v1/notifications/{new_message_notification['id']}/read", headers=owner_headers).json()["is_read"] is True
    assert client.get("/api/v1/notifications", headers=owner_headers).json()["unread_count"] == 1

    opened = client.get(f"/api/v1/conversations/{conversation_id}", headers=owner_headers)
    assert opened.status_code == 200
    assert len(opened.json()["messages"]) == 1
    assert opened.json()["messages"][0]["read_at"] is not None
    assert client.get("/api/v1/conversations", headers=owner_headers).json()[0]["unread_count"] == 0

    assert client.post("/api/v1/notifications/read-all", headers=owner_headers).status_code == 204
    assert client.get("/api/v1/notifications", headers=owner_headers).json()["unread_count"] == 0