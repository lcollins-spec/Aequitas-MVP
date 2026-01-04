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
    # Use persistent volume in production, local file in development
    in_docker = os.path.exists('/.dockerenv')
    if in_docker:
        # Production: Use persistent volume mounted at /app/data
        db_path = '/app/data/aequitas.db'
    else:
        # Development: Use local file
        db_path = os.path.join(base_dir, 'aequitas.db')

    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', f'sqlite:///{db_path}')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = DEBUG

    # SQLite-specific connection arguments
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {
            'check_same_thread': False,
            'timeout': 30
        },
        'pool_pre_ping': True,
        'pool_recycle': 3600
    }
