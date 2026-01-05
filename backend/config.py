import os
from dotenv import load_dotenv

base_dir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(base_dir, '.env'))

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'you-will-never-guess')
    DEBUG = os.getenv('FLASK_DEBUG', '0') == '1'  # Default to False in production
    ENV = os.getenv('FLASK_ENV', 'production')

    # Census API Configuration
    CENSUS_API_KEY = os.getenv('CENSUS_API_KEY', '')
    CENSUS_API_BASE_URL = os.getenv('CENSUS_API_BASE_URL', 'https://api.census.gov/data')
    CENSUS_API_YEAR = os.getenv('CENSUS_API_YEAR', '2022')
    CENSUS_CACHE_TTL = int(os.getenv('CENSUS_CACHE_TTL', '86400'))

    # Federal Reserve Economic Data (FRED) API Configuration
    FRED_API_KEY = os.getenv('FRED_API_KEY', '')
    FRED_API_BASE_URL = os.getenv('FRED_API_BASE_URL', 'https://api.stlouisfed.org/fred')
    FRED_CACHE_TTL = int(os.getenv('FRED_CACHE_TTL', '3600'))

    # RentCast Property Data API Configuration
    RENTCAST_API_KEY = os.getenv('RENTCAST_API_KEY', '')
    RENTCAST_CACHE_TTL = int(os.getenv('RENTCAST_CACHE_TTL', '604800'))

    # Frontend URL for CORS (only used in development)
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

    # Database Configuration
    # Supports both PostgreSQL (production) and SQLite (local development)
    in_docker = os.path.exists('/.dockerenv')
    if in_docker:
        # Production: Use Render's DATABASE_URL (PostgreSQL)
        # Render auto-generates this environment variable
        db_url = os.getenv('DATABASE_URL', '')

        # Handle postgres:// vs postgresql:// prefix
        # Render uses postgres://, SQLAlchemy requires postgresql://
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)

        SQLALCHEMY_DATABASE_URI = db_url
    else:
        # Development: Use local SQLite
        db_path = os.path.join(base_dir, 'aequitas.db')
        SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', f'sqlite:///{db_path}')

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = DEBUG

    # Database-agnostic engine options
    # Configure based on database type
    db_uri = SQLALCHEMY_DATABASE_URI
    if db_uri.startswith('postgresql://'):
        # PostgreSQL-specific configuration
        SQLALCHEMY_ENGINE_OPTIONS = {
            'pool_pre_ping': True,  # Verify connections before using
            'pool_recycle': 3600,   # Recycle connections after 1 hour
            'pool_size': 5,         # Connection pool size (free tier limit)
            'max_overflow': 0,      # No overflow connections on free tier
            'connect_args': {
                'connect_timeout': 10,
                'options': '-c timezone=utc'  # Force UTC timezone
            }
        }
    else:
        # SQLite-specific configuration
        SQLALCHEMY_ENGINE_OPTIONS = {
            'connect_args': {
                'check_same_thread': False,
                'timeout': 30
            },
            'pool_pre_ping': True,
            'pool_recycle': 3600
        }
