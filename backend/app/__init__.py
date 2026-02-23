import os
import sys
import logging
from flask import Flask, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from app.database import db

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

    # Initialize database
    db.init_app(app)

    # Configure database session
    @app.teardown_appcontext
    def shutdown_session(exception=None):
        db.session.remove()

    # Create tables if they don't exist, but don't crash if they already exist
    try:
        with app.app_context():
            db.create_all()
            logger.info("Database tables created successfully")
    except Exception as e:
        logger.warning(f"DB create_all error (continuing anyway): {e}")
        # Continue even if table creation fails - tables may already exist

    # Enable CORS for frontend communication (only in development)
    # In production (Docker), CORS not needed as same-origin
    if not in_docker:
        CORS(app, resources={
            r"/api/*": {
                "origins": app.config.get('FRONTEND_URL', 'http://localhost:5173')
            }
        })

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
