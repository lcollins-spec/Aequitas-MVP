"""add gp_id FK column to sourcing_properties and deals

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2a3b4c5d6e7'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.add_column(sa.Column('gp_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_sourcing_properties_gp_id', 'gps', ['gp_id'], ['id'])
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('gp_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_deals_gp_id', 'gps', ['gp_id'], ['id'])


def downgrade():
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.drop_constraint('fk_deals_gp_id', type_='foreignkey')
        batch_op.drop_column('gp_id')
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.drop_constraint('fk_sourcing_properties_gp_id', type_='foreignkey')
        batch_op.drop_column('gp_id')
