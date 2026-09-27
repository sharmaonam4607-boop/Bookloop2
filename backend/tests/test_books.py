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
    test_client = TestClient(app)
    yield test_client
    if previous_override is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous_override
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_listing_publish_edit_status_discovery_and_delete(client):
    signup = client.post("/api/v1/auth/signup", json={
        "email": "phase4-listing@student.edu",
        "password": "Password123!",
        "full_name": "Phase Four Student",
        "university": "BookLoop University",
        "course": "B.Tech CSE",
        "year": "3rd Year",
        "location": "Campus",
    })
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    created = client.post("/api/v1/books", headers=headers, json={
        "title": "Phase Four Book",
        "author": "Test Author",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
        "description": "A focused listing lifecycle test.",
    })
    assert created.status_code == 201
    listing_id = created.json()["id"]
    assert created.json()["status"] == "active"
    assert [item["id"] for item in client.get("/api/v1/books/mine", headers=headers).json()] == [listing_id]

    paused = client.put(f"/api/v1/books/{listing_id}", headers=headers, json={"status": "paused"})
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"
    assert client.get("/api/v1/books", params={"q": "Phase Four Book"}).json()["total"] == 0

    edited = client.put(f"/api/v1/books/{listing_id}", headers=headers, json={
        "status": "active",
        "description": "Updated listing details.",
    })
    assert edited.status_code == 200
    assert edited.json()["description"] == "Updated listing details."
    assert client.get("/api/v1/books", params={"q": "Phase Four Book"}).json()["total"] == 1

    deleted = client.delete(f"/api/v1/books/{listing_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get("/api/v1/books/mine", headers=headers).json() == []