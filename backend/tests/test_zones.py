from __future__ import annotations

def test_hosted_zone_crud_search_pagination(client, auth_headers):
    for index, name in enumerate(["example.com", "internal.test", "other.net"]):
        response = client.post(
            "/api/hosted-zones",
            headers=auth_headers,
            json={
                "name": name,
                "comment": f"zone {index}",
                "private_zone": name == "internal.test",
            },
        )
        assert response.status_code == 201
        assert response.json()["name"].endswith(".")
        assert response.json()["record_count"] == 0
        assert "created_at" in response.json()
        assert "updated_at" in response.json()

    duplicate = client.post(
        "/api/hosted-zones",
        headers=auth_headers,
        json={"name": "example.com."},
    )
    assert duplicate.status_code == 409

    page = client.get(
        "/api/hosted-zones?page=1&page_size=2&sort=name&order=asc",
        headers=auth_headers,
    ).json()
    assert page["total"] == 3
    assert page["page"] == 1
    assert page["page_size"] == 2
    assert page["pages"] == 2
    assert len(page["items"]) == 2

    filtered = client.get(
        "/api/hosted-zones?search=internal&private_zone=true", headers=auth_headers
    ).json()
    assert filtered["total"] == 1
    zone = filtered["items"][0]

    updated = client.put(
        f"/api/hosted-zones/{zone['id']}",
        headers=auth_headers,
        json={"comment": "updated"},
    )
    assert updated.status_code == 200
    assert updated.json()["comment"] == "updated"
    assert client.get(f"/api/hosted-zones/{zone['id']}", headers=auth_headers).status_code == 200
    assert client.delete(f"/api/hosted-zones/{zone['id']}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/hosted-zones/{zone['id']}", headers=auth_headers).status_code == 404


def test_invalid_zone_name(client, auth_headers):
    response = client.post(
        "/api/hosted-zones", headers=auth_headers, json={"name": "not a dns name"}
    )
    assert response.status_code == 422
