import os
from dotenv import load_dotenv

base_dir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(base_dir, '.env'))

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'you-will-never-guess')
    DEBUG = os.getenv('FLASK_DEBUG', '1') == '1'
    ENV = os.getenv('FLASK_ENV', 'development')

    # Census API Configuration
    CENSUS_API_KEY = os.getenv('CENSUS_API_KEY', '')
    CENSUS_API_BASE_URL = os.getenv('CENSUS_API_BASE_URL', 'https://api.census.gov/data')
    CENSUS_API_YEAR = os.getenv('CENSUS_API_YEAR', '2022')
    CENSUS_CACHE_TTL = int(os.getenv('CENSUS_CACHE_TTL', '86400'))

    # Federal Reserve Economic Data (FRED) API Configuration
    FRED_API_KEY = os.getenv('FRED_API_KEY', '')
    FRED_API_BASE_URL = os.getenv('FRED_API_BASE_URL', 'https://api.stlouisfed.org/fred')
    FRED_CACHE_TTL = int(os.getenv('FRED_CACHE_TTL', '3600'))

    # Frontend URL for CORS
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')
