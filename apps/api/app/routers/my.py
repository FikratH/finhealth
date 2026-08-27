"""GET/DELETE `/api/my/*` — the signed-in user's own data: analysis history
(P5.T4) and the opt-in document vault (P5.T7, plus download — P6.T5).
Split out of `main.py` (P5.T8) to keep that module under the project's
500-line ceiling — all endpoints here share the same `require_user` +
ownership-scoped shape, the natural seam Task 7's review named. `main.py`
mounts this via `app.include_router(my_router.router)`; paths/behavior are
unchanged by the move.

All three `/api/my/documents...` routes (list, delete, download) carry
`dependencies=[Depends(rate_limit)]` (P6.T5, closing a carried Phase-5
finding) — per-route, not router-level, matching the idiom `main.py`'s four
rate-limited endpoints already use, so a reader checking either module sees
the same pattern. `/api/my/analyses...` is deliberately NOT rate-limited:
out of scope for this pass, same as before.
"""
from __future__ import annotations

import logging
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from .. import auth, entitlements, storage
from ..ratelimit import rate_limit
from ..schemas import MyAnalysesResponse, MyDocumentsResponse
from ..services import vault

log = logging.getLogger("finhealth.my")

router = APIRouter()

# Kind -> MIME type for the download endpoint below. Same "pdf"/"xlsx"/
# "xls"/"csv" vocabulary main.py's _detect_kind produces and VaultDocument.kind
# stores — nothing else ever reaches the vault.
_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "csv": "text/csv",
}


def _content_disposition(filename: str) -> str:
    """Builds a Content-Disposition header carrying the document's REAL
    original filename, which is routinely Cyrillic (RSBU statements — see
    app/services/vault.py's module docstring). Per RFC 6266/5987, both
    parameters are always sent together, never just one: `filename*=` is
    the UTF-8 percent-encoded form modern clients use; the plain `filename=`
    is an ASCII-only fallback (non-ASCII characters replaced, not dropped)
    for anything that only understands the older form — a client that
    honors both is expected to prefer `filename*=`."""
    name = filename or "document"
    ascii_fallback = (
        name.encode("ascii", "replace").decode("ascii").replace('"', "'").replace("\\", "_")
    )
    encoded = urllib.parse.quote(name, safe="")
    return f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'


@router.get("/api/my/analyses", response_model=MyAnalysesResponse)
def my_analyses(user_id: str = Depends(auth.require_user)):
    """«Мои анализы» — the signed-in user's own analyses, newest first,
    capped at 50. Auth-gated (401 anonymous, via require_user); a summary
    projection only, never the full stored payload. Also carries the
    caller's plan (get_or_create is cheap and idempotent) so the frontend
    can show a quiet plan chip without a second request."""
    rows = storage.list_analyses_for_user(user_id, limit=50)
    plan = entitlements.get_or_create(user_id)["plan"]
    return {
        "plan": plan,
        "analyses": [
            {
                "analysis_id": row["id"],
                "created_at": row["created_at"],
                "industry_name": row["payload"].get("industry_name", ""),
                "overall_score": row["payload"].get("overall_score"),
                "health_label": row["payload"].get("health_label", ""),
            }
            for row in rows
        ]
    }


@router.delete("/api/my/analyses/{analysis_id}")
def delete_my_analysis(analysis_id: str, user_id: str = Depends(auth.require_user)):
    """Ownership-checked delete: an id that doesn't exist and an id that
    belongs to a different user both 404 identically — never a 403, so the
    response can't be used to probe for other users' analysis ids."""
    if not storage.delete_analysis_for_user(analysis_id, user_id):
        raise HTTPException(status_code=404, detail="Анализ не найден.")
    return {"deleted": analysis_id}


@router.get("/api/my/documents", response_model=MyDocumentsResponse,
           dependencies=[Depends(rate_limit)])
def my_documents(user_id: str = Depends(auth.require_user)):
    """The caller's own retained documents (P5.T7 opt-in vault), newest
    first. Metadata only — GET never returns the raw bytes. Mirrors
    GET /api/my/analyses' require_user + scoped-projection idiom."""
    try:
        docs = vault.get_vault().list_for_user(user_id)
    except vault.VaultPathError:
        # user_id comes from a verified JWT sub — this should be
        # unreachable in practice, but a failed path-safety check must
        # never 500; degrade to "no documents" rather than leak why.
        log.warning("vault path validation rejected user_id on list")
        docs = []
    except vault.VaultBackendError:
        # A real backend failure (bad R2 credentials, an outage, ...) —
        # degrade to "no documents" rather than a 500. Deliberately quiet,
        # not a 503: this is a read of the user's OWN data, and reporting
        # an empty list is the same "fail toward showing nothing rather
        # than crashing" posture VaultPathError already gets above. A
        # genuinely broken backend is an ops problem to notice via logs,
        # not something to interrupt this page with an error banner over.
        log.warning("vault backend error on list user_id=%s", user_id, exc_info=True)
        docs = []
    return {"documents": [
        {
            "doc_id": d.doc_id,
            "filename": d.filename,
            "kind": d.kind,
            "size_bytes": d.size_bytes,
            "created_at": d.created_at,
        }
        for d in docs
    ]}


@router.delete("/api/my/documents/{doc_id}", dependencies=[Depends(rate_limit)])
def delete_my_document(doc_id: str, user_id: str = Depends(auth.require_user)):
    """Ownership-checked delete, same 404-never-403 idiom as
    DELETE /api/my/analyses/{id}: an id that doesn't exist and an id that
    belongs to someone else both 404 identically."""
    try:
        deleted = vault.get_vault().delete(doc_id, user_id)
    except vault.VaultPathError:
        deleted = False
    except vault.VaultBackendError:
        # Unlike the list endpoint above, a delete must not silently claim
        # success or silently claim "not found" when the backend itself
        # failed — either would misinform the caller about their own data.
        # A 503 with the same envelope POST /api/upload's retain=1 already
        # uses is the honest answer: "try again," not "gone."
        log.warning("vault backend error on delete doc_id=%s user_id=%s", doc_id, user_id,
                   exc_info=True)
        raise HTTPException(status_code=503, detail={
            "code": "vault_unavailable",
            "message": "Хранилище документов временно недоступно. Попробуйте ещё раз.",
        })
    if not deleted:
        raise HTTPException(status_code=404, detail="Документ не найден.")
    return {"deleted": doc_id}


@router.get("/api/my/documents/{doc_id}/download", dependencies=[Depends(rate_limit)])
def download_my_document(doc_id: str, user_id: str = Depends(auth.require_user)):
    """Streams the caller's own retained document back — the retrieval
    half of P5.T7's "retention without retrieval" gap (see
    docs/founder-todo.md). Same ownership-checked, 404-never-403 idiom as
    DELETE above: an id that doesn't exist and an id that belongs to
    someone else both 404 identically, so the response can't be used to
    probe for other users' doc ids. Mirrors DELETE's error posture on a
    backend failure too — 503, never a silent empty/degraded response —
    because a download that returned the wrong thing (or nothing, framed
    as success) would misinform the caller about their own data, the same
    reasoning DELETE's own comment gives."""
    try:
        result = vault.get_vault().get(doc_id, user_id)
    except vault.VaultPathError:
        result = None
    except vault.VaultBackendError:
        log.warning("vault backend error on download doc_id=%s user_id=%s", doc_id, user_id,
                   exc_info=True)
        raise HTTPException(status_code=503, detail={
            "code": "vault_unavailable",
            "message": "Хранилище документов временно недоступно. Попробуйте ещё раз.",
        })
    if result is None:
        raise HTTPException(status_code=404, detail="Документ не найден.")
    data, doc = result
    content_type = _CONTENT_TYPES.get(doc.kind, "application/octet-stream")
    return StreamingResponse(
        iter([data]),
        media_type=content_type,
        headers={
            "Content-Disposition": _content_disposition(doc.filename),
            "Content-Length": str(len(data)),
        },
    )
