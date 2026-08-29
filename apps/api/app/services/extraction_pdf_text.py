"""Word-position table reconstruction for text-layer PDF pages that have no
ruling-line tables (English/IFRS support — see
.superpowers/founder-r1/ifrs-en-report.md).

Real annual reports are very often typeset with NO drawn table borders at
all — columns exist only as x-coordinate alignment on the page, not as
literal repeated-space runs in the underlying text stream. On such a page,
pdfplumber's lattice-based `extract_tables()` finds nothing (there are no
lines to detect), and `extraction_ocr.lines_to_matrix` (tuned for
tesseract's *preserved* multi-space output, `preserve_interword_spaces=1`)
also finds nothing when fed plain, non-layout `extract_text()`: that call
joins every word on a line with a single space regardless of how far apart
the words actually sit on the page. Measured directly against a real IFRS
annual report: this combination extracted ZERO tables, ZERO metrics, ZERO
periods, and — because nothing ever iterated a row — ZERO warnings, a
confident-looking empty result for a document that was never actually
empty.

This module reconstructs rows/cells directly from pdfplumber word bounding
boxes instead of whitespace:

  1. Words on the same visual line (`top` within `Y_TOLERANCE`) form a row.
  2. Every "bare number" token on the page (digits/punctuation only, no
     letters — a real accounting figure, or a note/footnote reference
     number) contributes its RIGHT edge (`x1`) to a page-wide 1D
     clustering pass, producing a small number of "column bands". Financial
     statements right-align figures within a column; measured on a real
     annual report, same-column right edges cluster within ~3pt of each
     other while distinct columns sit 50pt+ apart — a far more reliable
     signal than left edges or gap-to-previous-word, which fold under
     narrow value-to-value gaps (as little as 9pt) and inconsistent
     trailing footnote-reference numbers.
  3. Every row (including the header) is re-expressed against those SAME
     bands: label text is everything before the row's first bare-number
     token; each bare-number token joins the nearest band within a
     font-size-relative cutoff (otherwise dropped — a stray reference
     number too far from any real column, e.g. a footnote mark, never
     contaminates a value cell); non-numeric text AFTER the first
     bare-number token (trailing reference codes like "SME(5.5)(a)") is
     always dropped, never appended to the label — appending it would
     otherwise corrupt an exact label match into a failed containment
     match (measured: "Revenue" + a trailing code drops the match
     entirely).

This produces a matrix with a FIXED column count shared by every row on the
page, so extraction.py's existing header detection / period-column mapping
(built once from the header row and applied by column INDEX to every data
row — see `extraction._extract_from_tables`) works exactly as it does for
CSV/XLSX. No changes needed there.

A second pass, `_merge_wrapped_labels`, rejoins a label that legitimately
wraps across two physical PDF lines — e.g. a long "profit attributable to
the owners of <company name>" sentence where the company name spills onto
the next physical line, which is also where that row's real values sit.
Merging is conditional on BOTH: the earlier row is genuinely label-only (no
SUBSTANTIAL number in it — note/footnote reference numbers don't count,
see `_SUBSTANTIAL_NUMBER_RE`), and the later row's own label does not
already match a metric on its own — this protects short labels like
"Receivables" from ever being merged with an unrelated preceding
section-header line.
"""
from __future__ import annotations

import re

from . import metrics as M

Y_TOLERANCE = 3.0          # points: same visual line
# Column bands are built from EVERY bare-number token on the page,
# including the header's own "2025"/"2024" — and a header year sits
# noticeably left of its column's right-aligned data (measured ~15-17pt on
# a real annual report, since header text is centered/left-set over a
# column sized for up to 11-digit figures). BAND_GAP must exceed that so
# the header year joins its own column's cluster rather than forming a
# stray extra band — while staying well under the real gap BETWEEN
# distinct columns (~40pt+ on the same file) so genuine columns never
# merge into one.
BAND_GAP_RATIO = 2.5       # of font size: minimum gap to start a new column band
BAND_GAP_FLOOR = 20.0
ASSIGN_RATIO = 2.0         # of font size: max distance from a band center to join it
ASSIGN_FLOOR = 8.0
DEFAULT_FONT_SIZE = 10.0

# A token that is ENTIRELY digits/punctuation — a real accounting figure or
# a bare note/footnote reference number. Letters anywhere (e.g. a trailing
# "SME(5.5)(a)" reference code) disqualify it, by design: parse_number()
# itself is deliberately NOT reused here — it is tolerant of stray
# characters (designed to parse an already-isolated cell), which is exactly
# why it can't double as a token classifier: parse_number("SME(5.5)(a)")
# returns 5.5, which would make a reference code look like a real number.
_BARE_NUMBER_RE = re.compile(r"^\(?-?[0-9][0-9,.]*\)?$|^[-–—]$")

# A "real" financial figure specifically for the label-wrap merge decision:
# thousands-grouped or decimal, which real values in this document class
# always are and bare note/footnote/line reference numbers never are.
_SUBSTANTIAL_NUMBER_RE = re.compile(
    r"^\(?-?[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?\)?$|^\(?-?[0-9]+\.[0-9]+\)?$")


def _cluster_rows(words: list[dict]) -> list[list[dict]]:
    ws = sorted(words, key=lambda w: (w["top"], w["x0"]))
    rows: list[list[dict]] = []
    for w in ws:
        if rows and w["top"] - rows[-1][-1]["top"] <= Y_TOLERANCE:
            rows[-1].append(w)
        else:
            rows.append([w])
    return rows


def _page_font_size(words: list[dict]) -> float:
    sizes = sorted(w["size"] for w in words if w.get("size"))
    return sizes[len(sizes) // 2] if sizes else DEFAULT_FONT_SIZE


def _column_bands(words: list[dict], font_size: float) -> list[float]:
    """Right-edge (x1) cluster centers, left to right, over every bare-number
    token on the page (module docstring, point 2)."""
    x1s = sorted(w["x1"] for w in words if _BARE_NUMBER_RE.match(w["text"]))
    if not x1s:
        return []
    gap = max(BAND_GAP_FLOOR, font_size * BAND_GAP_RATIO)
    clusters: list[list[float]] = [[x1s[0]]]
    for x in x1s[1:]:
        if x - clusters[-1][-1] <= gap:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    return [sum(c) / len(c) for c in clusters]


def _row_to_cells(row: list[dict], bands: list[float], cutoff: float) -> list[str]:
    ws = sorted(row, key=lambda w: w["x0"])
    label_words: list[str] = []
    band_words: list[list[str]] = [[] for _ in bands]
    seen_number = False
    for w in ws:
        text = w["text"]
        is_number = bool(_BARE_NUMBER_RE.match(text))
        if not seen_number and not is_number:
            label_words.append(text)
            continue
        if is_number:
            seen_number = True
            if bands:
                idx = min(range(len(bands)), key=lambda i: abs(bands[i] - w["x1"]))
                if abs(bands[idx] - w["x1"]) <= cutoff:
                    band_words[idx].append(text)
            continue
        # Non-numeric text after the first number on this row: a trailing
        # reference code — dropped, never appended to the label or a cell.
    return [" ".join(label_words)] + [" ".join(bw) for bw in band_words]


def _merge_wrapped_labels(matrix: list[list[str]]) -> list[list[str]]:
    out: list[list[str]] = []
    i, n = 0, len(matrix)
    while i < n:
        cells = matrix[i]
        has_substantial = any(_SUBSTANTIAL_NUMBER_RE.match(c) for c in cells[1:] if c)
        if cells and cells[0] and not has_substantial and i + 1 < n:
            nxt = matrix[i + 1]
            nxt_substantial = any(_SUBSTANTIAL_NUMBER_RE.match(c) for c in nxt[1:] if c)
            if nxt_substantial and nxt[0] and M.match_label(nxt[0]) is None:
                merged_label = f"{cells[0]} {nxt[0]}".strip()
                out.append([merged_label] + list(nxt[1:]))
                i += 2
                continue
        out.append(cells)
        i += 1
    return out


def words_to_matrix(page) -> list[list[str]]:
    """Reconstructs a [[label, *values], ...] matrix from a page's word
    positions — the text-layer counterpart to extraction_ocr.lines_to_matrix
    for pages with no ruling-line tables. Returns [] when the page has no
    bare-number tokens at all (nothing to anchor columns to, e.g. a pure
    narrative page) — the caller's existing "no table on this page"
    handling is unchanged."""
    words = page.extract_words(extra_attrs=["size"])
    if not words:
        return []
    font_size = _page_font_size(words)
    bands = _column_bands(words, font_size)
    if not bands:
        return []
    cutoff = max(ASSIGN_FLOOR, font_size * ASSIGN_RATIO)
    matrix = [_row_to_cells(row, bands, cutoff) for row in _cluster_rows(words)]
    matrix = [cells for cells in matrix if any(c for c in cells)]
    return _merge_wrapped_labels(matrix)
