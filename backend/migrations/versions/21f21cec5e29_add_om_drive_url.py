"""add om_drive_url column to sourcing_properties

Stores the Drive URL of the original OM file once it's uploaded there
after a Sourcing deal save (a separate, best-effort step from saving
the deal itself, so this column is populated after the fact and starts
out NULL for every row).

Checks column existence first, same idempotency guard used in
f2a3b4c5d6e7/c6778a62cf8c, since create_app()'s own inline safety net
may run before or after this migration depending on how
`flask db upgrade` loads the app.

Revision ID: 21f21cec5e29
Revises: c6778a62cf8c
Create Date: 2026-07-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '21f21cec5e29'
down_revision = 'c6778a62cf8c'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = [c['name'] for c in inspector.get_columns('sourcing_properties')]
    if 'om_drive_url' not in cols:
        with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
            batch_op.add_column(sa.Column('om_drive_url', sa.String(1000), nullable=True))


def downgrade():
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.drop_column('om_drive_url')
