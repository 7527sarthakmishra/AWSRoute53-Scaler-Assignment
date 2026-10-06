# Route53 Clone Backend

FastAPI and SQLite backend for hosted zones and DNS records.

## Run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API is under `/api`, OpenAPI docs are at `/docs`, and health checks are available at `/health` and `/api/health`.

The seeded credentials default to `admin@example.com` / `route53demo`; override them in `.env`.
