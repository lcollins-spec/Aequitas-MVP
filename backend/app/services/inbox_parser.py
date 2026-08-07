"""
Parses LoopNet/Crexi/broker deal-alert emails from the "Sourcing Feed"
Gmail label into hit-shaped dicts, consumed the same way signal_engine
consumes every other connector's output.

Built from real sample LoopNet emails pulled via gmail_connector.py during
development (not guessed). LoopNet's saved-search alert emails are
HTML-only (no meaningful plain-text body) and pack one or more property
"cards" into a single email — each card's fields (name, address,
city/state/zip, type, price, stats) sit in a run of text immediately
followed by a "View Listing" link, which is what makes splitting one
email into its individual listings reliable: flatten the HTML to text
with separators, then split on each "View Listing" occurrence.

Crexi and generic broker alerts aren't handled yet — no real sample seen,
and guessing a format would just be wrong. parse_message() returns an
empty list for any sender it doesn't recognize rather than fabricate a
parse.
"""
import re

from bs4 import BeautifulSoup

CITY_STATE_ZIP_RE = re.compile(r"^([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5})$")
PRICE_RE = re.compile(r'\$[\d,]+')
UNITS_RE = re.compile(r'(\d+)\s*Units?\b', re.IGNORECASE)


def _parse_loopnet_html(html):
    if not html:
        return []
    soup = BeautifulSoup(html, 'html.parser')
    view_listing_links = [
        a['href'] for a in soup.find_all('a', href=True) if a.get_text(strip=True) == 'View Listing'
    ]

    # LoopNet's own template pads its pipe separators with non-breaking
    # spaces ('\xa0\xa0|\xa0\xa0') as literal text content, distinct from
    # the ' | ' separator get_text() inserts between DOM elements — collapse
    # both to a single plain-space-pipe-space form before splitting on it.
    text = soup.get_text(separator=' | ', strip=True)
    text = re.sub(r'\s*\xa0*\|\xa0*\s*', ' | ', text)
    chunks = text.split(' | View Listing | ')
    if chunks:
        # First chunk includes the email preamble ("N properties matched
        # your saved search for ... - date.") — drop through the last
        # sentence-ending period before the first real listing's fields.
        marker = chunks[0].rfind('. ')
        if marker != -1:
            chunks[0] = chunks[0][marker + 2:]

    listings = []
    for i, chunk in enumerate(chunks[:-1]):  # last chunk is the email footer, not a listing
        parts = [p.strip() for p in chunk.split('|') if p.strip()]
        csz_idx = next((j for j, p in enumerate(parts) if CITY_STATE_ZIP_RE.match(p)), None)
        if csz_idx is None or csz_idx == 0:
            continue  # doesn't look like a listing block — skip rather than guess
        address = parts[csz_idx - 1]
        m = CITY_STATE_ZIP_RE.match(parts[csz_idx])
        city, state, zip_code = m.group(1), m.group(2), m.group(3)
        # Price/unit-count/cap-rate stats can render either before the
        # address or after it depending on how much data LoopNet has for
        # that specific listing — search the whole chunk, not just the
        # tail after city/state/zip. A highlight line like "$190K/Unit"
        # can appear before the address alongside the real total price
        # ("$3,995,000") after it — the real price is always the LAST
        # dollar figure in the chunk and is never K-suffixed, so take the
        # last match that isn't immediately followed by 'K'.
        units_m = UNITS_RE.search(chunk)
        price_val = None
        for pm in PRICE_RE.finditer(chunk):
            if chunk[pm.end():pm.end() + 1] == 'K':
                continue
            price_val = float(pm.group(0).replace('$', '').replace(',', ''))
        listings.append({
            'source': 'inbox_loopnet',
            'address': f'{address}, {city}, {state} {zip_code}',
            'city': city,
            'state': state,
            'listing_price': price_val,
            'unit_count': int(units_m.group(1)) if units_m else None,
            'listing_url': view_listing_links[i] if i < len(view_listing_links) else None,
            'raw_data': {'chunk': chunk},
        })
    return listings


def parse_message(message):
    """
    message is a dict from gmail_connector.fetch_sourcing_feed_messages:
    {id, from, subject, date, body_text, body_html}.
    Returns a list of hit-shaped dicts: {source, address, listing_price,
    unit_count, listing_url, raw_data} — same shape run_market_scan already
    expects from every other connector.
    """
    sender = (message.get('from') or '').lower()
    if 'loopnet.com' in sender:
        return _parse_loopnet_html(message.get('body_html'))
    return []
