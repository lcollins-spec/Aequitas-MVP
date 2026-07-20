"""drop stale next_followup_date column from sourcing_properties

next_followup_date was removed from SourcingPropertyModel (and every
route/service/UI reference) when the Priority field replaced it, but no
migration ever dropped the physical column. db.create_all() only adds
missing tables, never alters existing ones, so any database whose
sourcing_properties table predates that removal is stuck with a NOT
NULL, no-default column the ORM never populates -- every INSERT fails.

Checks column existence first, same idempotency guard used in
f2a3b4c5d6e7, since create_app()'s own inline safety net may run before
or after this migration depending on how `flask db upgrade` loads the
app.

Revision ID: c6778a62cf8c
Revises: f2a3b4c5d6e7
Create Date: 2026-07-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c6778a62cf8c'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = [c['name'] for c in inspector.get_columns('sourcing_properties')]
    if 'next_followup_date' in cols:
        with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
            batch_op.drop_column('next_followup_date')


def downgrade():
    with op.batch_alter_table('sourcing_properties', schema=None) as batch_op:
        batch_op.add_column(sa.Column('next_followup_date', sa.String(20), nullable=False, server_default=''))
