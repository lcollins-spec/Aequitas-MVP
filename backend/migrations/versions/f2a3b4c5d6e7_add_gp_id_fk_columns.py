"""add gp_id FK column to sourcing_properties and deals

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2a3b4c5d6e7'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def _add_gp_id(table_name, fk_name):
    """Add gp_id + its FK to `table_name`, but only whatever piece is
    actually missing. `flask db upgrade` loads the app via the Flask CLI,
    which runs create_app()'s own inline "add gp_id if missing" safety net
    (needed for local SQLite dev, which never runs Alembic) as a side effect
    *before* this migration executes — so the column may already exist by
    the time we get here. Checking first keeps this migration idempotent
    regardless of which mechanism wins the race.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    cols = [c['name'] for c in inspector.get_columns(table_name)]
    if 'gp_id' not in cols:
        with op.batch_alter_table(table_name, schema=None) as batch_op:
            batch_op.add_column(sa.Column('gp_id', sa.Integer(), nullable=True))

    fk_names = [fk['name'] for fk in inspector.get_foreign_keys(table_name)]
    if fk_name not in fk_names:
        with op.batch_alter_table(table_name, schema=None) as batch_op:
            batch_op.create_foreign_key(fk_name, 'gps', ['gp_id'], ['id'])


def upgrade():
    _add_gp_id('sourcing_properties', 'fk_sourcing_properties_gp_id')
    _add_gp_id('deals', 'fk_deals_gp_id')


def downgrade():
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.drop_constraint('fk_deals_gp_id', type_='foreignkey')
        batch_op.drop_column('gp_id')
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.drop_constraint('fk_sourcing_properties_gp_id', type_='foreignkey')
        batch_op.drop_column('gp_id')
