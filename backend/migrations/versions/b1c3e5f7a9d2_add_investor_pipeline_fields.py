"""add investor pipeline view fields to sourcing_properties

Adds business_plan, target_return, and neighborhood free-text fields plus
an unenforced operator_id soft link (matches the existing deal_id
convention on this table, no DB-level FK) — used by the investor-facing
pipeline snapshot view.

Revision ID: b1c3e5f7a9d2
Revises: f4a2b8c6d1e9
Create Date: 2026-09-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b1c3e5f7a9d2'
down_revision = 'f4a2b8c6d1e9'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'sourcing_properties' not in inspector.get_table_names():
        return
    cols = {c['name'] for c in inspector.get_columns('sourcing_properties')}
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        if 'business_plan' not in cols:
            batch_op.add_column(sa.Column('business_plan', sa.Text(), nullable=True))
        if 'target_return' not in cols:
            batch_op.add_column(sa.Column('target_return', sa.String(255), nullable=True))
        if 'neighborhood' not in cols:
            batch_op.add_column(sa.Column('neighborhood', sa.Text(), nullable=True))
        if 'operator_id' not in cols:
            batch_op.add_column(sa.Column('operator_id', sa.String(64), nullable=True))


def downgrade():
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.drop_column('operator_id')
        batch_op.drop_column('neighborhood')
        batch_op.drop_column('target_return')
        batch_op.drop_column('business_plan')
