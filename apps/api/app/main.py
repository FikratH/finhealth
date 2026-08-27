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
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from . import storage
from .schemas import (
    AnalysisRequest,
    ExtractRequest,
    ExtractionResult,
    NarrativeResult,
    UploadedDocument,
)
from .services import extraction
from .services import narrative as narrative_service
from .services.analysis import run_analysis
from .services.scoring import get_industry, list_industries

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("finhealth")

MAX_FILE_SIZE = int(os.environ.get("MAX_FILE_SIZE_MB", "15")) * 1024 * 1024
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
EXTRACT_TIMEOUT_SECONDS = int(os.environ.get("EXTRACT_TIMEOUT_SECONDS", "90"))
_extract_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)

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


@app.post("/api/upload", response_model=UploadedDocument)
async def upload(file: UploadFile = File(...)):
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
    upload_id = await run_in_threadpool(storage.save_upload, data, kind)
    log.info("upload accepted id=%s kind=%s size=%d", upload_id, kind, len(data))
    return UploadedDocument(
        upload_id=upload_id,
        filename=os.path.basename(file.filename or "document"),
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data), detected_kind=kind)


@app.post("/api/extract", response_model=ExtractionResult)
def extract(payload: ExtractRequest):
    upload_id = payload.upload_id
    stored = storage.read_upload(upload_id)
    if stored is None:
        raise HTTPException(status_code=404,
                            detail="Загруженный файл не найден или уже удалён. Загрузите файл заново.")
    data, kind = stored
    try:
        future = _extract_pool.submit(extraction.extract, data, kind)
        result = future.result(timeout=EXTRACT_TIMEOUT_SECONDS)
    except extraction.ScannedPdfError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except concurrent.futures.TimeoutError:
        # NB: concurrent.futures.TimeoutError aliases the builtin TimeoutError
        # on Python 3.11+; this except must precede the generic Exception
        # handler below or the timeout would be reported as a parse failure.
        log.warning("extraction timed out id=%s kind=%s", upload_id, kind)
        raise HTTPException(
            status_code=422,
            detail="Файл слишком сложен для разбора за отведённое время. Попробуйте Excel/CSV.")
    except Exception:
        log.exception("extraction failed id=%s kind=%s", upload_id, kind)
        raise HTTPException(status_code=422,
                            detail="Не удалось извлечь данные из файла. Попробуйте Excel/CSV.")
    finally:
        # the document itself is never stored permanently
        storage.delete_upload(upload_id)
        log.info("upload deleted id=%s", upload_id)
    result.upload_id = upload_id
    result.suggested_industry = extraction.suggest_industry(result)
    return result


@app.post("/api/analyze")
def analyze(req: AnalysisRequest):
    try:
        result = run_analysis(req)
    except KeyError:
        raise HTTPException(status_code=400, detail="Неизвестная отрасль.")
    payload = result.model_dump(mode="json")
    storage.save_analysis(result.analysis_id, result.created_at, payload)
    log.info("analysis saved id=%s industry=%s", result.analysis_id, req.industry)
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


@app.post("/api/analysis/{analysis_id}/narrative", response_model=NarrativeResult)
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
