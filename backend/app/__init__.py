import os
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
from app.database import db

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', '.env'))


def create_app(test_config=None):
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

    # Create tables if they don't exist
    with app.app_context():
        db.create_all()

    # Enable CORS for frontend communication
    CORS(app, resources={
        r"/api/*": {
            "origins": app.config.get('FRONTEND_URL', 'http://localhost:5173')
        }
    })

    # Simple route
    from .routes import main_bp
    app.register_blueprint(main_bp)

    # API blueprints
    from .api.v1.routes import api_v1
    app.register_blueprint(api_v1, url_prefix='/api/v1')

    # Deal management API
    from .api.v1.deal_routes import deals_bp
    app.register_blueprint(deals_bp, url_prefix='/api/v1')

    # Fund management API
    from .api.v1.fund_routes import fund_routes
    app.register_blueprint(fund_routes, url_prefix='/api/v1')

    # Excel export API
    from .api.v1.excel_export_routes import excel_export_bp
    app.register_blueprint(excel_export_bp, url_prefix='/api/v1')

    return app
