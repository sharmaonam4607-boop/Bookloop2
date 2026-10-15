"""BookLoop Phase 11 — Comprehensive End-to-End Integration & System Verification Test Suite.

Validates the complete lifecycle across:
- Authentication & Sessions
- User Profiles & Account States
- Book Listings, Searching, Filters & Sorting
- Wishlist & Book Requests
- Transactions Lifecycle (Request -> Accept -> Complete)
- Real-Time Messaging & Notifications
- Communities, Feeds, Comments, Reactions & Reports
- Safe Meeting Points & Maps Coordinates
- Trust, Reviews & Multi-Directional Impact Metrics
- Administration Console, Moderation Queues & Analytics
"""
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
def client(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", "superadmin@bookloop.edu")
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


def register_user(client: TestClient, email: str, name: str, password: str = "SecurePass123!") -> dict:
    res = client.post("/api/v1/auth/signup", json={
        "email": email,
        "password": password,
        "full_name": name,
        "university": "BookLoop Engineering Institute",
        "course": "B.Tech Computer Science",
        "year": "3rd Year",
        "location": "Central Campus",
    })
    assert res.status_code == 201, f"Failed signup for {email}: {res.text}"
    data = res.json()
    return {
        "id": data["user"]["id"],
        "email": email,
        "name": name,
        "token": data["access_token"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


def test_complete_platform_integration_lifecycle(client: TestClient):
    # =========================================================================
    # 1. AUTHENTICATION & PROFILES
    # =========================================================================
    admin = register_user(client, "superadmin@bookloop.edu", "Global Admin")
    student_a = register_user(client, "alice.senior@bookloop.edu", "Alice Senior")
    student_b = register_user(client, "bob.junior@bookloop.edu", "Bob Junior")
    student_c = register_user(client, "charlie.outsider@bookloop.edu", "Charlie Outsider")

    # Profile retrieval and self-update
    alice_me = client.get("/api/v1/auth/me", headers=student_a["headers"])
    assert alice_me.status_code == 200
    assert alice_me.json()["email"] == "alice.senior@bookloop.edu"

    updated_profile = client.put("/api/v1/profile/me", headers=student_a["headers"], json={
        "bio": "Final year CSE student graduating soon. Sharing my book collection.",
        "location": "North Hostel Block B",
    })
    assert updated_profile.status_code == 200
    assert "Block B" in updated_profile.json()["location"]

    # =========================================================================
    # 2. BOOK LISTINGS & ADVANCED SEARCH / FILTERING
    # =========================================================================
    # Alice lists a textbook for lending with a safe meeting point
    book1 = client.post("/api/v1/books", headers=student_a["headers"], json={
        "title": "Database Systems Concepts",
        "author": "Silberschatz & Korth",
        "isbn": "978-0078022159",
        "category": "Computer Science",
        "condition": "like_new",
        "listing_type": "lend",
        "price": 25,
        "price_unit": "/month",
        "safe_meeting_point": "Central Library Main Lobby",
        "latitude": 30.9015,
        "longitude": 75.8572,
        "description": "Essential database book for semester 5.",
    })
    assert book1.status_code == 201
    book1_id = book1.json()["id"]

    # Alice lists a book for free donation
    book2 = client.post("/api/v1/books", headers=student_a["headers"], json={
        "title": "Clean Code Handbook",
        "author": "Robert C. Martin",
        "category": "Computer Science",
        "condition": "good",
        "listing_type": "donate",
        "safe_meeting_point": "Hostel 4 Student Common Room",
        "latitude": 30.9035,
        "longitude": 75.8591,
        "description": "Free donation for first-year coders.",
    })
    assert book2.status_code == 201
    book2_id = book2.json()["id"]

    # Alice views her own active listings
    my_books = client.get("/api/v1/books/mine", headers=student_a["headers"]).json()
    assert len(my_books) == 2

    # Bob searches for database books with filters
    search_res = client.get("/api/v1/books", params={
        "q": "Database",
        "listing_type": "lend",
        "sort": "newest",
    }).json()
    assert search_res["total"] == 1
    assert search_res["items"][0]["id"] == book1_id

    # Verify single book details endpoint
    book_details = client.get(f"/api/v1/books/{book1_id}").json()
    assert book_details["seller"]["name"] == "Alice Senior"
    assert book_details["safe_meeting_point"] == "Central Library Main Lobby"

    # =========================================================================
    # 3. WISHLIST & BOOK REQUESTS
    # =========================================================================
    # Bob adds Book 1 to his wishlist
    wishlist_add = client.post(f"/api/v1/wishlist/{book1_id}", headers=student_b["headers"])
    assert wishlist_add.status_code == 201
    assert wishlist_add.json()["is_available"] is True

    bob_wishlist = client.get("/api/v1/wishlist", headers=student_b["headers"]).json()
    assert len(bob_wishlist) == 1
    assert bob_wishlist[0]["book_id"] == book1_id

    # Bob requests to borrow Book 1
    request_res = client.post(f"/api/v1/books/{book1_id}/requests", headers=student_b["headers"], json={
        "message": "Hi Alice, could I borrow this for the DBMS semester module?",
    })
    assert request_res.status_code == 201
    request_id = request_res.json()["id"]

    # Alice checks incoming notifications and requests
    alice_notifs = client.get("/api/v1/notifications", headers=student_a["headers"]).json()
    assert alice_notifs["unread_count"] >= 1
    assert alice_notifs["items"][0]["notification_type"] == "book_request"

    alice_requests = client.get("/api/v1/requests", headers=student_a["headers"]).json()
    assert len(alice_requests) == 1
    assert alice_requests[0]["direction"] == "incoming"
    assert alice_requests[0]["status"] == "pending"

    # =========================================================================
    # 4. CHAT MESSAGING LINKED TO REQUEST
    # =========================================================================
    # Alice accepts the request
    accept_res = client.patch(f"/api/v1/requests/{request_id}", headers=student_a["headers"], json={
        "status": "accepted",
    })
    assert accept_res.status_code == 200
    assert accept_res.json()["status"] == "accepted"

    # Start a chat conversation linked to this request
    conv_res = client.post("/api/v1/conversations", headers=student_b["headers"], json={
        "request_id": request_id,
    })
    assert conv_res.status_code == 201
    conv_id = conv_res.json()["id"]

    # Send messages
    msg1 = client.post(f"/api/v1/conversations/{conv_id}/messages", headers=student_b["headers"], json={
        "body": "Hi Alice! Can we meet at 3 PM at the Central Library Lobby?",
    })
    assert msg1.status_code == 201

    msg2 = client.post(f"/api/v1/conversations/{conv_id}/messages", headers=student_a["headers"], json={
        "body": "Sounds great Bob! See you near the study desks at 3 PM.",
    })
    assert msg2.status_code == 201

    # Charlie (unauthorized third-party) cannot read their conversation
    assert client.get(f"/api/v1/conversations/{conv_id}", headers=student_c["headers"]).status_code == 404

    # Bob reads conversation
    conv_details = client.get(f"/api/v1/conversations/{conv_id}", headers=student_b["headers"]).json()
    assert len(conv_details["messages"]) == 2

    # Clear notifications
    assert client.post("/api/v1/notifications/read-all", headers=student_a["headers"]).status_code == 204
    assert client.get("/api/v1/notifications", headers=student_a["headers"]).json()["unread_count"] == 0

    # =========================================================================
    # 5. TRANSACTION COMPLETION & MY LIBRARY
    # =========================================================================
    # Alice completes the handoff
    complete_res = client.patch(f"/api/v1/requests/{request_id}", headers=student_a["headers"], json={
        "status": "completed",
    })
    assert complete_res.status_code == 200
    assert complete_res.json()["status"] == "completed"

    # My Library reflects correct categories
    alice_library = client.get("/api/v1/library", headers=student_a["headers"]).json()
    assert any(item["category"] == "lent" and item["book_id"] == book1_id for item in alice_library)

    bob_library = client.get("/api/v1/library", headers=student_b["headers"]).json()
    assert any(item["category"] == "borrowed" and item["book_id"] == book1_id for item in bob_library)

    # Wishlist reflects that the book is now unavailable
    updated_wishlist = client.get("/api/v1/wishlist", headers=student_b["headers"]).json()
    assert updated_wishlist[0]["is_available"] is False

    # =========================================================================
    # 6. TRUST, REVIEWS & IMPACT TRACKING
    # =========================================================================
    # Both students are now eligible to review each other
    assert len(client.get("/api/v1/reviews/eligible", headers=student_a["headers"]).json()) == 1
    assert len(client.get("/api/v1/reviews/eligible", headers=student_b["headers"]).json()) == 1

    # Bob rates Alice 5 stars
    bob_review = client.post("/api/v1/reviews", headers=student_b["headers"], json={
        "request_id": request_id,
        "rating": 5,
        "comment": "Book in pristine condition! Alice was on time and very helpful.",
    })
    assert bob_review.status_code == 201

    # Alice rates Bob 5 stars
    alice_review = client.post("/api/v1/reviews", headers=student_a["headers"], json={
        "request_id": request_id,
        "rating": 5,
        "comment": "Very polite and responsible borrower.",
    })
    assert alice_review.status_code == 201

    # Verify review summaries
    alice_summary = client.get(f"/api/v1/reviews/users/{student_a['id']}").json()
    assert alice_summary["average_rating"] == 5.0
    assert alice_summary["review_count"] == 1
    assert alice_summary["completed_interactions"] == 1

    # Check platform global impact
    impact = client.get("/api/v1/impact").json()
    assert impact["completed_interactions"] == 1
    assert impact["books_given_second_chance"] == 1
    assert impact["students_connected"] == 2

    # Personal impact
    alice_impact = client.get("/api/v1/impact/me", headers=student_a["headers"]).json()
    assert alice_impact["books_passed_on"] == 1
    assert alice_impact["completed_interactions"] == 1

    # =========================================================================
    # 7. STUDENT COMMUNITIES & MODERATION
    # =========================================================================
    # Alice creates a student circle
    comm = client.post("/api/v1/communities", headers=student_a["headers"], json={
        "name": "CSE Academic Circle",
        "description": "Collaborative study group and textbook exchange for CSE students.",
        "category": "Engineering",
        "location_name": "CSE Department Reading Hall",
        "latitude": 30.9020,
        "longitude": 75.8580,
    })
    assert comm.status_code == 201
    comm_id = comm.json()["id"]

    # Bob joins the circle
    assert client.post(f"/api/v1/communities/{comm_id}/join", headers=student_b["headers"]).status_code == 200

    # Share Alice's clean code book with the circle
    assert client.post(f"/api/v1/communities/{comm_id}/books/{book2_id}", headers=student_a["headers"]).status_code == 201
    assert len(client.get(f"/api/v1/communities/{comm_id}/books").json()) == 1

    # Bob posts a discussion in the circle
    post = client.post(f"/api/v1/communities/{comm_id}/posts", headers=student_b["headers"], json={
        "post_type": "discussion",
        "content": "Looking for recommendations on advanced algorithms textbooks.",
    })
    assert post.status_code == 201
    post_id = post.json()["id"]

    # Alice comments and likes
    assert client.post(f"/api/v1/communities/{comm_id}/posts/{post_id}/comments", headers=student_a["headers"], json={
        "content": "Check out Kleinberg & Tardos Algorithm Design!",
    }).status_code == 201

    assert client.post(f"/api/v1/communities/{comm_id}/posts/{post_id}/reactions", headers=student_a["headers"]).status_code == 200

    # Charlie reports the post for moderation review
    report = client.post(f"/api/v1/communities/{comm_id}/reports", headers=student_a["headers"], json={
        "target_type": "post",
        "target_id": post_id,
        "reason": "Verify textbook recommendations relevance.",
    })
    assert report.status_code == 201
    report_id = report.json()["id"]

    # =========================================================================
    # 8. MAPS & GEOGRAPHIC DISCOVERY
    # =========================================================================
    points = client.get("/api/v1/maps/points").json()
    assert len(points) >= 2  # Book safe point + Community location
    assert any(p["point_type"] == "book" and p["location_name"] == "Hostel 4 Student Common Room" for p in points)
    assert any(p["point_type"] == "community" and p["location_name"] == "CSE Department Reading Hall" for p in points)

    # =========================================================================
    # 9. ADMIN CONSOLE, MODERATION & ANALYTICS
    # =========================================================================
    # Admin logs in via restricted admin endpoint
    admin_login = client.post("/api/v1/admin/auth/login", json={
        "email": "superadmin@bookloop.edu",
        "password": "SecurePass123!",
    })
    assert admin_login.status_code == 200
    admin_jwt = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_jwt}"}

    # Verify admin identity
    assert client.get("/api/v1/admin/auth/me", headers=admin_headers).json()["email"] == "superadmin@bookloop.edu"

    # Verify real platform metrics
    analytics = client.get("/api/v1/admin/analytics", headers=admin_headers).json()
    assert analytics["users_total"] == 4
    assert analytics["users_active"] == 4
    assert analytics["listings_active"] == 1
    assert analytics["communities_total"] == 1
    assert analytics["open_reports"] == 1
    assert analytics["reviews_total"] == 2
    assert analytics["completed_interactions"] == 1

    # Admin moderates report -> resolved
    assert client.patch(f"/api/v1/admin/reports/{report_id}", headers=admin_headers, json={
        "status": "resolved",
    }).status_code == 200

    # Admin hides review
    assert client.patch(f"/api/v1/admin/reviews/{bob_review.json()['id']}", headers=admin_headers, json={
        "is_hidden": True,
    }).status_code == 200

    # Hidden review is immediately excluded from student's visible review count
    assert client.get(f"/api/v1/reviews/users/{student_a['id']}").json()["review_count"] == 0

    # Admin pauses listing
    assert client.patch(f"/api/v1/admin/listings/{book2_id}", headers=admin_headers, json={
        "status": "paused",
    }).status_code == 200

    # Admin temporarily deactivates Charlie
    assert client.patch(f"/api/v1/admin/users/{student_c['id']}", headers=admin_headers, json={
        "is_active": False,
    }).status_code == 200

    # Deactivated Charlie is immediately blocked from making authenticated requests
    assert client.get("/api/v1/auth/me", headers=student_c["headers"]).status_code == 401

    # Reactivate Charlie
    assert client.patch(f"/api/v1/admin/users/{student_c['id']}", headers=admin_headers, json={
        "is_active": True,
    }).status_code == 200
    assert client.get("/api/v1/auth/me", headers=student_c["headers"]).status_code == 200

    print("\n✅ COMPLETE PLATFORM INTEGRATION & LIFECYCLE TESTS PASSED PERFECTLY!")
