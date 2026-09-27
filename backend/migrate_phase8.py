"""Add approximate safe-location fields for Phase Eight maps and nearby discovery."""
from sqlalchemy import text

from app.database.session import engine


with engine.begin() as connection:
    connection.execute(text(
        "ALTER TABLE book_listings ADD COLUMN IF NOT EXISTS safe_meeting_point VARCHAR(180)"
    ))
    connection.execute(text(
        "ALTER TABLE book_listings ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION"
    ))
    connection.execute(text(
        "ALTER TABLE book_listings ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION"
    ))
    connection.execute(text(
        "ALTER TABLE communities ADD COLUMN IF NOT EXISTS location_name VARCHAR(180)"
    ))
    connection.execute(text(
        "ALTER TABLE communities ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION"
    ))
    connection.execute(text(
        "ALTER TABLE communities ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_book_listings_coordinates ON book_listings (latitude, longitude)"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_communities_coordinates ON communities (latitude, longitude)"
    ))

print("Phase Eight approximate location migration applied.")