"""add signal_scan_runs table

One row per scan run (per-market or all-markets) — powers the insights
"what's new since last refresh" view and the hit-count trend chart,
neither of which was previously persisted (run_market_scan computed a
`created` count but only ever returned it to the immediate caller).

Revision ID: a3b5c7d9e1f4
Revises: e7a1c4d6f9b2
Create Date: 2026-08-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a3b5c7d9e1f4'
down_revision = 'e7a1c4d6f9b2'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'signal_scan_runs' in inspector.get_table_names():
        return
    op.create_table(
        'signal_scan_runs',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('market_id', sa.String(length=64), nullable=True),
        sa.Column('ran_at', sa.DateTime(), nullable=False),
        sa.Column('hits_created', sa.Integer(), nullable=False),
        sa.Column('hits_total_after', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['market_id'], ['signal_markets.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('signal_scan_runs', schema=None) as batch_op:
        batch_op.create_index('ix_signal_scan_runs_market_id', ['market_id'])
        batch_op.create_index('ix_signal_scan_runs_ran_at', ['ran_at'])


def downgrade():
    op.drop_table('signal_scan_runs')
