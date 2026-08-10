"""add funder engine tables (funder_definitions, funder_hits)

National capital-source sourcing engine — family offices, banks, and curated
emerging-manager programs. No market table: unlike the property signal engine,
these sources are national with zero per-market config. Guarded with an
existence check since db.create_all() in create_app() may have already
created these on a fresh install/boot before `flask db upgrade` runs.

Revision ID: f4a2b8c6d1e9
Revises: a3b5c7d9e1f4
Create Date: 2026-08-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f4a2b8c6d1e9'
down_revision = 'a3b5c7d9e1f4'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if 'funder_definitions' not in existing:
        op.create_table(
            'funder_definitions',
            sa.Column('id', sa.String(64), primary_key=True),
            sa.Column('key', sa.String(100), nullable=False, unique=True),
            sa.Column('label', sa.String(255), nullable=False),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('stubbed', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('disabled_reason', sa.Text(), nullable=True),
        )

    if 'funder_hits' not in existing:
        op.create_table(
            'funder_hits',
            sa.Column('id', sa.String(64), primary_key=True),
            sa.Column('source', sa.String(50), nullable=False),
            sa.Column('name', sa.String(255), nullable=False, server_default=''),
            sa.Column('entity_type', sa.String(50), nullable=True),
            sa.Column('city', sa.String(255), nullable=True),
            sa.Column('state', sa.String(50), nullable=True),
            sa.Column('aum', sa.Float(), nullable=True),
            sa.Column('cre_loan_total', sa.Float(), nullable=True),
            sa.Column('cre_growth_pct', sa.Float(), nullable=True),
            sa.Column('contact_address', sa.String(500), nullable=True),
            sa.Column('external_id', sa.String(255), nullable=True),
            sa.Column('raw_data', sa.Text(), nullable=True),
            sa.Column('dedup_key', sa.String(300), nullable=False),
            sa.Column('first_seen_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('last_seen_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('pinned', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('note', sa.Text(), nullable=False, server_default=''),
            sa.Column('status', sa.String(30), nullable=False, server_default='New'),
        )
        op.create_index('ix_funder_hits_source', 'funder_hits', ['source'])
        op.create_index('ix_funder_hits_dedup', 'funder_hits', ['dedup_key'], unique=True)


def downgrade():
    op.drop_table('funder_hits')
    op.drop_table('funder_definitions')
