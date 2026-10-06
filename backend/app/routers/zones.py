from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import current_user
from ..models import DNSRecord, HostedZone, User
from ..schemas import (
    HostedZoneCreate,
    HostedZoneResponse,
    HostedZoneUpdate,
    MessageResponse,
    Paginated,
)

router = APIRouter(prefix="/hosted-zones", tags=["hosted zones"])


def zone_or_404(db: Session, zone_id: int) -> HostedZone:
    zone = db.get(HostedZone, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Hosted zone not found")
    return zone


def zone_response(zone: HostedZone, record_count: int | None = None) -> HostedZoneResponse:
    return HostedZoneResponse.model_validate(
        {
            **{key: getattr(zone, key) for key in ("id", "name", "comment", "private_zone", "created_at", "updated_at")},
            "record_count": len(zone.records) if record_count is None else record_count,
        }
    )


@router.get("", response_model=Paginated[HostedZoneResponse])
def list_zones(
    search: str | None = None,
    private_zone: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("name", pattern="^(name|created_at|updated_at)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> Paginated[HostedZoneResponse]:
    filters = []
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(HostedZone.name.ilike(term), HostedZone.comment.ilike(term)))
    if private_zone is not None:
        filters.append(HostedZone.private_zone == private_zone)
    count_stmt = select(func.count(HostedZone.id)).where(*filters)
    total = db.scalar(count_stmt) or 0
    sort_column = getattr(HostedZone, sort)
    stmt = (
        select(HostedZone, func.count(DNSRecord.id).label("record_count"))
        .outerjoin(DNSRecord)
        .where(*filters)
        .group_by(HostedZone.id)
        .order_by(sort_column.desc() if order == "desc" else sort_column.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [zone_response(zone, count) for zone, count in db.execute(stmt).all()]
    return Paginated[HostedZoneResponse].build(items, total, page, page_size)


@router.post("", response_model=HostedZoneResponse, status_code=status.HTTP_201_CREATED)
def create_zone(
    payload: HostedZoneCreate,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> HostedZoneResponse:
    zone = HostedZone(**payload.model_dump())
    db.add(zone)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A hosted zone with this name already exists")
    db.refresh(zone)
    return zone_response(zone, 0)


@router.get("/{zone_id}", response_model=HostedZoneResponse)
def get_zone(
    zone_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> HostedZoneResponse:
    return zone_response(zone_or_404(db, zone_id))


@router.put("/{zone_id}", response_model=HostedZoneResponse)
def update_zone(
    zone_id: int,
    payload: HostedZoneUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> HostedZoneResponse:
    zone = zone_or_404(db, zone_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(zone, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A hosted zone with this name already exists")
    db.refresh(zone)
    return zone_response(zone)


@router.delete("/{zone_id}", response_model=MessageResponse)
def delete_zone(
    zone_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> MessageResponse:
    db.delete(zone_or_404(db, zone_id))
    db.commit()
    return MessageResponse(message="Hosted zone and its records deleted")


@router.get("/{zone_id}/export/json")
def export_json(
    zone_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> Response:
    zone = zone_or_404(db, zone_id)
    content = json.dumps(
        {
            "zone": {
                "id": zone.id,
                "name": zone.name,
                "comment": zone.comment,
                "private_zone": zone.private_zone,
            },
            "records": [
                {
                    "name": record.name,
                    "type": record.type,
                    "ttl": record.ttl,
                    "values": json.loads(record.values_json),
                }
                for record in zone.records
            ],
        },
        indent=2,
    )
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{zone.name.rstrip(".")}.json"'},
    )
