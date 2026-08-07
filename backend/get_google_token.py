"""
One-time script to obtain a Google OAuth refresh token for Drive + Gmail
(read-only) access.

Usage:
    cd backend
    source venv/bin/activate
    python get_google_token.py

Prerequisites:
    - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in backend/.env
    - Your Google Cloud project must have both the Drive API and the Gmail
      API enabled
    - Add http://localhost:8080/ as an authorised redirect URI in your OAuth client

After running:
    - Copy the printed refresh token
    - Add it to Render as the environment variable: GOOGLE_REFRESH_TOKEN
      (replaces the existing Drive-only token — the new one covers both)

Note on scope: gmail.readonly grants read access to the whole mailbox at
the Google level — there's no OAuth scope limited to a single label. The
inbox connector (gmail_connector.py) restricts itself in code to only ever
query the "Sourcing Feed" label; that's an application-level restriction,
not a token-level one.
"""

import os
import sys
from pathlib import Path

# Load .env from the same directory as this script
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=env_path)

client_id = os.environ.get("GOOGLE_CLIENT_ID")
client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")

if not client_id or not client_secret:
    print(
        "ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in backend/.env",
        file=sys.stderr,
    )
    sys.exit(1)

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/gmail.readonly",
]

client_config = {
    "installed": {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["http://localhost:8080/"],
    }
}

flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)

print("Opening browser for Google login…")
credentials = flow.run_local_server(port=8080, prompt="consent", access_type="offline")

refresh_token = credentials.refresh_token

if not refresh_token:
    print(
        "\nERROR: No refresh token returned. Make sure you passed prompt='consent' "
        "and that this is the first time authorising this client (or you revoked access first).",
        file=sys.stderr,
    )
    sys.exit(1)

print("\n" + "=" * 60)
print("SUCCESS — copy the token below and add it to Render as:")
print("  Environment variable name : GOOGLE_REFRESH_TOKEN")
print("  Value                     :", refresh_token)
print("=" * 60 + "\n")
