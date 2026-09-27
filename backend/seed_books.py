"""Create clearly marked development seed listings for local Phase Three testing."""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.security import hash_password
from app.database.session import SessionLocal
from app.models.book import BookListing
from app.models.user import User, UserProfile

SEED_BOOKS = [
    {
        "email": "seed.algorithms@bookloop.demo",
        "full_name": "Demo Student - Algorithms",
        "title": "Introduction to Algorithms (CLRS)",
        "author": "Thomas H. Cormen, Charles E. Leiserson",
        "edition": "4th Edition",
        "category": "cse",
        "course": "B.Tech CSE / IT",
        "course_code": "CS302",
        "isbn": "978-0262046305",
        "condition": "like_new",
        "listing_type": "exchange",
        "original_price": 1899,
        "distance_km": 0.8,
        "exchange_wish": "Database System Concepts or Operating Systems",
        "cover_gradient": "linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)",
        "description": "Development seed listing for testing Phase Three discovery.",
    },
    {
        "email": "seed.operating-systems@bookloop.demo",
        "full_name": "Demo Student - Operating Systems",
        "title": "Operating System Concepts",
        "author": "Abraham Silberschatz, Peter Galvin",
        "edition": "10th Edition",
        "category": "cse",
        "course": "B.Tech CSE",
        "course_code": "CS401",
        "isbn": "978-1119800361",
        "condition": "good",
        "listing_type": "sell",
        "price": 480,
        "original_price": 1250,
        "distance_km": 1.4,
        "cover_gradient": "linear-gradient(135deg, #065F46 0%, #10B981 100%)",
        "description": "Development seed listing for testing title and price filters.",
    },
    {
        "email": "seed.database@bookloop.demo",
        "full_name": "Demo Student - Database Systems",
        "title": "Database System Concepts",
        "author": "Abraham Silberschatz, Henry F. Korth",
        "edition": "7th Edition",
        "category": "cse",
        "course": "B.Tech CSE / MCA",
        "course_code": "CS304",
        "isbn": "978-0078022159",
        "condition": "good",
        "listing_type": "lend",
        "price": 60,
        "price_unit": "/ month",
        "original_price": 1100,
        "distance_km": 2.1,
        "cover_gradient": "linear-gradient(135deg, #4C1D95 0%, #8B5CF6 100%)",
        "description": "Development seed listing for testing course and lending filters.",
    },
    {
        "email": "seed.physics@bookloop.demo",
        "full_name": "Demo Student - Physics",
        "title": "Concepts of Physics",
        "author": "Dr. H.C. Verma",
        "edition": "Revised Classic Edition",
        "category": "exams",
        "course": "JEE / Engineering Physics",
        "course_code": "PH101",
        "isbn": "978-8177091878",
        "condition": "like_new",
        "listing_type": "donate",
        "original_price": 850,
        "distance_km": 0.5,
        "cover_gradient": "linear-gradient(135deg, #7C2D12 0%, #EA580C 100%)",
        "description": "Development seed listing for testing category and donation filters.",
    },
]


def seed():
    db = SessionLocal()
    try:
        for item in SEED_BOOKS:
            user = db.query(User).filter(User.email == item["email"]).first()
            if not user:
                user = User(
                    email=item["email"],
                    hashed_password=hash_password("seed-data-only"),
                    is_active=True,
                    is_verified=False,
                )
                db.add(user)
                db.flush()
                db.add(UserProfile(user_id=user.id, full_name=item["full_name"], university="Development Seed", course=item["course"], year="Demo", location="Demo Campus"))

            existing = db.query(BookListing).filter(BookListing.title == item["title"], BookListing.is_seed_data.is_(True)).first()
            if not existing:
                book_data = {key: value for key, value in item.items() if key not in {"email", "full_name"}}
                book_data.update({"seller_id": user.id, "is_seed_data": True, "image_urls": []})
                db.add(BookListing(**book_data))
        db.commit()
        print(f"Seeded {len(SEED_BOOKS)} clearly marked development listings into bookloop.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
