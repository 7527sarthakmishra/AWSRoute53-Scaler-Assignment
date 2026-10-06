from __future__ import annotations

def test_health_and_auth_session_lifecycle(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "wrong-password"},
        ).status_code
        == 401
    )

    login = client.post(
        "/api/auth/login",
        json={"email": "ADMIN@example.com", "password": "route53demo"},
    )
    assert login.status_code == 200
    body = login.json()
    assert body["token_type"] == "bearer"
    assert body["token"]
    assert body["user"]["email"] == "admin@example.com"
    assert body["user"]["created_at"].endswith(("Z", "+00:00"))
    headers = {"Authorization": f"Bearer {body['token']}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/auth/logout", headers=headers).json() == {"message": "Logged out"}
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_cors_for_local_frontend(client):
    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
