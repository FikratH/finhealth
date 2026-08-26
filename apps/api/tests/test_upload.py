from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cyrillic_csv_with_multibyte_char_at_boundary_is_accepted():
    # 'я' is 2 bytes in UTF-8; position it to straddle the 4096-byte sample cut
    prefix = b"Show;2024\n" + b"a" * (4096 - 11)
    data = prefix + "яяяя;100\n".encode("utf-8")
    assert data[4095:4097].decode("utf-8", errors="ignore") != ""  # sanity: cut mid-char
    resp = client.post("/api/upload", files={"file": ("r.csv", data, "text/csv")})
    assert resp.status_code == 200
    assert resp.json()["detected_kind"] == "csv"


def test_docx_zip_is_rejected_not_treated_as_xlsx():
    import io
    import zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", "<w/>")
    resp = client.post("/api/upload",
                       files={"file": ("x.docx", buf.getvalue(), "application/octet-stream")})
    assert resp.status_code == 415


def test_extract_rejects_non_object_body_with_422():
    resp = client.post("/api/extract", json=["not", "an", "object"])
    assert resp.status_code == 422  # Pydantic validation, not a 500
