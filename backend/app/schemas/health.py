from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class DatabaseStatus(BaseModel):
    connected: bool = Field(..., description="Whether the database connection check succeeded")
    target_engine: str = Field(..., description="Target database engine (PostgreSQL)")
    target_url: str = Field(..., description="Sanitized connection URL")
    message: str = Field(..., description="Detailed status message")
    error: Optional[str] = Field(None, description="Exact error details if connection failed")


class HealthCheckResponse(BaseModel):
    status: str = Field(..., description="General API health status ('online' or 'degraded')")
    project_name: str = Field(..., description="Project name")
    version: str = Field(..., description="API Version")
    environment: str = Field(..., description="Environment mode")
    timestamp: datetime = Field(..., description="Server timestamp (ISO format)")
    database: DatabaseStatus = Field(..., description="PostgreSQL database connectivity report")
