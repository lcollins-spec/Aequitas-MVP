"""add template underwriting input columns to deals

Revision ID: e1f2a3b4c5d6
Revises: c3d4e5f6a7b8
Create Date: 2026-03-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e1f2a3b4c5d6'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('acquisition_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('loss_to_lease_rate', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('concessions_rate', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_payroll_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_admin_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_marketing_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_rm_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_contract_service_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_turnover_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_insurance_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_utilities_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_property_tax_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('capex_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('parking_income_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('rubs_pct', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('other_income_per_unit', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('refi_ltv', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('refi_interest_rate', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('refi_financing_costs_pct', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('refi_io_periods', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('refi_term_months', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('senior_io_periods', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('senior_financing_costs_pct', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('opex_growth_rate', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('property_tax_growth_rate', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('gp_equity_split_pct', sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.drop_column('gp_equity_split_pct')
        batch_op.drop_column('property_tax_growth_rate')
        batch_op.drop_column('opex_growth_rate')
        batch_op.drop_column('senior_financing_costs_pct')
        batch_op.drop_column('senior_io_periods')
        batch_op.drop_column('refi_term_months')
        batch_op.drop_column('refi_io_periods')
        batch_op.drop_column('refi_financing_costs_pct')
        batch_op.drop_column('refi_interest_rate')
        batch_op.drop_column('refi_ltv')
        batch_op.drop_column('other_income_per_unit')
        batch_op.drop_column('rubs_pct')
        batch_op.drop_column('parking_income_per_unit')
        batch_op.drop_column('capex_per_unit')
        batch_op.drop_column('opex_property_tax_per_unit')
        batch_op.drop_column('opex_utilities_per_unit')
        batch_op.drop_column('opex_insurance_per_unit')
        batch_op.drop_column('opex_turnover_per_unit')
        batch_op.drop_column('opex_contract_service_per_unit')
        batch_op.drop_column('opex_rm_per_unit')
        batch_op.drop_column('opex_marketing_per_unit')
        batch_op.drop_column('opex_admin_per_unit')
        batch_op.drop_column('opex_payroll_per_unit')
        batch_op.drop_column('concessions_rate')
        batch_op.drop_column('loss_to_lease_rate')
        batch_op.drop_column('acquisition_date')
