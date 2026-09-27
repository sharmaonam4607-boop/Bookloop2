"""Apply the Phase Four listing-status column to an existing PostgreSQL database."""
from sqlalchemy import text

from app.database.session import engine


with engine.begin() as connection:
    connection.execute(text(
        "ALTER TABLE book_listings "
        "ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_book_listings_status ON book_listings (status)"
    ))

print("Phase Four listing status migration applied.")
