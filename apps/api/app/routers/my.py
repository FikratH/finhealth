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
its cost curve is categorically different (a single indexed local query
with `LIMIT 50`), where `GET /api/my/documents`'s worst case is R2Vault
issuing a paginated list plus one remote `get_object` per document — see
app/ratelimit.py's module docstring for the fuller reasoning.
"""
from __future__ import annotations

import logging
import re
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from .. import auth, entitlements, storage
from ..ratelimit import rate_limit
from ..schemas import MyAnalysesResponse, MyDocumentsResponse
from ..services import i18n, vault

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

# CR/LF/NUL/other C0 controls + DEL are all valid ASCII, so
# encode("ascii", "replace") in _content_disposition below lets them
# through untouched — they must be stripped separately, before this
# string ever reaches a header. Matches uvicorn's own outgoing-header
# validation (HEADER_VALUE_RE), but the application must not depend on
# the ASGI server to be the only thing standing between a stored filename
# and a malformed header — see _content_disposition's docstring.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def _content_disposition(filename: str) -> str:
    """Builds a Content-Disposition header carrying the document's REAL
    original filename, which is routinely Cyrillic (RSBU statements — see
    app/services/vault.py's module docstring). Per RFC 6266/5987, both
    parameters are always sent together, never just one: `filename*=` is
    the UTF-8 percent-encoded form modern clients use — `quote(name,
    safe="")` percent-encodes everything, including control characters, so
    that half is safe by construction. The plain `filename=` is an
    ASCII-only fallback for anything that only understands the older form
    — a client that honors both is expected to prefer `filename*=`. Its
    non-ASCII characters are replaced (not dropped) by
    `encode("ascii", "replace")`, but CR/LF/NUL and the other C0 controls
    ARE ASCII and survive that step untouched; left unstripped, a filename
    containing one would either break the header outright (uvicorn's own
    HEADER_VALUE_RE rejects it — after the response has already started,
    so that document becomes permanently undownloadable) or, on a server
    that doesn't validate, inject an arbitrary header line. Stripped here
    instead, so this holds regardless of which ASGI server sits underneath
    — see tests/test_my_documents.py's direct (not-through-TestClient)
    unit test on this function, since Starlette's TestClient transport
    does not validate outgoing header values and would never catch a
    regression here."""
    name = filename or "document"
    ascii_fallback = (
        name.encode("ascii", "replace").decode("ascii").replace('"', "'").replace("\\", "_")
    )
    ascii_fallback = _CONTROL_CHARS_RE.sub("", ascii_fallback) or "document"
    encoded = urllib.parse.quote(name, safe="")
    return f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'


@router.get("/api/my/analyses", response_model=MyAnalysesResponse)
def my_analyses(locale: str | None = None, user_id: str = Depends(auth.require_user)):
    """«Мои анализы» — the signed-in user's own analyses, newest first,
    capped at 50. Auth-gated (401 anonymous, via require_user); a summary
    projection only, never the full stored payload. Also carries the
    caller's plan (get_or_create is cheap and idempotent) so the frontend
    can show a quiet plan chip without a second request.

    `?locale=ru|en` (additive, founder-r1 fix-round F2, default `ru`):
    `health_label` is a free-text RU sentence («Хорошее состояние»), not a
    machine-picked field the web could localize on its own the way it
    already does for `industry_name`/`industry_name_en` (both are always
    returned side by side — the frontend has picked between them since
    the original founder-R1 round). `?locale=en` swaps `health_label` for
    `i18n.health_label_en()`'s equivalent, recomputed straight from
    `overall_score` — the same score/band logic `GET /api/analysis/{id}`
    already uses, so a row here always agrees with what that analysis's
    own results page shows. `industry_name_en` also gets the same F3 fix
    applied (a fresh `benchmarks.json` lookup by the row's own `industry`
    id when the stored field is empty/legacy) rather than silently
    returning the RU name for a pre-founder-R1 row."""
    loc = i18n.normalize_locale(locale)
    rows = storage.list_analyses_for_user(user_id, limit=50)
    plan = entitlements.get_or_create(user_id)["plan"]
    analyses = []
    for row in rows:
        payload = row["payload"]
        score = payload.get("overall_score")
        health_label = (i18n.health_label_en(score) if loc == "en"
                        else payload.get("health_label", ""))
        analyses.append({
            "analysis_id": row["id"],
            "created_at": row["created_at"],
            "industry_name": payload.get("industry_name", ""),
            "industry_name_en": i18n.industry_name_en(payload, payload.get("industry", "")),
            "overall_score": score,
            "health_label": health_label,
        })
    return {"plan": plan, "analyses": analyses}


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
    """Returns the caller's own retained document — the retrieval half of
    P5.T7's "retention without retrieval" gap (see docs/founder-todo.md).
    Same ownership-checked, 404-never-403 idiom as DELETE above: an id
    that doesn't exist and an id that belongs to someone else both 404
    identically, so the response can't be used to probe for other users'
    doc ids. Mirrors DELETE's error posture on a backend failure too —
    503, never a silent empty/degraded response — because a download that
    returned the wrong thing (or nothing, framed as success) would
    misinform the caller about their own data, the same reasoning DELETE's
    own comment gives.

    Wrapped in `StreamingResponse` for the `Content-Length` control it
    gives (keeps uvicorn off chunked encoding), not because the transfer
    is actually incremental: `vault.get_vault().get()` already reads the
    whole document into memory (≤15MB, the upload cap) before this
    function is even called, so every download buffers fully before the
    first byte leaves — a plain `Response(content=data, ...)` would behave
    identically. Don't describe this endpoint as "streaming" bytes
    incrementally; it isn't."""
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
