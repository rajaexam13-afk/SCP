from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "DemandIQ"
    ENV: str = "development"
    DEBUG: bool = True

    # Auth
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://dpuser:dppassword@localhost:5432/demandplatform"

    # ClickHouse
    CLICKHOUSE_URL: str = "http://dpuser:dppassword@localhost:8123/demand"
    CLICKHOUSE_HOST: str = "localhost"
    CLICKHOUSE_PORT: int = 8123
    CLICKHOUSE_USER: str = "dpuser"
    CLICKHOUSE_PASSWORD: str = "dppassword"
    CLICKHOUSE_DB: str = "demand"

    # Redis
    REDIS_URL: str = "redis://:dpredis@localhost:6379/0"

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9010"
    MINIO_ACCESS_KEY: str = "dpminiouser"
    MINIO_SECRET_KEY: str = "dpminiopassword"
    MINIO_BUCKET: str = "demand-platform"
    MINIO_SECURE: bool = False

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # Forecast Engine
    FORECAST_ENGINE_URL: str = "http://forecast-engine:8003"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
