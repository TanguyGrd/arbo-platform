# AGENTS.md

## Cursor Cloud specific instructions

### Overview

ARBO Platform is a SaaS MVP for agroforestry design and carbon credit brokerage. The stack is:
- **Backend**: Python FastAPI (port 8000) at `/workspace/backend/`
- **Frontend**: React 18 + Vite (port 5173) at `/workspace/frontend/`
- **Database**: PostgreSQL 16 + PostGIS 3.4 (Docker, port 5432)

### Starting services

1. **Database** (must start first):
   ```
   docker start arbo-db || docker run -d --name arbo-db -e POSTGRES_USER=arbo -e POSTGRES_PASSWORD=arbo -e POSTGRES_DB=arbo -p 5432:5432 postgis/postgis:16-3.4
   ```

2. **Schema setup** (only needed on fresh DB):
   ```
   python3 -c "from backend.database import init_db; init_db()"
   alembic stamp head
   ```
   Note: The Alembic migration `4553206819f7_initial_schema.py` has a known SQLAlchemy enum double-creation bug. Use `init_db()` + `alembic stamp head` instead of `alembic upgrade head` when setting up from scratch.

3. **Backend**:
   ```
   python3 -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
   ```

4. **Frontend**:
   ```
   cd frontend && npm run dev
   ```

### Important caveats

- Docker must be running before starting the backend (the SQLAlchemy engine connects immediately on import).
- The `alembic` package is not listed in `requirements.txt` but is needed for migrations; install with `pip install alembic`.
- ESLint is referenced in `package.json` scripts but no `.eslintrc` config exists, so `npm run lint` will fail. The build (`npm run build`) works fine.
- No automated test suite exists (no pytest, no jest/vitest configured).
- The frontend uses `npm` (lockfile is `package-lock.json`).
- `PATH` must include `$HOME/.local/bin` for pip-installed CLI tools (uvicorn, alembic).

### Key endpoints for testing

- Health check: `GET http://127.0.0.1:8000/health`
- Swagger UI: `http://127.0.0.1:8000/docs`
- Register: `POST /api/v1/auth/register` (JSON body with email, password, full_name, role)
- Login: `POST /api/v1/auth/login` (OAuth2 form: username=email, password)
- Create farm: `POST /api/v1/farms` (requires Bearer token, role=farmer)

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ARBO_DATABASE_URL` | `postgresql+psycopg2://arbo:arbo@localhost:5432/arbo` | DB connection |
| `ARBO_JWT_SECRET` | `dev-only-change-me` | JWT signing |
| `ARBO_FRONTEND_URL` | `http://localhost:5173` | CORS origin |
