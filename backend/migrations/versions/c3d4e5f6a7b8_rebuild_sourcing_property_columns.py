"""rebuild sourcing property columns

Adds transaction_type, operator_name, contact_name, contact_phone, contact_email.
Drops last_contact_date.
Backfills existing rows: transaction_type = 'Acquisition', all new string fields = '',
and resets all status values to 'Identified'.

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-03-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.add_column(sa.Column('transaction_type', sa.String(50),  nullable=True, server_default='Acquisition'))
        batch_op.add_column(sa.Column('operator_name',   sa.String(255), nullable=True, server_default=''))
        batch_op.add_column(sa.Column('contact_name',    sa.String(255), nullable=True, server_default=''))
        batch_op.add_column(sa.Column('contact_phone',   sa.String(50),  nullable=True, server_default=''))
        batch_op.add_column(sa.Column('contact_email',   sa.String(255), nullable=True, server_default=''))
        batch_op.drop_column('last_contact_date')

    # Backfill existing rows
    op.execute("UPDATE sourcing_properties SET transaction_type = 'Acquisition' WHERE transaction_type IS NULL OR transaction_type = ''")
    op.execute("UPDATE sourcing_properties SET operator_name = '' WHERE operator_name IS NULL")
    op.execute("UPDATE sourcing_properties SET contact_name  = '' WHERE contact_name  IS NULL")
    op.execute("UPDATE sourcing_properties SET contact_phone = '' WHERE contact_phone IS NULL")
    op.execute("UPDATE sourcing_properties SET contact_email = '' WHERE contact_email IS NULL")
    # Reset all status values to the new enum
    op.execute("UPDATE sourcing_properties SET status = 'Identified'")


def downgrade():
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.drop_column('contact_email')
        batch_op.drop_column('contact_phone')
        batch_op.drop_column('contact_name')
        batch_op.drop_column('operator_name')
        batch_op.drop_column('transaction_type')
        batch_op.add_column(sa.Column('last_contact_date', sa.String(20), nullable=False, server_default=''))
