import os
import sys
from pathlib import Path

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


def test_photo_upload_validation_and_serving(client):
    # Signup a student
    signup = client.post("/api/v1/auth/signup", json={
        "email": "photouser@student.edu",
        "password": "Password123!",
        "full_name": "Photo Test Student",
        "university": "Delhi Technological University",
        "course": "B.Tech CSE",
        "year": "3rd Year",
        "location": "New Delhi, India",
    })
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    # 1. Upload unauthenticated fails
    fake_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00" + b"A" * 100
    res_noauth = client.post("/api/v1/books/upload-image", content=fake_jpeg, headers={"Content-Type": "image/jpeg"})
    assert res_noauth.status_code == 401

    # 2. Upload empty body fails
    res_empty = client.post("/api/v1/books/upload-image", content=b"", headers={**headers, "Content-Type": "image/jpeg"})
    assert res_empty.status_code == 400

    # 3. Upload invalid file content fails
    res_bad = client.post("/api/v1/books/upload-image", content=b"NOT_AN_IMAGE_FILE_DATA", headers={**headers, "Content-Type": "image/jpeg"})
    assert res_bad.status_code == 400
    assert "Unsupported file format" in res_bad.json()["detail"]

    # 4. Upload valid JPEG via binary stream
    res_jpg = client.post("/api/v1/books/upload-image", content=fake_jpeg, headers={**headers, "Content-Type": "image/jpeg"})
    assert res_jpg.status_code == 200
    img_url = res_jpg.json()["image_url"]
    assert img_url.startswith("/uploads/books/")
    assert img_url.endswith(".jpg")

    # 5. Verify the uploaded image is served via GET
    res_serve = client.get(img_url)
    assert res_serve.status_code == 200
    assert res_serve.content == fake_jpeg

    # 6. Upload valid PNG via multipart/form-data
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"B" * 100
    boundary = "TestBoundary123"
    multipart_body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="book.png"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode("utf-8") + fake_png + f"\r\n--{boundary}--\r\n".encode("utf-8")
    res_png = client.post(
        "/api/v1/books/upload-image",
        content=multipart_body,
        headers={**headers, "Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    assert res_png.status_code == 200
    png_url = res_png.json()["image_url"]
    assert png_url.endswith(".png")

    # 7. Create a listing with the uploaded image URL
    listing = client.post("/api/v1/books", headers=headers, json={
        "title": "Data Structures in C++",
        "author": "Mark Weiss",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
        "safe_meeting_point": "Central Library Delhi Campus",
        "image_urls": [img_url],
    })
    assert listing.status_code == 201
    created_book = listing.json()
    assert created_book["image_urls"] == [img_url]

    # 8. Create a listing WITHOUT any photo (optional photo)
    no_photo = client.post("/api/v1/books", headers=headers, json={
        "title": "Discrete Mathematics",
        "author": "Kenneth Rosen",
        "category": "Mathematics",
        "condition": "like_new",
        "listing_type": "donate",
        "safe_meeting_point": "North Campus Canteen",
        "image_urls": [],
    })
    assert no_photo.status_code == 201
    assert no_photo.json()["image_urls"] == []


def test_manual_location_search_and_discovery(client):
    # Student 1 in Delhi
    s1 = client.post("/api/v1/auth/signup", json={
        "email": "student_delhi@student.edu",
        "password": "Password123!",
        "full_name": "Delhi Student",
        "university": "Delhi Technological University",
        "course": "B.Tech CSE",
        "year": "3rd Year",
        "location": "New Delhi, Delhi, India",
    }).json()
    h1 = {"Authorization": f"Bearer {s1['access_token']}"}

    # Student 2 in Mumbai
    s2 = client.post("/api/v1/auth/signup", json={
        "email": "student_mumbai@student.edu",
        "password": "Password123!",
        "full_name": "Mumbai Student",
        "university": "IIT Bombay",
        "course": "M.Tech",
        "year": "1st Year",
        "location": "Powai, Mumbai, Maharashtra, India",
    }).json()
    h2 = {"Authorization": f"Bearer {s2['access_token']}"}

    # Book 1 listed in Delhi
    client.post("/api/v1/books", headers=h1, json={
        "title": "Operating System Concepts",
        "author": "Silberschatz",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
        "safe_meeting_point": "Delhi Tech Central Library",
    })

    # Book 2 listed in Mumbai
    client.post("/api/v1/books", headers=h2, json={
        "title": "Artificial Intelligence Modern Approach",
        "author": "Russell and Norvig",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
        "safe_meeting_point": "Powai Campus Gate 2",
    })

    # Search location with case-insensitive and formatting-tolerant queries
    # Query "delhi"
    res_delhi = client.get("/api/v1/books", params={"location": "delhi"})
    assert res_delhi.status_code == 200
    assert res_delhi.json()["total"] == 1
    assert res_delhi.json()["items"][0]["title"] == "Operating System Concepts"

    # Query with state/country "Delhi, India"
    res_delhi_fmt = client.get("/api/v1/books", params={"location": "Delhi, India"})
    assert res_delhi_fmt.status_code == 200
    assert res_delhi_fmt.json()["total"] == 1

    # Query "mumbai"
    res_mumbai = client.get("/api/v1/books", params={"location": "MUMBAI"})
    assert res_mumbai.status_code == 200
    assert res_mumbai.json()["total"] == 1
    assert res_mumbai.json()["items"][0]["title"] == "Artificial Intelligence Modern Approach"

    # Query "india" matches both
    res_india = client.get("/api/v1/books", params={"location": "india"})
    assert res_india.status_code == 200
    assert res_india.json()["total"] == 2

    # Query non-existent city returns 0
    res_none = client.get("/api/v1/books", params={"location": "Tokyo"})
    assert res_none.status_code == 200
    assert res_none.json()["total"] == 0

    # Also test /api/v1/maps/points with location filter
    map_delhi = client.get("/api/v1/maps/points", params={"location": "delhi"})
    assert map_delhi.status_code == 200
    assert len(map_delhi.json()) == 1
    assert map_delhi.json()[0]["location_name"] == "Delhi Tech Central Library"


def test_donation_and_sale_pricing_and_nearby_user_listings(client):
    # Register user
    signup = client.post("/api/v1/auth/signup", json={
        "email": "donor_student@student.edu",
        "password": "Password123!",
        "full_name": "Donor Student",
        "university": "Delhi University",
        "course": "B.Sc Mathematics",
        "year": "2nd Year",
        "location": "North Campus, Delhi",
    })
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    # 1. Donation listing without price: MUST SUCCEED (price defaults to 0)
    donate_res = client.post("/api/v1/books", headers=headers, json={
        "title": "Calculus Early Transcendentals",
        "author": "James Stewart",
        "category": "Mathematics",
        "condition": "good",
        "listing_type": "donate",
        "safe_meeting_point": "Maths Dept Reading Room",
    })
    assert donate_res.status_code == 201
    assert donate_res.json()["price"] == 0
    assert donate_res.json()["listing_type"] == "donate"

    # 2. Sale listing without price: MUST FAIL (price required for sale)
    sale_noprice = client.post("/api/v1/books", headers=headers, json={
        "title": "Linear Algebra Done Right",
        "author": "Sheldon Axler",
        "category": "Mathematics",
        "condition": "like_new",
        "listing_type": "sell",
        "safe_meeting_point": "North Campus Gate 4",
    })
    assert sale_noprice.status_code == 422

    # 3. Sale listing with valid price: MUST SUCCEED
    sale_res = client.post("/api/v1/books", headers=headers, json={
        "title": "Linear Algebra Done Right",
        "author": "Sheldon Axler",
        "category": "Mathematics",
        "condition": "like_new",
        "listing_type": "sell",
        "price": 250.0,
        "safe_meeting_point": "North Campus Gate 4",
    })
    assert sale_res.status_code == 201
    assert sale_res.json()["price"] == 250.0

    # 4. Verify Nearby points endpoint returns the user's own listed books
    nearby_res = client.get("/api/v1/maps/points")
    assert nearby_res.status_code == 200
    points = nearby_res.json()
    titles = [p["title"] for p in points if p["point_type"] == "book"]
    assert "Calculus Early Transcendentals" in titles
    assert "Linear Algebra Done Right" in titles




def test_exact_city_filtering_and_registration(client):
    """Verify Task requirements:
    1. City field in user registration saves to profile.
    2. Book listing saves listing_city and display location.
    3. Exact city match: searching 'Ludhiana' does NOT return 'Raikot' books.
    4. Changing user profile city does NOT alter previously published book listing_city.
    5. Donation listings have price=0 and no price required.
    """
    # 1. Register student in Ludhiana
    res_reg = client.post("/api/v1/auth/signup", json={
        "email": "ludhiana_student@college.edu",
        "password": "Password123!",
        "full_name": "Ludhiana Student",
        "city": "Ludhiana",
        "university": "GNDEC Ludhiana",
        "course": "B.Tech CSE",
        "year": "2nd Year",
    })
    assert res_reg.status_code == 201
    auth_data = res_reg.json()
    token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Profile should have city = "Ludhiana"
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["profile"]["city"] == "Ludhiana"

    # 2. Register student in Raikot
    res_reg2 = client.post("/api/v1/auth/signup", json={
        "email": "raikot_student@college.edu",
        "password": "Password123!",
        "full_name": "Raikot Student",
        "city": "Raikot",
        "university": "GNDEC Ludhiana",
        "course": "B.Tech IT",
        "year": "3rd Year",
    })
    headers2 = {"Authorization": f"Bearer {res_reg2.json()['access_token']}"}

    # 3. Create Book 1: Ludhiana
    b1_res = client.post("/api/v1/books", headers=headers, json={
        "title": "Atomic Habits in Ludhiana",
        "author": "James Clear",
        "category": "Self Help",
        "condition": "good",
        "listing_type": "donate",
        "safe_meeting_point": "Ludhiana",
        "listing_city": "Ludhiana",
    })
    assert b1_res.status_code == 201
    b1 = b1_res.json()
    assert b1["price"] == 0
    assert b1["listing_city"] == "Ludhiana"
    assert b1["safe_meeting_point"] == "Ludhiana"

    # 4. Create Book 2: Raikot
    b2_res = client.post("/api/v1/books", headers=headers2, json={
        "title": "Data Structures in Raikot",
        "author": "Mark Weiss",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "sell",
        "price": 250.0,
        "price_unit": "",
        "safe_meeting_point": "Raikot, Ludhiana",
        "listing_city": "Raikot",
    })
    assert b2_res.status_code == 201
    b2 = b2_res.json()
    assert b2["listing_city"] == "Raikot"
    assert b2["safe_meeting_point"] == "Raikot, Ludhiana"

    # 5. Exact city search test: ?city=Ludhiana
    search_ludhiana = client.get("/api/v1/books", params={"city": "Ludhiana"}).json()
    ludhiana_titles = [item["title"] for item in search_ludhiana["items"]]
    assert "Atomic Habits in Ludhiana" in ludhiana_titles
    assert "Data Structures in Raikot" not in ludhiana_titles, "Exact city filter must not match Raikot book"

    # Exact city search test: ?city=Raikot
    search_raikot = client.get("/api/v1/books", params={"city": "Raikot"}).json()
    raikot_titles = [item["title"] for item in search_raikot["items"]]
    assert "Data Structures in Raikot" in raikot_titles
    assert "Atomic Habits in Ludhiana" not in raikot_titles

    # Exact city search test on /api/v1/maps/points: ?city=Ludhiana
    map_ludhiana = client.get("/api/v1/maps/points", params={"city": "Ludhiana"}).json()
    map_ludhiana_titles = [p["title"] for p in map_ludhiana if p["point_type"] == "book"]
    assert "Atomic Habits in Ludhiana" in map_ludhiana_titles
    assert "Data Structures in Raikot" not in map_ludhiana_titles

    # 6. Profile city change isolation: changing user 1 profile city to "Chandigarh"
    # does NOT change the previously listed book's listing_city
    update_prof = client.put("/api/v1/profile/me", headers=headers, json={
        "city": "Chandigarh"
    })
    assert update_prof.status_code == 200

    book1_check = client.get(f"/api/v1/books/{b1['id']}").json()
    assert book1_check["listing_city"] == "Ludhiana", "Existing book listing_city must remain unchanged"
