"""SQLite storage for analysis results + ephemeral upload storage.

Uploaded documents are written to a temporary directory under random UUID
names (never the user-supplied filename — path traversal is impossible) and
are deleted immediately after extraction or by TTL cleanup. Only analysis
results (already anonymized numbers) are persisted in SQLite.
"""
from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import time
import uuid
from pathlib import Path
from typing import Optional

DB_PATH = os.environ.get("FINHEALTH_DB", str(Path(__file__).resolve().parent.parent / "app.db"))
UPLOAD_DIR = Path(tempfile.gettempdir()) / "finhealth_uploads"
UPLOAD_TTL_SECONDS = 15 * 60


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.execute("""CREATE TABLE IF NOT EXISTS analyses(
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)""")
    return c


# --------------------------- uploads (ephemeral) ---------------------------
def save_upload(data: bytes, kind: str) -> str:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    upload_id = uuid.uuid4().hex
    path = UPLOAD_DIR / f"{upload_id}.{kind}"
    with open(path, "wb") as f:
        f.write(data)
    return upload_id


def read_upload(upload_id: str) -> Optional[tuple[bytes, str]]:
    # upload_id is validated as hex to exclude any path characters
    if not all(ch in "0123456789abcdef" for ch in upload_id) or len(upload_id) != 32:
        return None
    for path in UPLOAD_DIR.glob(f"{upload_id}.*"):
        kind = path.suffix.lstrip(".")
        with open(path, "rb") as f:
            return f.read(), kind
    return None


def delete_upload(upload_id: str) -> None:
    if not all(ch in "0123456789abcdef" for ch in upload_id) or len(upload_id) != 32:
        return
    for path in UPLOAD_DIR.glob(f"{upload_id}.*"):
        try:
            path.unlink()
        except OSError:
            pass


def cleanup_stale_uploads() -> None:
    if not UPLOAD_DIR.exists():
        return
    now = time.time()
    for path in UPLOAD_DIR.iterdir():
        try:
            if now - path.stat().st_mtime > UPLOAD_TTL_SECONDS:
                path.unlink()
        except OSError:
            pass


# --------------------------- analyses (persistent) -------------------------
def save_analysis(analysis_id: str, created_at: str, payload: dict) -> None:
    with _conn() as c:
        c.execute("INSERT OR REPLACE INTO analyses VALUES (?, ?, ?)",
                  (analysis_id, created_at, json.dumps(payload, ensure_ascii=False)))


def get_analysis(analysis_id: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT payload FROM analyses WHERE id = ?",
                        (analysis_id,)).fetchone()
    return json.loads(row[0]) if row else None


def delete_analysis(analysis_id: str) -> bool:
    with _conn() as c:
        cur = c.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
    return cur.rowcount > 0
