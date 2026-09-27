"""Create the persisted Phase Nine review table for existing installations."""
from app.database.base import Base
from app.database.session import engine
import app.models.review  # noqa: F401


Base.metadata.create_all(bind=engine, tables=[app.models.review.Review.__table__])
print("Phase Nine reviews migration applied.")