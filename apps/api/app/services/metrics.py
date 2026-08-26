"""Metric dictionary (RU/EN synonyms), number parsing, scale & period detection."""
from __future__ import annotations

import re
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
        "synonyms": ["interest expense", "finance costs",
                     "процентные расходы", "проценты к уплате", "финансовые расходы"],
    },
    "net_income": {
        "name": "Чистая прибыль",
        "synonyms": ["net income", "net profit", "profit for the year",
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
        "synonyms": ["accounts receivable", "trade receivables", "receivables",
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
                     "кредиторская задолженность", "торговая кредиторская задолженность"],
    },
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
                     "денежный поток от операционной деятельности",
                     "чистые денежные средства от операционной деятельности",
                     "денежные потоки от операционной деятельности"],
    },
    "capital_expenditures": {
        "name": "Капитальные затраты (CAPEX)",
        "synonyms": ["capital expenditures", "capex", "purchases of property, plant and equipment",
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
}

_norm_re = re.compile(r"[^a-zа-яё0-9 ]+")


def normalize_label(label: str) -> str:
    s = str(label).lower().replace("ё", "е").replace("’", "'")
    s = _norm_re.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


# Precompute normalized synonym -> (metric, synonym-length)
_SYNONYM_INDEX: list[tuple[str, str]] = []
for _key, _cfg in METRICS.items():
    for _syn in _cfg["synonyms"]:
        _SYNONYM_INDEX.append((normalize_label(_syn), _key))
_SYNONYM_INDEX.sort(key=lambda t: len(t[0]), reverse=True)


def match_label(label: str) -> Optional[tuple[str, float]]:
    """Return (metric_key, confidence 0..100) for a document row label, or None.

    Exact normalized match wins (95). Otherwise the longest synonym contained
    in the label as a whole phrase wins (80). Substring-only matches are not
    accepted for very short synonyms to avoid false positives.
    """
    norm = normalize_label(label)
    if not norm:
        return None
    for syn, key in _SYNONYM_INDEX:
        if norm == syn:
            return key, 95.0
    for syn, key in _SYNONYM_INDEX:
        if len(syn) < 4:
            continue
        if re.search(rf"(?:^|\s){re.escape(syn)}(?:$|\s|,)", norm):
            # Guard: "total assets" must not be captured by "assets" first —
            # ordering by length already ensures the longer phrase wins.
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
