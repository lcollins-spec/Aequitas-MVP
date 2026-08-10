"""
Seed curated emerging-manager / deal-by-deal capital-source entries for the
Funders engine. Unlike the automated family-office/bank sources, these have
no connector to re-run — this script is a one-off, idempotent load (skips
any external_id that already exists, so it's safe to re-run after adding
more entries below without touching rows a user has since edited/pinned).

Every entry's program/relationship facts were verified against primary
sources (CalPERS, NY State Comptroller, TPG, Enterprise Community Partners
official pages) as of Aug 2026. Contact details are only included where
independently confirmed on an official page — a couple of plausible-looking
personal names/phone numbers surfaced by search tooling for the CalPERS
advisor relationships could not be corroborated on the advisors' own sites
and were deliberately left out rather than risking wrong info attributed to
a real person.

Run from the backend directory: python -m scripts.seed_curated_funders
"""
import sys
import os
import json
import uuid
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.database import db, FunderHitModel

SOURCE = 'curated_emerging_manager'

CURATED_FUNDERS = [
    {
        'external_id': 'calpers-gcm-elevate',
        'name': 'CalPERS — GCM Elevate (advised by GCM Grosvenor)',
        'entity_type': 'pension_emerging_manager',
        'city': 'Chicago', 'state': 'IL',
        'contact_address': None,
        'raw_data': {
            'program': 'CalPERS Emerging & Diverse Manager Program',
            'advisor': 'GCM Grosvenor',
            'commitment': '$500M committed by CalPERS to GCM Grosvenor\'s Elevate strategy',
            'how_to_apply': "Submit an investment proposal via CalPERS' Investment Proposal Submission process, referencing GCM Elevate.",
            'application_url': 'https://www.calpers.ca.gov/investments/sustainable-investments-program/emerging-diverse-manager-program',
        },
    },
    {
        'external_id': 'calpers-tpg-next',
        'name': 'CalPERS — TPG Next',
        'entity_type': 'pension_emerging_manager',
        'city': 'San Francisco', 'state': 'CA',
        'contact_address': 'next@tpg.com',
        'raw_data': {
            'program': 'CalPERS Emerging & Diverse Manager Program',
            'advisor': 'TPG Next',
            'commitment': "$500M committed by CalPERS to TPG's Next fund",
            'how_to_apply': 'Email next@tpg.com to submit a fund for consideration (confirmed on next.tpg.com).',
            'application_url': 'https://next.tpg.com/',
        },
    },
    {
        'external_id': 'calpers-canyon-catalyst',
        'name': 'CalPERS — Canyon Catalyst Fund (Canyon Partners Real Estate)',
        'entity_type': 'pension_emerging_manager',
        'city': 'Los Angeles', 'state': 'CA',
        'contact_address': None,
        'raw_data': {
            'program': 'Canyon Catalyst Fund — CalPERS real estate emerging manager program',
            'advisor': 'Canyon Partners Real Estate',
            'commitment': '$350M new capital committed (2022); ~$1B cumulative committed by CalPERS since 2012',
            'note': 'Real-estate-specific, deal-by-deal — mentors emerging real estate managers through Canyon investment professionals rather than a blind-pool commitment.',
            'application_url': 'https://www.canyonpartners.com/canyon-catalyst-fund-grows-emerging-manager-program-announces-new-investments-in-arizona-market/',
        },
    },
    {
        'external_id': 'nycrf-artemis-re',
        'name': 'NY State Common Retirement Fund — Artemis Real Estate Partners',
        'entity_type': 'pension_emerging_manager',
        'city': 'Chevy Chase', 'state': 'MD',
        'contact_address': '5404 Wisconsin Avenue, Suite 1150, Chevy Chase, MD 20815 · (202) 370-7450',
        'raw_data': {
            'program': 'NY Common Retirement Fund Real Estate Emerging Manager Program',
            'advisor': 'Artemis Real Estate Partners',
            'commitment': '$400M (Frontier Mach III), following $300M (Mach I, 2012) and $500M (Mach II, 2014)',
            'website': 'www.artemisrep.com',
            'application_url': 'https://www.osc.ny.gov/common-retirement-fund/emerging-manager/real-estate',
        },
    },
    {
        'external_id': 'nycrf-gcm-grosvenor-re',
        'name': 'NY State Common Retirement Fund — GCM Grosvenor (Real Estate)',
        'entity_type': 'pension_emerging_manager',
        'city': 'New York', 'state': 'NY',
        'contact_address': '767 Fifth Avenue, 14th Floor, New York, NY 10153 · (646) 362-3675',
        'raw_data': {
            'program': 'NY Common Retirement Fund Real Estate Emerging Manager Program',
            'advisor': 'GCM Grosvenor',
            'structure': 'Seed, Early to Late-Stage; Funds, Co-investments, Joint Ventures, Seed Investments',
            'website': 'www.gcmgrosvenor.com',
            'application_url': 'https://www.osc.ny.gov/common-retirement-fund/emerging-manager/real-estate',
        },
    },
    {
        'external_id': 'txtrs-emerging-managers',
        'name': 'Texas TRS Emerging Manager Program',
        'entity_type': 'pension_emerging_manager',
        'city': 'Austin', 'state': 'TX',
        'contact_address': 'EmergingManagers@trs.texas.gov',
        'raw_data': {
            'program': 'Teacher Retirement System of Texas — Emerging Manager Program',
            'how_to_apply': 'Live inbox for emerging manager inquiries: EmergingManagers@trs.texas.gov',
            'application_url': 'https://www.trs.texas.gov',
        },
    },
    {
        'external_id': 'calstrs-belay',
        'name': 'CalSTRS — Belay Investment Group',
        'entity_type': 'pension_emerging_manager',
        'city': 'Los Angeles', 'state': 'CA',
        'contact_address': None,
        'raw_data': {
            'program': 'CalSTRS Real Estate Emerging Manager relationship',
            'advisor': 'Belay Investment Group (majority woman-owned)',
            'commitment': '$250M capital allocation (2021) for co-investment alongside CalSTRS in first-time/emerging real estate funds; prior $200M (2016) and $100M (2018) commitments',
            'application_url': 'https://belayinvestmentgroup.com/',
        },
    },
    {
        'external_id': 'freddiemac-impact-sponsors',
        'name': 'Freddie Mac Diverse and Emerging Sponsors (Impact Sponsors) Program',
        'entity_type': 'gse_program',
        'city': 'McLean', 'state': 'VA',
        'contact_address': None,
        'raw_data': {
            'program': 'Freddie Mac Multifamily Impact Sponsors — Diverse & Emerging Sponsor cohort',
            'eligibility': 'No more than 1,000 multifamily units owned/operated; 5+ years multifamily ownership experience, or meets Small Balance Loan (SBL) baseline experience requirements',
            'how_to_apply': 'Annual cohort; apply via an online interest form when the application window opens.',
            'application_url': 'https://mf.freddiemac.com/borrowers/impact-sponsors',
        },
    },
    {
        'external_id': 'enterprise-epf',
        'name': 'Enterprise Community Loan Fund — Equitable Path Forward',
        'entity_type': 'cdfi',
        'city': 'Columbia', 'state': 'MD',
        'contact_address': 'Matthew Morrin (Senior Director, Programs); Rob Bachmann (Director, Capital Originations)',
        'raw_data': {
            'program': 'Equitable Path Forward — $350M Growth Fund aiming to attract $3.1B in total financing',
            'target': 'Economically and socially disadvantaged, BIPOC-led housing developers',
            'products': 'Entity-level lending, grants, project-level equity and debt — genuinely deal-level, not a blind-pool commitment',
            'how_to_apply': "Developer Interest Form on Enterprise's Equitable Path Forward page.",
            'application_url': 'https://www.enterprisecommunity.org/impact-areas/racial-equity/equitable-path-forward',
        },
    },
]


def seed_curated_funders():
    app = create_app()
    with app.app_context():
        created, skipped = 0, 0
        for entry in CURATED_FUNDERS:
            dedup_key = f"{SOURCE}:{entry['external_id']}"
            if FunderHitModel.query.filter_by(dedup_key=dedup_key).first():
                skipped += 1
                continue
            now = datetime.utcnow()
            db.session.add(FunderHitModel(
                id=uuid.uuid4().hex,
                source=SOURCE,
                name=entry['name'],
                entity_type=entry.get('entity_type'),
                city=entry.get('city'),
                state=entry.get('state'),
                contact_address=entry.get('contact_address'),
                external_id=entry['external_id'],
                raw_data=json.dumps(entry.get('raw_data')),
                dedup_key=dedup_key,
                first_seen_at=now,
                last_seen_at=now,
            ))
            created += 1
        db.session.commit()
        print(f"Seeded curated funders: {created} created, {skipped} already existed")


if __name__ == '__main__':
    seed_curated_funders()
