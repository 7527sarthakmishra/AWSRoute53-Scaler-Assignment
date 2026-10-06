from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import current_user
from ..models import DNSRecord, HostedZone, User
from ..schemas import (
    BindImportRequest,
    BindImportResponse,
    DNSRecordCreate,
    DNSRecordResponse,
    DNSRecordUpdate,
    MessageResponse,
    Paginated,
)
from .zones import zone_or_404

router = APIRouter(tags=["DNS records"])


def record_or_404(db: Session, zone_id: int, record_id: int) -> DNSRecord:
    record = db.scalar(
        select(DNSRecord).where(DNSRecord.id == record_id, DNSRecord.zone_id == zone_id)
    )
    if not record:
        raise HTTPException(status_code=404, detail="DNS record not found")
    return record


def record_response(record: DNSRecord) -> DNSRecordResponse:
    return DNSRecordResponse.model_validate(
        {
            **{
                key: getattr(record, key)
                for key in ("id", "zone_id", "name", "type", "ttl", "created_at", "updated_at")
            },
            "values": json.loads(record.values_json),
        }
    )


@router.get("/hosted-zones/{zone_id}/records", response_model=Paginated[DNSRecordResponse])
def list_records(
    zone_id: int,
    search: str | None = None,
    record_type: str | None = Query(default=None, alias="type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("name", pattern="^(name|type|ttl|created_at|updated_at)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> Paginated[DNSRecordResponse]:
    zone_or_404(db, zone_id)
    filters = [DNSRecord.zone_id == zone_id]
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(DNSRecord.name.ilike(term), DNSRecord.values_json.ilike(term)))
    if record_type:
        normalized_type = record_type.upper()
        if normalized_type not in {"A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"}:
            raise HTTPException(status_code=422, detail="Unsupported record type")
        filters.append(DNSRecord.type == normalized_type)
    total = db.scalar(select(func.count(DNSRecord.id)).where(*filters)) or 0
    sort_column = getattr(DNSRecord, sort)
    records = db.scalars(
        select(DNSRecord)
        .where(*filters)
        .order_by(sort_column.desc() if order == "desc" else sort_column.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Paginated[DNSRecordResponse].build(
        [record_response(record) for record in records], total, page, page_size
    )


@router.post(
    "/hosted-zones/{zone_id}/records",
    response_model=DNSRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_record(
    zone_id: int,
    payload: DNSRecordCreate,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> DNSRecordResponse:
    zone = zone_or_404(db, zone_id)
    if payload.type == "CNAME" and payload.name == zone.name:
        raise HTTPException(status_code=422, detail="CNAME records are not allowed at the zone apex")
    existing_types = set(
        db.scalars(
            select(DNSRecord.type).where(
                DNSRecord.zone_id == zone_id, DNSRecord.name == payload.name
            )
        ).all()
    )
    if (payload.type == "CNAME" and existing_types) or (
        payload.type != "CNAME" and "CNAME" in existing_types
    ):
        raise HTTPException(status_code=409, detail="CNAME cannot coexist with other records at a name")
    record = DNSRecord(
        zone_id=zone_id,
        name=payload.name,
        type=payload.type,
        ttl=payload.ttl,
        values_json=json.dumps(payload.values),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record_response(record)


@router.get("/hosted-zones/{zone_id}/records/{record_id}", response_model=DNSRecordResponse)
def get_record(
    zone_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> DNSRecordResponse:
    return record_response(record_or_404(db, zone_id, record_id))


@router.put("/hosted-zones/{zone_id}/records/{record_id}", response_model=DNSRecordResponse)
def update_record(
    zone_id: int,
    record_id: int,
    payload: DNSRecordUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> DNSRecordResponse:
    record = record_or_404(db, zone_id, record_id)
    merged = {
        "name": payload.name if payload.name is not None else record.name,
        "type": payload.type if payload.type is not None else record.type,
        "ttl": payload.ttl if payload.ttl is not None else record.ttl,
        "values": payload.values if payload.values is not None else json.loads(record.values_json),
    }
    try:
        validated = DNSRecordCreate.model_validate(merged)
    except ValidationError as exc:
        detail = [
            {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
            for error in exc.errors()
        ]
        raise HTTPException(status_code=422, detail=detail)
    zone = zone_or_404(db, zone_id)
    if validated.type == "CNAME" and validated.name == zone.name:
        raise HTTPException(status_code=422, detail="CNAME records are not allowed at the zone apex")
    other_types = set(
        db.scalars(
            select(DNSRecord.type).where(
                DNSRecord.zone_id == zone_id,
                DNSRecord.name == validated.name,
                DNSRecord.id != record.id,
            )
        ).all()
    )
    if (validated.type == "CNAME" and other_types) or (
        validated.type != "CNAME" and "CNAME" in other_types
    ):
        raise HTTPException(status_code=409, detail="CNAME cannot coexist with other records at a name")
    record.name = validated.name
    record.type = validated.type
    record.ttl = validated.ttl
    record.values_json = json.dumps(validated.values)
    db.commit()
    db.refresh(record)
    return record_response(record)


@router.delete("/hosted-zones/{zone_id}/records/{record_id}", response_model=MessageResponse)
def delete_record(
    zone_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> MessageResponse:
    db.delete(record_or_404(db, zone_id, record_id))
    db.commit()
    return MessageResponse(message="DNS record deleted")


def bind_value(record_type: str, value: str) -> str:
    if record_type == "TXT" and not (len(value) >= 2 and value[0] == value[-1] == '"'):
        return f'"{value}"'
    return value


@router.get("/hosted-zones/{zone_id}/export/bind")
def export_bind(
    zone_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> Response:
    zone = zone_or_404(db, zone_id)
    lines = [f"$ORIGIN {zone.name}", "$TTL 300"]
    for record in sorted(zone.records, key=lambda item: (item.name, item.type)):
        for value in json.loads(record.values_json):
            lines.append(f"{record.name} {record.ttl} IN {record.type} {bind_value(record.type, value)}")
    return Response(
        content="\n".join(lines) + "\n",
        media_type="text/dns",
        headers={"Content-Disposition": f'attachment; filename="{zone.name.rstrip(".")}.zone"'},
    )


@router.post("/hosted-zones/{zone_id}/import/bind", response_model=BindImportResponse)
def import_bind(
    zone_id: int,
    payload: BindImportRequest,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> BindImportResponse:
    zone = zone_or_404(db, zone_id)
    if payload.replace_existing:
        db.query(DNSRecord).filter(DNSRecord.zone_id == zone_id).delete()
    origin = zone.name
    default_ttl = 300
    imported = 0
    skipped = 0
    errors: list[str] = []
    by_key: dict[tuple[str, str, int], DNSRecord] = {}
    for line_number, raw_line in enumerate(payload.content.splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith(";"):
            continue
        if line.upper().startswith("$ORIGIN"):
            parts = line.split()
            if len(parts) == 2:
                origin = parts[1].rstrip(".") + "."
            continue
        if line.upper().startswith("$TTL"):
            parts = line.split()
            if len(parts) == 2 and parts[1].isdigit():
                default_ttl = int(parts[1])
            continue
        line = re.sub(r"\s+;.*$", "", line)
        match = re.match(
            r"^(\S+)\s+(?:(\d+)\s+)?(?:IN\s+)?(A|AAAA|CNAME|TXT|MX|NS|PTR|SRV|CAA)\s+(.+)$",
            line,
            re.IGNORECASE,
        )
        if not match:
            skipped += 1
            errors.append(f"Line {line_number}: unsupported or malformed record")
            continue
        name, ttl_text, record_type, value = match.groups()
        name = origin if name == "@" else (name.rstrip(".") + "." if "." in name else f"{name}.{origin}")
        value = value.strip()
        if record_type.upper() == "TXT" and len(value) >= 2 and value[0] == value[-1] == '"':
            value = value[1:-1]
        ttl = int(ttl_text) if ttl_text else default_ttl
        try:
            validated = DNSRecordCreate(name=name, type=record_type.upper(), ttl=ttl, values=[value])
        except ValidationError as exc:
            skipped += 1
            errors.append(f"Line {line_number}: {exc.errors()[0]['msg']}")
            continue
        key = (validated.name, validated.type, validated.ttl)
        record = by_key.get(key)
        if record is None:
            record = DNSRecord(
                zone_id=zone_id,
                name=validated.name,
                type=validated.type,
                ttl=validated.ttl,
                values_json=json.dumps(validated.values),
            )
            by_key[key] = record
            db.add(record)
        else:
            values = json.loads(record.values_json)
            values.extend(validated.values)
            record.values_json = json.dumps(values)
        imported += 1
    db.commit()
    return BindImportResponse(imported=imported, skipped=skipped, errors=errors)
