from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Route53 Clone API"
    database_url: str = (
        "sqlite:////tmp/route53_clone.db"
        if os.environ.get("VERCEL")
        else "sqlite:///./route53_clone.db"
    )
    frontend_origins: str = (
        "http://localhost:3000,http://localhost:5173,"
        "http://127.0.0.1:3000,http://127.0.0.1:5173"
    )
    session_ttl_hours: int = 168
    demo_user_email: str = "admin@example.com"
    demo_user_password: str = "route53demo"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]
        if os.environ.get("VERCEL") and "*" not in origins:
            origins.append("*")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
