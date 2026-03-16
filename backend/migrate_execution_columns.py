"""
Migration: Add Deal Execution columns to the deals table.
Run once: python migrate_execution_columns.py
Safe to re-run — skips columns that already exist.
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), 'aequitas.db')

NEW_COLUMNS = [
    # Section 1 — Deal Overview
    ('execution_transaction_type',           'VARCHAR(50)'),
    ('execution_current_stage',              'VARCHAR(50)'),

    # Section 2 — LOI Terms
    ('loi_offer_price',                      'REAL'),
    ('loi_earnest_money',                    'REAL'),
    ('loi_earnest_money_refundable',         'INTEGER DEFAULT 1'),
    ('loi_dd_period_days',                   'INTEGER'),
    ('loi_financing_contingency',            'INTEGER DEFAULT 1'),
    ('loi_financing_contingency_period_days','INTEGER'),
    ('loi_exclusivity',                      'INTEGER DEFAULT 0'),
    ('loi_target_closing_date',              'TEXT'),
    ('loi_psa_drafted_by',                   'VARCHAR(50)'),
    ('loi_notes',                            'TEXT'),

    # Section 3 — PSA Terms
    ('psa_executed_date',                    'TEXT'),
    ('psa_final_purchase_price',             'REAL'),
    ('psa_earnest_money_hard_date',          'TEXT'),
    ('psa_dd_expiration_date',               'TEXT'),
    ('psa_closing_date',                     'TEXT'),
    ('psa_key_conditions',                   'TEXT'),
    ('psa_notes',                            'TEXT'),

    # Section 4 — JV / Partnership Terms
    ('jv_operator_equity_share',             'REAL'),
    ('jv_preferred_return',                  'REAL'),
    ('jv_promote_structure',                 'TEXT'),
    ('jv_acquisition_fee',                   'REAL'),
    ('jv_asset_management_fee',              'REAL'),
    ('jv_disposition_fee',                   'REAL'),

    # Section 5 — Control & Approval Rights
    ('approval_major_decision_required',     'INTEGER DEFAULT 1'),
    ('approval_rights',                      'TEXT'),
    ('approval_major_capex_threshold',       'REAL'),
    ('approval_notes',                       'TEXT'),

    # Section 6 — Loan Details
    ('loan_details',                         'TEXT'),
]


def get_existing_columns(cursor, table):
    cursor.execute(f'PRAGMA table_info({table})')
    return {row[1] for row in cursor.fetchall()}


def main():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    existing = get_existing_columns(cur, 'deals')
    added = []
    skipped = []

    for col_name, col_type in NEW_COLUMNS:
        if col_name in existing:
            skipped.append(col_name)
        else:
            cur.execute(f'ALTER TABLE deals ADD COLUMN {col_name} {col_type}')
            added.append(col_name)

    conn.commit()
    conn.close()

    if added:
        print(f'Added {len(added)} column(s): {", ".join(added)}')
    if skipped:
        print(f'Skipped {len(skipped)} already-existing column(s): {", ".join(skipped)}')
    print('Migration complete.')


if __name__ == '__main__':
    main()
