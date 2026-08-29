"""Metric dictionary (RU/EN synonyms), number parsing, scale & period detection."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from ..schemas import Scale

# ---------------------------------------------------------------------------
# Metric dictionary. Order of synonyms inside a metric does not matter,
# but longer / more specific phrases must win over shorter ones globally,
# which match_label() enforces by picking the longest matching pattern.
# ---------------------------------------------------------------------------
METRICS: dict[str, dict] = {
    "revenue": {
        "name": "Выручка",
        "synonyms": ["revenue", "net sales", "sales", "total revenue",
                     "выручка", "доход от реализации", "доходы от реализации"],
    },
    "cost_of_goods_sold": {
        "name": "Себестоимость",
        "synonyms": ["cost of goods sold", "cogs", "cost of sales", "cost of revenue",
                     "себестоимость", "себестоимость продаж",
                     "себестоимость реализованной продукции"],
    },
    "gross_profit": {
        "name": "Валовая прибыль",
        "synonyms": ["gross profit", "валовая прибыль"],
    },
    "operating_income": {
        "name": "Операционная прибыль (EBIT)",
        "synonyms": ["operating income", "operating profit", "ebit",
                     "операционная прибыль", "прибыль от продаж",
                     "прибыль от операционной деятельности"],
    },
    "ebitda": {
        "name": "EBITDA",
        "synonyms": ["ebitda"],
    },
    "interest_expense": {
        "name": "Процентные расходы",
        "synonyms": ["interest expense", "finance costs", "finance cost",
                     "процентные расходы", "проценты к уплате", "финансовые расходы"],
    },
    "net_income": {
        "name": "Чистая прибыль",
        # "profit before (income) tax" is deliberately NOT a synonym — a
        # different, larger figure this dictionary has no metric to hold;
        # mapping it would misreport a real filing. The long "...for the
        # year" phrase relies on match_label's long-anchor bypass below.
        "synonyms": ["net income", "net profit", "profit for the year",
                     "profit for the financial year", "profit after tax",
                     "profit after income tax",
                     "profit after income tax expense for the year",
                     "чистая прибыль", "прибыль за год", "чистая прибыль (убыток)"],
    },
    "total_assets": {
        "name": "Итого активы",
        "synonyms": ["total assets", "активы", "итого активы", "итого активов", "баланс (актив)"],
    },
    "current_assets": {
        "name": "Оборотные активы",
        "synonyms": ["current assets", "total current assets",
                     "оборотные активы", "итого оборотные активы",
                     "итого по разделу ii", "краткосрочные активы",
                     "итого краткосрочных активов"],
    },
    "cash": {
        "name": "Денежные средства",
        "synonyms": ["cash and cash equivalents", "cash",
                     "денежные средства", "денежные средства и их эквиваленты",
                     "денежные средства и денежные эквиваленты"],
    },
    "short_term_investments": {
        "name": "Краткосрочные финансовые вложения",
        "synonyms": ["short-term investments", "short term investments", "marketable securities",
                     "краткосрочные финансовые вложения", "финансовые вложения (краткосрочные)"],
    },
    "accounts_receivable": {
        "name": "Дебиторская задолженность",
        "synonyms": ["accounts receivable", "trade receivables",
                     "trade and other receivables", "receivables",
                     "дебиторская задолженность", "торговая дебиторская задолженность"],
    },
    "inventory": {
        "name": "Запасы",
        "synonyms": ["inventory", "inventories", "запасы",
                     "товарно-материальные запасы"],
    },
    "total_liabilities": {
        "name": "Итого обязательства",
        "synonyms": ["total liabilities", "обязательства",
                     "итого обязательства", "итого обязательств"],
    },
    "current_liabilities": {
        "name": "Краткосрочные обязательства",
        "synonyms": ["current liabilities", "total current liabilities",
                     "краткосрочные обязательства", "итого по разделу v",
                     "итого краткосрочных обязательств"],
    },
    "accounts_payable": {
        "name": "Кредиторская задолженность",
        "synonyms": ["accounts payable", "trade payables",
                     "trade and other payables",
                     "кредиторская задолженность", "торговая кредиторская задолженность"],
    },
    # total_debt / long_term_debt skip a bare "borrowings"/"loans" EN
    # synonym: IFRS balance sheets often list "Borrowings" twice (current +
    # non-current) with no section awareness here to tell them apart —
    # left N/A rather than risk mislabeling current debt as long-term.
    "total_debt": {
        "name": "Процентный долг",
        "synonyms": ["total debt", "total borrowings", "loans and borrowings",
                     "кредиты и займы", "процентный долг", "заемные средства",
                     "займы и кредиты"],
    },
    "shareholders_equity": {
        "name": "Собственный капитал",
        "synonyms": ["shareholders' equity", "shareholders equity", "stockholders' equity",
                     "stockholders equity", "total equity", "equity",
                     "собственный капитал", "итого капитал", "капитал и резервы",
                     "итого по разделу iii"],
    },
    "operating_cash_flow": {
        "name": "Денежный поток от операционной деятельности",
        "synonyms": ["operating cash flow", "cash flow from operating activities",
                     "net cash provided by operating activities",
                     "net cash from operating activities",
                     "денежный поток от операционной деятельности",
                     "чистые денежные средства от операционной деятельности",
                     "денежные потоки от операционной деятельности"],
    },
    "capital_expenditures": {
        "name": "Капитальные затраты (CAPEX)",
        "synonyms": ["capital expenditures", "capex", "purchases of property, plant and equipment",
                     "payments for property, plant and equipment",
                     "капитальные затраты", "приобретение основных средств"],
    },
    "shares_outstanding": {
        "name": "Количество акций",
        "synonyms": ["number of shares", "shares outstanding",
                     "количество акций", "количество акций в обращении"],
    },
    "eps": {
        "name": "Прибыль на акцию (EPS)",
        "synonyms": ["earnings per share", "eps", "базовая прибыль на акцию",
                     "прибыль на акцию"],
    },
    "share_price": {
        "name": "Цена акции",
        "synonyms": ["share price", "stock price", "цена акции"],
    },
    "market_cap": {
        "name": "Рыночная капитализация",
        "synonyms": ["market capitalization", "market cap",
                     "рыночная капитализация"],
    },
    "retained_earnings": {
        "name": "Нераспределённая прибыль",
        "synonyms": ["retained earnings", "retained profits",
                     "нераспределенная прибыль",
                     "нераспределенная прибыль (непокрытый убыток)"],
    },
    "net_ppe": {
        "name": "Основные средства",
        "synonyms": ["property, plant and equipment", "net property plant and equipment",
                     "основные средства", "основные средства (нетто)"],
    },
    "long_term_debt": {
        "name": "Долгосрочные займы",
        "synonyms": ["long-term debt", "long term borrowings",
                     "долгосрочные займы", "долгосрочные займы и кредиты",
                     "долгосрочные кредиты и займы", "долгосрочные заемные средства"],
    },
    "depreciation_amortization": {
        "name": "Амортизация",
        "synonyms": ["depreciation and amortization", "depreciation and amortisation",
                     "depreciation",
                     "амортизация", "износ и амортизация", "амортизация основных средств"],
    },
    "sga_expense": {
        "name": "Коммерческие и управленческие расходы",
        "synonyms": ["selling, general and administrative expenses", "sga",
                     "коммерческие расходы", "управленческие расходы",
                     "коммерческие и административные расходы",
                     "общие и административные расходы"],
    },
}

# Metrics reported in statements as parenthesized outflows; the engine works
# with their positive magnitude and formulas subtract them explicitly.
EXPENSE_MAGNITUDE_METRICS: frozenset[str] = frozenset(
    {"cost_of_goods_sold", "interest_expense", "capital_expenditures",
     "sga_expense", "depreciation_amortization"})

MARKET_METRICS: frozenset[str] = frozenset(
    {"market_cap", "share_price", "eps", "shares_outstanding"})
ADVANCED_METRICS: frozenset[str] = frozenset(
    {"retained_earnings", "net_ppe", "long_term_debt",
     "depreciation_amortization", "sga_expense"})
CORE_METRICS: frozenset[str] = frozenset(METRICS) - MARKET_METRICS - ADVANCED_METRICS

_norm_re = re.compile(r"[^a-zа-яё0-9 ]+")


def normalize_label(label: str) -> str:
    s = str(label).lower().replace("ё", "е")
    s = _norm_re.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


# Precompute normalized synonym -> (metric, synonym-length)
_SYNONYM_INDEX: list[tuple[str, str]] = []
for _key, _cfg in METRICS.items():
    for _syn in _cfg["synonyms"]:
        _SYNONYM_INDEX.append((normalize_label(_syn), _key))
_SYNONYM_INDEX.sort(key=lambda t: len(t[0]), reverse=True)


QUALIFIER_TOKENS: frozenset[str] = frozenset({
    # RU qualifiers that flip a line’s meaning relative to the base metric
    "нематериальн", "прочие", "прочая", "прочий", "отложенн", "изменени",
    "уменьшени", "увеличени", "поступлени", "выбыти", "авансы",
    # EN equivalents
    "decrease", "increase", "investing", "financing", "used in", "changes",
    "deferred", "other", "intangible",
    # "non " catches "non-current" (else "total non-current assets"
    # contains "current assets" once the hyphen normalizes to a space).
    # "disposal"/"proceeds" catch e.g. "Net gain on disposal of property,
    # plant and equipment", which legitimately contains a metric's synonym.
    "non ", "disposal", "proceeds",
})


def _has_qualifier(norm: str, syn: str) -> bool:
    remainder = norm.replace(syn, " ")
    return any(tok in remainder for tok in QUALIFIER_TOKENS)


# Real IFRS/English reports often spell a line item as a long sentence —
# "Profit after income tax expense for the year attributable to the owners
# of <company>" — where the company name alone can outweigh the whole
# distinctive phrase. The ≥55%-coverage rule exists to stop a short, generic
# fragment matching deep inside an unrelated sentence; a synonym already
# this long is specific enough that coincidence isn't a real risk, so it
# bypasses the ratio gate (still needs a whole-phrase, word-boundary match
# and no disqualifying qualifier). Short synonyms are unaffected.
_LONG_ANCHOR_MIN_LEN = 24


def match_label(label: str) -> Optional[tuple[str, float]]:
    """Exact normalized match → 95. Whole-phrase containment → 80, only when
    the synonym covers ≥55% of the label (waived at/above
    _LONG_ANCHOR_MIN_LEN chars), remainder carries no qualifier (finding 1)."""
    norm = normalize_label(label)
    if not norm:
        return None
    for syn, key in _SYNONYM_INDEX:
        if norm == syn:
            return key, 95.0
    for syn, key in _SYNONYM_INDEX:
        if len(syn) < 4:
            continue
        if not re.search(rf"(?:^|\s){re.escape(syn)}(?:$|\s)", norm):
            continue
        if len(syn) < _LONG_ANCHOR_MIN_LEN and len(syn) / len(norm) < 0.55:
            continue
        if _has_qualifier(norm, syn):
            continue
        return key, 80.0
    return None


# ---------------------------------------------------------------------------
# Number parsing
# ---------------------------------------------------------------------------
_NA_TOKENS = {"", "-", "—", "–", "n/a", "na", "нет данных", "x", "*"}


def parse_number(raw) -> Optional[float]:
    """Parse numbers in RU/EN formats. Returns None for N/A tokens.

    Handles: parentheses negatives "(1 234)", thin/regular spaces,
    "1,234.56", "1.234,56", "1 234,5", trailing currency symbols.
    """
    if raw is None:
        return None
    if isinstance(raw, bool):          # bool subclasses int; TRUE cells are not numbers
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip().lower()
    if s in _NA_TOKENS:
        return None
    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative = True
        s = s[1:-1]
    s = s.replace("\u00a0", " ").replace("\u202f", " ")
    s = re.sub(r"[^\d,.\-+ ]", "", s).strip()
    if not s or s in {"-", "+"}:
        return None
    s = s.replace(" ", "")
    if "," in s and "." in s:
        # the rightmost separator is decimal
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) != 3:
            s = s.replace(",", ".")       # decimal comma
        else:
            s = s.replace(",", "")        # thousands comma
    elif "." in s:
        parts = s.split(".")
        if len(parts) > 2:
            if all(len(p) == 3 for p in parts[1:]):
                s = s.replace(".", "")   # 1.234.567 → 1234567
            else:
                return None
        elif (len(parts) == 2 and len(parts[1]) == 3
              and parts[0] not in {"0", "-0", "+0"}):
            s = s.replace(".", "")       # 1.234 → 1234 (mirror of '1,234')
    try:
        value = float(s)
    except ValueError:
        return None
    return -value if negative else value


# ---------------------------------------------------------------------------
# Scale / currency / period / audit detection from free text
# ---------------------------------------------------------------------------
def detect_scale(text: str) -> Scale:
    t = text.lower()
    if re.search(r"(в|in)\s+млрд|billions?", t):
        return Scale.billions
    if re.search(r"(в|in)\s+(млн|миллионах)|in millions|млн\.?\s*(руб|тенге|долл|usd|kzt|rub)", t):
        return Scale.millions
    if re.search(r"(в|in)\s+(тыс|тысячах)|in thousands|тыс\.?\s*(руб|тенге|долл|usd|kzt|rub)", t):
        return Scale.thousands
    return Scale.units


_CURRENCIES = [
    ("KZT", ["kzt", "тенге", "₸"]),
    ("RUB", ["rub", "руб", "₽"]),
    ("USD", ["usd", "долл", "$", "u.s. dollar"]),
    ("EUR", ["eur", "евро", "€"]),
]


def detect_currency(text: str) -> Optional[str]:
    t = text.lower()
    for code, tokens in _CURRENCIES:
        if any(tok in t for tok in tokens):
            return code
    return None


_YEAR_RE = re.compile(r"\b(19\d{2}|20\d{2})\b")


def detect_periods(cells: list[str]) -> list[str]:
    """Return unique period labels (years) found in header cells, newest first."""
    years: list[str] = []
    for c in cells:
        for m in _YEAR_RE.findall(str(c)):
            if m not in years:
                years.append(m)
    return sorted(years, reverse=True)


def detect_audited(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ["аудирован", "аудиторское заключение", "audited",
                                "independent auditor"])


# ---------------------------------------------------------------------------
# Quarter / half-year period detection (P7.T3c). Complements the plain-year
# detect_periods() above: recognizes RU/intl quarter markers and dd.mm.yyyy
# quarter-end dates, producing a *canonical* label so the same real-world
# period spelled differently across cells/tables still merges into one
# column — "I кв. 2024", "1 квартал 2024", "Q1 2024" and "31.03.2024" all
# canonicalize to "Q1 2024".
#
# Deliberately scoped: a dd.mm.yyyy date with mm == "12" is NEVER read as a
# quarter marker, even though Q4 conventionally ends in December. A plain
# annual year-end date ("31.12.2024") is far more common in real statements
# (it is exactly what demo_company.csv and the existing golden fixtures use)
# and must keep resolving through the untouched bare-year path below rather
# than being reinterpreted as "Q4 2024".
# ---------------------------------------------------------------------------
_ROMAN_QUARTER = {"i": 1, "ii": 2, "iii": 3, "iv": 4}
_ARABIC_QUARTER = {"1": 1, "2": 2, "3": 3, "4": 4}

_QUARTER_WORD_RE = re.compile(
    r"\b(?P<q>iv|iii|ii|i|[1-4])[\-\s]*(?:й|ой|ый)?\s*(?:кв\.?|квартал\w*|quarter)"
    r"\D{0,12}?(?P<year>19\d{2}|20\d{2})",
    re.IGNORECASE,
)
_Q_LETTER_RE = re.compile(r"\bQ(?P<q>[1-4])\D{0,12}?(?P<year>19\d{2}|20\d{2})", re.IGNORECASE)
# dd.mm.yyyy, mm restricted to {03, 06, 09} — see scoping note above.
_QUARTER_DATE_RE = re.compile(r"\b\d{1,2}\.(?P<m>03|06|09)\.(?P<year>(?:19|20)\d{2})\b")
_DATE_MONTH_TO_QUARTER = {"03": 1, "09": 3}  # mm == "06" is handled as half-year below
_HALF_YEAR_DATE_MONTHS = {"06"}

# Looser marker (no year required) used only to recognize a *candidate*
# stacked-header fragment row as period-bearing, e.g. "I квартал" on its own
# row with the year supplied by a neighboring row (see extraction.py's
# multi-row header merge, P7.T3b). Never used to build a canonical label.
_QUARTER_MARKER_ONLY_RE = re.compile(
    r"\b(?:iv|iii|ii|i|[1-4])[\-\s]*(?:й|ой|ый)?\s*(?:кв\.?|квартал\w*|quarter)\b|\bQ[1-4]\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Period:
    """A single detected reporting period: a canonical, format-independent
    label plus enough structure to compare/group periods (P7.T3c)."""
    label: str        # canonical display label: "2024", "Q1 2024", "H1 2024"
    kind: str          # "annual" | "quarter" | "half-year"
    sort_key: tuple    # chronologically comparable, newest = greatest


# Tie-break at the same (year, end_month): an annual figure is the most
# "complete" period covering that month, a half-year next, a quarter least.
_KIND_RANK = {"quarter": 1, "half-year": 2, "annual": 3}


def _make_period(year: str, kind: str, sub_label: str = "") -> Period:
    year_i = int(year)
    if kind == "annual":
        return Period(label=year, kind="annual", sort_key=(year_i, 12, _KIND_RANK["annual"]))
    if kind == "half-year":
        end_month = 6 if sub_label == "H1" else 12
        return Period(label=f"{sub_label} {year}", kind="half-year",
                      sort_key=(year_i, end_month, _KIND_RANK["half-year"]))
    q = int(sub_label[1])
    return Period(label=f"Q{q} {year}", kind="quarter",
                  sort_key=(year_i, q * 3, _KIND_RANK["quarter"]))


def _detect_quarter_or_half(s: str) -> Optional[Period]:
    m = _Q_LETTER_RE.search(s)
    if m:
        return _make_period(m.group("year"), "quarter", f"Q{m.group('q')}")
    m = _QUARTER_WORD_RE.search(s)
    if m:
        q = _ROMAN_QUARTER.get(m.group("q").lower()) or _ARABIC_QUARTER.get(m.group("q").lower())
        if q:
            return _make_period(m.group("year"), "quarter", f"Q{q}")
    m = _QUARTER_DATE_RE.search(s)
    if m:
        mm = m.group("m")
        if mm in _HALF_YEAR_DATE_MONTHS:
            return _make_period(m.group("year"), "half-year", "H1")
        return _make_period(m.group("year"), "quarter", f"Q{_DATE_MONTH_TO_QUARTER[mm]}")
    return None


def detect_period_objects(cells: list[str]) -> list[Period]:
    """Return unique Period objects found across header cells, newest first.
    Recognizes plain years (via the same _YEAR_RE as detect_periods, so
    year-only headers behave identically) plus quarter/half-year markers
    (P7.T3c). Each cell contributes at most one period."""
    seen: dict[str, Period] = {}
    for c in cells:
        s = str(c)
        p = _detect_quarter_or_half(s)
        if p is None:
            years = _YEAR_RE.findall(s)
            if years:
                p = _make_period(years[0], "annual")
        if p is not None and p.label not in seen:
            seen[p.label] = p
    return sorted(seen.values(), key=lambda p: p.sort_key, reverse=True)


def has_quarter_marker_without_year(text: str) -> bool:
    """True for a bare quarter/half-year *word* marker with no accompanying
    year in the same cell (e.g. "I квартал", "Q1") — used by
    extraction_headers.has_period_fragment to recognize a stacked-header
    fragment that needs a neighboring row's year to complete (P7.T3b).

    Deliberately excludes bare years (round 1, F1): a cell that already
    resolves to a *complete* period on its own via detect_period_objects is
    NOT fragment evidence — either the row it's in would already have been
    picked as the header directly, or (the regression this guards against)
    the "year" is coincidental, e.g. a title row's date embedded in prose
    ("на 31 декабря 2024 года") next to an unrelated «Код» column, which
    must never be swept into the header on that basis alone."""
    s = str(text)
    return bool(_QUARTER_MARKER_ONLY_RE.search(s))
