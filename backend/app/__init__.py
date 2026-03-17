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

    # Excel export API
    from .api.v1.excel_export_routes import excel_export_bp
    app.register_blueprint(excel_export_bp, url_prefix='/api/v1')

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

    # Sourcing import API
    from .api.v1.sourcing_routes import sourcing_bp
    app.register_blueprint(sourcing_bp, url_prefix='/api/v1')

    # Generic app-data key-value store (sourcing, fund settings, op performance)
    from .api.v1.app_data_routes import app_data_bp
    app.register_blueprint(app_data_bp, url_prefix='/api/v1')

    # Document upload / retrieval (Google Drive backed)
    from .api.v1.document_routes import documents_bp
    app.register_blueprint(documents_bp, url_prefix='/api/v1')

    # Asset Management (quarterly actuals vs underwriting)
    from .api.v1.asset_management import asset_mgmt_bp
    app.register_blueprint(asset_mgmt_bp, url_prefix='/api')

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
