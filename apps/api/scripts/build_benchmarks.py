#!/usr/bin/env python3
"""Build Damodaran-derived industry benchmark ranges (Plan 2 / Task 6, Tier 1).

Downloads the January-2026-vintage Damodaran (NYU Stern) industry datafile
HTML mirrors, aggregates them into our 10 industry buckets (weighted by each
source table's own "Number of firms" column), computes good/acceptable bands
around each weighted-average center, and MERGES the result into
app/data/benchmarks.json — every field that isn't explicitly updated below
(weights, directions, excluded_ratios, category_weights, industry
name/note, non-Tier-1 ratios) is preserved byte-for-byte.

Scope (binding, see .superpowers/sdd/.../task-6-brief.md and
docs/research/benchmark-sources.md):

  Updated (Tier 1, Damodaran-sourced) ratios:
    gross_margin, operating_margin, ebitda_margin, net_margin  <- margin.html
    roe                                                        <- roe.html
    interest_coverage, debt_to_equity, net_debt_to_ebitda      <- dbtfund.html
    asset_turnover                                             <- mgnroc.html
    receivables_turnover, inventory_turnover, payables_turnover
                                                <- wcdata.html + margin.html
    pe                                                         <- pedata.html
    pb                                                         <- pbvdata.html
    ev_ebitda                                                  <- vebitda.html

  NOT updated (kept as-is, gain method="demo" only):
    current_ratio, quick_ratio, cash_ratio, ocf_ratio, liabilities_to_equity,
    debt_ratio, roa, fcf_margin — Damodaran does not publish these.
    cash_conversion — DEVIATION from the original task brief. The brief
    assumed this is a days-based cash-conversion-cycle metric derivable from
    wcdata.html. It is not: app/services/ratios.py defines cash_conversion as
    operating_cash_flow / net_income (a quality-of-earnings ratio), and every
    existing benchmark entry already uses direction="higher" for it, not
    "lower". Damodaran publishes no equivalent of OCF/NetIncome anywhere in
    these tables, so there is no honest source to derive a center from.
    Per the research doc's "never fake a distribution" rule, we leave
    cash_conversion as method="demo" for every industry.

  Banking bucket: margins/ev_ebitda/pe/pb are NOT updated from aggregation
  (garbage for financials per the research doc). Only roe and debt_to_equity
  are updated for banking, using the bank/insurance-industry subset of the
  same Damodaran tables.

Band formula v1 (binding, controller decision — NOT Damodaran's own
methodology, and deliberately NOT presented as percentiles):
    direction "higher" or "range":
        good       = [center * 0.85, center * 1.8]
        acceptable = [center * 0.45, center * 2.4]
    direction "lower":
        good       = [0, center * 1.15]
        acceptable = [0, center * 1.9]

  "range"-direction ratios (pe, pb, ev_ebitda, and debt_to_equity in the
  banking bucket) have no separate formula in the task brief, which only
  specifies "higher" and "lower". We reuse the "higher" shape for "range":
  the existing demo data for range-direction ratios already has the same
  asymmetric shape (good band's upper bound is roughly 2x its lower bound,
  acceptable widens further in both directions) as higher-direction ratios,
  and the scoring function (_score_against_benchmark in scoring.py) treats
  "range" purely as band membership, so reusing the shape is safe. Flagged
  here for visibility since it's an interpretation, not a literal brief spec.

Parsing gotchas handled (see docs/research/benchmark-sources.md):
  1. Header row position varies; we find the row whose column 0 starts with
     "Industry", not a hardcoded skiprows.
  2. "Financial Svcs. (Non-bank & Insurance" is missing its closing paren in
     mgnroc.html, vebitda.html, dbtfund.html only — patched after whitespace
     normalization regardless of which table it came from.
  3. "Heathcare Information and Technology" is misspelled in the source and
     matched as-is.
  4. Double spaces inside names (e.g. "Auto  Parts") are collapsed.
  5. "Total Market" / "Total Market (without financials)" rows are dropped.
  6. net_debt_to_ebitda draws on Damodaran's "Debt to EBITDA" column, which
     is GROSS debt / EBITDA, while our ratio is NET debt / EBITDA. Honest
     proxy note added on every updated entry.
  7. asset_turnover draws on "Sales / Invested Capital (LTM)" (mgnroc.html)
     because Damodaran does not publish Sales/Total-Assets. Honest proxy
     note added.
  8. debt_to_equity draws on "Market D/E (unadjusted)" (market-value based)
     while our ratio is book-value based (total_debt / shareholders_equity).
     Honest proxy note added.

Usage:
    python scripts/build_benchmarks.py --dry-run
    python scripts/build_benchmarks.py                 # writes benchmarks.json
    python scripts/build_benchmarks.py --cache-dir /path/to/cached/html
    python scripts/build_benchmarks.py --offline --cache-dir /path/to/html

Requires: pandas, lxml (HTML table parsing backend), certifi (TLS trust
store — the stock certifi-less urllib context fails cert verification for
this host on some Python installs).
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Optional

import pandas as pd

try:
    import certifi
    import ssl
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover - certifi ships with pip by default
    _SSL_CONTEXT = None

REPO_ROOT = Path(__file__).resolve().parent.parent
BENCHMARKS_PATH = REPO_ROOT / "app" / "data" / "benchmarks.json"
BASE_URL = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/{name}.html"
USER_AGENT = ("FinHealth-Benchmarks-Builder/1.0 "
              "(research use, non-commercial aggregation; "
              "contact: fikret.huseynov2006@gmail.com)")
AS_OF = "2026-01"
SOURCE_LABEL = "Damodaran (NYU Stern), Jan 2026"

DISCLAIMER = (
    "Отраслевые ориентиры (ratios с method=\"band-around-center-v1\") получены на основе "
    "публичных агрегированных данных Aswath Damodaran (NYU Stern), январь 2026; "
    "US Census Bureau QFR; SEC EDGAR financial statement data sets. Это не проценти́ли и не "
    "официальные нормативы — расчётные диапазоны вокруг средневзвешенного значения по отрасли, "
    "не одобренные и не проверенные указанными источниками. Часть показателей (method=\"demo\") "
    "по-прежнему остаётся демонстрационной и должна быть заменена проверенными данными в "
    "следующих итерациях (см. Tier 2/3 в docs/research/benchmark-sources.md)."
)

TABLE_NAMES = ["margin", "roe", "dbtfund", "mgnroc", "wcdata", "vebitda", "pedata", "pbvdata"]

# our bucket -> Damodaran industry names (normalized: single spaces, closing
# paren present). See docs/research/benchmark-sources.md "Industry mapping".
INDUSTRY_MAP: dict[str, list[str]] = {
    "saas": [
        "Software (System & Application)", "Software (Internet)", "Software (Entertainment)",
        "Computer Services", "Information Services",
    ],
    "retail": [
        "Retail (General)", "Retail (Special Lines)", "Retail (Grocery and Food)",
        "Retail (Distributors)", "Retail (Building Supply)", "Retail (Automotive)",
    ],
    "manufacturing": [
        "Machinery", "Electrical Equipment", "Electronics (General)",
        "Electronics (Consumer & Office)", "Auto Parts", "Rubber& Tires",
        "Packaging & Container", "Building Materials", "Construction Supplies", "Steel",
        "Chemical (Basic)", "Chemical (Diversified)", "Chemical (Specialty)",
        "Paper/Forest Products", "Furn/Home Furnishings", "Auto & Truck",
    ],
    "healthcare": [
        "Healthcare Products", "Healthcare Support Services",
        "Heathcare Information and Technology",  # sic — matches source typo
        "Hospitals/Healthcare Facilities", "Drugs (Pharmaceutical)", "Drugs (Biotechnology)",
    ],
    "banking": [
        "Bank (Money Center)", "Banks (Regional)", "Brokerage & Investment Banking",
        "Financial Svcs. (Non-bank & Insurance)", "Insurance (General)", "Insurance (Life)",
        "Insurance (Prop/Cas.)", "Reinsurance", "Investments & Asset Management",
    ],
    "energy": [
        "Oil/Gas (Integrated)", "Oil/Gas (Production and Exploration)", "Oil/Gas Distribution",
        "Oilfield Svcs/Equip.", "Coal & Related Energy", "Green & Renewable Energy", "Power",
        "Utility (General)", "Utility (Water)",
    ],
    "realestate": [
        "R.E.I.T.", "Real Estate (Development)", "Real Estate (General/Diversified)",
        "Real Estate (Operations & Services)", "Retail (REITs)", "Homebuilding",
    ],
    "telecom": [
        "Telecom (Wireless)", "Telecom. Services", "Telecom. Equipment", "Cable TV",
    ],
    "transport": [
        "Air Transport", "Transportation", "Transportation (Railroads)", "Trucking",
        "Shipbuilding & Marine",
    ],
    "aerospace_defense": ["Aerospace/Defense"],
}

# Ratios not touched at all — Damodaran has no honest source for them.
NOT_UPDATED_RATIOS = {
    "current_ratio", "quick_ratio", "cash_ratio", "ocf_ratio",
    "liabilities_to_equity", "debt_ratio", "roa", "fcf_margin", "cash_conversion",
}

# Ratios updated for banking specifically (see module docstring).
BANKING_UPDATED_RATIOS = {"roe", "debt_to_equity"}

PROXY_NOTES = {
    "debt_to_equity": "Ориентир основан на рыночном D/E отрасли (Damodaran), а не балансовом.",
    "net_debt_to_ebitda": "Ориентир по валовому долгу/EBITDA отрасли (Damodaran), не по чистому долгу.",
    "asset_turnover": "Прокси: выручка/инвестированный капитал отрасли (Damodaran), не выручка/активы.",
}


# --------------------------------------------------------------------------
# Fetch + parse
# --------------------------------------------------------------------------

def fetch_html(name: str, cache_dir: Optional[Path], offline: bool) -> str:
    cache_path = cache_dir / f"{name}.html" if cache_dir else None
    if offline:
        if not cache_path or not cache_path.exists():
            raise RuntimeError(f"BLOCKED: --offline set but no cached file for {name} "
                                f"at {cache_path}")
        return cache_path.read_text(encoding="utf-8", errors="replace")
    url = BASE_URL.format(name=name)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20, context=_SSL_CONTEXT) as resp:
            html = resp.read().decode("utf-8", errors="replace")
        if cache_path:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(html, encoding="utf-8")
        return html
    except Exception as exc:  # noqa: BLE001 - report and fall back deliberately
        if cache_path and cache_path.exists():
            print(f"  [warn] live fetch of {name} failed ({exc!r}); using cached {cache_path}",
                  file=sys.stderr)
            return cache_path.read_text(encoding="utf-8", errors="replace")
        raise RuntimeError(
            f"BLOCKED: cannot fetch {url} ({exc!r}) and no cache at {cache_path}") from exc


def find_header_row(raw: pd.DataFrame) -> int:
    for i in range(min(5, len(raw))):
        v = raw.iloc[i, 0]
        if isinstance(v, str) and v.strip().startswith("Industry"):
            return i
    raise ValueError("could not locate header row (col 0 starting with 'Industry')")


_WS_RE = re.compile(r"\s+")


def normalize_name(raw: str) -> str:
    s = _WS_RE.sub(" ", str(raw).strip())
    if s == "Financial Svcs. (Non-bank & Insurance":
        s += ")"
    return s


def num_to_float(s) -> Optional[float]:
    if s is None:
        return None
    s = str(s).strip()
    if s == "" or s.lower() in ("nan", "na", "nm", "n/a", "--"):
        return None
    s = s.replace(",", "").rstrip("%")
    try:
        return float(s)
    except ValueError:
        return None


def load_table(name: str, cache_dir: Optional[Path], offline: bool) -> pd.DataFrame:
    """Return a DataFrame with a normalized 'name' column and a 'firms' int
    column, plus every other original column left as raw strings (caller
    picks and converts the columns it needs)."""
    html = fetch_html(name, cache_dir, offline)
    tables = pd.read_html(io.StringIO(html))
    if not tables:
        raise ValueError(f"{name}: no <table> found in fetched HTML")
    raw = tables[0]
    hdr_idx = find_header_row(raw)
    header = raw.iloc[hdr_idx].tolist()
    body = raw.iloc[hdr_idx + 1:].reset_index(drop=True)
    body.columns = [f"c{i}" for i in range(len(header))]
    body = body.rename(columns={"c0": "name", "c1": "firms"})
    body["name"] = body["name"].map(normalize_name)
    body = body[~body["name"].isin(["Total Market", "Total Market (without financials)"])]
    body["firms"] = body["firms"].map(lambda x: int(num_to_float(x) or 0))
    return body, header


# --------------------------------------------------------------------------
# Aggregation
# --------------------------------------------------------------------------

def weighted_center(df: pd.DataFrame, value_col: str, industries: list[str],
                     pct_to_ratio: bool = False) -> tuple[Optional[float], int, list[str]]:
    """Firm-count-weighted average of value_col over the given industries.

    Returns (center, total_firms_used, matched_industry_names). center is
    None if no mapped industry has a usable value.
    """
    sub = df[df["name"].isin(industries)].copy()
    sub["_v"] = sub[value_col].map(num_to_float)
    sub = sub.dropna(subset=["_v"])
    sub = sub[sub["firms"] > 0]
    if sub.empty:
        return None, 0, []
    if pct_to_ratio:
        sub["_v"] = sub["_v"] / 100.0
    total_firms = int(sub["firms"].sum())
    center = float((sub["_v"] * sub["firms"]).sum() / total_firms)
    return center, total_firms, sorted(sub["name"].tolist())


def band_for(direction: str, center: float) -> tuple[list[float], list[float]]:
    if direction == "lower":
        return [0.0, round(center * 1.15, 4)], [0.0, round(center * 1.9, 4)]
    # "higher" and "range" share the same shape — see module docstring.
    return ([round(center * 0.85, 4), round(center * 1.8, 4)],
            [round(center * 0.45, 4), round(center * 2.4, 4)])


def build_metrics(tables: dict[str, tuple[pd.DataFrame, list]]) -> dict:
    """Compute {bucket: {ratio: {"center":..., "firms":..., "matched": [...]}}}."""
    margin_df, margin_hdr = tables["margin"]
    roe_df, _ = tables["roe"]
    dbt_df, _ = tables["dbtfund"]
    mgn_df, _ = tables["mgnroc"]
    wc_df, _ = tables["wcdata"]
    veb_df, veb_hdr = tables["vebitda"]
    pe_df, _ = tables["pedata"]
    pb_df, _ = tables["pbvdata"]

    # column indices established by manual inspection of the Jan-2026 mirrors
    # (see module docstring / task-6-report.md for the header dumps).
    COL = {
        "gross_margin": "c2", "net_margin": "c3", "operating_margin": "c5",
        "ebitda_margin": "c11", "cogs_to_sales": "c14",
        "roe": "c2",
        "debt_to_equity_pct": "c4", "interest_coverage": "c7", "net_debt_to_ebitda": "c8",
        "asset_turnover": "c3",
        "ar_to_sales": "c2", "inv_to_sales": "c3", "ap_to_sales": "c4",
        "ev_ebitda": "c3",  # "Only positive EBITDA firms" subset
        "pe": "c6",  # Aggregate Mkt Cap / Net Income (all firms) — see note below
        "pb": "c2",  # PBV
    }
    # pe note: pedata.html also has a "Trailing PE" column (a naive average
    # of each company's own P/E). We deliberately do NOT use it — it is
    # dominated by tiny near-zero-earnings firms (e.g. it puts retail's
    # center above 140x). "Aggregate Mkt Cap/Net Income (all firms)" is
    # sum(market cap)/sum(net income) across the industry, i.e. the same
    # value-weighted construction used for real-world sector/index P/E
    # (S&P 500 P/E, etc.), and is far more robust to per-firm outliers.

    results: dict = {}
    for bucket, industries in INDUSTRY_MAP.items():
        m: dict = {}

        def add(ratio, df, col, pct_to_ratio=False):
            c, firms, matched = weighted_center(df, col, industries, pct_to_ratio)
            if c is not None:
                m[ratio] = {"center": c, "firms": firms, "matched": matched}

        add("gross_margin", margin_df, COL["gross_margin"])
        add("net_margin", margin_df, COL["net_margin"])
        add("operating_margin", margin_df, COL["operating_margin"])
        add("ebitda_margin", margin_df, COL["ebitda_margin"])
        add("roe", roe_df, COL["roe"])
        add("debt_to_equity", dbt_df, COL["debt_to_equity_pct"], pct_to_ratio=True)
        add("interest_coverage", dbt_df, COL["interest_coverage"])
        add("net_debt_to_ebitda", dbt_df, COL["net_debt_to_ebitda"])
        add("asset_turnover", mgn_df, COL["asset_turnover"])
        add("ev_ebitda", veb_df, COL["ev_ebitda"])
        add("pe", pe_df, COL["pe"])
        add("pb", pb_df, COL["pb"])

        # turnovers + (deliberately NOT) cash_conversion — derived from two tables
        cogs_sales, _, cogs_matched = weighted_center(margin_df, COL["cogs_to_sales"],
                                                       industries, pct_to_ratio=True)
        ar_sales, ar_firms, ar_matched = weighted_center(wc_df, COL["ar_to_sales"],
                                                          industries, pct_to_ratio=True)
        inv_sales, inv_firms, inv_matched = weighted_center(wc_df, COL["inv_to_sales"],
                                                             industries, pct_to_ratio=True)
        ap_sales, ap_firms, ap_matched = weighted_center(wc_df, COL["ap_to_sales"],
                                                          industries, pct_to_ratio=True)
        if ar_sales and ar_sales > 1e-6:
            m["receivables_turnover"] = {"center": 1.0 / ar_sales, "firms": ar_firms,
                                          "matched": ar_matched}
        if cogs_sales is not None and inv_sales and inv_sales > 1e-6:
            m["inventory_turnover"] = {"center": cogs_sales / inv_sales,
                                        "firms": min(ar_firms or inv_firms, inv_firms),
                                        "matched": sorted(set(cogs_matched) | set(inv_matched))}
        if cogs_sales is not None and ap_sales and ap_sales > 1e-6:
            m["payables_turnover"] = {"center": cogs_sales / ap_sales,
                                       "firms": ap_firms,
                                       "matched": sorted(set(cogs_matched) | set(ap_matched))}
        results[bucket] = m
    return results


# --------------------------------------------------------------------------
# Merge
# --------------------------------------------------------------------------

def merge_benchmarks(existing: dict, metrics: dict) -> tuple[dict, list[dict]]:
    """Mutates a deep-copied benchmarks dict in place; returns (new_dict, changelog)."""
    import copy
    out = copy.deepcopy(existing)
    changelog = []
    for bucket, cfg in out["industries"].items():
        bucket_metrics = metrics.get(bucket, {})
        for ratio_key, bm in cfg["ratios"].items():
            updatable = ratio_key not in NOT_UPDATED_RATIOS
            if bucket == "banking" and ratio_key not in BANKING_UPDATED_RATIOS:
                updatable = False
            if updatable and ratio_key in bucket_metrics:
                center = bucket_metrics[ratio_key]["center"]
                old_good, old_acceptable = bm["good"], bm["acceptable"]
                good, acceptable = band_for(bm["direction"], center)
                bm["good"], bm["acceptable"] = good, acceptable
                bm["source"] = SOURCE_LABEL
                bm["source_url"] = _source_url_for(ratio_key)
                bm["as_of"] = AS_OF
                bm["method"] = "band-around-center-v1"
                if ratio_key in PROXY_NOTES:
                    note = bm.get("note", "")
                    if PROXY_NOTES[ratio_key] not in note:
                        bm["note"] = (note + " " + PROXY_NOTES[ratio_key]).strip()
                changelog.append({
                    "industry": bucket, "ratio": ratio_key,
                    "old_good": old_good, "old_acceptable": old_acceptable,
                    "new_good": good, "new_acceptable": acceptable,
                    "center": round(center, 4),
                    "firms": bucket_metrics[ratio_key]["firms"],
                })
            else:
                bm.setdefault("method", "demo")
    out["_disclaimer"] = DISCLAIMER
    return out, changelog


def _source_url_for(ratio_key: str) -> str:
    table = {
        "gross_margin": "margin", "net_margin": "margin", "operating_margin": "margin",
        "ebitda_margin": "margin",
        "roe": "roe",
        "debt_to_equity": "dbtfund", "interest_coverage": "dbtfund",
        "net_debt_to_ebitda": "dbtfund",
        "asset_turnover": "mgnroc",
        "receivables_turnover": "wcdata", "inventory_turnover": "wcdata",
        "payables_turnover": "wcdata",
        "ev_ebitda": "vebitda", "pe": "pedata", "pb": "pbvdata",
    }[ratio_key]
    return BASE_URL.format(name=table)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def print_dry_run_table(changelog: list[dict]) -> None:
    by_ratio: dict[str, list[dict]] = {}
    for row in changelog:
        by_ratio.setdefault(row["ratio"], []).append(row)
    for ratio in sorted(by_ratio):
        print(f"\n=== {ratio} ===")
        print(f"{'industry':<18}{'firms':>7}  {'old good':<18}{'old acc.':<18}"
              f"{'new good':<20}{'new acc.':<20}{'center':>10}")
        for row in sorted(by_ratio[ratio], key=lambda r: r["industry"]):
            print(f"{row['industry']:<18}{row['firms']:>7}  "
                  f"{str([round(x, 2) for x in row['old_good']]):<18}"
                  f"{str([round(x, 2) for x in row['old_acceptable']]):<18}"
                  f"{str([round(x, 2) for x in row['new_good']]):<20}"
                  f"{str([round(x, 2) for x in row['new_acceptable']]):<20}"
                  f"{row['center']:>10.3f}")
    print(f"\nTotal updated entries: {len(changelog)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                     help="compute and print the summary table; do not write benchmarks.json")
    ap.add_argument("--benchmarks-path", type=Path, default=BENCHMARKS_PATH)
    ap.add_argument("--cache-dir", type=Path, default=None,
                     help="directory to read/write cached HTML mirrors")
    ap.add_argument("--offline", action="store_true",
                     help="use --cache-dir only, never hit the network")
    args = ap.parse_args()

    print("Fetching Damodaran datafile mirrors...", file=sys.stderr)
    tables = {}
    for name in TABLE_NAMES:
        try:
            tables[name] = load_table(name, args.cache_dir, args.offline)
            print(f"  {name}: {len(tables[name][0])} industries", file=sys.stderr)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 2

    metrics = build_metrics(tables)

    with open(args.benchmarks_path, encoding="utf-8") as f:
        existing = json.load(f)
    merged, changelog = merge_benchmarks(existing, metrics)

    print_dry_run_table(changelog)

    if args.dry_run:
        print("\n[dry-run] benchmarks.json NOT written.", file=sys.stderr)
        return 0

    with open(args.benchmarks_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\nWrote {args.benchmarks_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
