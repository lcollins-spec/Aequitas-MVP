"""initial schema

Revision ID: 7d2b3da5de12
Revises:
Create Date: 2026-03-15 01:02:30.443278

Baseline migration. All tables were created via db.create_all() before
Flask-Migrate was introduced. This revision records the existing schema
as the starting point; no DDL is executed. Future migrations will be
additive from this point.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '7d2b3da5de12'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
