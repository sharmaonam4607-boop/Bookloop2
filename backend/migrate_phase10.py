"""Add Phase Ten moderation state columns to existing community and review tables."""
from sqlalchemy import text

from app.database.session import engine


with engine.begin() as connection:
    connection.execute(text(
        "ALTER TABLE communities ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE"
    ))
    connection.execute(text(
        "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_communities_is_active ON communities (is_active)"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_reviews_is_hidden ON reviews (is_hidden)"
    ))

print("Phase Ten moderation migration applied.")