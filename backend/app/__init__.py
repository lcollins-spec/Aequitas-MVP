import os
import sys
import logging
from flask import Flask, send_from_directory, session, request, redirect, url_for, make_response
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

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', '.env'))


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

    # Set static folder to frontend dist if in production
    if in_docker:
        static_folder = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'dist'))
        logger.info(f"Static folder set to: {static_folder}")
        logger.info(f"Static folder exists: {os.path.exists(static_folder)}")
        if os.path.exists(static_folder):
            files = os.listdir(static_folder)
            logger.info(f"Files in static folder: {files}")
            logger.info(f"index.html in static folder: {'index.html' in files}")
        app = Flask(__name__,
                    instance_relative_config=True,
                    static_folder=static_folder,
                    static_url_path='')
    else:
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

    # Serve frontend (only in production/Docker)
    if in_docker:
        logger.info("=" * 60)
        logger.info(f"Registering frontend catch-all route")
        logger.info(f"app.static_folder = {app.static_folder}")
        logger.info("=" * 60)
        
        @app.route('/', defaults={'path': ''})
        @app.route('/<path:path>')
        def serve_frontend(path):
            """Serve React frontend, fallback to index.html for client-side routing"""
            logger.info(f"Frontend route called with path: '{path}'")
            if path and os.path.exists(os.path.join(app.static_folder, path)):
                logger.info(f"Serving file: {path}")
                return send_from_directory(app.static_folder, path)
            else:
                logger.info(f"Serving index.html for path: '{path}'")
                index_path = os.path.join(app.static_folder, 'index.html')
                logger.info(f"Index.html path: {index_path}, exists: {os.path.exists(index_path)}")
                return send_from_directory(app.static_folder, 'index.html')

    logger.info("CREATE_APP COMPLETED SUCCESSFULLY")
    return app
