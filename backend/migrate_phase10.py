"""Add Phase Ten moderation state columns to existing community and review tables."""
from sqlalchemy import inspect, text

from app.database.session import engine


inspector = inspect(engine)
table_names = inspector.get_table_names()
is_sqlite = engine.dialect.name == "sqlite"

with engine.begin() as connection:
    if "communities" in table_names:
        comm_cols = {c["name"] for c in inspector.get_columns("communities")}
        if "is_active" not in comm_cols:
            connection.execute(text(
                "ALTER TABLE communities ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"
                if is_sqlite
                else "ALTER TABLE communities ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"
            ))
            try:
                connection.execute(text("CREATE INDEX ix_communities_is_active ON communities (is_active)"))
            except Exception:
                pass

    if "reviews" in table_names:
        rev_cols = {c["name"] for c in inspector.get_columns("reviews")}
        if "is_hidden" not in rev_cols:
            connection.execute(text(
                "ALTER TABLE reviews ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT 0"
                if is_sqlite
                else "ALTER TABLE reviews ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            try:
                connection.execute(text("CREATE INDEX ix_reviews_is_hidden ON reviews (is_hidden)"))
            except Exception:
                pass

print("Phase Ten moderation migration applied.")