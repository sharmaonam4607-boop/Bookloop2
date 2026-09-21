from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import settings
from app.database.session import check_db_connection
from app.schemas.health import HealthCheckResponse, DatabaseStatus

router = APIRouter(prefix="/health", tags=["System Health"])


@router.get(
    "",
    response_model=HealthCheckResponse,
    summary="System and Database Health Check",
    description="Validates FastAPI backend operational status and actively checks PostgreSQL connectivity via SQLAlchemy."
)
def get_health() -> HealthCheckResponse:
    db_result = check_db_connection()
    overall_status = "online" if db_result.get("connected") else "degraded"

    return HealthCheckResponse(
        status=overall_status,
        project_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
        database=DatabaseStatus(
            connected=db_result.get("connected", False),
            target_engine=db_result.get("target_engine", "PostgreSQL"),
            target_url=db_result.get("target_url", ""),
            message=db_result.get("message", ""),
            error=db_result.get("error")
        )
    )
