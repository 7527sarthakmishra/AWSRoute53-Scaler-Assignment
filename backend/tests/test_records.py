from __future__ import annotations

import pytest


@pytest.mark.parametrize(
    ("record_type", "value"),
    [
        ("A", "192.0.2.1"),
        ("AAAA", "2001:db8::1"),
        ("CNAME", "target.example.com."),
        ("TXT", "hello world"),
        ("MX", "10 mail.example.com."),
        ("NS", "ns1.example.com."),
        ("PTR", "host.example.com."),
        ("SRV", "10 5 443 service.example.com."),
        ("CAA", '0 issue "letsencrypt.org"'),
    ],
)
def test_supported_record_types(client, auth_headers, zone, record_type, value):
    name = (
        f"_{record_type.lower()}.example.com"
        if record_type == "SRV"
        else f"{record_type.lower()}.example.com"
    )
    response = client.post(
        f"/api/hosted-zones/{zone['id']}/records",
        headers=auth_headers,
        json={"name": name, "type": record_type, "ttl": 300, "values": [value]},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["type"] == record_type
    assert body["values"] == [value]
    assert body["zone_id"] == zone["id"]
    assert "created_at" in body and "updated_at" in body


@pytest.mark.parametrize(
    ("record_type", "value"),
    [
        ("A", "999.1.1.1"),
        ("AAAA", "192.0.2.1"),
        ("CNAME", "bad target"),
        ("TXT", "x" * 256),
        ("MX", "mail.example.com."),
        ("NS", "not valid!"),
        ("PTR", "not valid!"),
        ("SRV", "10 5 service.example.com."),
        ("CAA", "0 invalid value"),
    ],
)
def test_invalid_record_values(client, auth_headers, zone, record_type, value):
    response = client.post(
        f"/api/hosted-zones/{zone['id']}/records",
        headers=auth_headers,
        json={
            "name": f"invalid-{record_type.lower()}.example.com",
            "type": record_type,
            "values": [value],
        },
    )
    assert response.status_code == 422


def test_record_crud_filter_and_cascade(client, auth_headers, zone):
    created_ids = []
    for index in range(3):
        response = client.post(
            f"/api/hosted-zones/{zone['id']}/records",
            headers=auth_headers,
            json={
                "name": f"host{index}.example.com",
                "type": "A" if index < 2 else "AAAA",
                "ttl": 60,
                "values": [f"192.0.2.{index + 1}" if index < 2 else "2001:db8::1"],
            },
        )
        assert response.status_code == 201
        created_ids.append(response.json()["id"])

    listing = client.get(
        f"/api/hosted-zones/{zone['id']}/records?type=A&search=host&page=1&page_size=1",
        headers=auth_headers,
    ).json()
    assert listing["total"] == 2
    assert listing["pages"] == 2
    assert len(listing["items"]) == 1

    updated = client.put(
        f"/api/hosted-zones/{zone['id']}/records/{created_ids[0]}",
        headers=auth_headers,
        json={"ttl": 900, "values": ["192.0.2.99"]},
    )
    assert updated.status_code == 200
    assert updated.json()["ttl"] == 900
    assert updated.json()["values"] == ["192.0.2.99"]

    assert (
        client.delete(
            f"/api/hosted-zones/{zone['id']}/records/{created_ids[1]}",
            headers=auth_headers,
        ).status_code
        == 200
    )
    assert client.delete(f"/api/hosted-zones/{zone['id']}", headers=auth_headers).status_code == 200
    assert (
        client.get(
            f"/api/hosted-zones/{zone['id']}/records/{created_ids[0]}",
            headers=auth_headers,
        ).status_code
        == 404
    )


def test_cname_constraints(client, auth_headers, zone):
    apex = client.post(
        f"/api/hosted-zones/{zone['id']}/records",
        headers=auth_headers,
        json={"name": "example.com", "type": "CNAME", "values": ["target.example.net"]},
    )
    assert apex.status_code == 422

    first = client.post(
        f"/api/hosted-zones/{zone['id']}/records",
        headers=auth_headers,
        json={"name": "www.example.com", "type": "A", "values": ["192.0.2.10"]},
    )
    assert first.status_code == 201
    conflict = client.post(
        f"/api/hosted-zones/{zone['id']}/records",
        headers=auth_headers,
        json={"name": "www.example.com", "type": "CNAME", "values": ["target.example.net"]},
    )
    assert conflict.status_code == 409
