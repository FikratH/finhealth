#!/usr/bin/env python3
"""Build the Kazakhstan (KZ) benchmark overlay (Plan 7 / Task 5, Tier-2).

Writes app/data/benchmarks_kz.json — a SEPARATE, additive file from
app/data/benchmarks.json. Every ratio's global (Damodaran-derived) band
keeps deciding the traffic-light verdict; this file only supplies a second,
citation-carrying reference POINT the UI can mark alongside it (see
apps/api/app/services/benchmarks_kz.py and the `benchmark_kz` field on
RatioResult). No entry here is ever invented: every value below is
recomputed, in this script, from raw series pulled out of one real,
publicly downloadable regulator dataset — never hand-typed as a bare
percentage. If the source can't back a number, the number does not exist.

## The one source used

National Bank of Kazakhstan (Нацбанк РК) — "Индикаторы финансовой
устойчивости" (Financial Soundness Indicators, FSI), compiled to the IMF's
2019 FSI Guide and also filed with the IMF:
  https://nationalbank.kz/ru/page/indikatory-finansovoy-ustoychivosti
  (EN mirror: https://nationalbank.kz/en/page/indikatory-finansovoy-ustoychivosti)
Downloaded file: "Индикаторы финансовой устойчивости 1К2024.xlsx"
  direct link (as of this research pass): https://nationalbank.kz/file/download/103364
  published by the National Bank on 12.08.2024 — the page has not been
  refreshed past this file as of this script's writing (2026-08-28); the
  quarters cited below are the file's own true last-populated columns, not
  today's date. Re-run candidate: if the National Bank publishes a newer
  FSI workbook at the same page, re-derive RAW_DATA from its "5.1 Deposit
  takers" and "5.5 Nonfinancial corporations" sheets using the row/series
  codes cited inline below (they are IMF-standard FS_* codes and stable
  across vintages of this same file).

Two sheets, two scopes:
  - "5.5 Nonfinancial corporations" (IMF Table 5.5) — an economy-wide
    aggregate across ALL of Kazakhstan's non-financial corporate sector,
    NOT broken out by industry, and explicitly EXCLUDING banks/insurers.
    Mapped here under the synthetic industry key "all" — a fallback every
    non-banking industry bucket resolves to (see benchmarks_kz.py). This
    is honestly a blunt instrument: Kazakhstan's non-financial corporate
    economy is dominated by extraction/metals/trade, so "all" is a much
    better proxy for manufacturing/energy/transport than for e.g. saas —
    shipped anyway, per the task brief's explicit allowance for
    economy-wide reference lines, with that caveat recorded in every
    entry's `note` and in task-5-report.md.
  - "5.1 Deposit takers" (IMF Table 5.1) — Kazakhstan's banking sector
    specifically. Mapped under the "banking" industry key only; never used
    as a fallback for any other industry (a bank's balance sheet has
    nothing in common with a non-financial corporate one).

Income-statement rows in both sheets are reported CUMULATIVE from the start
of the calendar year (the workbook's own disclaimer), so a Q1 column is
already a clean quarterly figure — no de-annualizing needed. The "Annualized
net income..." memo rows are the source's own annualization; used verbatim
for ROE/ROA, never re-derived.

## Ratios NOT attempted from this source (see task-5-report.md for the full
rejected-candidates log)

  - current_ratio / quick_ratio / cash_ratio / ocf_ratio: the FSI liquidity
    series ("Liquid assets", "Short-term liabilities") are defined too
    differently from ratios.py's own formulas (cash + short-term
    investments + receivables, current assets/liabilities) to relabel
    honestly without a proxy note thick enough to be misleading.
  - gross_margin / ebitda_margin: no separate COGS-only or D&A series
    exists in either sheet — "Net operating income" is the closest thing
    to a margin figure and is mapped to operating_margin (with a proxy
    note), not gross_margin, since it nets against "Cost of sales", not
    a COGS-only line.
  - debt_to_equity (interest-bearing debt / equity, the ratios.py
    definition): the FSI "Debt" series is total liabilities (all
    liability instruments, dominated by deposits for banks and trade
    credit for corporates), not interest-bearing debt specifically — a
    materially different quantity, already mapped honestly to
    liabilities_to_equity/debt_ratio instead (see PROXY_NOTES precedent
    in build_benchmarks.py for the same discipline).

Usage:
    python scripts/build_benchmarks_kz.py --dry-run
    python scripts/build_benchmarks_kz.py                 # writes benchmarks_kz.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "app" / "data" / "benchmarks_kz.json"

SOURCE_URL = "https://nationalbank.kz/ru/page/indikatory-finansovoy-ustoychivosti"
SOURCE_NFC = "Нацбанк РК / МВФ, Индикаторы фин. устойчивости, Табл. 5.5 (нефин. организации)"
SOURCE_DT = "Нацбанк РК / МВФ, Индикаторы фин. устойчивости, Табл. 5.1 (банки)"
METHOD = "kz-official-point-v1"

ALL_NOTE_SUFFIX = (
    " Показатель по экономике КЗ в целом (нефинансовые организации), "
    "не по отдельной отрасли — экономика Казахстана заметно смещена в "
    "сторону добычи/металлургии/торговли, так что для «Software и SaaS» "
    "или «Здравоохранение» это грубый ориентир."
)

# ---------------------------------------------------------------------------
# RAW_DATA: every figure below is transcribed by hand from cells in
# "Индикаторы финансовой устойчивости 1К2024.xlsx" (see module docstring for
# the download link). Each key names the sheet, the source workbook's own
# row label, and its IMF FS_* series code, so a re-derivation can find the
# exact cell again. Reporting scale is "Thousand" (KZT thousands) per the
# workbook's own header — irrelevant here since every quantity below is used
# only inside a ratio (the scale cancels).
# ---------------------------------------------------------------------------

# "5.5 Nonfinancial corporations" sheet, column 2024Q1 (cumulative Jan-Mar
# 2024) unless noted; income-statement rows are YTD-cumulative per the
# workbook's own disclaimer, so a Q1 column is already a clean quarterly
# value.
NFC_2024Q1 = {
    "revenue": 19_556_004_764,  # row "1. Revenue from sales of goods and services", FS_NFC_RS
    "cost_of_sales": 14_013_817_190,  # row "2. Cost of sales", FS_NFC_CS
    "interest_expense": 870_696_315,  # row "5. Interest expenses", FS_NFC_EI
    "net_income_after_taxes": 2_928_618_614,  # row "9. Net income after taxes", FS_NFC_INAET
    "total_assets": 148_770_156_585,  # row "12. Total assets", FS_NFC_A
    "liabilities": 72_045_487_107.00003,  # row "21. Liabilities", FS_NFC_L
    "capital_and_reserves": 76_724_669_478,  # row "29. Capital and reserves", FS_NFC_CR
    "ebit": 4_396_178_743,  # row "31. Earnings before interest and taxes", FS_NFC_EBIT
    "annualized_net_income_after_taxes": 11_714_474_456,  # row "37.", FS_NFC_AINBT
    "average_capital_and_reserves": 76_473_909_849,  # row "38.", FS_NFC_ACR
}
# Same sheet, column 2023Q4 — only "Total assets" is needed, to average
# against 2024Q1's for a two-point ROA denominator (ratios.py's own
# average() convention: current+previous / 2 — the source doesn't publish
# an "average total assets" memo series for this sheet the way it does for
# deposit takers below, so this mirrors the app's own averaging method
# rather than inventing a new one).
NFC_2023Q4_TOTAL_ASSETS = 145_709_410_619  # row "12. Total assets", FS_NFC_A

# "5.1 Deposit takers" sheet, column 2023Q3 — the sheet's own last
# populated column in this workbook vintage (later than the NFC sheet's
# 2024Q1 on some series, earlier on others; each sheet is cited at its own
# true last quarter, not forced to match).
DT_2023Q3 = {
    "annualized_net_income_after_taxes": 2_107_383_206.99701,  # row "64.", FSNERAB
    "average_total_assets": 47_052_365_963.5152,  # row "65.", FSDERA
    "average_capital_and_reserves": 5_719_718_050.65979,  # row "66.", FSDERE
    "liabilities": 42_665_130_746.13495,  # row "21. Liabilities", FS_ODX_L
    "capital_and_reserves": 6_242_773_374.29852,  # row "29. Capital and reserves" equiv., FS_ODX_CR
    "total_assets": 48_907_904_120.43343,  # row "12. Total assets" equiv., FS_ODX_A
}


def pct(numer: float, denom: float) -> float:
    return round(numer / denom * 100, 2)


def ratio(numer: float, denom: float) -> float:
    return round(numer / denom, 3)


def build_all_bucket() -> dict:
    d = NFC_2024Q1
    avg_total_assets = (d["total_assets"] + NFC_2023Q4_TOTAL_ASSETS) / 2
    return {
        "net_margin": {
            "value": pct(d["net_income_after_taxes"], d["revenue"]),
            "note": "Чистая прибыль / выручка, нефинансовые организации РК, 2024 Q1 (нарастающим итогом с начала года)."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
        },
        "operating_margin": {
            "value": pct(d["revenue"] - d["cost_of_sales"], d["revenue"]),
            "note": "Прокси: «чистый операционный доход» источника (выручка минус себестоимость "
            "реализации, МВФ FSI Табл. 5.5) — состав себестоимости в этой методологии может "
            "отличаться от operating_income в отчётности конкретной компании."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
        },
        "interest_coverage": {
            "value": ratio(d["ebit"], d["interest_expense"]),
            "note": "EBIT / проценты к уплате, нефинансовые организации РК, 2024 Q1."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
        },
        "liabilities_to_equity": {
            "value": ratio(d["liabilities"], d["capital_and_reserves"]),
            "note": "Обязательства / капитал и резервы, нефинансовые организации РК, 2024 Q1."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
        },
        "debt_ratio": {
            "value": ratio(d["liabilities"], d["total_assets"]),
            "note": "Обязательства / активы, нефинансовые организации РК, 2024 Q1." + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
        },
        "roe": {
            "value": pct(d["annualized_net_income_after_taxes"], d["average_capital_and_reserves"]),
            "note": "ROE (аннуализировано источником), нефинансовые организации РК, 2024 Q1."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
        },
        "roa": {
            "value": pct(d["annualized_net_income_after_taxes"], avg_total_assets),
            "note": "ROA = аннуализированная чистая прибыль (источник) / средние активы "
            "(среднее 2023 Q4 и 2024 Q1 — источник не публикует отдельный ряд «средние активы» "
            "для этой таблицы; усреднение по той же схеме, что и в собственных расчётах "
            "приложения)." + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
        },
    }


def build_banking_bucket() -> dict:
    d = DT_2023Q3
    return {
        "roa": {
            "value": pct(d["annualized_net_income_after_taxes"], d["average_total_assets"]),
            "note": "ROA (аннуализировано источником), банковский сектор РК, 2023 Q3.",
            "source": SOURCE_DT, "source_url": SOURCE_URL, "as_of": "2023Q3", "method": METHOD,
        },
        "roe": {
            "value": pct(d["annualized_net_income_after_taxes"], d["average_capital_and_reserves"]),
            "note": "ROE (аннуализировано источником), банковский сектор РК, 2023 Q3.",
            "source": SOURCE_DT, "source_url": SOURCE_URL, "as_of": "2023Q3", "method": METHOD,
        },
        "liabilities_to_equity": {
            "value": ratio(d["liabilities"], d["capital_and_reserves"]),
            "note": "Обязательства / капитал и резервы, банковский сектор РК, 2023 Q3 — "
            "структурно высокое значение ожидаемо для банков (депозиты — обязательства).",
            "source": SOURCE_DT, "source_url": SOURCE_URL, "as_of": "2023Q3", "method": METHOD,
        },
        "debt_ratio": {
            "value": ratio(d["liabilities"], d["total_assets"]),
            "note": "Обязательства / активы, банковский сектор РК, 2023 Q3.",
            "source": SOURCE_DT, "source_url": SOURCE_URL, "as_of": "2023Q3", "method": METHOD,
        },
    }


DISCLAIMER = (
    "Ориентиры КЗ (`benchmark_kz`) — справочная точка, не диапазон и не замена "
    "отраслевому ориентиру: рассчитаны из официальных данных Национального Банка РК "
    "(Индикаторы финансовой устойчивости, методология МВФ, FSI Guide 2019). Раздел "
    "«all» — показатель по нефинансовым организациям РК в целом (не по отрасли); "
    "раздел «banking» — по банковскому сектору РК отдельно. Вердикты коэффициентов "
    "(«хорошо»/«внимание»/«критично») по-прежнему определяются только глобальным "
    "(Damodaran-based) ориентиром — раздел KZ показывается дополнительно, не заменяя "
    "его. Покрытие частичное: см. docs research log / task-5-report.md для полного "
    "списка рассмотренных и отклонённых источников."
)


def _validate(data: dict) -> None:
    for ind_id, cfg in data["industries"].items():
        for rk, bm in cfg["ratios"].items():
            for field in ("value", "source", "source_url", "as_of", "method"):
                if not bm.get(field) and bm.get(field) != 0:
                    raise ValueError(f"industries.{ind_id}.ratios.{rk}.{field} is missing")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                     help="compute and print the summary table; do not write benchmarks_kz.json")
    ap.add_argument("--out-path", type=Path, default=OUT_PATH)
    args = ap.parse_args()

    data = {
        "_disclaimer": DISCLAIMER,
        "industries": {
            "all": {"ratios": build_all_bucket()},
            "banking": {"ratios": build_banking_bucket()},
        },
    }
    _validate(data)

    total = sum(len(cfg["ratios"]) for cfg in data["industries"].values())
    print(f"KZ benchmark entries: {total}", file=sys.stderr)
    for ind_id, cfg in data["industries"].items():
        for rk, bm in cfg["ratios"].items():
            print(f"  {ind_id:<8} {rk:<22} value={bm['value']:<10} as_of={bm['as_of']}",
                  file=sys.stderr)

    if args.dry_run:
        print("\n[dry-run] benchmarks_kz.json NOT written.", file=sys.stderr)
        return 0

    with open(args.out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\nWrote {args.out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
