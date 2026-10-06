from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import event, select
from sqlalchemy.engine import Engine

from .config import get_settings
from .database import Base, SessionLocal, engine
import json

from .models import DNSRecord, HostedZone, User
from .routers import auth, records, zones
from .security import hash_password


@event.listens_for(Engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    settings = get_settings()
    with SessionLocal() as db:
        email = settings.demo_user_email.lower()
        if not db.scalar(select(User).where(User.email == email)):
            db.add(
                User(
                    email=email,
                    name="Sarthak Mishra (Admin)",
                    password_hash=hash_password(settings.demo_user_password),
                )
            )
            db.commit()

        if not db.scalar(select(HostedZone).limit(1)):
            zone1 = HostedZone(
                name="acme-cloud.com.",
                comment="Production web applications and public API services",
                private_zone=False,
            )
            zone2 = HostedZone(
                name="corp.internal.",
                comment="Internal VPC private DNS service routing",
                private_zone=True,
            )
            zone3 = HostedZone(
                name="staging.acme-dev.net.",
                comment="Staging and pre-production environment",
                private_zone=False,
            )
            db.add_all([zone1, zone2, zone3])
            db.commit()
            db.refresh(zone1)
            db.refresh(zone2)
            db.refresh(zone3)

            records = [
                DNSRecord(
                    zone_id=zone1.id,
                    name="acme-cloud.com.",
                    type="A",
                    ttl=300,
                    values_json=json.dumps(["198.51.100.10", "198.51.100.11"]),
                ),
                DNSRecord(
                    zone_id=zone1.id,
                    name="www.acme-cloud.com.",
                    type="CNAME",
                    ttl=300,
                    values_json=json.dumps(["acme-cloud.com."]),
                ),
                DNSRecord(
                    zone_id=zone1.id,
                    name="api.acme-cloud.com.",
                    type="A",
                    ttl=60,
                    values_json=json.dumps(["198.51.100.25"]),
                ),
                DNSRecord(
                    zone_id=zone1.id,
                    name="mail.acme-cloud.com.",
                    type="MX",
                    ttl=3600,
                    values_json=json.dumps(["10 mail1.acme-cloud.com.", "20 mail2.acme-cloud.com."]),
                ),
                DNSRecord(
                    zone_id=zone1.id,
                    name="acme-cloud.com.",
                    type="TXT",
                    ttl=300,
                    values_json=json.dumps(['"v=spf1 include:_spf.google.com ~all"']),
                ),
                DNSRecord(
                    zone_id=zone1.id,
                    name="acme-cloud.com.",
                    type="CAA",
                    ttl=3600,
                    values_json=json.dumps(['0 issue "letsencrypt.org"']),
                ),
                DNSRecord(
                    zone_id=zone1.id,
                    name="_sip._tcp.acme-cloud.com.",
                    type="SRV",
                    ttl=300,
                    values_json=json.dumps(["10 5 5060 sip.acme-cloud.com."]),
                ),
                DNSRecord(
                    zone_id=zone2.id,
                    name="gateway.corp.internal.",
                    type="A",
                    ttl=300,
                    values_json=json.dumps(["10.0.1.1"]),
                ),
                DNSRecord(
                    zone_id=zone2.id,
                    name="db-primary.corp.internal.",
                    type="A",
                    ttl=60,
                    values_json=json.dumps(["10.0.2.10"]),
                ),
                DNSRecord(
                    zone_id=zone2.id,
                    name="auth.corp.internal.",
                    type="CNAME",
                    ttl=300,
                    values_json=json.dumps(["gateway.corp.internal."]),
                ),
                DNSRecord(
                    zone_id=zone3.id,
                    name="staging.acme-dev.net.",
                    type="A",
                    ttl=300,
                    values_json=json.dumps(["203.0.113.40"]),
                ),
                DNSRecord(
                    zone_id=zone3.id,
                    name="web.staging.acme-dev.net.",
                    type="CNAME",
                    ttl=300,
                    values_json=json.dumps(["staging.acme-dev.net."]),
                ),
                DNSRecord(
                    zone_id=zone3.id,
                    name="staging.acme-dev.net.",
                    type="TXT",
                    ttl=300,
                    values_json=json.dumps(['"aws-route53-verification=d8f9214a"']),
                ),
            ]
            db.add_all(records)
            db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(zones.router, prefix="/api")
app.include_router(records.router, prefix="/api")

