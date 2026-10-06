from __future__ import annotations

def test_json_and_bind_export_and_bind_import(client, auth_headers, zone):
    bind_content = """$ORIGIN example.com.
$TTL 600
@ IN A 192.0.2.10
www 300 IN A 192.0.2.11
mail IN MX 10 mailhost.example.com.
txt IN TXT "hello world"
invalid unsupported data
"""
    imported = client.post(
        f"/api/hosted-zones/{zone['id']}/import/bind",
        headers=auth_headers,
        json={"content": bind_content, "replace_existing": True},
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["imported"] == 4
    assert imported.json()["skipped"] == 1
    assert len(imported.json()["errors"]) == 1

    json_export = client.get(
        f"/api/hosted-zones/{zone['id']}/export/json", headers=auth_headers
    )
    assert json_export.status_code == 200
    assert len(json_export.json()["records"]) == 4
    assert "attachment;" in json_export.headers["content-disposition"]

    bind_export = client.get(
        f"/api/hosted-zones/{zone['id']}/export/bind", headers=auth_headers
    )
    assert bind_export.status_code == 200
    assert "$ORIGIN example.com." in bind_export.text
    assert 'txt.example.com. 600 IN TXT "hello world"' in bind_export.text

