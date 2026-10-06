# AWS Route 53 Clone

A full-stack recreation of the core AWS Route 53 console experience. The application provides mocked console authentication, persistent hosted zones, persistent DNS records, Route 53-style navigation and resource tables, search, filters, pagination, dialogs, and notifications.

This project is an interface and workflow clone for demonstration purposes. It does not publish DNS changes or connect to AWS.

## Features

- **Authentication**: Mocked console authentication with login, logout, expiring opaque sessions, browser session persistence, and AWS IAM account switcher mock
- **Hosted Zones CRUD**: Full create, read, update, delete for public and private hosted zones with search, sorting, and pagination
- **DNS Records CRUD**: Full create, read, update, delete for all Route 53 record types: `A`, `AAAA`, `CNAME`, `TXT`, `MX`, `NS`, `PTR`, `SRV`, and `CAA`
- **Route 53 Console Experience**: Pixel-accurate AWS Cloudscape console UI with top navigation, Route 53 sidebar, breadcrumbs, search, filters, pagination, modals, alerts, and toast notifications
- **Interactive Dashboard**: Route 53 Overview dashboard with real hosted zones metrics, record counts, recent zones table, and quick actions
- **Hosted Zone Details**: Collapsible details panel displaying Zone ID, status ("In sync"), record count, description, and 4 assigned AWS authoritative name servers with one-click copy
- **Record Inspector**: Quick record details card with copy-to-clipboard actions
- **Bulk Operations (Bonus)**: Multi-row selection checkboxes, indeterminate select-all, bulk delete for hosted zones and records
- **BIND Zone File Import (Bonus)**: Import DNS records from BIND zone files via file upload or paste, with optional replacement and sample template loader
- **Zone Export (Bonus)**: One-click export of hosted zones in standard JSON and BIND `.zone` formats
- **Dark Mode (Bonus)**: Native AWS dark theme with persistent theme toggle in topbar and account menu
- **Keyboard Shortcuts (Bonus)**: `Alt+S` or `/` for search, `Alt+C` to create, `Esc` to close, `?` for interactive shortcuts modal
- **Mocked AWS Sections**: Authentic placeholder pages for Traffic Policies, Health Checks, Resolver VPCs, and Profiles
- **SQLite Persistence**: Automatic schema migrations, relationship cascade deletion, and persistent volume support

## Technology

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, CSS |
| Backend | FastAPI, SQLAlchemy 2, Pydantic |
| Database | SQLite |
| Tests | Pytest, FastAPI TestClient |

## Quick start with Docker

Prerequisite: Docker Desktop with Compose.

```powershell
docker compose up --build
```

Open:

- Application: [http://localhost:3000](http://localhost:3000)
- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- API health: [http://localhost:8000/api/health](http://localhost:8000/api/health)

Demo credentials:

```text
admin@example.com
route53demo
```

SQLite data is stored in the named `route53_data` Docker volume and survives container restarts.

## Local development

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

The database is created automatically at `backend/route53_clone.db`. Configuration can be changed with environment variables documented in `backend/.env.example`.

### Frontend

In a second terminal:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000/api`.

## Architecture

```text
Browser
  |
  | HTTP + Bearer session token
  v
Next.js frontend (port 3000)
  |
  | REST JSON
  v
FastAPI backend (port 8000)
  |
  | SQLAlchemy
  v
SQLite database
```

The frontend is a client-side console application. It stores only the opaque session token in `localStorage`; all hosted-zone and record data is fetched from the API. The backend hashes session tokens before storage, validates record-type-specific values, and uses SQLite foreign keys to cascade record deletion when a hosted zone is removed.

### Repository layout

```text
route53-clone/
├── frontend/
│   ├── src/app/          # Console page, layout, and visual system
│   ├── src/components/   # Shared icons
│   └── src/lib/          # API client and TypeScript models
├── backend/
│   ├── app/              # FastAPI application, models, schemas, routers
│   └── tests/            # Isolated API tests
├── docker-compose.yml
└── README.md
```

## Database schema

### `users`

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `email` | Unique login email |
| `name` | Display name |
| `password_hash` | PBKDF2 password hash |
| `is_active` | Login status |
| `created_at`, `updated_at` | Audit timestamps |

### `auth_sessions`

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `token_hash` | SHA-256 hash of the opaque bearer token |
| `user_id` | Owning user |
| `expires_at` | Session expiration |
| `created_at` | Session creation timestamp |

### `hosted_zones`

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `name` | Unique normalized DNS zone name |
| `comment` | Optional description |
| `private_zone` | Public/private hosted-zone flag |
| `created_at`, `updated_at` | Audit timestamps |

### `dns_records`

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `zone_id` | Hosted-zone foreign key with cascading delete |
| `name` | Normalized owner name |
| `type` | Route 53 record type |
| `ttl` | Time to live in seconds |
| `values_json` | JSON array of one or more record values |
| `created_at`, `updated_at` | Audit timestamps |

## API overview

All resource endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Create a session |
| `GET` | `/api/auth/me` | Restore the current user |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/hosted-zones` | Search and paginate zones |
| `POST` | `/api/hosted-zones` | Create a zone |
| `GET` | `/api/hosted-zones/{id}` | Read a zone |
| `PUT` | `/api/hosted-zones/{id}` | Update a zone |
| `DELETE` | `/api/hosted-zones/{id}` | Delete a zone and its records |
| `GET` | `/api/hosted-zones/{id}/records` | Search/filter/paginate records |
| `POST` | `/api/hosted-zones/{id}/records` | Create a record |
| `PUT` | `/api/hosted-zones/{id}/records/{recordId}` | Update a record |
| `DELETE` | `/api/hosted-zones/{id}/records/{recordId}` | Delete a record |
| `GET` | `/api/hosted-zones/{id}/export/json` | Download JSON export |
| `GET` | `/api/hosted-zones/{id}/export/bind` | Download BIND zone file |
| `POST` | `/api/hosted-zones/{id}/import/bind` | Import BIND text |

Interactive request/response documentation is available at `/docs`.

## Validation

```powershell
cd backend
python -m pytest -q

cd ..\frontend
npm run lint
npm run build
```

## Deployment

The included Dockerfiles can be deployed to any container platform with a persistent volume for `/app/data`. Set the frontend build argument `NEXT_PUBLIC_API_URL` to the public backend URL, configure `FRONTEND_ORIGINS` with the public frontend origin, and use a persistent `DATABASE_URL`.

A hosted demo URL is not embedded because deployment credentials and a target hosting account are environment-specific.
