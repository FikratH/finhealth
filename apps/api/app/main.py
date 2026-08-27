"""FinHealth MVP — FastAPI backend.

Security notes:
- file size limit + magic-byte MIME check (extension alone is not trusted);
- uploads stored under random UUID names, deleted right after extraction;
- logging never includes financial values, only ids and technical metadata;
- no secrets in the repository, configuration via environment (.env.example).
"""
from __future__ import annotations

import concurrent.futures
import logging
import multiprocessing
import os
import threading
import uuid
from concurrent.futures.process import BrokenProcessPool

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from . import auth, entitlements, storage
from .ratelimit import rate_limit
from .schemas import (
    AnalysisRequest,
    ExtractRequest,
    ExtractionResult,
    MyAnalysesResponse,
    MyDocumentsResponse,
    NarrativeResult,
    UploadedDocument,
)
from .services import extraction, vault
from .services import narrative as narrative_service
from .services.analysis import run_analysis
from .services.scoring import get_industry, list_industries

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("finhealth")

MAX_FILE_SIZE = int(os.environ.get("MAX_FILE_SIZE_MB", "15")) * 1024 * 1024
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
EXTRACT_TIMEOUT_SECONDS = int(os.environ.get("EXTRACT_TIMEOUT_SECONDS", "90"))

# Extraction runs in a process pool, not a thread pool: a pathological file
# (e.g. a PDF that sends a parsing library into a near-infinite loop) can
# only be stopped by killing the OS process running it — Python threads
# cannot be killed from the outside, so a hung extraction under the old
# ThreadPoolExecutor(max_workers=4) permanently leaked one worker thread per
# timeout (the Phase 1 deferral this closes). A killed *process* is
# reclaimed by the OS immediately, and a fresh one can be started in its
# place.
#
# Kill-on-timeout pattern (why this is more than `future.cancel()`):
# `future.cancel()` only succeeds for a PENDING future; once a task has
# started running in a worker process, cancel() returns False and does
# nothing — there is no API to interrupt a running process from here. So on
# a timeout we reach into the pool for the live multiprocessing.Process
# handles backing its workers and kill() them directly (SIGKILL — stronger
# than terminate()/SIGTERM, which a wedged C extension could in principle
# ignore), then shut the now-broken pool down and swap in a freshly
# constructed one so the *next* request is served by clean workers. The
# timed-out future itself is abandoned: its process is dead, so it will
# never produce a result, and nothing waits on it again.
#
# `_pool_lock` guards the swap: two requests can time out concurrently
# against the same broken pool, and only the first should perform the
# kill-and-recreate; the second sees `_extract_pool is not broken_pool` and
# no-ops (`_recreate_extract_pool` is idempotent per broken pool instance).
#
# Explicit spawn context, not the platform default: macOS has defaulted to
# "spawn" since Python 3.8, but Linux (including CI's ubuntu-latest) still
# defaults to "fork". A fork inherits the parent's memory and any threads
# it's holding locks in — a known source of subprocess deadlocks — so
# forcing "spawn" here makes worker startup behave identically on every
# platform this runs on, rather than depending on fork-only behavior. The
# extraction worker function (app.services.extraction.extract) is a
# module-level, picklable function taking (bytes, str), as spawn requires.
_MP_CONTEXT = multiprocessing.get_context("spawn")
EXTRACT_POOL_WORKERS = 2
_pool_lock = threading.Lock()
_extract_pool = concurrent.futures.ProcessPoolExecutor(
    max_workers=EXTRACT_POOL_WORKERS, mp_context=_MP_CONTEXT)


def _recreate_extract_pool(broken_pool: concurrent.futures.ProcessPoolExecutor) -> None:
    """Kill every worker process in `broken_pool` and replace the
    module-level pool with a fresh one. Safe to call from multiple threads
    after concurrent timeouts on the same pool: only the caller that still
    sees `_extract_pool is broken_pool` performs the swap.

    Construct-then-assign-then-teardown, in that order: the replacement
    pool is built and published to `_extract_pool` *before* anything is
    done to `broken_pool`. If constructing the replacement raises (e.g.
    the OS is out of file descriptors/processes), `_extract_pool` is left
    untouched — still pointing at `broken_pool`, unusable for the request
    that just timed out but otherwise exactly as it was before this call —
    rather than extraction being left permanently dead because the old
    pool was already torn down before its replacement existed."""
    global _extract_pool
    with _pool_lock:
        if _extract_pool is not broken_pool:
            return  # another thread already recreated it
        fresh_pool = concurrent.futures.ProcessPoolExecutor(
            max_workers=EXTRACT_POOL_WORKERS, mp_context=_MP_CONTEXT)
        _extract_pool = fresh_pool
        # `_processes` (pid -> Process) is `{}` from construction onward,
        # populated as workers are lazily launched, and is only ever reset
        # to None by `broken_pool.shutdown()` — which the lock + identity
        # check above guarantee nothing has called on `broken_pool` yet at
        # this point. The `or {}` is cheap insurance against that
        # invariant breaking in some future refactor, not a real case
        # this function expects to hit today.
        processes = getattr(broken_pool, "_processes", None) or {}
        for process in list(processes.values()):
            process.kill()
        broken_pool.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="FinHealth MVP", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


def _detect_kind(filename: str, data: bytes) -> str:
    """Detect file kind by magic bytes; the filename extension is not trusted at all."""
    if data[:5] == b"%PDF-":
        return "pdf"
    if data[:4] == b"PK\x03\x04":
        # zip container: verify it's actually an Excel workbook, not docx/pptx/etc.
        import io
        import zipfile
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                decompressed = sum(i.file_size for i in z.infolist())
                if decompressed > 200 * 1024 * 1024:
                    raise HTTPException(
                        status_code=413,
                        detail="Архив Excel распакованного размера более 200 МБ не поддерживается.")
                if "xl/workbook.xml" in z.namelist():
                    return "xlsx"
        except zipfile.BadZipFile:
            pass
        raise HTTPException(status_code=415,
                            detail="Файл является ZIP-контейнером, но не книгой Excel.")
    if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return "xls"
    # plausibly text → CSV: must decode AND contain no control bytes.
    # The 4096-byte sample can cut a multibyte UTF-8 code point in half, so
    # retry with up to 3 trailing bytes trimmed before giving up.
    sample = data[:4096]
    for trim in range(4):  # a UTF-8 code point is at most 4 bytes
        try:
            sample[: len(sample) - trim].decode("utf-8-sig")
            break
        except UnicodeDecodeError:
            continue
    else:
        raise HTTPException(
            status_code=415,
            detail="Формат файла не распознан. Поддерживаются PDF, XLSX, XLS и CSV.")
    if not any(b < 9 or (13 < b < 32) for b in sample):
        return "csv"
    raise HTTPException(
        status_code=415,
        detail="Формат файла не распознан. Поддерживаются PDF, XLSX, XLS и CSV.")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/industries")
def industries():
    return {"industries": list_industries(),
            "disclaimer": "Часть отраслевых ориентиров основана на данных Damodaran "
                          "(NYU Stern, янв. 2026); остальные являются демонстрационными "
                          "и помечены соответствующим образом."}


@app.get("/api/industries/{industry_id}/benchmarks")
def industry_benchmarks(industry_id: str):
    try:
        cfg = get_industry(industry_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Отрасль не найдена.")
    return {"industry": industry_id, **cfg,
            "disclaimer": "Часть отраслевых ориентиров основана на данных Damodaran "
                          "(NYU Stern, янв. 2026); остальные являются демонстрационными "
                          "и помечены соответствующим образом."}


@app.post("/api/upload", response_model=UploadedDocument, dependencies=[Depends(rate_limit)])
async def upload(
    file: UploadFile = File(...),
    # Opt-in vault retention (P5.T7): "1"/"true"/"yes"/"on" all count as
    # set, matching services.vault._env_bool's own leniency. Absent/"0"/
    # anything else is False — the ordinary, unmodified delete-after-
    # extract path (see /api/extract below).
    retain: bool = Form(False),
    user_id: str | None = Depends(auth.get_current_user_id),
):
    if retain:
        # Conditional require_user, not Depends(auth.require_user) on the
        # route: retain is a per-request opt-in, not a blanket auth
        # requirement — anonymous upload must keep working unchanged when
        # retain is absent/false (the Global Constraint). Same 401 body as
        # require_user's, so the two are indistinguishable to a caller.
        if user_id is None:
            raise HTTPException(status_code=401, detail=auth.AUTH_REQUIRED_DETAIL)
        if not vault.vault_enabled():
            raise HTTPException(status_code=503, detail={
                "code": "vault_unavailable",
                "message": "Хранилище документов недоступно.",
            })
    await run_in_threadpool(storage.cleanup_stale_uploads)
    chunks: list[bytes] = []
    size = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"Файл больше {MAX_FILE_SIZE // (1024 * 1024)} МБ. Уменьшите размер файла.")
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(status_code=400, detail="Файл пуст.")
    kind = _detect_kind(file.filename or "", data)
    filename = os.path.basename(file.filename or "document")
    upload_id = await run_in_threadpool(
        storage.save_upload, data, kind, retain=retain, user_id=user_id, filename=filename)
    log.info("upload accepted id=%s kind=%s size=%d retain=%s", upload_id, kind, len(data), retain)
    return UploadedDocument(
        upload_id=upload_id,
        filename=filename,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data), detected_kind=kind)


@app.post("/api/extract", response_model=ExtractionResult, dependencies=[Depends(rate_limit)])
def extract(payload: ExtractRequest):
    upload_id = payload.upload_id
    stored = storage.read_upload(upload_id)
    if stored is None:
        raise HTTPException(status_code=404,
                            detail="Загруженный файл не найден или уже удалён. Загрузите файл заново.")
    data, kind = stored
    # Snapshot the pool: a concurrent request's timeout can swap the
    # module-level `_extract_pool` for a fresh one while this request is
    # in flight; `pool` keeps referring to the (possibly now-broken) one
    # this submission actually went to, so `_recreate_extract_pool(pool)`
    # below targets the right instance.
    pool = _extract_pool
    try:
        future = pool.submit(extraction.extract, data, kind)
        result = future.result(timeout=EXTRACT_TIMEOUT_SECONDS)
    except extraction.ScannedPdfError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except concurrent.futures.TimeoutError:
        # NB: concurrent.futures.TimeoutError aliases the builtin TimeoutError
        # on Python 3.11+; this except must precede the generic Exception
        # handler below or the timeout would be reported as a parse failure.
        log.warning("extraction timed out id=%s kind=%s", upload_id, kind)
        _recreate_extract_pool(pool)
        raise HTTPException(
            status_code=422,
            detail="Файл слишком сложен для разбора за отведённое время. Попробуйте Excel/CSV.")
    except (BrokenProcessPool, RuntimeError):
        # Two distinct ways this specific `pool` instance can turn out to
        # be unusable, both meaning "try again," not "the file is bad":
        #   - BrokenProcessPool: a worker died unexpectedly — e.g. it was
        #     killed out from under this request by another request's
        #     timeout, or it crashed (segfault, OOM-kill).
        #   - RuntimeError: `pool.submit()` raises this exact type
        #     ("cannot schedule new futures after shutdown") if `pool` was
        #     already shut down — by `_recreate_extract_pool` reacting to
        #     another request's timeout — between this request's snapshot
        #     of `_extract_pool` and its own submit() call.
        # (A genuine RuntimeError raised by extraction logic itself, inside
        # the worker process, would also land here rather than the generic
        # handler below — considered acceptable: extraction code does not
        # raise bare RuntimeError for real parse failures today.)
        # Recreate defensively (a no-op if this already happened) and
        # report the same "try again" 422 rather than a 500.
        log.warning("extract pool unusable id=%s kind=%s", upload_id, kind)
        _recreate_extract_pool(pool)
        raise HTTPException(status_code=422,
                            detail="Не удалось извлечь данные из файла. Попробуйте ещё раз.")
    except Exception:
        log.exception("extraction failed id=%s kind=%s", upload_id, kind)
        raise HTTPException(status_code=422,
                            detail="Не удалось извлечь данные из файла. Попробуйте Excel/CSV.")
    else:
        # Success-only branch (P5.T7): honor an opt-in retain=1 captured at
        # upload time (storage.save_upload's sidecar — see its docstring),
        # by copying the bytes into the vault before the `finally` below
        # clears the ephemeral upload. When retain was never requested,
        # read_upload_retain_meta() returns None and this is a no-op — the
        # delete-after-extract behavior stays byte-identical to pre-T7.
        retain_meta = storage.read_upload_retain_meta(upload_id)
        if retain_meta is not None:
            try:
                vault.get_vault().put(
                    doc_id=uuid.uuid4().hex, data=data, kind=kind,
                    user_id=retain_meta["user_id"], filename=retain_meta.get("filename", ""))
                log.info("document retained id=%s kind=%s", upload_id, kind)
            except Exception:
                # Retention is opt-in, extraction already succeeded — a
                # vault write failure must never turn a successful analysis
                # into an error response. Degrade to "deleted, exactly as
                # if retain had not been requested" (the `finally` below
                # still runs either way) rather than surfacing a failure
                # for something the user only gets a yes/no on, not a retry.
                log.warning("vault retain failed upload_id=%s kind=%s", upload_id, kind,
                           exc_info=True)
    finally:
        # the document itself is never stored permanently in the ephemeral
        # upload area — unchanged from pre-T7 and unconditional: even a
        # successful retain above only copies the bytes into the vault, so
        # this still clears the short-lived UPLOAD_DIR scratch file (and its
        # retain sidecar, if any — delete_upload's glob covers both).
        storage.delete_upload(upload_id)
        log.info("upload deleted id=%s", upload_id)
    result.upload_id = upload_id
    result.suggested_industry = extraction.suggest_industry(result)
    return result


@app.post("/api/analyze", dependencies=[Depends(rate_limit)])
def analyze(req: AnalysisRequest, user_id: str | None = Depends(auth.get_current_user_id)):
    try:
        result = run_analysis(req)
    except KeyError:
        raise HTTPException(status_code=400, detail="Неизвестная отрасль.")
    payload = result.model_dump(mode="json")
    storage.save_analysis(result.analysis_id, result.created_at, payload, user_id=user_id)
    log.info("analysis saved id=%s industry=%s user_id=%s", result.analysis_id, req.industry, user_id)
    if user_id is not None:
        # Anonymous analyses are unmetered by design (no entitlements row to
        # attribute usage to). Counting is best-effort: the analysis is
        # already saved above, so a bookkeeping failure here must never
        # turn a successful analysis into an error response (enforcement is
        # off anyway — see app/entitlements.py).
        try:
            entitlements.get_or_create(user_id)
            entitlements.increment_analyses(user_id)
        except Exception:
            log.warning("entitlements increment failed user_id=%s", user_id, exc_info=True)
    return payload


@app.get("/api/analysis/{analysis_id}")
def get_analysis(analysis_id: str):
    payload = storage.get_analysis(analysis_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Анализ не найден.")
    return payload


@app.delete("/api/analysis/{analysis_id}")
def delete_analysis(analysis_id: str):
    if not storage.delete_analysis(analysis_id):
        raise HTTPException(status_code=404, detail="Анализ не найден.")
    return {"deleted": analysis_id}


@app.get("/api/my/analyses", response_model=MyAnalysesResponse)
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


@app.delete("/api/my/analyses/{analysis_id}")
def delete_my_analysis(analysis_id: str, user_id: str = Depends(auth.require_user)):
    """Ownership-checked delete: an id that doesn't exist and an id that
    belongs to a different user both 404 identically — never a 403, so the
    response can't be used to probe for other users' analysis ids."""
    if not storage.delete_analysis_for_user(analysis_id, user_id):
        raise HTTPException(status_code=404, detail="Анализ не найден.")
    return {"deleted": analysis_id}


@app.get("/api/my/documents", response_model=MyDocumentsResponse)
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


@app.delete("/api/my/documents/{doc_id}")
def delete_my_document(doc_id: str, user_id: str = Depends(auth.require_user)):
    """Ownership-checked delete, same 404-never-403 idiom as
    DELETE /api/my/analyses/{id}: an id that doesn't exist and an id that
    belongs to someone else both 404 identically."""
    try:
        deleted = vault.get_vault().delete(doc_id, user_id)
    except vault.VaultPathError:
        deleted = False
    if not deleted:
        raise HTTPException(status_code=404, detail="Документ не найден.")
    return {"deleted": doc_id}


@app.post("/api/analysis/{analysis_id}/narrative", response_model=NarrativeResult,
         dependencies=[Depends(rate_limit)])
def generate_narrative(analysis_id: str, refresh: bool = False):
    """Generates (or returns the cached) LLM narrative for an analysis.
    Optional and provider-agnostic: absent OPENAI_API_KEY is a 503, never a
    500 — the rest of the product is unaffected either way. `?refresh=1`
    bypasses the cache and regenerates."""
    payload = storage.get_analysis(analysis_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Анализ не найден.")

    cached = payload.get("narrative")
    if cached and not refresh:
        return cached

    try:
        result = narrative_service.generate_narrative(payload)
    except narrative_service.NarrativeUnavailable:
        raise HTTPException(status_code=503, detail={
            "code": "narrative_unavailable",
            "message": "Пояснение аналитика недоступно: ключ OPENAI_API_KEY не настроен.",
        })
    except Exception:
        log.exception("narrative generation failed id=%s", analysis_id)
        raise HTTPException(status_code=502, detail={
            "code": "narrative_failed",
            "message": "Не удалось сформировать пояснение. Попробуйте ещё раз позже.",
        })

    payload["narrative"] = result
    storage.save_analysis(analysis_id, payload["created_at"], payload)
    log.info("narrative generated id=%s model=%s", analysis_id, result["model"])
    return result
