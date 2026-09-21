import logging
from typing import Generator, Dict, Any
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError, OperationalError
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings

logger = logging.getLogger("bookloop.database")

# Explicit PostgreSQL engine configuration
# Pool pre-ping tests connections before giving them to sessions
engine = create_engine(
    settings.sync_database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args={"connect_timeout": 5}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a SQLAlchemy session.
    Ensures session closure and rollback on exception.
    """
    db: Session = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def check_db_connection() -> Dict[str, Any]:
    """
    Tests live PostgreSQL connectivity via SQLAlchemy.
    Explicit error handling that reports exact failure details
    without concealing or silently falling back to a different database.
    """
    # Sanitize database URL for safe logging/reporting (hide password)
    raw_url = settings.sync_database_url
    if "@" in raw_url and ":" in raw_url:
        try:
            proto, rest = raw_url.split("://", 1)
            user_pass, host_db = rest.split("@", 1)
            user = user_pass.split(":", 1)[0]
            sanitized_url = f"{proto}://{user}:****@{host_db}"
        except Exception:
            sanitized_url = "postgresql://***:****@host/db"
    else:
        sanitized_url = raw_url

    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1")).scalar()
            if result == 1:
                return {
                    "connected": True,
                    "target_engine": "PostgreSQL",
                    "target_url": sanitized_url,
                    "message": "Successfully connected to PostgreSQL database.",
                    "error": None
                }
            else:
                return {
                    "connected": False,
                    "target_engine": "PostgreSQL",
                    "target_url": sanitized_url,
                    "message": "Unexpected response received from database test query.",
                    "error": "Query returned unexpected result"
                }
    except OperationalError as oe:
        logger.error(f"PostgreSQL OperationalError: {oe}")
        return {
            "connected": False,
            "target_engine": "PostgreSQL",
            "target_url": sanitized_url,
            "message": "PostgreSQL connection failed: Server unreachable or credentials rejected.",
            "error": str(oe.orig) if hasattr(oe, "orig") and oe.orig else str(oe)
        }
    except SQLAlchemyError as se:
        logger.error(f"SQLAlchemy Database Error: {se}")
        return {
            "connected": False,
            "target_engine": "PostgreSQL",
            "target_url": sanitized_url,
            "message": "SQLAlchemy error during connection attempt.",
            "error": str(se)
        }
    except Exception as e:
        logger.error(f"Unexpected Database Connection Error: {e}")
        return {
            "connected": False,
            "target_engine": "PostgreSQL",
            "target_url": sanitized_url,
            "message": "Unexpected error while attempting database connection.",
            "error": str(e)
        }
