# ARBO Platform

SaaS MVP d'agroforesterie et courtage FinTech de crédits carbone selon le Label Bas-Carbone (LBC) français. La plateforme permet aux agriculteurs de concevoir des parcelles agroforestières sur carte, d'obtenir des diagnostics (ombrage, conformité PAC, séquestration carbone) et de commercialiser des crédits carbone simulés sur une marketplace.

> **Disclaimer :** MVP à usage démonstratif. Les crédits générés ne sont pas certifiés par le Label Bas-Carbone officiel.

---

## Prérequis

| Outil | Version minimale |
|-------|------------------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Dernière stable |
| Python | 3.11+ |
| Node.js | 18+ |
| npm ou pnpm | Récent |

---

## Lancement complet (Windows PowerShell)

### 1. Base de données PostgreSQL + PostGIS

```powershell
# Première fois — créer le conteneur
docker run -d --name arbo-db `
  -e POSTGRES_USER=arbo `
  -e POSTGRES_PASSWORD=arbo `
  -e POSTGRES_DB=arbo `
  -p 5432:5432 `
  postgis/postgis:16-3.4

# Vérifier que le conteneur tourne
docker ps
```

Si le conteneur existe déjà mais est arrêté :

```powershell
docker start arbo-db
```

### 2. Backend Python (FastAPI)

```powershell
cd D:\ARBO

# Installation des dépendances (première fois)
python -m pip install -r backend\requirements.txt

# Lancer l'API (depuis la racine D:\ARBO)
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

L'API est disponible sur :

- **Swagger UI :** http://127.0.0.1:8000/docs
- **Health check :** http://127.0.0.1:8000/health

### 3. Frontend React (Vite)

> Le composant principal se trouve dans `frontend/App.jsx`. Un scaffolding Vite complet reste à initialiser.

```powershell
cd D:\ARBO\frontend

# Première fois — initialiser le projet Vite (si pas encore fait)
npm create vite@latest . -- --template react
npm install react-leaflet leaflet leaflet-draw react-leaflet-draw recharts
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Lancer le dev server
npm run dev
```

Le frontend Vite démarre par défaut sur http://localhost:5173.

---

## Variables d'environnement

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `ARBO_DATABASE_URL` | URL SQLAlchemy PostgreSQL | `postgresql+psycopg2://arbo:arbo@localhost:5432/arbo` |
| `VITE_API_BASE` | URL de base de l'API côté frontend | `http://127.0.0.1:8000` |

Exemple PowerShell (session courante) :

```powershell
$env:ARBO_DATABASE_URL = "postgresql+psycopg2://arbo:arbo@localhost:5432/arbo"
$env:VITE_API_BASE = "http://127.0.0.1:8000"
```

---

## Commandes utiles

```powershell
# Logs du conteneur DB
docker logs arbo-db

# Accès psql interactif
docker exec -it arbo-db psql -U arbo -d arbo

# Reset complet de la base (⚠️ supprime toutes les données)
docker stop arbo-db
docker rm arbo-db
docker run -d --name arbo-db `
  -e POSTGRES_USER=arbo `
  -e POSTGRES_PASSWORD=arbo `
  -e POSTGRES_DB=arbo `
  -p 5432:5432 `
  postgis/postgis:16-3.4

# Test rapide de l'API
curl.exe http://127.0.0.1:8000/health
```

---

## Structure du projet

```
D:\ARBO\
├── backend\
│   ├── __init__.py
│   ├── database.py      # Engine SQLAlchemy, sessions, init PostGIS
│   ├── engine.py        # Calculs géo, ombrage, PAC, carbone, commission
│   ├── main.py          # Point d'entrée FastAPI
│   ├── models.py        # Modèles ORM (User, Farm, Plot, TreeLine, …)
│   ├── routes.py        # Endpoints REST /api/v1/*
│   ├── schemas.py       # Schémas Pydantic v2
│   └── requirements.txt
├── frontend\
│   └── App.jsx          # Composant React unifié (carte + dashboard)
├── AUDIT_REPORT.md      # Rapport d'audit et smoke tests
└── README.md
```

---

## Thème visuel frontend

| Couleur | Usage | Hex |
|---------|-------|-----|
| Forêt | Fond principal | `#0F3D24` |
| Crème | Texte / fond clair | `#FAF9F6` |
| Émeraude | Accent / actions | `#2ECC71` |

---

## Constantes métier (backend)

- **Commission plateforme :** 15% (`PLATFORM_COMMISSION_RATE` dans `engine.py`)
- **Limite PAC :** 200 arbres/ha (`PAC_MAX_DENSITY_PER_HA`)
- **Répartition revenus :** 85% agriculteur / 15% plateforme
