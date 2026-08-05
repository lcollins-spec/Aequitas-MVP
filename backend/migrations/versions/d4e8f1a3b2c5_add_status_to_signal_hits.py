"""add status column to signal_hits

Manual pipeline-conversion tracking on hit cards — fixed set of values
(New, Enriched, Contacted, Responding, Dead, Under LOI), no automation,
purely user-selected via a dropdown on the card.

Revision ID: d4e8f1a3b2c5
Revises: c9d2e4f6a8b1
Create Date: 2026-07-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd4e8f1a3b2c5'
down_revision = 'c9d2e4f6a8b1'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'signal_hits' not in inspector.get_table_names():
        return
    cols = {c['name'] for c in inspector.get_columns('signal_hits')}
    if 'status' not in cols:
        with op.batch_alter_table('signal_hits', schema=None) as batch_op:
            batch_op.add_column(sa.Column('status', sa.String(20), nullable=False, server_default='New'))


def downgrade():
    with op.batch_alter_table('signal_hits', schema=None) as batch_op:
        batch_op.drop_column('status')
