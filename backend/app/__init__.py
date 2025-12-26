import os
from flask import Flask
from dotenv import load_dotenv

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

    # Simple route
    from .routes import main_bp
    app.register_blueprint(main_bp)

    # API blueprints
    from .api.v1.routes import api_v1
    app.register_blueprint(api_v1, url_prefix='/api/v1')

    return app
