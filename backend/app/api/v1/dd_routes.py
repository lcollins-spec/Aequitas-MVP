"""
Due Diligence API routes
Provides CRUD for dd_items, dd_issues, dd_questions, dd_budget_items, dd_contacts, dd_key_dates.
Includes a /seed endpoint that populates dd_items from the standard Aequitas DD checklist template.
"""
from datetime import date as _date
from flask import Blueprint, request, jsonify
from app.database import (
    db, DDKeyDates, DDItem, DDIssue, DDQuestion, DDBudgetItem, DDContact,
)

dd_bp = Blueprint('dd', __name__)

# ─── Seed template ────────────────────────────────────────────────────────────
# Each entry: (top_section, section_code, section_name, item_number, description, responsible)
# Derived directly from Aequitas_DD_Checklist.xlsx

DD_TEMPLATE = [
    # ── I. TRANSACTION / A. Initial Underwriting ──────────────────────────────
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 1,
     "Input and verify Sponsor underwriting — match assumptions, returns, and unit mix", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 2,
     "Rent comps — current in-place rents vs. market (CoStar, Axio, Apartments.com)", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 3,
     "Sales comps — recent multifamily trades in submarket (last 2-3 years, same vintage)", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 4,
     "OpEx comps — verify sponsor expense assumptions vs. market (Yardi Matrix, RedIQ, Sponsor PM)", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 5,
     "Property tax — verify current bill, assessment methodology, any abatements or exemptions", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 6,
     "Insurance quote — obtain preliminary quote for property, liability, and loss of rents", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 7,
     "Cap stack analysis — existing debt terms, assumability, payoff requirements", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 8,
     "Senior debt terms — confirm existing loan terms or new financing assumption (rate, maturity, covenants)", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 9,
     "Waterfall verification — model distribution waterfall per term sheet, verify IRR hurdles", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 10,
     "Crime / neighborhood analysis — pull crime data, walkability, school ratings", "AEQUITAS"),
    ("I. TRANSACTION", "I.A", "Initial Underwriting", 11,
     "Investment memo / IC summary — draft preliminary investment memo for Aequitas IC", "AEQUITAS"),

    # ── I. TRANSACTION / B. Initiation of Due Diligence ──────────────────────
    ("I. TRANSACTION", "I.B", "Initiation of Due Diligence", 1,
     "Develop DD budget and timeline", "AEQUITAS"),
    ("I. TRANSACTION", "I.B", "Initiation of Due Diligence", 2,
     "Create contact list (Sponsor, counsel, consultants, lenders)", "AEQUITAS"),
    ("I. TRANSACTION", "I.B", "Initiation of Due Diligence", 3,
     "Set up shared data room / Box / Drive link with Sponsor", "AEQUITAS"),
    ("I. TRANSACTION", "I.B", "Initiation of Due Diligence", 4,
     "Engage JV legal counsel", "COUNSEL"),
    ("I. TRANSACTION", "I.B", "Initiation of Due Diligence", 5,
     "Engage title / survey / zoning counsel", "COUNSEL"),
    ("I. TRANSACTION", "I.B", "Initiation of Due Diligence", 6,
     "Engage environmental consultant (peer review)", "CONS"),
    ("I. TRANSACTION", "I.B", "Initiation of Due Diligence", 7,
     "Engage property tax consultant (if needed)", "CONS"),
    ("I. TRANSACTION", "I.B", "Initiation of Due Diligence", 8,
     "Engage background check firm on Sponsor principals", "AEQUITAS"),

    # ── I. TRANSACTION / C. Sponsor / Partner Information ────────────────────
    ("I. TRANSACTION", "I.C", "Sponsor / Partner Information", 1,
     "Sponsor organizational chart", "SPONS"),
    ("I. TRANSACTION", "I.C", "Sponsor / Partner Information", 2,
     "Sponsor financial statements (last 2-3 years) and personal net worth", "SPONS"),
    ("I. TRANSACTION", "I.C", "Sponsor / Partner Information", 3,
     "Sponsor track record — prior multifamily deals, exits, references", "SPONS"),
    ("I. TRANSACTION", "I.C", "Sponsor / Partner Information", 4,
     "Background check authorization forms — send to Sponsor principals", "AEQUITAS"),
    ("I. TRANSACTION", "I.C", "Sponsor / Partner Information", 5,
     "Background check results", "CONS"),
    ("I. TRANSACTION", "I.C", "Sponsor / Partner Information", 6,
     "Sponsor property management experience and current portfolio", "SPONS"),

    # ── I. TRANSACTION / D. JV / Venture Documents ───────────────────────────
    ("I. TRANSACTION", "I.D", "JV / Venture Documents", 1,
     "LLC Operating Agreement — Aequitas and Sponsor", "COUNSEL"),
    ("I. TRANSACTION", "I.D", "JV / Venture Documents", 2,
     "Exhibit A: Legal Description of Property", "SPONS"),
    ("I. TRANSACTION", "I.D", "JV / Venture Documents", 3,
     "Exhibit B: Capitalization table and member funding schedule", "AEQUITAS"),
    ("I. TRANSACTION", "I.D", "JV / Venture Documents", 4,
     "Contribution Agreement (if applicable)", "COUNSEL"),
    ("I. TRANSACTION", "I.D", "JV / Venture Documents", 5,
     "Subscription Agreement (if applicable)", "COUNSEL"),
    ("I. TRANSACTION", "I.D", "JV / Venture Documents", 6,
     "Brand / IP License Agreement (if applicable)", "COUNSEL"),
    ("I. TRANSACTION", "I.D", "JV / Venture Documents", 7,
     "Property Management Agreement — Sponsor PM entity", "COUNSEL"),
    ("I. TRANSACTION", "I.D", "JV / Venture Documents", 8,
     "Purchase and Sale Agreement (if acquisition JV)", "COUNSEL"),

    # ── II. PROPERTY / A. Financial / Operational ─────────────────────────────
    ("II. PROPERTY", "II.A", "Financial / Operational", 1,
     "Trailing 12-month operating statement (T-12)", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 2,
     "Year-to-date operating statement (current year)", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 3,
     "Prior 2 years of audited / reviewed financial statements", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 4,
     "Current rent roll with unit mix, lease dates, and in-place rents", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 5,
     "Accounts payable aging schedule", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 6,
     "Schedule of deferred maintenance items", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 7,
     "Security deposit schedule", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 8,
     "Historical utility bills (past 24 months)", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 9,
     "Historical real estate tax bills (past 3 years)", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 10,
     "Insurance loss run (past 5 years)", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 11,
     "Current and historical occupancy data (monthly, past 2 years)", "SPONS"),
    ("II. PROPERTY", "II.A", "Financial / Operational", 12,
     "Existing property management reports / owner reports", "SPONS"),

    # ── II. PROPERTY / B. Legal Documentation ─────────────────────────────────
    ("II. PROPERTY", "II.B", "Legal Documentation", 1,
     "Deed / title documentation showing current ownership", "SPONS"),
    ("II. PROPERTY", "II.B", "Legal Documentation", 2,
     "Existing mortgage / loan documents (all current debt)", "SPONS"),
    ("II. PROPERTY", "II.B", "Legal Documentation", 3,
     "Existing preferred equity / mezzanine agreement (if applicable)", "SPONS"),
    ("II. PROPERTY", "II.B", "Legal Documentation", 4,
     "Payoff letters / release documentation from existing lenders/pref equity holders", "SPONS"),
    ("II. PROPERTY", "II.B", "Legal Documentation", 5,
     "Outstanding liens, UCC filings, and litigation", "COUNSEL"),
    ("II. PROPERTY", "II.B", "Legal Documentation", 6,
     "CC&Rs, HOA documents, and reciprocal easements (if applicable)", "SPONS"),
    ("II. PROPERTY", "II.B", "Legal Documentation", 7,
     "Ground lease (if applicable)", "SPONS"),
    ("II. PROPERTY", "II.B", "Legal Documentation", 8,
     "All existing third-party service contracts affecting the property", "SPONS"),
    ("II. PROPERTY", "II.B", "Legal Documentation", 9,
     "Licenses and permits currently in place (boiler, parking, etc.)", "SPONS"),
    ("II. PROPERTY", "II.B", "Legal Documentation", 10,
     "Certificate of Occupancy (existing building)", "SPONS"),

    # ── II. PROPERTY / C. Survey and Title ────────────────────────────────────
    ("II. PROPERTY", "II.C", "Survey and Title", 1,
     "Existing survey", "SPONS"),
    ("II. PROPERTY", "II.C", "Survey and Title", 2,
     "Updated ALTA/NSPS survey (if required by lender or counsel)", "CONS"),
    ("II. PROPERTY", "II.C", "Survey and Title", 3,
     "Owner's title insurance commitment and pro forma policy", "COUNSEL"),
    ("II. PROPERTY", "II.C", "Survey and Title", 4,
     "Underlying title exception documents", "COUNSEL"),
    ("II. PROPERTY", "II.C", "Survey and Title", 5,
     "All required title endorsements", "COUNSEL"),
    ("II. PROPERTY", "II.C", "Survey and Title", 6,
     "Aequitas title and survey review memo", "AEQUITAS"),

    # ── II. PROPERTY / D. Environmental ───────────────────────────────────────
    ("II. PROPERTY", "II.D", "Environmental", 1,
     "Phase I Environmental Site Assessment (existing, if available)", "SPONS"),
    ("II. PROPERTY", "II.D", "Environmental", 2,
     "Phase II Environmental Site Assessment (existing, if applicable)", "SPONS"),
    ("II. PROPERTY", "II.D", "Environmental", 3,
     "Soil Management Plan (if applicable)", "SPONS"),
    ("II. PROPERTY", "II.D", "Environmental", 4,
     "Asbestos / lead paint remediation documentation (if applicable)", "SPONS"),
    ("II. PROPERTY", "II.D", "Environmental", 5,
     "New Phase I (if existing Phase I older than 180 days)", "CONS"),
    ("II. PROPERTY", "II.D", "Environmental", 6,
     "Peer review of environmental assessments by Aequitas consultant", "CONS"),

    # ── II. PROPERTY / E. Physical / Property Condition ───────────────────────
    ("II. PROPERTY", "II.E", "Physical / Property Condition", 1,
     "Existing property condition report (PCR) / capital needs assessment", "SPONS"),
    ("II. PROPERTY", "II.E", "Physical / Property Condition", 2,
     "Roof inspection report (if available)", "SPONS"),
    ("II. PROPERTY", "II.E", "Physical / Property Condition", 3,
     "MEP (mechanical, electrical, plumbing) report (if available)", "SPONS"),
    ("II. PROPERTY", "II.E", "Physical / Property Condition", 4,
     "Elevator inspection records (if applicable)", "SPONS"),
    ("II. PROPERTY", "II.E", "Physical / Property Condition", 5,
     "Aequitas property site visit and inspection", "AEQUITAS"),
    ("II. PROPERTY", "II.E", "Physical / Property Condition", 6,
     "Deferred maintenance prioritization and budget cross-check", "AEQUITAS"),

    # ── II. PROPERTY / F. Tenancy ─────────────────────────────────────────────
    ("II. PROPERTY", "II.F", "Tenancy", 1,
     "Existing residential leases (sample or all, as applicable)", "SPONS"),
    ("II. PROPERTY", "II.F", "Tenancy", 2,
     "Tenant estoppel certificates (if required by lender or counsel)", "SPONS"),
    ("II. PROPERTY", "II.F", "Tenancy", 3,
     "Notice to tenants of ownership transfer (if required by state law)", "COUNSEL"),
    ("II. PROPERTY", "II.F", "Tenancy", 4,
     "Tenant income verification / affordability documentation (if affordable units present)", "SPONS"),
    ("II. PROPERTY", "II.F", "Tenancy", 5,
     "Parking agreements / storage agreements (if applicable)", "SPONS"),

    # ── II. PROPERTY / G. Taxes and Insurance ─────────────────────────────────
    ("II. PROPERTY", "II.G", "Taxes and Insurance", 1,
     "Current and historical tax bills (3 years)", "SPONS"),
    ("II. PROPERTY", "II.G", "Taxes and Insurance", 2,
     "Evidence of payment of real estate taxes", "AEQUITAS"),
    ("II. PROPERTY", "II.G", "Taxes and Insurance", 3,
     "Tax consultant report — abatements, exemptions, reassessment risk", "CONS"),
    ("II. PROPERTY", "II.G", "Taxes and Insurance", 4,
     "In-place insurance policies and certificates", "SPONS"),
    ("II. PROPERTY", "II.G", "Taxes and Insurance", 5,
     "New insurance quote / binder for Aequitas JV entity", "AEQUITAS"),

    # ── III. FINANCING / A. Existing Debt Review ──────────────────────────────
    ("III. FINANCING", "III.A", "Existing Debt Review", 1,
     "Full loan documents for all existing debt (senior, mezz, pref equity)", "SPONS"),
    ("III. FINANCING", "III.A", "Existing Debt Review", 2,
     "Lender payoff letters — confirmed payoff amount, per diem, wire instructions", "SPONS"),
    ("III. FINANCING", "III.A", "Existing Debt Review", 3,
     "Lender / pref equity holder consent to JV transaction and/or loan assumption", "SPONS"),
    ("III. FINANCING", "III.A", "Existing Debt Review", 4,
     "Confirmation of release / termination of existing pref equity / mezz at closing", "COUNSEL"),
    ("III. FINANCING", "III.A", "Existing Debt Review", 5,
     "Existing loan default / workout correspondence (if applicable)", "SPONS"),

    # ── III. FINANCING / B. Acquisition Financing ─────────────────────────────
    ("III. FINANCING", "III.B", "Acquisition Financing", 1,
     "Financing package — lender proposals / term sheets (min. 2 lenders)", "AEQUITAS"),
    ("III. FINANCING", "III.B", "Acquisition Financing", 2,
     "Loan assumption documents (if assuming existing loan)", "COUNSEL"),
    ("III. FINANCING", "III.B", "Acquisition Financing", 3,
     "Aequitas guarantee obligations (if any)", "AEQUITAS"),
    ("III. FINANCING", "III.B", "Acquisition Financing", 4,
     "Lender due diligence requirements — appraisal, PCR, environmental", "AEQUITAS"),
    ("III. FINANCING", "III.B", "Acquisition Financing", 5,
     "Final loan documents", "COUNSEL"),
    ("III. FINANCING", "III.B", "Acquisition Financing", 6,
     "Lender closing statement", "AEQUITAS"),

    # ── IV. CLOSING / A. Pre-Closing Checklist ────────────────────────────────
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 1,
     "All DD items above confirmed complete or waived", "AEQUITAS"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 2,
     "Definitive JV documents fully negotiated and ready for execution", "COUNSEL"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 3,
     "Entity formation — JV LLC duly formed and in good standing", "COUNSEL"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 4,
     "Certificate of Formation", "COUNSEL"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 5,
     "Certificate of Good Standing", "COUNSEL"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 6,
     "Organizational chart (JV entity)", "COUNSEL"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 7,
     "W-9 (JV entity)", "COUNSEL"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 8,
     "Title insurance commitment confirmed — acceptable to Aequitas and lender", "COUNSEL"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 9,
     "Environmental clearance confirmed", "AEQUITAS"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 10,
     "Payoff or assumption of existing debt confirmed — funds wired or assumption docs executed", "AEQUITAS"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 11,
     "All representations and warranties confirmed true and correct", "COUNSEL"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 12,
     "Insurance binder in place for Aequitas JV entity", "AEQUITAS"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 13,
     "Aequitas equity funded / capital call completed", "AEQUITAS"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 14,
     "Escrow / wiring instructions confirmed", "SPONS"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 15,
     "Closing statement reviewed and approved", "AEQUITAS"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 16,
     "Final title policy issued", "COUNSEL"),
    ("IV. CLOSING", "IV.A", "Pre-Closing Checklist", 17,
     "Closing binder assembled", "COUNSEL"),
]

# Standard DD budget services seeded for every new deal
DD_BUDGET_TEMPLATE = [
    "Phase I Environmental Site Assessment",
    "Phase II Environmental (if needed)",
    "Environmental Peer Review",
    "Geotech Evaluation (if needed)",
    "Property Condition Report / Capital Needs Assessment",
    "Background Checks (Sponsor principals)",
    "Property Tax Consultant",
    "Title Insurance",
    "Survey (ALTA/NSPS, if required)",
    "Legal — JV Counsel",
    "Legal — Title / Survey / Zoning Counsel",
    "Appraisal (if required by lender)",
    "Insurance Brokerage / Quoting",
    "Miscellaneous / Contingency",
]

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_date(val):
    if not val:
        return None
    try:
        from datetime import date
        if isinstance(val, date):
            return val
        return _date.fromisoformat(str(val)[:10])
    except (ValueError, TypeError):
        return None


def _ok(data=None, **kwargs):
    resp = {'success': True}
    if data is not None:
        resp.update(data)
    resp.update(kwargs)
    return jsonify(resp), 200


def _err(msg, code=400):
    return jsonify({'success': False, 'error': msg}), code


# ─── Key Dates ────────────────────────────────────────────────────────────────

@dd_bp.route('/dd/<int:deal_id>/key-dates', methods=['GET'])
def get_key_dates(deal_id):
    row = DDKeyDates.query.filter_by(deal_id=deal_id).first()
    if not row:
        return _ok(key_dates=None)
    return _ok(key_dates=row.to_dict())


@dd_bp.route('/dd/<int:deal_id>/key-dates', methods=['PUT'])
def upsert_key_dates(deal_id):
    data = request.get_json() or {}
    row = DDKeyDates.query.filter_by(deal_id=deal_id).first()
    if not row:
        row = DDKeyDates(deal_id=deal_id)
        db.session.add(row)
    for field in ('term_sheet_executed', 'dd_start_date', 'target_dd_completion',
                  'site_visit', 'jv_execution_target', 'closing_target'):
        if field in data:
            setattr(row, field, _parse_date(data[field]))
    db.session.commit()
    return _ok(key_dates=row.to_dict())


# ─── DD Items ─────────────────────────────────────────────────────────────────

@dd_bp.route('/dd/<int:deal_id>/items', methods=['GET'])
def get_dd_items(deal_id):
    items = DDItem.query.filter_by(deal_id=deal_id)\
        .order_by(DDItem.top_section, DDItem.section_code, DDItem.item_number).all()
    return _ok(items=[i.to_dict() for i in items])


@dd_bp.route('/dd/<int:deal_id>/items/seed', methods=['POST'])
def seed_dd_items(deal_id):
    """Populate dd_items from the standard template. Skip if items already exist."""
    existing = DDItem.query.filter_by(deal_id=deal_id).count()
    if existing > 0:
        return _ok(seeded=False, message='Items already exist for this deal')

    items = []
    for (top, code, name, num, desc, resp) in DD_TEMPLATE:
        items.append(DDItem(
            deal_id=deal_id,
            top_section=top,
            section_code=code,
            section_name=name,
            item_number=num,
            description=desc,
            responsible=resp,
        ))
    db.session.add_all(items)

    # Seed budget template if not already present
    budget_existing = DDBudgetItem.query.filter_by(deal_id=deal_id).count()
    if budget_existing == 0:
        for idx, service in enumerate(DD_BUDGET_TEMPLATE):
            db.session.add(DDBudgetItem(deal_id=deal_id, service=service, sort_order=idx))

    db.session.commit()
    return _ok(seeded=True, count=len(items))


@dd_bp.route('/dd/<int:deal_id>/items/<int:item_id>', methods=['PUT', 'PATCH'])
def update_dd_item(deal_id, item_id):
    item = DDItem.query.filter_by(id=item_id, deal_id=deal_id).first()
    if not item:
        return _err('Item not found', 404)
    data = request.get_json() or {}
    for field in ('status', 'responsible', 'comments', 'analyst_notes'):
        if field in data:
            setattr(item, field, data[field])
    if 'due_date' in data:
        item.due_date = _parse_date(data['due_date'])
    if 'completed_date' in data:
        item.completed_date = _parse_date(data['completed_date'])
    db.session.commit()
    return _ok(item=item.to_dict())


# ─── Issues & Findings ────────────────────────────────────────────────────────

@dd_bp.route('/dd/<int:deal_id>/issues', methods=['GET'])
def get_issues(deal_id):
    issues = DDIssue.query.filter_by(deal_id=deal_id)\
        .order_by(DDIssue.created_at.desc()).all()
    return _ok(issues=[i.to_dict() for i in issues])


@dd_bp.route('/dd/<int:deal_id>/issues', methods=['POST'])
def create_issue(deal_id):
    data = request.get_json() or {}
    issue = DDIssue(
        deal_id=deal_id,
        status=data.get('status', 'Open'),
        date_identified=_parse_date(data.get('date_identified')),
        type=data.get('type', ''),
        category=data.get('category', ''),
        description=data.get('description', ''),
        action_plan=data.get('action_plan', ''),
        resolved_date=_parse_date(data.get('resolved_date')),
    )
    db.session.add(issue)
    db.session.commit()
    return jsonify({'success': True, 'issue': issue.to_dict()}), 201


@dd_bp.route('/dd/<int:deal_id>/issues/<int:issue_id>', methods=['PUT', 'PATCH'])
def update_issue(deal_id, issue_id):
    issue = DDIssue.query.filter_by(id=issue_id, deal_id=deal_id).first()
    if not issue:
        return _err('Issue not found', 404)
    data = request.get_json() or {}
    for field in ('status', 'type', 'category', 'description', 'action_plan'):
        if field in data:
            setattr(issue, field, data[field])
    for field in ('date_identified', 'resolved_date'):
        if field in data:
            setattr(issue, field, _parse_date(data[field]))
    db.session.commit()
    return _ok(issue=issue.to_dict())


@dd_bp.route('/dd/<int:deal_id>/issues/<int:issue_id>', methods=['DELETE'])
def delete_issue(deal_id, issue_id):
    issue = DDIssue.query.filter_by(id=issue_id, deal_id=deal_id).first()
    if not issue:
        return _err('Issue not found', 404)
    db.session.delete(issue)
    db.session.commit()
    return _ok()


# ─── Q&A Log ──────────────────────────────────────────────────────────────────

@dd_bp.route('/dd/<int:deal_id>/questions', methods=['GET'])
def get_questions(deal_id):
    qs = DDQuestion.query.filter_by(deal_id=deal_id)\
        .order_by(DDQuestion.created_at.desc()).all()
    return _ok(questions=[q.to_dict() for q in qs])


@dd_bp.route('/dd/<int:deal_id>/questions', methods=['POST'])
def create_question(deal_id):
    data = request.get_json() or {}
    q = DDQuestion(
        deal_id=deal_id,
        resolved=bool(data.get('resolved', False)),
        priority=data.get('priority', 'Medium'),
        category=data.get('category', ''),
        question=data.get('question', ''),
        party_to_respond=data.get('party_to_respond', ''),
        date_identified=_parse_date(data.get('date_identified')),
        response=data.get('response', ''),
        date_resolved=_parse_date(data.get('date_resolved')),
    )
    db.session.add(q)
    db.session.commit()
    return jsonify({'success': True, 'question': q.to_dict()}), 201


@dd_bp.route('/dd/<int:deal_id>/questions/<int:q_id>', methods=['PUT', 'PATCH'])
def update_question(deal_id, q_id):
    q = DDQuestion.query.filter_by(id=q_id, deal_id=deal_id).first()
    if not q:
        return _err('Question not found', 404)
    data = request.get_json() or {}
    for field in ('priority', 'category', 'question', 'party_to_respond', 'response'):
        if field in data:
            setattr(q, field, data[field])
    if 'resolved' in data:
        q.resolved = bool(data['resolved'])
    for field in ('date_identified', 'date_resolved'):
        if field in data:
            setattr(q, field, _parse_date(data[field]))
    db.session.commit()
    return _ok(question=q.to_dict())


@dd_bp.route('/dd/<int:deal_id>/questions/<int:q_id>', methods=['DELETE'])
def delete_question(deal_id, q_id):
    q = DDQuestion.query.filter_by(id=q_id, deal_id=deal_id).first()
    if not q:
        return _err('Question not found', 404)
    db.session.delete(q)
    db.session.commit()
    return _ok()


# ─── DD Budget ────────────────────────────────────────────────────────────────

@dd_bp.route('/dd/<int:deal_id>/budget', methods=['GET'])
def get_budget(deal_id):
    items = DDBudgetItem.query.filter_by(deal_id=deal_id)\
        .order_by(DDBudgetItem.sort_order, DDBudgetItem.id).all()
    return _ok(budget=[i.to_dict() for i in items])


@dd_bp.route('/dd/<int:deal_id>/budget', methods=['POST'])
def create_budget_item(deal_id):
    data = request.get_json() or {}
    max_order = db.session.query(db.func.max(DDBudgetItem.sort_order))\
        .filter_by(deal_id=deal_id).scalar() or 0
    item = DDBudgetItem(
        deal_id=deal_id,
        service=data.get('service', ''),
        vendor=data.get('vendor', ''),
        estimated_cost=data.get('estimated_cost'),
        invoice_number=data.get('invoice_number', ''),
        due_date=_parse_date(data.get('due_date')),
        comments=data.get('comments', ''),
        sort_order=max_order + 1,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({'success': True, 'item': item.to_dict()}), 201


@dd_bp.route('/dd/<int:deal_id>/budget/<int:item_id>', methods=['PUT', 'PATCH'])
def update_budget_item(deal_id, item_id):
    item = DDBudgetItem.query.filter_by(id=item_id, deal_id=deal_id).first()
    if not item:
        return _err('Budget item not found', 404)
    data = request.get_json() or {}
    for field in ('service', 'vendor', 'invoice_number', 'comments'):
        if field in data:
            setattr(item, field, data[field])
    if 'estimated_cost' in data:
        item.estimated_cost = data['estimated_cost']
    if 'due_date' in data:
        item.due_date = _parse_date(data['due_date'])
    db.session.commit()
    return _ok(item=item.to_dict())


@dd_bp.route('/dd/<int:deal_id>/budget/<int:item_id>', methods=['DELETE'])
def delete_budget_item(deal_id, item_id):
    item = DDBudgetItem.query.filter_by(id=item_id, deal_id=deal_id).first()
    if not item:
        return _err('Budget item not found', 404)
    db.session.delete(item)
    db.session.commit()
    return _ok()


# ─── Contacts ─────────────────────────────────────────────────────────────────

@dd_bp.route('/dd/<int:deal_id>/contacts', methods=['GET'])
def get_contacts(deal_id):
    contacts = DDContact.query.filter_by(deal_id=deal_id)\
        .order_by(DDContact.sort_order, DDContact.id).all()
    return _ok(contacts=[c.to_dict() for c in contacts])


@dd_bp.route('/dd/<int:deal_id>/contacts', methods=['POST'])
def create_contact(deal_id):
    data = request.get_json() or {}
    max_order = db.session.query(db.func.max(DDContact.sort_order))\
        .filter_by(deal_id=deal_id).scalar() or 0
    contact = DDContact(
        deal_id=deal_id,
        party_type=data.get('party_type', ''),
        company=data.get('company', ''),
        name_title=data.get('name_title', ''),
        email=data.get('email', ''),
        phone=data.get('phone', ''),
        notes=data.get('notes', ''),
        sort_order=max_order + 1,
    )
    db.session.add(contact)
    db.session.commit()
    return jsonify({'success': True, 'contact': contact.to_dict()}), 201


@dd_bp.route('/dd/<int:deal_id>/contacts/<int:contact_id>', methods=['PUT', 'PATCH'])
def update_contact(deal_id, contact_id):
    contact = DDContact.query.filter_by(id=contact_id, deal_id=deal_id).first()
    if not contact:
        return _err('Contact not found', 404)
    data = request.get_json() or {}
    for field in ('party_type', 'company', 'name_title', 'email', 'phone', 'notes'):
        if field in data:
            setattr(contact, field, data[field])
    db.session.commit()
    return _ok(contact=contact.to_dict())


@dd_bp.route('/dd/<int:deal_id>/contacts/<int:contact_id>', methods=['DELETE'])
def delete_contact(deal_id, contact_id):
    contact = DDContact.query.filter_by(id=contact_id, deal_id=deal_id).first()
    if not contact:
        return _err('Contact not found', 404)
    db.session.delete(contact)
    db.session.commit()
    return _ok()
