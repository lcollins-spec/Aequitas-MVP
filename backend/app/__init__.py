import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from app.database import db

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', '.env'))


def create_app(test_config=None):
    # Detect if running in Docker (production)
    in_docker = os.path.exists('/.dockerenv')

    # Set static folder to frontend dist if in production
    if in_docker:
        static_folder = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'dist'))
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

    # Create tables if they don't exist
    with app.app_context():
        db.create_all()

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

    # Serve frontend (only in production/Docker)
    if in_docker:
        @app.route('/', defaults={'path': ''})
        @app.route('/<path:path>')
        def serve_frontend(path):
            """Serve React frontend, fallback to index.html for client-side routing"""
            if path and os.path.exists(os.path.join(app.static_folder, path)):
                return send_from_directory(app.static_folder, path)
            else:
                return send_from_directory(app.static_folder, 'index.html')

    return app
