"""FastAPI serverless entrypoint for Vercel."""
from app.main import app

__all__ = ["app"]
