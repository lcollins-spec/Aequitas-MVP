"""add signal engine tables (signal_markets, signal_definitions, signal_hits)

New tables only for the sourcing signals engine (public-records + HUD lead
sourcing). Guarded with an existence check since db.create_all() in
create_app() may have already created these on a fresh install/boot before
`flask db upgrade` runs.

Revision ID: b7c4d9e2f1a3
Revises: f17343301055
Create Date: 2026-07-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b7c4d9e2f1a3'
down_revision = 'f17343301055'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if 'signal_markets' not in existing:
        op.create_table(
            'signal_markets',
            sa.Column('id', sa.String(64), primary_key=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('city', sa.String(255), nullable=False, server_default=''),
            sa.Column('state', sa.String(50), nullable=False, server_default=''),
            sa.Column('assessor_feed_url', sa.String(1000), nullable=True),
            sa.Column('assessor_feed_type', sa.String(20), nullable=True),
            sa.Column('assessor_field_mapping', sa.Text(), nullable=True),
            sa.Column('code_violations_feed_url', sa.String(1000), nullable=True),
            sa.Column('code_violations_feed_type', sa.String(20), nullable=True),
            sa.Column('code_violations_field_mapping', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    if 'signal_definitions' not in existing:
        op.create_table(
            'signal_definitions',
            sa.Column('id', sa.String(64), primary_key=True),
            sa.Column('key', sa.String(100), nullable=False, unique=True),
            sa.Column('label', sa.String(255), nullable=False),
            sa.Column('category', sa.String(20), nullable=False, server_default='public_records'),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('stubbed', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('disabled_reason', sa.Text(), nullable=True),
        )

    if 'signal_hits' not in existing:
        op.create_table(
            'signal_hits',
            sa.Column('id', sa.String(64), primary_key=True),
            sa.Column('market_id', sa.String(64), sa.ForeignKey('signal_markets.id'), nullable=False),
            sa.Column('source', sa.String(50), nullable=False),
            sa.Column('address', sa.String(500), nullable=False, server_default=''),
            sa.Column('owner_name', sa.String(255), nullable=True),
            sa.Column('owner_mailing_address', sa.String(500), nullable=True),
            sa.Column('unit_count', sa.Integer(), nullable=True),
            sa.Column('assessed_value', sa.Float(), nullable=True),
            sa.Column('listing_price', sa.Float(), nullable=True),
            sa.Column('listing_broker', sa.String(255), nullable=True),
            sa.Column('listing_url', sa.String(1000), nullable=True),
            sa.Column('raw_data', sa.Text(), nullable=True),
            sa.Column('dedup_key', sa.String(600), nullable=False),
            sa.Column('first_seen_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('last_seen_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('pinned', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('note', sa.Text(), nullable=False, server_default=''),
        )
        op.create_index('ix_signal_hits_market_id', 'signal_hits', ['market_id'])
        op.create_index('ix_signal_hits_source', 'signal_hits', ['source'])
        op.create_index('ix_signal_hits_dedup', 'signal_hits', ['dedup_key'], unique=True)


def downgrade():
    op.drop_table('signal_hits')
    op.drop_table('signal_definitions')
    op.drop_table('signal_markets')
