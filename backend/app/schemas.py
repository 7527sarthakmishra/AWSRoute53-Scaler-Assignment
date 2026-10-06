from __future__ import annotations

import ipaddress
import math
import re
from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

RecordType = Literal["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"]
T = TypeVar("T")
HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}\.?$)(?:\*\.)?(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.?$"
)
OWNER_NAME_RE = re.compile(
    r"^(?=.{1,253}\.?$)(?:\*\.)?(?:[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?\.)*"
    r"[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?\.?$"
)


def normalize_dns_name(value: str, *, owner_name: bool = False) -> str:
    value = value.strip().lower()
    if not value:
        raise ValueError("DNS name cannot be empty")
    pattern = OWNER_NAME_RE if owner_name else HOSTNAME_RE
    if not pattern.fullmatch(value):
        raise ValueError("Invalid DNS name")
    return value.rstrip(".") + "."


def validate_record_value(record_type: str, value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Record values cannot be empty")
    if record_type == "A":
        if ipaddress.ip_address(value).version != 4:
            raise ValueError("A records require IPv4 addresses")
    elif record_type == "AAAA":
        if ipaddress.ip_address(value).version != 6:
            raise ValueError("AAAA records require IPv6 addresses")
    elif record_type in {"CNAME", "NS", "PTR"}:
        normalize_dns_name(value)
    elif record_type == "TXT":
        unquoted = value[1:-1] if len(value) >= 2 and value[0] == value[-1] == '"' else value
        if len(unquoted.encode("utf-8")) > 255:
            raise ValueError("TXT values may not exceed 255 bytes")
    elif record_type == "MX":
        parts = value.split()
        if len(parts) != 2 or not parts[0].isdigit() or not 0 <= int(parts[0]) <= 65535:
            raise ValueError("MX values must be '<priority> <hostname>'")
        normalize_dns_name(parts[1])
    elif record_type == "SRV":
        parts = value.split()
        if len(parts) != 4 or not all(part.isdigit() for part in parts[:3]):
            raise ValueError("SRV values must be '<priority> <weight> <port> <hostname>'")
        if any(not 0 <= int(part) <= 65535 for part in parts[:3]):
            raise ValueError("SRV priority, weight, and port must be between 0 and 65535")
        normalize_dns_name(parts[3])
    elif record_type == "CAA":
        match = re.fullmatch(r'(\d{1,3})\s+(issue|issuewild|iodef)\s+"([^"]+)"', value)
        if not match or not 0 <= int(match.group(1)) <= 255:
            raise ValueError('CAA values must be \'<flags> <tag> "<value>"\'')
    return value


class TimestampResponse(BaseModel):
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def serialize_utc_timestamp(self, value: datetime) -> str:
        if value.tzinfo is None:
            return value.isoformat() + "Z"
        return value.isoformat()


class UserResponse(TimestampResponse):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    name: str
    is_active: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class AuthResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str


class HostedZoneBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    comment: str | None = Field(default=None, max_length=255)
    private_zone: bool = False

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        return normalize_dns_name(value)


class HostedZoneCreate(HostedZoneBase):
    pass


class HostedZoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    comment: str | None = Field(default=None, max_length=255)
    private_zone: bool | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str | None) -> str | None:
        return normalize_dns_name(value) if value is not None else value


class HostedZoneResponse(HostedZoneBase, TimestampResponse):
    model_config = ConfigDict(from_attributes=True)
    id: int
    record_count: int = 0


class DNSRecordBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: RecordType
    ttl: int = Field(default=300, ge=0, le=2_147_483_647)
    values: list[str] = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        return normalize_dns_name(value, owner_name=True)

    @model_validator(mode="after")
    def valid_values(self) -> DNSRecordBase:
        normalized = []
        for value in self.values:
            try:
                normalized.append(validate_record_value(self.type, value))
            except ValueError as exc:
                raise ValueError(str(exc)) from exc
        self.values = normalized
        return self


class DNSRecordCreate(DNSRecordBase):
    pass


class DNSRecordUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: RecordType | None = None
    ttl: int | None = Field(default=None, ge=0, le=2_147_483_647)
    values: list[str] | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str | None) -> str | None:
        return normalize_dns_name(value, owner_name=True) if value is not None else value


class DNSRecordResponse(DNSRecordBase, TimestampResponse):
    model_config = ConfigDict(from_attributes=True)
    id: int
    zone_id: int


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def build(cls, items: list[T], total: int, page: int, page_size: int) -> Paginated[T]:
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size) if total else 0,
        )


class BindImportRequest(BaseModel):
    content: str = Field(min_length=1)
    replace_existing: bool = False


class BindImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: list[str]
