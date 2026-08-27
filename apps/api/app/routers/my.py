"""GET/DELETE `/api/my/*` — the signed-in user's own data: analysis history
(P5.T4) and the opt-in document vault (P5.T7). Split out of `main.py`
(P5.T8) to keep that module under the project's 500-line ceiling — all four
endpoints here share the same `require_user` + ownership-scoped shape, the
natural seam Task 7's review named. `main.py` mounts this via
`app.include_router(my_router.router)`; paths/behavior are unchanged by
the move.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from .. import auth, entitlements, storage
from ..schemas import MyAnalysesResponse, MyDocumentsResponse
from ..services import vault

log = logging.getLogger("finhealth.my")

router = APIRouter()


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


@router.get("/api/my/documents", response_model=MyDocumentsResponse)
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


@router.delete("/api/my/documents/{doc_id}")
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
