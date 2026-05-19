# ARBO — Rapport d'audit Phase 1 & 2

**Date :** 2026-05-18  
**Périmètre :** Restructuration backend, audit code Python, smoke tests API

---

## 1. Restructuration effectuée

| Fichier source (racine) | Destination |
|-------------------------|-------------|
| `database.py`           | `backend/database.py` |
| `engine.py`             | `backend/engine.py` |
| `main.py`               | `backend/main.py` |
| `models.py`             | `backend/models.py` |
| `routes.py`             | `backend/routes.py` |
| `schemas.py`            | `backend/schemas.py` |
| `requirements.txt`      | `backend/requirements.txt` |
| `App.jsx`               | `frontend/App.jsx` |
| *(créé)*                | `backend/__init__.py` |

Aucun fichier supprimé. Les imports relatifs (`from .database`, `from . import engine`) étaient déjà cohérents avec un package `backend` — aucune modification d'import nécessaire.

---

## 2. Bugs trouvés et corrigés

| # | Fichier | Problème | Correction |
|---|---------|----------|------------|
| 1 | `backend/database.py` | `init_db()` ne créait pas l'extension PostGIS avant `create_all()` — échec possible sur une DB vierge | Ajout de `CREATE EXTENSION IF NOT EXISTS postgis` dans une transaction avant la création des tables |
| 2 | `backend/database.py` | Paramètre `future=True` obsolète en SQLAlchemy 2.x | Suppression de `future=True` sur `create_engine` et `sessionmaker` |
| 3 | `backend/routes.py` | `_to_decimal(area_ha * 10000) / 10000` — arrondi monétaire (2 déc.) appliqué à une surface nécessitant 4 décimales | Nouvelle helper `_to_decimal4()` avec quantize `0.0001` pour `area_ha` et `estimated_tco2` |
| 4 | `backend/routes.py` | Commission plateforme codée en dur (`0.15`) dans `purchase_credit` au lieu de la constante moteur | Utilisation de `engine.PLATFORM_COMMISSION_RATE` |
| 5 | `backend/engine.py` | Import `LineString` inutilisé | Suppression de l'import |
| 6 | `backend/models.py` | Imports inutilisés (`List`, `Optional`, `Mapped`) | Nettoyage des imports |

### Points audités — aucune correction requise

- **Syntaxe Python :** OK (vérifié via `py_compile`)
- **Pydantic v2 :** `ConfigDict(from_attributes=True)`, `@field_validator`, `model_validate()` — conformes
- **SQLAlchemy 2.x :** `db.get()`, `sessionmaker`, `declarative_base()` — fonctionnels (style `db.query()` conservé, compatible SA 2.x)
- **engine.py — calculs :** projection azimuthale équidistante pour l'aire, géodésie WGS84 pour longueurs, sigmoïde logistique carbone, limite PAC 200 arbres/ha, commission 15% — logique cohérente
- **routes.py — codes HTTP :** 404 via `_require()`, 409 email dupliqué, 422 validation Pydantic/géométrie — présents sur les routes testées

---

## 3. Résultats des smoke tests

Serveur : `python -m uvicorn backend.main:app --reload` sur `http://127.0.0.1:8000`  
Base de données : conteneur Docker `arbo-db` (PostGIS 16-3.4)

| Test | Méthode / Route | Attendu | Obtenu | Statut |
|------|-----------------|---------|--------|--------|
| Root | `GET /` | 200, JSON | 200 — `{"name":"ARBO Platform API","status":"ok",...}` | ✅ |
| Health | `GET /health` | 200 | 200 — `{"status":"healthy"}` | ✅ |
| Swagger | `GET /docs` | 200 | 200 | ✅ |
| Création user | `POST /api/v1/users` (payload valide) | 201 | 201 — user avec UUID retourné | ✅ |
| Email dupliqué | `POST /api/v1/users` (même email) | 409 | 409 — `"A user with this email already exists."` | ✅ |
| Mot de passe court | `POST /api/v1/users` (password `"abc"`) | 422 | 422 — validation Pydantic `min_length=8` | ✅ |

**Démarrage uvicorn :** ✅ `Uvicorn running on http://127.0.0.1:8000` + `Database schema verified.`

---

## 4. Problèmes restants — décision requise

| Priorité | Sujet | Détail | Recommandation |
|----------|-------|--------|----------------|
| 🔴 Haute | Hash mot de passe | SHA-256 + salt (`routes._hash_password`) — insuffisant en production | Migrer vers `bcrypt` ou `argon2-cffi` avant mise en prod |
| 🔴 Haute | Authentification | Aucun JWT ; `buyer_id` passé en clair dans le body | Implémenter OAuth2/JWT + sessions signées |
| 🟡 Moyenne | Migrations DB | `create_all()` au startup — pas de versioning schéma | Ajouter Alembic pour les évolutions de schéma |
| 🟡 Moyenne | Frontend Vite | `App.jsx` seul, pas de `package.json` / config Vite | Scaffolding Vite + Tailwind + deps Leaflet/Recharts |
| 🟡 Moyenne | Modèle carbone | Sigmoïde MVP avec paramètres indicatifs | Remplacer par calculateurs LBC officiels pour toute claim réelle |
| 🟢 Basse | Style ORM | Modèles en style `Column()` classique vs `Mapped[]` SA 2.0 | Refactor progressif si souhaité (cosmétique) |
| 🟢 Basse | `datetime.utcnow` | Déprécié Python 3.12+ | Migrer vers `datetime.now(timezone.utc)` lors d'un upgrade Python |

---

## 5. Sécurité — inventaire

| Élément | État |
|---------|------|
| SQL injection | ✅ Requêtes ORM paramétrées, pas de SQL brut utilisateur |
| Validation entrées | ✅ Pydantic v2 + validation GeoJSON côté serveur |
| CORS | ⚠️ Permissif (`localhost:5173/3000`) — restreindre en prod |
| Secrets | ✅ Pas de credentials en dur (URL via `ARBO_DATABASE_URL`) |
| Double comptage crédits | ✅ Statut `retired` + `FOR UPDATE` sur achat |
