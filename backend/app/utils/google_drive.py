"""
Google Drive utility for Aequitas deal document storage.

Authenticates via refresh token (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
GOOGLE_REFRESH_TOKEN). Never uses a service account.

All Drive errors raise exceptions with clear messages — never fail silently.
"""

import os
from functools import lru_cache

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

# ── Config ────────────────────────────────────────────────────────────────────

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"]


def _get_credentials() -> Credentials:
    """Build refreshed Credentials from environment variables."""
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
        scopes=DRIVE_SCOPES,
    )
    # Refresh to obtain a valid access token
    creds.refresh(Request())
    return creds


def _build_service():
    """Return an authenticated Drive v3 service."""
    creds = _get_credentials()
    return build("drive", "v3", credentials=creds, cache_discovery=False)


# ── Root folder ───────────────────────────────────────────────────────────────

_root_folder_id: str | None = None


def _get_root_folder_id() -> str:
    """Find or create the Aequitas root folder. Result is cached in-process."""
    global _root_folder_id
    if _root_folder_id:
        return _root_folder_id

    folder_name = os.environ.get("GOOGLE_DRIVE_FOLDER_NAME", "Aequitas Deal Docs")
    service = _build_service()

    # Search for existing folder
    query = (
        f"name = '{folder_name}' "
        "and mimeType = 'application/vnd.google-apps.folder' "
        "and trashed = false"
    )
    try:
        results = service.files().list(
            q=query,
            spaces="drive",
            fields="files(id, name)",
            pageSize=1,
        ).execute()
    except Exception as e:
        raise RuntimeError(f"Drive API error while searching for root folder: {e}") from e

    files = results.get("files", [])
    if files:
        _root_folder_id = files[0]["id"]
        return _root_folder_id

    # Create the root folder
    try:
        meta = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        folder = service.files().create(body=meta, fields="id").execute()
        _root_folder_id = folder["id"]
        return _root_folder_id
    except Exception as e:
        raise RuntimeError(f"Drive API error while creating root folder '{folder_name}': {e}") from e


# ── Deal subfolder ────────────────────────────────────────────────────────────

def get_or_create_deal_folder(deal_name: str) -> str:
    """
    Find or create a subfolder under the Aequitas root named after the deal.
    Returns the folder ID.
    """
    root_id = _get_root_folder_id()
    service = _build_service()

    # Escape single quotes in deal_name for Drive query
    safe_name = deal_name.replace("'", "\\'")
    query = (
        f"name = '{safe_name}' "
        "and mimeType = 'application/vnd.google-apps.folder' "
        f"and '{root_id}' in parents "
        "and trashed = false"
    )
    try:
        results = service.files().list(
            q=query,
            spaces="drive",
            fields="files(id, name)",
            pageSize=1,
        ).execute()
    except Exception as e:
        raise RuntimeError(
            f"Drive API error while searching for deal folder '{deal_name}': {e}"
        ) from e

    files = results.get("files", [])
    if files:
        return files[0]["id"]

    # Create subfolder
    try:
        meta = {
            "name": deal_name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [root_id],
        }
        folder = service.files().create(body=meta, fields="id").execute()
        return folder["id"]
    except Exception as e:
        raise RuntimeError(
            f"Drive API error while creating deal folder '{deal_name}': {e}"
        ) from e


# ── File operations ───────────────────────────────────────────────────────────

def upload_file(
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    deal_name: str,
    document_type: str,
) -> dict:
    """
    Upload a file to the deal's subfolder in Google Drive.

    Returns:
        {"file_id": str, "file_name": str, "web_view_link": str}
    """
    folder_id = get_or_create_deal_folder(deal_name)
    service = _build_service()

    file_meta = {
        "name": filename,
        "parents": [folder_id],
        "description": f"Document type: {document_type}",
    }
    media = MediaIoBaseUpload(
        io.BytesIO(file_bytes),
        mimetype=mime_type,
        resumable=False,
    )

    try:
        uploaded = service.files().create(
            body=file_meta,
            media_body=media,
            fields="id, name, webViewLink",
        ).execute()
    except Exception as e:
        raise RuntimeError(
            f"Drive API error while uploading '{filename}' for deal '{deal_name}': {e}"
        ) from e

    return {
        "file_id": uploaded["id"],
        "file_name": uploaded["name"],
        "web_view_link": uploaded.get("webViewLink", ""),
    }


def list_files(deal_name: str) -> list:
    """
    List all files in the deal's Drive subfolder.

    Returns a list of dicts with keys: file_id, file_name, web_view_link, mime_type.
    """
    folder_id = get_or_create_deal_folder(deal_name)
    service = _build_service()

    query = f"'{folder_id}' in parents and trashed = false"
    try:
        results = service.files().list(
            q=query,
            spaces="drive",
            fields="files(id, name, webViewLink, mimeType)",
            orderBy="createdTime desc",
        ).execute()
    except Exception as e:
        raise RuntimeError(
            f"Drive API error while listing files for deal '{deal_name}': {e}"
        ) from e

    return [
        {
            "file_id": f["id"],
            "file_name": f["name"],
            "web_view_link": f.get("webViewLink", ""),
            "mime_type": f.get("mimeType", ""),
        }
        for f in results.get("files", [])
    ]


def delete_file(file_id: str) -> None:
    """
    Permanently delete a file by its Drive file ID.
    Raises RuntimeError on failure.
    """
    service = _build_service()
    try:
        service.files().delete(fileId=file_id).execute()
    except Exception as e:
        raise RuntimeError(
            f"Drive API error while deleting file '{file_id}': {e}"
        ) from e
