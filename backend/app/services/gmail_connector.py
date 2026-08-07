"""
Gmail connector for the sourcing signals engine — reads LoopNet/Crexi/broker
deal alerts out of a single Gmail label ("Sourcing Feed").

Authenticates via refresh token (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
GOOGLE_REFRESH_TOKEN — the same three env vars google_drive.py uses; the
token now needs the combined Drive + Gmail scope, see get_google_token.py).

Scope note: gmail.readonly grants read access to the whole mailbox at the
Google level — there's no OAuth scope limited to a single label. Every call
in this module is filtered to the "Sourcing Feed" label; that's an
application-level restriction, not a token-level one. Do not add a call
here that queries messages without that filter.
"""
from __future__ import annotations

import base64
import os

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
SOURCING_LABEL_NAME = "Sourcing Feed"

_label_id_cache: str | None = None


def _get_credentials() -> Credentials:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN")

    if not all([client_id, client_secret, refresh_token]):
        raise RuntimeError(
            "Missing Google OAuth credentials. "
            "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN."
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=GOOGLE_TOKEN_URI,
        client_id=client_id,
        client_secret=client_secret,
        scopes=GMAIL_SCOPES,
    )
    creds.refresh(Request())
    return creds


def _build_service():
    creds = _get_credentials()
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _get_sourcing_label_id(service) -> str | None:
    """Look up the "Sourcing Feed" label's ID (required by messages.list's
    labelIds filter — matching by name here, once, then cached in-process)."""
    global _label_id_cache
    if _label_id_cache:
        return _label_id_cache
    result = service.users().labels().list(userId="me").execute()
    for label in result.get("labels", []):
        if label.get("name") == SOURCING_LABEL_NAME:
            _label_id_cache = label["id"]
            return _label_id_cache
    return None


def _header(headers, name):
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value")
    return None


def _extract_body(payload) -> tuple[str, str]:
    """Walk a message's MIME parts and return (text_body, html_body)."""
    text_body, html_body = "", ""

    def walk(part):
        nonlocal text_body, html_body
        mime_type = part.get("mimeType", "")
        body_data = part.get("body", {}).get("data")
        if body_data:
            decoded = base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="replace")
            if mime_type == "text/plain" and not text_body:
                text_body = decoded
            elif mime_type == "text/html" and not html_body:
                html_body = decoded
        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload)
    return text_body, html_body


def fetch_sourcing_feed_messages(max_results=50):
    """
    Return recent messages from the "Sourcing Feed" label as a list of dicts:
    {id, from, subject, date, body_text, body_html}. Every request here is
    scoped to that one label — see module docstring.
    """
    service = _build_service()
    label_id = _get_sourcing_label_id(service)
    if not label_id:
        return []

    result = service.users().messages().list(
        userId="me", labelIds=[label_id], maxResults=max_results
    ).execute()
    stubs = result.get("messages", [])

    messages = []
    for stub in stubs:
        full = service.users().messages().get(userId="me", id=stub["id"], format="full").execute()
        headers = full.get("payload", {}).get("headers", [])
        text_body, html_body = _extract_body(full.get("payload", {}))
        messages.append({
            "id": full["id"],
            "from": _header(headers, "From"),
            "subject": _header(headers, "Subject"),
            "date": _header(headers, "Date"),
            "body_text": text_body,
            "body_html": html_body,
        })
    return messages
