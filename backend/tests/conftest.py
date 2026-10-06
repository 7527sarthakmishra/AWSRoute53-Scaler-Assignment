from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DEMO_USER_EMAIL", "admin@example.com")
os.environ.setdefault("DEMO_USER_PASSWORD", "route53demo")

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402


@pytest.fixture
def client(tmp_path):
    database_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{database_path}", connect_args={"check_same_thread": False}
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)
    with TestingSession() as db:
        db.add(
            User(
                email="admin@example.com",
                name="Demo User",
                password_hash=hash_password("route53demo"),
            )
        )
        db.commit()

    def override_get_db():
        with TestingSession() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    yield test_client
    test_client.close()
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def auth_headers(client):
    response = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "route53demo"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture
def zone(client, auth_headers):
    response = client.post(
        "/api/hosted-zones",
        headers=auth_headers,
        json={"name": "example.com", "comment": "Test zone", "private_zone": False},
    )
    assert response.status_code == 201
    return response.json()
