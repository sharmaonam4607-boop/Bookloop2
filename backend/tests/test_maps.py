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


def create_student(client):
    response = client.post("/api/v1/auth/signup", json={
        "email": "phase8-map@student.edu",
        "password": "Password123!",
        "full_name": "Map Student",
        "university": "BookLoop University",
        "course": "B.Tech CSE",
        "year": "3rd Year",
        "location": "Campus",
    })
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_map_points_only_expose_explicit_safe_locations(client):
    headers = create_student(client)
    listing = client.post("/api/v1/books", headers=headers, json={
        "title": "Mapped Campus Book",
        "author": "Map Test Author",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
        "safe_meeting_point": "Main campus library entrance",
        "latitude": 30.901,
        "longitude": 75.857,
    })
    assert listing.status_code == 201

    community = client.post("/api/v1/communities", headers=headers, json={
        "name": "Mapped Campus Circle",
        "description": "A community anchored to a public campus meeting location.",
        "category": "Computer Science",
        "location_name": "Campus student centre",
        "latitude": 30.902,
        "longitude": 75.858,
    })
    assert community.status_code == 201

    unlocated = client.post("/api/v1/books", headers=headers, json={
        "title": "Unlocated Book",
        "author": "Map Test Author",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
    })
    assert unlocated.status_code == 201

    response = client.get("/api/v1/maps/points")
    assert response.status_code == 200
    points = response.json()
    assert len(points) == 2
    book_point = next(point for point in points if point["point_type"] == "book")
    community_point = next(point for point in points if point["point_type"] == "community")
    assert book_point["location_name"] == "Main campus library entrance"
    assert book_point["latitude"] == 30.901
    assert community_point["location_name"] == "Campus student centre"
    assert client.get("/api/v1/maps/config").json()["google_maps_enabled"] is bool(settings.GOOGLE_MAPS_API_KEY)