# SOLAR_REPORT

## Resultats par etape

| Etape | Resultat | Detail |
| --- | --- | --- |
| 1 - Installation | ✅ | `pvlib==0.11.1`, `pandas==2.2.3`, `numpy==1.26.4` installes. Verification : `pvlib.__version__ = 0.11.1`. |
| 2 - `backend/solar.py` | ✅ | Module autonome cree avec pvlib, projection AEQD locale, Shapely, ratio annuel et heatmap GeoJSON. |
| 3 - Migration Alembic | ✅ | Modele `SolarSimulation` ajoute, migration `152c2219e0b0_add_solar_simulations.py` generee et appliquee. |
| 4 - API backend | ✅ | Router `/api/v1/solar` ajoute apres `diagnostics_router`, avec cache par `params_hash` et endpoint latest. |
| 5 - Frontend | ✅ | Ajout d'une section de simulation apres connexion, avec bouton `Simuler l'ombrage solaire`, message de calcul et interpretation agronomique. |
| 6 - Test fonctionnel | ✅ | Simulation solaire executee via API sur une parcelle et une ligne d'arbres creees pour le test. |
| 7 - Rapport | ✅ | Rapport genere dans `D:\ARBO\SOLAR_REPORT.md`. |

## Installation

Commande executee depuis `D:\ARBO` :

```text
pip install pvlib==0.11.1 pandas==2.2.3 numpy==1.26.4
python -c "import pvlib; print(pvlib.__version__)"
```

Output de verification :

```text
0.11.1
```

Note : `numpy` a ete downgrade de `2.0.0` vers `1.26.4` comme demande. `pip` a signale des dossiers temporaires `~umpy` non supprimes automatiquement, sans bloquer l'installation.

## Alembic

Output de `alembic current` apres migration :

```text
152c2219e0b0 (head)
```

Migration creee :

```text
alembic/versions/152c2219e0b0_add_solar_simulations.py
```

Contenu principal de `upgrade()` :

```python
op.create_table(
    "solar_simulations",
    sa.Column("id", sa.UUID(), nullable=False),
    sa.Column("plot_id", sa.UUID(), nullable=False),
    sa.Column("params_hash", sa.String(length=64), nullable=False),
    sa.Column("shade_ratio_annual", sa.Float(), nullable=False),
    sa.Column("shade_ratio_by_month", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column("peak_shade_hour_utc", sa.String(length=5), nullable=True),
    sa.Column("total_shadow_area_m2", sa.Float(), nullable=True),
    sa.Column("plot_area_m2", sa.Float(), nullable=True),
    sa.Column("heatmap_geojson", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("sample_days", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(["plot_id"], ["plots.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
)
op.create_index(op.f("ix_solar_simulations_params_hash"), "solar_simulations", ["params_hash"], unique=False)
op.create_index(op.f("ix_solar_simulations_plot_id"), "solar_simulations", ["plot_id"], unique=False)
```

Verification table :

```text
solar_simulations in inspect(e).get_table_names() => True
```

## Test fonctionnel

Donnees creees via API :

- Utilisateur farmer de test : `solar20260519151510@test.arbo`
- Farm ID : `44d4a109-e9b1-4828-97a3-7f109c50edaa`
- Plot ID : `a2a6b2bc-fa25-48f3-9fc6-9bf720304c56`
- TreeLine : creee avec status `201`

Requete test :

```text
POST http://localhost:8000/api/v1/solar/simulate/a2a6b2bc-fa25-48f3-9fc6-9bf720304c56
Body: {"sample_days":["2024-06-21"],"tree_height_m":8.0,"canopy_radius_m":3.0,"resolution_m":10.0}
```

Resultat :

```text
Status: 200
shade_ratio_annual: 0.06708164973417609
peak_shade_hour_utc: 18:00
heatmap point_count: 105
temps execution approx.: 0.58 s
```

## Verifications finales

- `python -m py_compile backend/solar.py backend/models.py backend/schemas.py backend/routes.py` : ✅
- Lints IDE sur fichiers modifies : ✅
- `npm run build` depuis `frontend/` : ✅
- Uvicorn : ✅ backend disponible sur `/health`; le reloader a recharge les changements backend.

## Bugs trouves et corriges

- Premier autogenerate Alembic de cette phase : aucune derive applicative inattendue, uniquement la table `solar_simulations` ajoutee.
- Premier essai de test fonctionnel : echec de creation de parcelle car PowerShell avait aplati les paires GeoJSON `[lng, lat]`. Corrige dans le test en envoyant des bodies JSON bruts. Aucun changement de code necessaire.
- Le frontend existant ne contenait pas encore l'ecran diagnostic/certification complet; la simulation solaire a donc ete ajoutee dans une section post-connexion avec champ `plot_id`, bouton `Certifier & publier`, puis bouton `Simuler l'ombrage solaire`.

## Problemes restants

- Aucun probleme bloquant constate sur le moteur solaire, la migration, l'API ou le build frontend.
- Optimisation future possible : exposer `canopy_radius_m` a `generate_shade_heatmap()` pour que la heatmap utilise exactement le meme rayon de canopee que le ratio annuel.
