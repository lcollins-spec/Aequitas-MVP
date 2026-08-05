"""add year_built and is_lihtc columns to signal_hits

Part of the big-bucket ingestion pivot: year_built lets the "built after
1960" criterion be filtered in the UI (only reliably populated by
Sacramento's long-hold signal for now — other sources leave it null).
is_lihtc is a cross-referenced exclusion flag checked against the HUD
LIHTC dataset for every hit regardless of source, not just the disabled
hud_lihtc_year15 signal.

Revision ID: e7a1c4d6f9b2
Revises: d4e8f1a3b2c5
Create Date: 2026-08-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e7a1c4d6f9b2'
down_revision = 'd4e8f1a3b2c5'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'signal_hits' not in inspector.get_table_names():
        return
    cols = {c['name'] for c in inspector.get_columns('signal_hits')}
    with op.batch_alter_table('signal_hits', schema=None) as batch_op:
        if 'year_built' not in cols:
            batch_op.add_column(sa.Column('year_built', sa.Integer(), nullable=True))
        if 'is_lihtc' not in cols:
            batch_op.add_column(sa.Column('is_lihtc', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table('signal_hits', schema=None) as batch_op:
        batch_op.drop_column('is_lihtc')
        batch_op.drop_column('year_built')
