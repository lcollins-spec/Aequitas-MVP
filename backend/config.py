import os
from dotenv import load_dotenv

base_dir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(base_dir, '.env'))

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'you-will-never-guess')
    DEBUG = os.getenv('FLASK_DEBUG', '1') == '1'
    ENV = os.getenv('FLASK_ENV', 'development')
