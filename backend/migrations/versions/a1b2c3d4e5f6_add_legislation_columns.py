"""add legislation columns to deals and sourcing_properties

Revision ID: a1b2c3d4e5f6
Revises: d8d48ec2e8fc
Create Date: 2026-03-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'd8d48ec2e8fc'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deal_legislation', sa.Text(), nullable=True))

    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.add_column(sa.Column('property_legislation', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.drop_column('property_legislation')

    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.drop_column('deal_legislation')
