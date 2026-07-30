"""add tax_delinquent_feed_url/type/mapping columns to signal_markets

Some counties (e.g. Muscogee County, GA) publish a real live tax-delinquency
ArcGIS/Socrata feed rather than only a purchasable/downloadable list — this
gives that case a live-feed alternative to the CSV-upload path, mirroring
the existing assessor_feed_*/code_violations_feed_* columns.

Revision ID: c9d2e4f6a8b1
Revises: b7c4d9e2f1a3
Create Date: 2026-07-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c9d2e4f6a8b1'
down_revision = 'b7c4d9e2f1a3'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'signal_markets' not in inspector.get_table_names():
        return
    cols = {c['name'] for c in inspector.get_columns('signal_markets')}
    with op.batch_alter_table('signal_markets', schema=None) as batch_op:
        if 'tax_delinquent_feed_url' not in cols:
            batch_op.add_column(sa.Column('tax_delinquent_feed_url', sa.String(1000), nullable=True))
        if 'tax_delinquent_feed_type' not in cols:
            batch_op.add_column(sa.Column('tax_delinquent_feed_type', sa.String(20), nullable=True))
        if 'tax_delinquent_field_mapping' not in cols:
            batch_op.add_column(sa.Column('tax_delinquent_field_mapping', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('signal_markets', schema=None) as batch_op:
        batch_op.drop_column('tax_delinquent_field_mapping')
        batch_op.drop_column('tax_delinquent_feed_type')
        batch_op.drop_column('tax_delinquent_feed_url')
