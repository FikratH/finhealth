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
# Used for BOTH band formation and the band-fit check (F3) — a lone dash
# never contributes to either (see _DASH_CHARS below): it's ambiguous on
# its own, a nil/zero value in the data columns ("51,076   -") but ordinary
# label punctuation in the label region (an en-dash separator, e.g. "Trade
# receivables – non-current"), and letting it seed or seek its own band
# would make the F2 position gate below trivially true for that same dash.
_DIGIT_NUMBER_RE = re.compile(r"^\(?-?[0-9][0-9,.]*\)?$")
_DASH_CHARS = frozenset({"-", "–", "—"})

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
    """Right-edge (x1) cluster centers, left to right, over every
    digit-bearing token on the page (module docstring, point 2). A lone
    dash never contributes (F2 residual): sitting alone in the label
    region, it would seed its OWN one-point band, which then makes the F2
    position gate in _row_to_cells trivially true for that exact dash — the
    band and the token that "fits" it would be the same point. A genuine
    nil-value dash in the data columns never needs to seed a band itself;
    the column it belongs to is already anchored by every OTHER row's real
    figure in that same position."""
    x1s = sorted(w["x1"] for w in words if _DIGIT_NUMBER_RE.match(w["text"]))
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
    first_band_x1 = bands[0] if bands else None
    for w in ws:
        text = w["text"]
        is_number = bool(_DIGIT_NUMBER_RE.match(text)) or (
            text in _DASH_CHARS and first_band_x1 is not None
            and w["x1"] >= first_band_x1 - cutoff)
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


def _is_exact_metric_name(label: str) -> bool:
    """True when `label` ALONE already resolves to an exact (95-confidence)
    metric match — i.e. its normalized text literally equals a known
    synonym, not just contains one. A section header ("Current
    liabilities") is almost always exactly this; a genuinely incomplete
    wrapped sentence ("Profit after income tax expense for the year
    attributable to the owners") is not — it only clears match_label via
    the long-anchor containment path (80), never the exact path (95),
    since its normalized text is never equal to any single synonym.
    Verified against the real file's own wrap case: the unmerged first
    line stays at 80 either way, so this check never blocks it."""
    m = M.match_label(label)
    return m is not None and m[1] == 95.0


def _has_period_cell(cells: list[str]) -> bool:
    """True when any of `cells` (a row's band values) resolves to a period
    label ("2025", "Q1 2024", ...) — the hallmark of the HEADER row itself,
    never a genuine wrapped data label (NEW-1 guard). A bare year like
    "2025" doesn't satisfy _SUBSTANTIAL_NUMBER_RE (no thousands grouping,
    no decimal point), so without this check the header row reads as
    "label-only" exactly like a genuine wrap candidate — and merging it
    forward replaces its own period-bearing cells with whatever the next
    row's cells happen to be (`out.append([merged_label] + list(nxt[1:]))`),
    silently destroying the header. Reproduced: a header immediately
    followed by a first data row whose label matches nothing merges the
    header away entirely — periods become [], the previous-period value is
    lost outright, and the latest value survives only via the positional
    safety-net fallback. A genuine wrapped label's cells are always empty
    at this point (no substantial number, and no period token either), so
    this never blocks the real net_income case."""
    return any(M.detect_period_objects([c]) for c in cells if c)


def _merge_wrapped_labels(matrix: list[list[str]]) -> list[list[str]]:
    """See module docstring. F1 guard: a row whose OWN label already names
    a metric exactly (a section header like "Current liabilities") is
    never merged forward, even when it has no numbers and the next row's
    own label doesn't match anything — that combination is exactly what a
    header followed by an unrecognized line item ("Borrowings", left
    unmapped on purpose — see metrics.py's total_debt comment) looks like,
    and merging would relabel that one line's value as the section's
    total. Found on a synthetic reproduction of the real file's own
    layout: without this guard, "Current liabilities" + "Borrowings"
    merges into a text that matches current_liabilities, attributing a
    single current-liability line's value to the whole section total.
    NEW-1 guard: a row carrying period cells (the header itself) is never
    merged forward either — see `_has_period_cell`."""
    out: list[list[str]] = []
    i, n = 0, len(matrix)
    while i < n:
        cells = matrix[i]
        has_substantial = any(_SUBSTANTIAL_NUMBER_RE.match(c) for c in cells[1:] if c)
        if (cells and cells[0] and not has_substantial
                and not _is_exact_metric_name(cells[0])
                and not _has_period_cell(cells[1:]) and i + 1 < n):
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


# F3: the right-alignment premise this whole module rests on doesn't hold
# for every layout (left-aligned columns, wildly varying value widths) — on
# those, values get silently DROPPED (never misassigned to the wrong
# column, since the cutoff still guards that), but a partial collapse
# produces no signal on its own: near_total_miss_warning only fires at
# ZERO values, so a page that keeps just enough to look plausible (e.g. the
# header losing "2025" while other numbers still land somewhere) can
# silently report the wrong year with no previous period, or drop entire
# line items with nothing to show for it. Measured on the real file: a
# healthy (right-aligned) page drops ~1.6% of its digit-bearing tokens
# (worst page 15%); synthetic left-aligned layouts drop 60-80%. 30% cleanly
# separates the two — below it, trust the reconstruction; at/above it,
# treat this page as unreconstructable and let the caller's existing
# `words_to_matrix(page) or lines_to_matrix(page_text)` fall through.
# Digits only, matching _column_bands — a lone dash never seeds or is
# required to join a band (see _column_bands), so counting it here would
# measure label-punctuation noise, not whether the figures are aligned.
BAND_FIT_MAX_DROP_RATE = 0.30


def _band_fit_ok(words: list[dict], bands: list[float], cutoff: float) -> bool:
    numbers = [w for w in words if _DIGIT_NUMBER_RE.match(w["text"])]
    if not numbers:
        return True
    dropped = sum(1 for w in numbers if min(abs(b - w["x1"]) for b in bands) > cutoff)
    return dropped / len(numbers) <= BAND_FIT_MAX_DROP_RATE


def words_to_matrix(page) -> list[list[str]]:
    """Reconstructs a [[label, *values], ...] matrix from a page's word
    positions — the text-layer counterpart to extraction_ocr.lines_to_matrix
    for pages with no ruling-line tables. Returns [] when the page has no
    bare-number tokens at all (nothing to anchor columns to, e.g. a pure
    narrative page) or when the reconstruction doesn't fit the page well
    enough to trust (F3, `_band_fit_ok`) — the caller's existing "no table
    on this page" handling covers both the same way."""
    words = page.extract_words(extra_attrs=["size"])
    if not words:
        return []
    font_size = _page_font_size(words)
    bands = _column_bands(words, font_size)
    if not bands:
        return []
    cutoff = max(ASSIGN_FLOOR, font_size * ASSIGN_RATIO)
    if not _band_fit_ok(words, bands, cutoff):
        return []
    matrix = [_row_to_cells(row, bands, cutoff) for row in _cluster_rows(words)]
    matrix = [cells for cells in matrix if any(c for c in cells)]
    return _merge_wrapped_labels(matrix)
