import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.core.config import settings
from app.database.base import Base
from app.database.session import engine
from app.routers.health import router as health_router
from app.routers.auth import router as auth_router
from app.routers.profile import router as profile_router
from app.routers.books import router as books_router
from app.routers.phase5 import router as phase5_router
from app.routers.messaging import router as messaging_router
from app.routers.communities import router as communities_router
from app.routers.maps import router as maps_router
from app.routers.phase9 import router as phase9_router
from app.routers.admin import _ensure_phase10_schema, router as admin_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("bookloop.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Target Database: {settings.sync_database_url.split('@')[-1] if '@' in settings.sync_database_url else 'PostgreSQL'}")
    logger.info("=" * 60)
    
    # Initialize DB tables if database is reachable
    try:
        Base.metadata.create_all(bind=engine)
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
        logger.info("SQLAlchemy tables initialized successfully.")
        _bootstrap_initial_data()
    except Exception as e:
        logger.warning(f"Database table creation deferred (DB offline or unreachable): {e}")

    yield
    logger.info("Shutting down BookLoop backend application.")


def _bootstrap_initial_data() -> None:
    """Bootstrap default admin account and initial seed books if not already present."""
    try:
        from app.database.session import SessionLocal
        from app.models.user import User, UserProfile
        from app.models.book import BookListing
        from app.core.security import hash_password

        db = SessionLocal()
        try:
            admin_emails = [e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()]
            for admin_email in admin_emails:
                existing_admin = db.query(User).filter(User.email == admin_email).first()
                if not existing_admin:
                    new_admin = User(
                        email=admin_email,
                        hashed_password=hash_password(settings.ADMIN_PASSWORD),
                        is_active=True,
                        is_verified=True,
                    )
                    db.add(new_admin)
                    db.flush()
                    db.add(UserProfile(
                        user_id=new_admin.id,
                        full_name="BookLoop Administrator",
                        university="Central Campus",
                        course="System Administration",
                        year="Admin",
                        location="Admin Portal",
                        bio="Official BookLoop System Administrator"
                    ))
                    db.commit()
                    logger.info(f"Initialized default administrator account: {admin_email}")

            listing_count = db.query(BookListing).count()
            if listing_count == 0:
                try:
                    import seed_books
                    seed_books.seed()
                    logger.info("Successfully seeded initial book listings.")
                except Exception as seed_err:
                    logger.warning(f"Initial book seeding skipped: {seed_err}")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Initial bootstrap check skipped: {e}")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="BookLoop — Giving Books a Second Chance. Modular REST API backend powered by FastAPI & SQLAlchemy.",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan
)

# Configure Cross-Origin Resource Sharing (CORS) for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 Routers (health route prefixed with /api/v1 so /api/v1/health matches health.py)
app.include_router(health_router, prefix=settings.API_V1_STR)
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(books_router)
app.include_router(phase5_router)
app.include_router(messaging_router)
app.include_router(communities_router)
app.include_router(maps_router)
app.include_router(phase9_router)
app.include_router(admin_router)

# Mount Frontend UI at /app for browser access
frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/app", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/admin", include_in_schema=False)
@app.get("/admin.html", include_in_schema=False)
def admin_redirect():
    return RedirectResponse(url="/app/admin.html", status_code=307)


@app.get("/", tags=["Root"])
def root(request: Request):
    accept = request.headers.get("accept", "")
    if "text/html" in accept and not accept.startswith("*/*"):
        return RedirectResponse(url="/app/", status_code=307)
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "frontend_ui": "/app",
        "documentation": f"{settings.API_V1_STR}/docs",
        "health_check": f"{settings.API_V1_STR}/health"
    }
