import os
import sys
import logging
from flask import Flask, send_from_directory, session, request, redirect, url_for, make_response, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from app.database import db
from flask_migrate import Migrate

migrate = Migrate()

# Configure logging to ensure output is visible
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))


def create_app(test_config=None):
    logger.info("=" * 60)
    logger.info("STARTING CREATE_APP")
    logger.info("=" * 60)
    
    # Detect if running in production (Docker/Render)
    # Check for /.dockerenv OR Render-specific env vars OR RENDER env var
    in_docker = (
        os.path.exists('/.dockerenv') or
        os.environ.get('RENDER') == 'true' or
        os.environ.get('RENDER_SERVICE_NAME') is not None
    )
    logger.info(f"Running in Docker/Production: {in_docker}")
    logger.info(f"RENDER env var: {os.environ.get('RENDER')}")
    logger.info(f"RENDER_SERVICE_NAME: {os.environ.get('RENDER_SERVICE_NAME')}")

    # Set static folder to frontend dist if the build exists (covers Docker/Render and
    # any local production-preview scenario where the dist was built manually).
    _candidate_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'dist'))
    serve_spa = in_docker or os.path.exists(os.path.join(_candidate_dist, 'index.html'))
    # Do NOT pass static_folder to Flask. If we do, Flask registers its own
    # /<path:filename> route (before our catch-all) and returns 404 for any
    # SPA path that doesn't map to a real file — the catch-all never fires.
    # Instead we handle all static-file serving inside serve_frontend() below.
    _index_html = os.path.join(_candidate_dist, 'index.html')
    logger.info(f"SPA candidate dist : {_candidate_dist}")
    logger.info(f"SPA index.html     : {_index_html} (exists: {os.path.exists(_index_html)})")
    logger.info(f"serve_spa          : {serve_spa}")
    app = Flask(__name__, instance_relative_config=True)

    # Load default config
    app.config.from_object('config.Config')

    # Load instance config if present
    if test_config is None:
        app.config.from_pyfile('config.py', silent=True)
    else:
        app.config.update(test_config)

    # Initialize database and Flask-Migrate
    db.init_app(app)
    migrate.init_app(app, db)

    # Configure database session
    @app.teardown_appcontext
    def shutdown_session(exception=None):
        db.session.remove()

    # Ensure all tables exist (safe for both fresh installs and existing DBs).
    # Schema changes going forward are handled by Flask-Migrate (flask db migrate/upgrade).
    try:
        with app.app_context():
            db.create_all()
            logger.info("Database tables verified/created successfully")
    except Exception as e:
        logger.warning(f"DB create_all error (continuing anyway): {e}")

    # Inline migration: add 'priority' column to sourcing_properties if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'sourcing_properties' in inspector.get_table_names():
                cols = [c['name'] for c in inspector.get_columns('sourcing_properties')]
                if 'priority' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(text("ALTER TABLE sourcing_properties ADD COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'medium'"))
                        conn.commit()
                    logger.info("Added 'priority' column to sourcing_properties")
    except Exception as e:
        logger.warning(f"Priority column migration note: {e}")

    # Inline migration: add 'activity_log' column to sourcing_properties if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'sourcing_properties' in inspector.get_table_names():
                cols = [c['name'] for c in inspector.get_columns('sourcing_properties')]
                if 'activity_log' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(text("ALTER TABLE sourcing_properties ADD COLUMN activity_log TEXT DEFAULT '[]'"))
                        conn.commit()
                    logger.info("Added 'activity_log' column to sourcing_properties")
    except Exception as e:
        logger.warning(f"activity_log column migration note: {e}")

    # Inline migration: add 'gp_id' column to sourcing_properties and deals if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            for table in ('sourcing_properties', 'deals'):
                if table in inspector.get_table_names():
                    cols = [c['name'] for c in inspector.get_columns(table)]
                    if 'gp_id' not in cols:
                        with db.engine.connect() as conn:
                            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN gp_id INTEGER"))
                            conn.commit()
                        logger.info(f"Added 'gp_id' column to {table}")
    except Exception as e:
        logger.warning(f"gp_id column migration note: {e}")

    # Inline migration: drop stale 'next_followup_date' column from sourcing_properties if present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'sourcing_properties' in inspector.get_table_names():
                cols = [c['name'] for c in inspector.get_columns('sourcing_properties')]
                if 'next_followup_date' in cols:
                    with db.engine.connect() as conn:
                        conn.execute(text("ALTER TABLE sourcing_properties DROP COLUMN next_followup_date"))
                        conn.commit()
                    logger.info("Dropped stale 'next_followup_date' column from sourcing_properties")
    except Exception as e:
        logger.warning(f"next_followup_date column cleanup note: {e}")

    # Inline migration: add 'om_drive_url' column to sourcing_properties if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'sourcing_properties' in inspector.get_table_names():
                cols = [c['name'] for c in inspector.get_columns('sourcing_properties')]
                if 'om_drive_url' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(text("ALTER TABLE sourcing_properties ADD COLUMN om_drive_url VARCHAR(1000)"))
                        conn.commit()
                    logger.info("Added 'om_drive_url' column to sourcing_properties")
    except Exception as e:
        logger.warning(f"om_drive_url column migration note: {e}")

    # Inline migration: add tax_delinquent_feed_* columns to signal_markets if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'signal_markets' in inspector.get_table_names():
                cols = [c['name'] for c in inspector.get_columns('signal_markets')]
                new_cols = {
                    'tax_delinquent_feed_url': 'VARCHAR(1000)',
                    'tax_delinquent_feed_type': 'VARCHAR(20)',
                    'tax_delinquent_field_mapping': 'TEXT',
                }
                with db.engine.connect() as conn:
                    for col, col_type in new_cols.items():
                        if col not in cols:
                            conn.execute(text(f"ALTER TABLE signal_markets ADD COLUMN {col} {col_type}"))
                            conn.commit()
                            logger.info(f"Added '{col}' column to signal_markets")
    except Exception as e:
        logger.warning(f"tax_delinquent_feed column migration note: {e}")

    # Inline migration: add 'status' column to signal_hits if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'signal_hits' in inspector.get_table_names():
                cols = [c['name'] for c in inspector.get_columns('signal_hits')]
                if 'status' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(text("ALTER TABLE signal_hits ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'New'"))
                        conn.commit()
                    logger.info("Added 'status' column to signal_hits")
    except Exception as e:
        logger.warning(f"signal_hits status column migration note: {e}")

    # Inline migration: add 'year_built' and 'is_lihtc' columns to signal_hits if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'signal_hits' in inspector.get_table_names():
                cols = [c['name'] for c in inspector.get_columns('signal_hits')]
                with db.engine.connect() as conn:
                    if 'year_built' not in cols:
                        conn.execute(text("ALTER TABLE signal_hits ADD COLUMN year_built INTEGER"))
                        conn.commit()
                        logger.info("Added 'year_built' column to signal_hits")
                    if 'is_lihtc' not in cols:
                        conn.execute(text("ALTER TABLE signal_hits ADD COLUMN is_lihtc BOOLEAN NOT NULL DEFAULT 0"))
                        conn.commit()
                        logger.info("Added 'is_lihtc' column to signal_hits")
    except Exception as e:
        logger.warning(f"signal_hits year_built/is_lihtc column migration note: {e}")

    # Seed default signal-engine markets + signal-library rows (idempotent —
    # only inserts if the tables are empty, so it's a no-op on every boot
    # after the first).
    try:
        with app.app_context():
            from app.database import SignalMarketModel, SignalDefinitionModel
            import time as _time

            if SignalMarketModel.query.count() == 0:
                seed_markets = [
                    {'name': 'Sacramento, CA', 'city': 'Sacramento', 'state': 'CA'},
                    {'name': 'Columbus, GA', 'city': 'Columbus', 'state': 'GA'},
                ]
                for i, m in enumerate(seed_markets):
                    db.session.add(SignalMarketModel(
                        id=str(int(_time.time() * 1000) + i),
                        name=m['name'], city=m['city'], state=m['state'],
                    ))
                db.session.commit()
                logger.info("Seeded default signal_markets (Sacramento CA, Columbus GA)")

            if SignalDefinitionModel.query.count() == 0:
                seed_signals = [
                    # Feasible for v1 — fully active
                    ('absentee_owner', 'Long-Hold Owner (Sacramento only)', 'public_records', True, False, None),
                    ('code_violations', 'Code Violations / Housing Court', 'public_records', True, False, None),
                    ('tax_delinquency', 'Tax Delinquency', 'public_records', True, False, None),
                    # HUD national datasets — fully active
                    ('hud_fha_loan_maturity', 'HUD FHA-Insured Loan Maturity', 'public_records', True, False, None),
                    ('hud_section8_contract_expiration', 'HUD Section 8 Contract Expiration', 'public_records', True, False, None),
                    ('hud_lihtc_year15', 'HUD LIHTC Year 15 Approaching', 'public_records', False, True,
                     "Out of buy box for now: LIHTC/affordable properties don't match this fund's conventional "
                     'Class B/C target, extended-use rent restrictions often outlive Year 15, and transfers can '
                     'require a right-of-first-refusal waiver. Data source is real and verified working if this changes.'),
                    # Flagged in original spec — stubbed, disabled
                    ('pre_foreclosure', 'Pre-Foreclosure / Notice of Default', 'public_records', False, True,
                     'County recorder portals have no API and differ per county; no reliable bulk search found.'),
                    ('probate', 'Probate Filings', 'public_records', False, True,
                     'Court portals are auth-walled with no structured search available.'),
                    ('ucc_lien', "UCC / Mechanic's Liens", 'public_records', False, True,
                     'UCC search is by owner name, not address; real mechanic\'s liens are recorded at the county, not the state UCC registry.'),
                    ('loan_maturity_cmbs', 'Loan Maturity (CMBS)', 'public_records', False, True,
                     'CMBS loan data (Trepp/CompStak) is proprietary; no free public source found. See HUD FHA loan maturity for a public substitute.'),
                    # Inbox sources — deferred to v1.1
                    ('inbox_loopnet', 'Inbox — LoopNet Alerts', 'inbox', False, True, 'Planned for v1.1.'),
                    ('inbox_crexi', 'Inbox — Crexi Alerts', 'inbox', False, True, 'Planned for v1.1.'),
                ]
                for i, (key, label, category, enabled, stubbed, reason) in enumerate(seed_signals):
                    db.session.add(SignalDefinitionModel(
                        id=str(int(_time.time() * 1000) + 100 + i),
                        key=key, label=label, category=category,
                        enabled=enabled, stubbed=stubbed, disabled_reason=reason,
                    ))
                db.session.commit()
                logger.info("Seeded default signal_definitions (12 signals)")
    except Exception as e:
        logger.warning(f"Signal engine seed data note: {e}")

    # Ensure known-good feed configs + signal-definition labels are applied
    # even on a database that was already seeded before these were found —
    # the seed block above only runs once (on an empty table), so a later
    # code change to seed constants doesn't retroactively update existing
    # rows. Matches by city/state, and only touches feed columns that are
    # still null — never overwrites something a user configured by hand
    # through the "Configure feeds" panel.
    try:
        with app.app_context():
            from app.database import SignalMarketModel, SignalDefinitionModel
            import json as _json

            absentee_def = SignalDefinitionModel.query.filter_by(key='absentee_owner').first()
            if absentee_def and absentee_def.label == 'Absentee / Long-Hold Owner':
                absentee_def.label = 'Long-Hold Owner (Sacramento only)'
                db.session.commit()
                logger.info("Updated absentee_owner signal label to reflect real scope")

            lihtc_def = SignalDefinitionModel.query.filter_by(key='hud_lihtc_year15').first()
            if lihtc_def and lihtc_def.enabled and not lihtc_def.stubbed:
                lihtc_def.enabled = False
                lihtc_def.stubbed = True
                lihtc_def.disabled_reason = (
                    "Out of buy box for now: LIHTC/affordable properties don't match this fund's conventional "
                    'Class B/C target, extended-use rent restrictions often outlive Year 15, and transfers can '
                    'require a right-of-first-refusal waiver. Data source is real and verified working if this changes.'
                )
                db.session.commit()
                logger.info("Disabled hud_lihtc_year15 signal — out of buy box, not a data problem")

            sacramento = SignalMarketModel.query.filter_by(city='Sacramento', state='CA').first()
            if sacramento:
                if not sacramento.code_violations_feed_url:
                    sacramento.code_violations_feed_url = 'https://mapservices.gis.saccounty.net/arcgis/rest/services/ACCELA_ACTIVITIES/MapServer/1'
                    sacramento.code_violations_feed_type = 'arcgis'
                    sacramento.code_violations_field_mapping = _json.dumps({
                        'address': 'StreetAddress', 'owner_name': 'OwnerName',
                        'owner_mailing_address': 'OwnerAddress', 'units': 'NumOfUnits',
                    })
                    logger.info("Applied known-good code_violations feed config to Sacramento")
                if not sacramento.assessor_feed_url:
                    sacramento.assessor_feed_url = 'https://mapservices.gis.saccounty.net/arcgis/rest/services/ASSESSOR/MapServer/1'
                    sacramento.assessor_feed_type = 'arcgis'
                    sacramento.assessor_field_mapping = _json.dumps({
                        'situs_address': 'SITUS_ADDRESS1', 'sale_date': 'DOCUMENT_DATE',
                        'units': 'Units', 'property_type': 'Property_Type', 'year_built': 'EFFECTIVE_YEAR_BUILT',
                        '_where': "Property_Type='Multiple Family Residence'",
                    })
                    logger.info("Applied known-good assessor (long-hold) feed config to Sacramento")
                elif sacramento.assessor_field_mapping:
                    # Big-bucket ingestion pivot: drop the 20-80 unit bound from an
                    # already-configured market's WHERE clause (verified separately:
                    # property-type-only is 1,633 records, fits one page, no
                    # pagination needed) and backfill year_built if it predates that
                    # field being added to the mapping. Only touches the mapping if
                    # it still matches what THIS code originally set — never
                    # clobbers a manually-edited "Configure feeds" config.
                    try:
                        existing_mapping = _json.loads(sacramento.assessor_field_mapping)
                    except (ValueError, TypeError):
                        existing_mapping = {}
                    old_where = "Property_Type='Multiple Family Residence' AND Units>=20 AND Units<=80"
                    changed = False
                    if existing_mapping.get('_where') == old_where:
                        existing_mapping['_where'] = "Property_Type='Multiple Family Residence'"
                        changed = True
                    if 'year_built' not in existing_mapping:
                        existing_mapping['year_built'] = 'EFFECTIVE_YEAR_BUILT'
                        changed = True
                    if changed:
                        sacramento.assessor_field_mapping = _json.dumps(existing_mapping)
                        logger.info("Updated Sacramento assessor feed config: dropped unit bound, added year_built")
                db.session.commit()

            columbus = SignalMarketModel.query.filter_by(city='Columbus', state='GA').first()
            if columbus and not columbus.tax_delinquent_feed_url:
                columbus.tax_delinquent_feed_url = 'https://services2.arcgis.com/hKwZvjnqryeqGRIt/arcgis/rest/services/Muscogee_County_Prop/FeatureServer/0'
                columbus.tax_delinquent_feed_type = 'arcgis'
                columbus.tax_delinquent_field_mapping = _json.dumps({
                    'address': 'USER_Address', 'owner_name': 'USER_Owner',
                })
                db.session.commit()
                logger.info("Applied known-good tax_delinquent feed config to Columbus")
    except Exception as e:
        logger.warning(f"Known-good feed config patch note: {e}")

    # Enable CORS for frontend communication (only in development)
    # In production (Docker), CORS not needed as same-origin
    if not in_docker:
        CORS(app, resources={
            r"/api/*": {
                "origins": app.config.get('FRONTEND_URL', 'http://localhost:5173')
            }
        })

    # ── Password protection ──────────────────────────────────────────────────
    APP_PASSWORD = os.environ.get('APP_PASSWORD', '')

    LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aequitas — Sign In</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e2e8f0;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 2.5rem;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.4);
    }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    p  { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1.75rem; }
    label { display: block; font-size: 0.8rem; font-weight: 600;
            letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 0.4rem; }
    input[type=password] {
      width: 100%; padding: 0.65rem 0.85rem;
      background: #0f172a; border: 1px solid #334155;
      border-radius: 8px; color: #e2e8f0; font-size: 1rem;
      outline: none; margin-bottom: 1.25rem;
      transition: border-color 0.15s;
    }
    input[type=password]:focus { border-color: #6366f1; }
    button {
      width: 100%; padding: 0.7rem;
      background: #6366f1; border: none; border-radius: 8px;
      color: #fff; font-size: 1rem; font-weight: 600;
      cursor: pointer; transition: background 0.15s;
    }
    button:hover { background: #4f46e5; }
    .error {
      background: #450a0a; border: 1px solid #7f1d1d;
      color: #fca5a5; border-radius: 8px;
      padding: 0.65rem 0.85rem; font-size: 0.875rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Aequitas</h1>
    <p>Enter your password to continue</p>
    {error}
    <form method="POST" action="/__auth__/login">
      <input type="hidden" name="next" value="{next}">
      <label for="pw">Password</label>
      <input type="password" id="pw" name="password" autofocus autocomplete="current-password">
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>"""

    @app.route('/__auth__/login', methods=['GET', 'POST'])
    def _auth_login():
        next_url = request.args.get('next') or request.form.get('next') or '/'
        if request.method == 'POST':
            if request.form.get('password') == APP_PASSWORD:
                session['authenticated'] = True
                return redirect(next_url)
            html = LOGIN_HTML.replace('{error}', '<div class="error">Incorrect password — try again.</div>')
            html = html.replace('{next}', next_url)
            return make_response(html, 401)
        html = LOGIN_HTML.replace('{error}', '')
        html = html.replace('{next}', next_url)
        return html

    @app.route('/__auth__/logout')
    def _auth_logout():
        session.pop('authenticated', None)
        return redirect('/')

    @app.before_request
    def _require_auth():
        # Skip auth check for the login/logout routes themselves
        if request.path.startswith('/__auth__/'):
            return
        # If no password is set, allow everything through
        if not APP_PASSWORD:
            return
        if not session.get('authenticated'):
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            return redirect(f'/__auth__/login?next={request.path}')
    # ─────────────────────────────────────────────────────────────────────────

    # Simple route
    from .routes import main_bp
    app.register_blueprint(main_bp)

    # API blueprints (register BEFORE catch-all)
    from .api.v1.routes import api_v1
    app.register_blueprint(api_v1, url_prefix='/api/v1')

    # Deal management API
    from .api.v1.deal_routes import deals_bp
    app.register_blueprint(deals_bp, url_prefix='/api/v1')

    # Fund management API
    from .api.v1.fund_routes import fund_routes
    app.register_blueprint(fund_routes, url_prefix='/api/v1')

    # GP management API
    from .api.v1.gp_routes import gp_routes
    app.register_blueprint(gp_routes, url_prefix='/api/v1')

    # Risk assessment API
    from .api.v1.risk_assessment_routes import risk_assessment_bp
    app.register_blueprint(risk_assessment_bp, url_prefix='/api/v1')

    # Property scraping API
    from .api.v1.scraping_routes import scraping_bp
    app.register_blueprint(scraping_bp, url_prefix='/api/v1')

    # Regulations API
    from .api.v1.regulations_routes import regulations_bp
    app.register_blueprint(regulations_bp, url_prefix='/api/v1')

    # Investment Memo generation API
    from .api.v1.memo_routes import memo_bp
    app.register_blueprint(memo_bp, url_prefix='/api/v1')

    # Sourcing import API (deal-pipeline CRM, now surfaced at /pipeline)
    from .api.v1.sourcing_routes import sourcing_bp
    app.register_blueprint(sourcing_bp, url_prefix='/api/v1')

    # Sourcing signals engine (public-records + HUD lead-sourcing, surfaced at /sourcing)
    from .api.v1.signals_routes import signals_bp
    app.register_blueprint(signals_bp, url_prefix='/api/v1')

    # Generic app-data key-value store (sourcing, fund settings, op performance)
    from .api.v1.app_data_routes import app_data_bp
    app.register_blueprint(app_data_bp, url_prefix='/api/v1')

    # Document upload / retrieval (Google Drive backed)
    from .api.v1.document_routes import documents_bp
    app.register_blueprint(documents_bp, url_prefix='/api/v1')

    # Asset Management (quarterly actuals vs underwriting)
    from .api.v1.asset_management import asset_mgmt_bp
    app.register_blueprint(asset_mgmt_bp, url_prefix='/api')

    # ClimateCheck PDF upload + extraction
    from .api.v1.climate_check_routes import climate_check_bp
    app.register_blueprint(climate_check_bp, url_prefix='/api/v1')

    # Due Diligence checklist, issues, Q&A, budget, contacts
    from .api.v1.dd_routes import dd_bp
    app.register_blueprint(dd_bp, url_prefix='/api/v1')

    # Underwriting v2 (accurate v14 Excel export + improved extractions)
    from .api.v2.underwriting_routes import underwriting_v2_bp
    app.register_blueprint(underwriting_v2_bp, url_prefix='/api/v2/underwriting')

    # Inline migration: create asset_reports table columns if the table already
    # exists but is missing newer columns (safe no-op on fresh installs because
    # db.create_all() above will have already built the full schema).
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'asset_reports' in inspector.get_table_names():
                existing_cols = {c['name'] for c in inspector.get_columns('asset_reports')}
                new_cols = {
                    'pdf_drive_url': 'VARCHAR(1000)',
                    'updated_at': 'TIMESTAMP',
                }
                with db.engine.connect() as conn:
                    for col, col_type in new_cols.items():
                        if col not in existing_cols:
                            conn.execute(text(f"ALTER TABLE asset_reports ADD COLUMN {col} {col_type}"))
                            conn.commit()
                            logger.info("Added '%s' column to asset_reports", col)
    except Exception as e:
        logger.warning(f"asset_reports migration note: {e}")

    # Inline migration: add ClimateCheck columns to deals table if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'deals' in inspector.get_table_names():
                existing_cols = {c['name'] for c in inspector.get_columns('deals')}
                climate_cols = {
                    'climate_overall_score':    'NUMERIC',
                    'climate_wildfire_score':   'NUMERIC',
                    'climate_flood_score':      'NUMERIC',
                    'climate_overall_label':    'VARCHAR(50)',
                    'climate_wildfire_label':   'VARCHAR(50)',
                    'climate_flood_label':      'VARCHAR(50)',
                    'climate_key_risks':        'TEXT',
                    'climate_property_address': 'VARCHAR(500)',
                    'climate_pdf_filename':     'VARCHAR(500)',
                    'climate_pdf_drive_url':    'VARCHAR(1000)',
                    'climate_raw_extracted':    'TEXT',
                    'climate_confirmed':        'INTEGER DEFAULT 0',
                }
                with db.engine.connect() as conn:
                    for col, col_type in climate_cols.items():
                        if col not in existing_cols:
                            conn.execute(text(f"ALTER TABLE deals ADD COLUMN {col} {col_type}"))
                            conn.commit()
                            logger.info("Added '%s' column to deals", col)
    except Exception as e:
        logger.warning(f"ClimateCheck column migration note: {e}")

    # Inline migration: add memo_drive_url to deals table if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'deals' in inspector.get_table_names():
                existing_cols = {c['name'] for c in inspector.get_columns('deals')}
                if 'memo_drive_url' not in existing_cols:
                    with db.engine.connect() as conn:
                        conn.execute(text("ALTER TABLE deals ADD COLUMN memo_drive_url VARCHAR(1000)"))
                        conn.commit()
                    logger.info("Added 'memo_drive_url' column to deals")
    except Exception as e:
        logger.warning(f"memo_drive_url migration note: {e}")

    # Inline migration: add insurance growth rate / abatement schedule columns to deals table.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'deals' in inspector.get_table_names():
                existing_cols = {c['name'] for c in inspector.get_columns('deals')}
                abatement_cols = {
                    'insurance_growth_rate':             'NUMERIC',
                    'abatement_pct_schedule':             'TEXT',
                    'opex_insurance_per_unit_confirmed':  'INTEGER',
                }
                with db.engine.connect() as conn:
                    for col, col_type in abatement_cols.items():
                        if col not in existing_cols:
                            conn.execute(text(f"ALTER TABLE deals ADD COLUMN {col} {col_type}"))
                            conn.commit()
                            logger.info("Added '%s' column to deals", col)
    except Exception as e:
        logger.warning(f"insurance growth/abatement column migration note: {e}")

    # Inline migration: add Drive attachment columns to dd_items if not present.
    try:
        with app.app_context():
            from sqlalchemy import text, inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            if 'dd_items' in inspector.get_table_names():
                existing_cols = {c['name'] for c in inspector.get_columns('dd_items')}
                dd_new_cols = {
                    'drive_url':     'VARCHAR(1000)',
                    'drive_file_id': 'VARCHAR(255)',
                    'document_id':   'VARCHAR(64)',
                }
                with db.engine.connect() as conn:
                    for col, col_type in dd_new_cols.items():
                        if col not in existing_cols:
                            conn.execute(text(f"ALTER TABLE dd_items ADD COLUMN {col} {col_type}"))
                            conn.commit()
                            logger.info("Added '%s' column to dd_items", col)
    except Exception as e:
        logger.warning(f"dd_items migration note: {e}")

    # Serve frontend (production/Docker, or any env where the dist was built)
    if serve_spa:
        @app.route('/', defaults={'path': ''})
        @app.route('/<path:path>')
        def serve_frontend(path):
            """Serve React frontend; fall back to index.html for all SPA routes."""
            if path and os.path.exists(os.path.join(_candidate_dist, path)):
                return send_from_directory(_candidate_dist, path)
            return send_from_directory(_candidate_dist, 'index.html')

    # JSON error handlers for API routes — prevents Flask from ever returning HTML
    # for 404/405 when a client hits /api/* with the wrong URL or method.
    from flask import jsonify as _jsonify

    @app.errorhandler(404)
    def _api_not_found(e):
        if request.path.startswith('/api/'):
            return _jsonify({'success': False, 'error': 'Not found', 'path': request.path}), 404
        # Non-API 404: fall through to SPA or default Flask handler
        if serve_spa:
            return send_from_directory(_candidate_dist, 'index.html')
        return e

    @app.errorhandler(405)
    def _api_method_not_allowed(e):
        if request.path.startswith('/api/'):
            return _jsonify({'success': False, 'error': 'Method not allowed', 'method': request.method, 'path': request.path}), 405
        return e

    @app.errorhandler(500)
    def _api_internal_error(e):
        if request.path.startswith('/api/'):
            logger.error("Internal server error on %s: %s", request.path, e)
            return _jsonify({'success': False, 'error': 'Internal server error', 'detail': str(e)}), 500
        return e

    @app.errorhandler(Exception)
    def _api_unhandled_exception(e):
        if request.path.startswith('/api/'):
            logger.exception("Unhandled exception on %s", request.path)
            return _jsonify({'success': False, 'error': str(e)}), 500
        raise e

    logger.info("CREATE_APP COMPLETED SUCCESSFULLY")
    return app
