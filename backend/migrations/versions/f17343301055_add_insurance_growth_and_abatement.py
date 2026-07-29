"""add insurance growth rate and property tax abatement columns to deals

Adds insurance_growth_rate (Float), abatement_pct_schedule (Text, JSON-encoded
5-year array), and opex_insurance_per_unit_confirmed (Integer flag) to the
deals table. These mirror the fields already round-tripped through the
underwriting_json blob for this deal page (see backend/app/api/v2/underwriting_routes.py) —
the columns here exist for schema consistency with prior similar migrations,
not because anything currently reads/writes them directly.

Checks column existence first, same idempotency guard used in
21f21cec5e29/c6778a62cf8c, since create_app()'s own inline safety net
may run before or after this migration depending on how
`flask db upgrade` loads the app.

Revision ID: f17343301055
Revises: 21f21cec5e29
Create Date: 2026-07-28 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f17343301055'
down_revision = '21f21cec5e29'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = [c['name'] for c in inspector.get_columns('deals')]
    with op.batch_alter_table('deals', schema=None) as batch_op:
        if 'insurance_growth_rate' not in cols:
            batch_op.add_column(sa.Column('insurance_growth_rate', sa.Float(), nullable=True))
        if 'abatement_pct_schedule' not in cols:
            batch_op.add_column(sa.Column('abatement_pct_schedule', sa.Text(), nullable=True))
        if 'opex_insurance_per_unit_confirmed' not in cols:
            batch_op.add_column(sa.Column('opex_insurance_per_unit_confirmed', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.drop_column('opex_insurance_per_unit_confirmed')
        batch_op.drop_column('abatement_pct_schedule')
        batch_op.drop_column('insurance_growth_rate')
