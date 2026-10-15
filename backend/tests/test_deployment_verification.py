"""Deployment Verification Test Suite for BookLoop Production & Render Readiness."""
import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app
from app.core.config import settings
from app.database.session import SessionLocal
from app.models.user import User
from app.models.book import BookListing


from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database.base import Base
from app.database.session import get_db


@pytest.fixture
def test_client():
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
    with TestClient(app) as client:
        yield client
    if previous_override is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous_override
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_cors_production_origin(test_client):
    """Verify that CORS preflight succeeds for any Render production origin."""
    response = test_client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://bookloop-app.onrender.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        }
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://bookloop-app.onrender.com"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_root_browser_redirect(test_client):
    """Verify that browser visits to '/' redirect to '/app/'."""
    response = test_client.get(
        "/",
        headers={"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"},
        follow_redirects=False
    )
    assert response.status_code == 307
    assert response.headers.get("location") == "/app/"


def test_root_api_json(test_client):
    """Verify that API clients requesting '/' receive the health and documentation metadata."""
    response = test_client.get("/", headers={"Accept": "application/json"})
    assert response.status_code == 200
    data = response.json()
    assert "BookLoop" in data["project"]
    assert data["status"] == "online"
    assert data["frontend_ui"] == "/app"


def test_admin_redirect(test_client):
    """Verify that /admin and /admin.html redirect to /app/admin.html."""
    res1 = test_client.get("/admin", follow_redirects=False)
    assert res1.status_code == 307
    assert res1.headers.get("location") == "/app/admin.html"

    res2 = test_client.get("/admin.html", follow_redirects=False)
    assert res2.status_code == 307
    assert res2.headers.get("location") == "/app/admin.html"


def test_frontend_static_serving(test_client):
    """Verify that the frontend UI is mounted and served at /app/."""
    index_res = test_client.get("/app/")
    assert index_res.status_code == 200
    assert "BookLoop" in index_res.text
    assert "Giving Books a Second Chance" in index_res.text

    admin_res = test_client.get("/app/admin.html")
    assert admin_res.status_code == 200
    assert "Admin Access" in admin_res.text


def test_admin_login_bootstrapped(test_client):
    """Verify that the bootstrapped admin account can log in immediately."""
    response = test_client.post("/api/v1/admin/auth/login", json={
        "email": settings.ADMIN_EMAILS.split(",")[0].strip(),
        "password": settings.ADMIN_PASSWORD
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["email"].lower() == settings.ADMIN_EMAILS.split(",")[0].strip().lower()

    # Verify admin analytics can be accessed with this token
    analytics_res = test_client.get(
        "/api/v1/admin/analytics",
        headers={"Authorization": f"Bearer {data['access_token']}"}
    )
    assert analytics_res.status_code == 200
    analytics_data = analytics_res.json()
    assert "users_total" in analytics_data
    assert "listings_total" in analytics_data
