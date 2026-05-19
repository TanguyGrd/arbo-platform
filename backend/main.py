"""
ARBO Platform - FastAPI entry point.

Run locally:
    uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

Prerequisites:
    1. A running PostgreSQL instance with PostGIS enabled.
    2. Env var ARBO_DATABASE_URL pointing to it (or use the local default).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import build_api_router


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("arbo")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting ARBO platform...")
    logger.info("Database migrations are managed by Alembic.")
    logger.info("Run: alembic upgrade head")
    yield
    logger.info("Shutting down ARBO platform...")


app = FastAPI(
    title="ARBO Platform API",
    description=(
        "SaaS de design agroforestier et FinTech de courtage de crédits "
        "carbone selon le Label Bas-Carbone (LBC) français. "
        "MVP — non destiné à la certification réelle de crédits."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — permissive for local development. Restrict to your domain in prod.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # CRA / Next dev server
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(build_api_router())


@app.get("/", tags=["meta"])
def root() -> dict:
    return {
        "name": "ARBO Platform API",
        "version": "0.1.0",
        "status": "ok",
        "disclaimer": (
            "MVP — Les crédits carbone générés via cette plateforme ne sont "
            "PAS certifiés par le Label Bas-Carbone officiel. À usage "
            "exclusivement démonstratif et de validation produit."
        ),
    }


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "healthy"}
