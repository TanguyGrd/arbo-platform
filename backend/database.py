"""
ARBO Platform - Database configuration.

Manages SQLAlchemy engine, session factory, and declarative Base for
PostgreSQL + PostGIS. Uses connection pooling suitable for a FastAPI
async-friendly workload.

Notes
-----
- The DATABASE_URL is read from an environment variable, with a sensible
  default for local Docker development.
- PostGIS must be enabled on the target database before models are
  created. Run `CREATE EXTENSION IF NOT EXISTS postgis;` in psql.
"""

from __future__ import annotations

import os
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Local default uses a postgis-enabled PostgreSQL container.
# In production, override via environment variable.
DATABASE_URL: str = os.environ.get(
    "ARBO_DATABASE_URL",
    "postgresql+psycopg2://arbo:arbo@localhost:5432/arbo",
)

# ---------------------------------------------------------------------------
# Engine and session factory
# ---------------------------------------------------------------------------

engine: Engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,   # Recycle stale connections automatically
    pool_size=10,
    max_overflow=20,
)

SessionLocal: sessionmaker = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

Base = declarative_base()


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session and ensures it
    is closed after the request, even on exceptions.
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Create all tables defined on Base.metadata.

    Intended for local development only. In production, use Alembic
    migrations to manage schema evolution.
    """
    # Local import to avoid circular dependency at module load time.
    from . import models  # noqa: F401

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    Base.metadata.create_all(bind=engine)
