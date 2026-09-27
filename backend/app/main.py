import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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
from app.routers.admin import router as admin_router

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
        logger.info("SQLAlchemy tables initialized successfully.")
    except Exception as e:
        logger.warning(f"Database table creation deferred (DB offline or unreachable): {e}")

    yield
    logger.info("Shutting down BookLoop backend application.")


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


@app.get("/", tags=["Root"])
def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "frontend_ui": "/app",
        "documentation": f"{settings.API_V1_STR}/docs",
        "health_check": f"{settings.API_V1_STR}/health"
    }
