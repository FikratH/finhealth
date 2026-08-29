"""English/IFRS extraction support (founder-r1): a real IFRS-for-SMEs
annual report (Pinnacle IFRS for SME Limited, gitignored — never committed;
see .superpowers/founder-r1/ifrs-en-report.md) extracted ZERO values, ZERO
periods, and ZERO warnings before this work — a confident-looking empty
result for a document that was never actually empty. Root cause: the file
has no ruling-line tables at all (columns are pure x-position alignment),
so pdfplumber's lattice `extract_tables()` found nothing, and the old
whitespace-run fallback (`extraction_ocr.lines_to_matrix`, tuned for
tesseract's *preserved* multi-space OCR output) also found nothing against
plain, non-layout `extract_text()`, which collapses every inter-word gap to
a single space regardless of true column position.

These tests exercise the real fix (`extraction_pdf_text.words_to_matrix`,
the label-wrap merge, the long-anchor `match_label` bypass, the new EN/IFRS
synonyms, and the near-total-miss honesty warning) against a REAL PDF built
right here — hand-rolled PDF bytes (Courier, a fixed-width standard font,
so column right-edges are exactly computable), not a fixture file and not
an image: no ruling lines, no PDF-writing library dependency (none is in
requirements — same reasoning as test_ocr.py's pypdfium2-built fixtures,
just without the OCR/rasterization step since this needs a real *text*
layer, not a scan).
"""
from __future__ import annotations

import io
from pathlib import Path

import pdfplumber
from fastapi.testclient import TestClient

from app import main
from app.services import extraction
from app.services import extraction_pdf_text as EPT

GOLDEN = Path(__file__).resolve().parent / "golden"

client = TestClient(app=main.app)

# ---------------------------------------------------------------------------
# Minimal real-PDF builder: absolute-positioned Courier text objects, no
# ruling lines. Courier is fixed-width (0.6 * font size per character in
# the standard PDF metrics), so a cell's right edge is exactly computable —
# lets these fixtures right-align numeric columns the way real financial
# statements do, which is the exact signal words_to_matrix's column-band
# clustering relies on (see that module's docstring).
# ---------------------------------------------------------------------------
FONT_SIZE = 10
CHAR_W = FONT_SIZE * 0.6
LABEL_X = 72.0
NOTE_X1 = 340.0
VAL1_X1 = 430.0
VAL2_X1 = 510.0
REF_X1 = 580.0


def _right(text: str, x1: float) -> float:
    return x1 - len(text) * CHAR_W


def _esc(text: str) -> str:
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _build_pdf(placements: list[tuple[float, float, str]], page_size=(612, 792)) -> bytes:
    parts = ["BT", f"/F1 {FONT_SIZE} Tf"]
    for x, y, text in placements:
        if text:
            parts.append(f"1 0 0 1 {x:.2f} {y:.2f} Tm ({_esc(text)}) Tj")
    parts.append("ET")
    content = "\n".join(parts).encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_size[0]} {page_size[1]}] "
         f"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>").encode("latin-1"),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
        f"<< /Length {len(content)} >>\nstream\n".encode("latin-1") + content + b"\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode("latin-1") + obj + b"\nendobj\n"
    xref_offset = len(out)
    n = len(objects) + 1
    out += f"xref\n0 {n}\n".encode("latin-1") + b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode("latin-1")
    out += f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode("latin-1")
    return bytes(out)


class _RowBuilder:
    """Lays out rows top-down at a fixed line height, right-aligning the
    Note/value/reference cells the way a real annual report does."""

    def __init__(self):
        self.placements: list[tuple[float, float, str]] = []
        self.y = 750.0

    def row(self, label="", note="", val1="", val2="", ref=""):
        if label:
            self.placements.append((LABEL_X, self.y, label))
        if note:
            self.placements.append((_right(note, NOTE_X1), self.y, note))
        if val1:
            self.placements.append((_right(val1, VAL1_X1), self.y, val1))
        if val2:
            self.placements.append((_right(val2, VAL2_X1), self.y, val2))
        if ref:
            self.placements.append((_right(ref, REF_X1), self.y, ref))
        self.y -= 15.0


def _build_ifrs_statement_pdf() -> bytes:
    """A synthetic, no-ruling-lines IFRS-style statement set: an income
    statement (by-function presentation, unlike the real Pinnacle file's
    by-nature presentation — complementary coverage for gross_profit/
    operating_income), a balance sheet, and one cash-flow line. Includes,
    deliberately, everything that broke on the real file: a "Note" column
    plus two value columns with no drawn borders, a trailing footnote-style
    reference code on the same line as real values ("Finance costs"), a
    label wrapping across two physical lines ("Profit after income tax
    expense... / ...of Acme IFRS Trading Limited"), and both a current and
    non-current section for assets/liabilities (the "total non-current
    assets" vs. "total ... assets" collision found on the real file)."""
    b = _RowBuilder()
    b.row(label="Acme IFRS Trading Limited")
    b.row(label="Statement of profit or loss and other comprehensive income")
    b.row(label="For the year ended 31 December 2025")
    b.row(label="Note", val1="2025", val2="2024")
    b.row(label="CU CU")
    b.row(label="Revenue", note="3", val1="9,000,000", val2="8,200,000")
    b.row(label="Cost of sales", val1="(5,400,000)", val2="(4,900,000)")
    b.row(label="Gross profit", val1="3,600,000", val2="3,300,000")
    b.row(label="Operating expenses", note="4", val1="(1,200,000)", val2="(1,100,000)")
    b.row(label="Operating profit", val1="2,400,000", val2="2,200,000")
    b.row(label="Finance costs", note="5", val1="(150,000)", val2="(180,000)", ref="ABC(5.1)(a)")
    b.row(label="Profit before income tax expense", val1="2,250,000", val2="2,020,000")
    b.row(label="Income tax expense", note="6", val1="(450,000)", val2="(404,000)")
    b.row(label="Profit after income tax expense for the year attributable to the owners")
    b.row(label="of Acme IFRS Trading Limited", note="33", val1="1,800,000", val2="1,616,000")
    b.row()
    b.row(label="Statement of financial position")
    b.row(label="As at 31 December 2025")
    b.row(label="Note", val1="2025", val2="2024")
    b.row(label="CU CU")
    b.row(label="Total current assets", val1="6,000,000", val2="5,200,000")
    b.row(label="Total non-current assets", val1="9,000,000", val2="8,300,000")
    b.row(label="Total assets", val1="15,000,000", val2="13,500,000")
    b.row(label="Cash and cash equivalents", note="8", val1="1,200,000", val2="900,000")
    b.row(label="Trade and other receivables", note="9", val1="1,100,000", val2="980,000")
    b.row(label="Inventories", note="10", val1="1,500,000", val2="1,400,000")
    b.row(label="Property, plant and equipment", note="16", val1="6,800,000", val2="6,300,000")
    b.row(label="Total current liabilities", val1="2,500,000", val2="2,200,000")
    b.row(label="Total non-current liabilities", val1="3,500,000", val2="3,400,000")
    b.row(label="Total liabilities", val1="6,000,000", val2="5,600,000")
    b.row(label="Trade and other payables", note="20", val1="1,000,000", val2="880,000")
    b.row(label="Total equity", val1="9,000,000", val2="7,900,000")
    b.row(label="Retained profits", val1="4,200,000", val2="3,000,000")
    b.row()
    b.row(label="Statement of cash flows")
    b.row(label="Note", val1="2025", val2="2024")
    b.row(label="Net cash from operating activities", val1="2,600,000", val2="2,300,000")
    b.row(label="Payments for property, plant and equipment", val1="(900,000)", val2="(700,000)")
    return _build_pdf(b.placements)


_EXPECTED_LATEST = {
    "revenue": 9_000_000.0, "cost_of_goods_sold": 5_400_000.0, "gross_profit": 3_600_000.0,
    "operating_income": 2_400_000.0, "interest_expense": 150_000.0, "net_income": 1_800_000.0,
    "total_assets": 15_000_000.0, "current_assets": 6_000_000.0, "cash": 1_200_000.0,
    "accounts_receivable": 1_100_000.0, "inventory": 1_500_000.0, "net_ppe": 6_800_000.0,
    "total_liabilities": 6_000_000.0, "current_liabilities": 2_500_000.0,
    "accounts_payable": 1_000_000.0, "shareholders_equity": 9_000_000.0,
    "retained_earnings": 4_200_000.0, "operating_cash_flow": 2_600_000.0,
    "capital_expenditures": 900_000.0,
}
_EXPECTED_PREVIOUS = {
    "revenue": 8_200_000.0, "cost_of_goods_sold": 4_900_000.0, "gross_profit": 3_300_000.0,
    "operating_income": 2_200_000.0, "interest_expense": 180_000.0, "net_income": 1_616_000.0,
    "total_assets": 13_500_000.0, "current_assets": 5_200_000.0, "cash": 900_000.0,
    "accounts_receivable": 980_000.0, "inventory": 1_400_000.0, "net_ppe": 6_300_000.0,
    "total_liabilities": 5_600_000.0, "current_liabilities": 2_200_000.0,
    "accounts_payable": 880_000.0, "shareholders_equity": 7_900_000.0,
    "retained_earnings": 3_000_000.0, "operating_cash_flow": 2_300_000.0,
    "capital_expenditures": 700_000.0,
}


def _values(res, previous=False) -> dict:
    src = res.previous_values if previous else res.values
    return {v.metric: v.value for v in src if v.value is not None}


def test_no_ruling_line_pdf_extracts_every_expected_metric_both_periods():
    """The core regression: a real (if synthetic) IFRS statement set with
    NO drawn table borders — exactly Pinnacle's structure — must extract
    every metric it actually contains, in both periods, with correct
    values. Before this work this returned {} for the whole document."""
    res = extraction.extract(_build_ifrs_statement_pdf(), "pdf")
    assert res.periods == ["2025", "2024"]
    assert res.latest_period == "2025" and res.previous_period == "2024"
    assert _values(res) == _EXPECTED_LATEST
    assert _values(res, previous=True) == _EXPECTED_PREVIOUS


def test_wrapped_label_across_two_lines_still_matches_net_income():
    """'Profit after income tax expense for the year attributable to the
    owners' / 'of Acme IFRS Trading Limited' are two physical PDF lines —
    the values sit on the second. Isolated, neither line's own label text
    matches net_income; only the merged label does (via match_label's
    long-anchor bypass)."""
    res = extraction.extract(_build_ifrs_statement_pdf(), "pdf")
    net_income = next(v for v in res.values if v.metric == "net_income")
    assert net_income.value == 1_800_000.0
    assert "attributable to the owners" in net_income.original_label
    assert "Acme IFRS Trading Limited" in net_income.original_label


def test_trailing_reference_code_never_corrupts_the_adjacent_value():
    """"Finance costs" carries a same-line trailing footnote code
    ("ABC(5.1)(a)") the way the real file's "SME(5.5)(a)"-style references
    do. It must be dropped, not merged into the neighboring value cell —
    proven by getting the exact right number, not a garbled one."""
    res = extraction.extract(_build_ifrs_statement_pdf(), "pdf")
    fc = next(v for v in res.values if v.metric == "interest_expense")
    assert fc.value == 150_000.0


def test_non_current_sections_never_pollute_the_current_metric():
    """Regression for a real false-positive found on the actual Pinnacle
    file: "Total non-current assets" contains "current assets" as a
    trailing substring once normalize_label turns the hyphen into a space,
    and would otherwise satisfy match_label's containment rule. Proven by
    the ABSENCE of a duplicate-value warning — if the qualifier guard
    weren't in place, the non-current figure would at least contend for
    the slot and get flagged, even though document order means the correct
    current-assets value still wins either way."""
    res = extraction.extract(_build_ifrs_statement_pdf(), "pdf")
    assert _values(res)["current_assets"] == 6_000_000.0
    assert _values(res)["current_liabilities"] == 2_500_000.0
    assert not any("Оборотные активы" in w or "Краткосрочные обязательства" in w
                   for w in res.warnings)


def test_near_total_miss_on_a_real_pdf_warns_instead_of_silent_empty():
    """The honesty-law regression this whole task started from: a
    real, non-empty PDF whose labels this engine cannot recognize at all
    must come back with a warning, not a calm all-N/A form indistinguishable
    from an honestly-empty file."""
    b = _RowBuilder()
    b.row(label="Zyxwvutsrq Corporation - annual bulletin")
    b.row(label="For the reporting period ended 31 December 2025")
    for i in range(20):
        b.row(label=f"Miscellaneous unindexed reference line {i}",
              val1=f"{1000 + i}", val2=f"{900 + i}")
    res = extraction.extract(_build_pdf(b.placements), "pdf")
    assert not any(v.value is not None for v in res.values)
    assert any("Не удалось распознать показатели" in w for w in res.warnings)


def test_determinism_across_two_runs_through_the_real_process_pool():
    """Runs the synthetic PDF through the actual spawned ProcessPoolExecutor
    (POST /api/upload + POST /api/extract, exactly the production path —
    see test_extract_pool.py) TWICE and requires byte-identical JSON.
    extract() takes bytes in, ExtractionResult out with no shared state, so
    this is the same determinism guarantee the CSV/XLSX goldens already
    rely on, now proven for the new PDF word-position path specifically."""
    data = _build_ifrs_statement_pdf()
    results = []
    for _ in range(2):
        up = client.post("/api/upload", files={"file": ("ifrs.pdf", data, "application/pdf")})
        assert up.status_code == 200, up.text
        upload_id = up.json()["upload_id"]
        resp = client.post("/api/extract", json={"upload_id": upload_id})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        body.pop("upload_id", None)  # a fresh, expected-to-differ id per run
        results.append(body)
    assert results[0] == results[1]


# ---------------------------------------------------------------------------
# EN/IFRS CSV + XLSX goldens (tests/golden/ifrs_en_*): the same new
# synonyms and qualifier guards through the plain, already-tabular formats —
# no word-position reconstruction involved, isolating "did the dictionary
# change do the right thing" from "did the PDF column reconstruction."
# ---------------------------------------------------------------------------
def test_en_csv_golden_income_statement():
    res = extraction.extract_from_csv((GOLDEN / "ifrs_en_income_statement.csv").read_bytes())
    vals = _values(res)
    assert vals["revenue"] == 5_245_900.0
    assert vals["cost_of_goods_sold"] == 3_271_100.0
    assert vals["gross_profit"] == 1_974_800.0
    assert vals["operating_income"] == 756_400.0
    assert vals["interest_expense"] == 94_300.0
    assert vals["net_income"] == 498_600.0
    assert vals["depreciation_amortization"] == 210_400.0
    assert res.latest_period == "2024" and res.previous_period == "2023"


# ---------------------------------------------------------------------------
# Round 1 fixes (founder-r1 review, .superpowers/founder-r1/ifrs-en-verdict.md):
# F1 (merge relabels a section header's total from an unmatched line item's
# value), F2 (a label-region dash truncates the label and defeats the
# "non-current" qualifier guard), F3 (no fit check on the band model, so a
# non-right-aligned layout collapses silently instead of honestly).
# ---------------------------------------------------------------------------
def test_f1_section_header_followed_by_unmatched_line_item_is_not_relabeled():
    """Reproduces the verdict's exact repro shape: "Current liabilities" (a
    section header — deliberately unmapped bare "Borrowings" per
    metrics.py's total_debt comment) directly followed by "Borrowings", a
    real line item whose own label matches nothing. Before the F1 guard,
    the wrap-merge relabeled "Current liabilities Borrowings" as
    current_liabilities at the Borrowings line's value (612,278) — an 8x
    understatement of the real total (4,937,426). With no later "Total
    current liabilities" row at all in this minimal fixture, the correct
    post-fix behavior is that current_liabilities matches NOTHING — not a
    wrong number with no warning to explain it."""
    b = _RowBuilder()
    b.row(label="Note", val1="2025", val2="2024")
    b.row(label="Current liabilities")
    b.row(label="Borrowings", val1="612,278", val2="461,733")
    b.row(label="Lease liabilities", val1="133,565", val2="60,132")
    res = extraction.extract(_build_pdf(b.placements), "pdf")
    vals = _values(res)
    assert "current_liabilities" not in vals
    assert "total_debt" not in vals  # bare "Borrowings" stays unmapped, as designed


def test_f1_genuine_wrapped_label_still_merges_after_the_guard():
    """Negative case for F1: the real net_income wrap must still work — its
    earlier line ("Profit after income tax expense for the year
    attributable to the owners") only clears match_label via the
    long-anchor CONTAINMENT path (confidence 80), never an exact 95 match,
    so _is_exact_metric_name never blocks it."""
    res = extraction.extract(_build_ifrs_statement_pdf(), "pdf")
    assert _values(res)["net_income"] == 1_800_000.0


def test_f2_en_dash_separated_non_current_label_is_not_captured():
    """Reproduces the verdict's F2 repro: "Trade receivables - non-current"
    (a dash used as ordinary label punctuation, not a nil-value marker).
    Before the fix, the dash was treated as "the first number", truncating
    the label to "Trade receivables" — an EXACT synonym match at full
    confidence — before the "non " qualifier guard (added for exactly this
    class of line) ever saw the word "non-current" at all. This is the
    ONLY receivables-bearing row in the fixture, so a wrong match here is
    unambiguous: it must resolve to nothing, not a real-looking value."""
    b = _RowBuilder()
    b.row(label="Note", val1="2025", val2="2024")
    b.row(label="Trade receivables - non-current", val1="777,000", val2="666,000")
    res = extraction.extract(_build_pdf(b.placements), "pdf")
    assert "accounts_receivable" not in _values(res)


def test_f3_left_aligned_layout_fails_the_band_fit_check():
    """Reproduces the verdict's F3 repro shape: values LEFT-aligned at a
    fixed x0 instead of right-aligned — varying digit counts then scatter
    the right edges (what the whole column-band model relies on) instead of
    clustering them. words_to_matrix must recognize the reconstruction
    doesn't fit and return [], not silently keep whatever happened to
    survive."""
    placements = [(LABEL_X, 750, "Note"), (300.0, 750, "2025"), (420.0, 750, "2024")]
    y = 735.0
    # Digit counts deliberately vary wildly row to row — at a FIXED left
    # x0, this scatters right edges across tens/hundreds of points (52%
    # measured drop rate below), the opposite of the real file's measured
    # ~3pt same-column clustering. Values themselves are arbitrary digits,
    # not real figures — this fixture tests layout geometry, not content.
    rows = [
        ("Line0", "2", "1409"), ("Line1", "45", "41116573584"),
        ("Line2", "242", "890779946"), ("Line3", "2679", "98696"),
        ("Line4", "81482", "748913461122"), ("Line5", "542417", "130201276659"),
        ("Line6", "2571945", "329258"), ("Line7", "41227216", "8381094320374"),
        ("Line8", "336696312", "67"), ("Line9", "7825844140", "1109031"),
        ("Line10", "54764787985", "31879756854153"),
        ("Line11", "472646369774", "2"),
        ("Line12", "7683367452945", "22981052"),
        ("Line13", "94964520328049", "5"), ("Line14", "1", "68"),
        ("Line15", "649", "234031070"), ("Line16", "496922", "180"),
        ("Line17", "692749116", "400"), ("Line18", "790757033266", "8995970241"),
        ("Line19", "83", "301629"),
    ]
    for label, v1, v2 in rows:
        placements.append((LABEL_X, y, label))
        placements.append((300.0, y, v1))
        placements.append((420.0, y, v2))
        y -= 15.0
    data = _build_pdf(placements)
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        matrix = EPT.words_to_matrix(pdf.pages[0])
    assert matrix == []


def test_new1_header_followed_by_unmatched_first_data_row_keeps_both_periods():
    """Reproduces the verdict's NEW-1 repro shape: a header row ("Note"
    label, "2025"/"2024" band cells) directly followed by a first data row
    whose own label matches no metric. A bare year like "2025" doesn't
    satisfy _SUBSTANTIAL_NUMBER_RE (no thousands grouping, no decimal
    point), so before the fix the header itself read as "label-only" —
    exactly the shape _merge_wrapped_labels treats as a wrap candidate —
    and merged forward, discarding its own period cells for whatever the
    next row's cells happened to be
    (`out.append([merged_label] + list(nxt[1:]))`). The result was silent,
    not a crash: periods [], the previous-period value lost outright, and
    the latest value only surviving via the positional safety-net
    fallback. Both periods must survive with this exact row order."""
    b = _RowBuilder()
    b.row(label="Note", val1="2025", val2="2024")
    b.row(label="Unusual opening line item", val1="9,000,000", val2="8,200,000")
    b.row(label="Revenue", val1="5,000,000", val2="4,500,000")
    res = extraction.extract(_build_pdf(b.placements), "pdf")
    assert res.periods == ["2025", "2024"]
    assert res.latest_period == "2025" and res.previous_period == "2024"
    assert _values(res)["revenue"] == 5_000_000.0
    assert _values(res, previous=True)["revenue"] == 4_500_000.0
    assert res.warnings == []


def test_en_xlsx_golden_balance_sheet():
    res = extraction.extract_from_xlsx((GOLDEN / "ifrs_en_balance_sheet.xlsx").read_bytes())
    vals = _values(res)
    assert vals["current_assets"] == 1_808_750.0
    assert vals["total_assets"] == 4_456_800.0
    assert vals["cash"] == 385_400.0
    assert vals["accounts_receivable"] == 468_750.0
    assert vals["inventory"] == 512_600.0
    assert vals["net_ppe"] == 1_200_000.0
    assert vals["current_liabilities"] == 986_200.0
    assert vals["total_liabilities"] == 2_026_200.0
    assert vals["accounts_payable"] == 398_300.0
    assert vals["shareholders_equity"] == 2_430_600.0
    assert vals["retained_earnings"] == 800_000.0
    assert vals["operating_cash_flow"] == 620_000.0
    assert vals["capital_expenditures"] == 310_000.0
    # Same false-positive class as the PDF test above, through XLSX's plain
    # row/column path instead of word-position reconstruction.
    assert not any("Оборотные активы" in w or "Краткосрочные обязательства" in w
                   for w in res.warnings)
