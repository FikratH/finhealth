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
Downloaded file (RU version — see round-1 fix note below):
"Индикаторы финансовой устойчивости.xlsx", ~718KB,
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, sheets
`Содержание`, `ИФУ`, `5.1 Депозитные учреждения`, `5.5 Нефинансовые
корпорации`. Re-run candidate: if the National Bank publishes a newer FSI
workbook at the same page, re-derive RAW_DATA from the two sheets below
using the row/series codes cited inline (IMF-standard FS_* codes, stable
across vintages of this same file).

Round-1 fix note (review round 1, Finding 2): the FIRST version of this
script used the EN mirror's download, whose "5.1 Deposit takers" sheet
physically stops at 2023Q3 (149 columns total, no data past that point).
The RU download used now is the SAME regulator table with more columns
(282) and genuinely populated data through 1кв2024/2024Q1 on that same
sheet — confirmed columns 62-66 (1кв2023 through 1кв2024) each satisfy the
balance-sheet identity Обязательства + Капитал и резервы = Совокупные
активы to within float rounding (e.g. at 1кв2024: 46,463,766,360.63 +
7,511,585,568.16 = 53,975,351,928.79 vs reported assets
53,975,351,928.82 — diff 0.00013, i.e. genuine reported data, not a
stray/interpolated cell). All four banking entries below are therefore
now sourced from 1кв2024/2024Q1, not a 2023Q3/2024Q1 mixed vintage — using
one consistent quarter across the whole banking bucket, the same
methodology already used for the "all" bucket. (Columns 279-281 of that
sheet are an unrelated, disconnected 3-column tail with an incompatible
header format — not part of the main quarterly series; ignore them.)

Two sheets, two scopes:
  - "5.5 Нефинансовые корпорации" (IMF Table 5.5) — an economy-wide
    aggregate across ALL of Kazakhstan's non-financial corporate sector,
    NOT broken out by industry, and explicitly EXCLUDING banks/insurers.
    Mapped here under the synthetic industry key "all" — a fallback every
    non-banking industry bucket resolves to (see benchmarks_kz.py). This
    is honestly a blunt instrument: Kazakhstan's non-financial corporate
    economy is dominated by extraction/metals/trade, so "all" is a much
    better proxy for manufacturing/energy/transport than for e.g. saas —
    shipped anyway, per the task brief's explicit allowance for
    economy-wide reference lines, with that caveat recorded in every
    entry's `note`, in its `scope` field ("economy_wide" vs "industry" —
    round-1 fix, Finding 1: the UI now renders this distinction instead of
    only a document-level footnote), and in task-5-report.md.
  - "5.1 Депозитные учреждения" (IMF Table 5.1) — Kazakhstan's banking
    sector specifically. Mapped under the "banking" industry key only;
    never used as a fallback for any other industry (a bank's balance
    sheet has nothing in common with a non-financial corporate one).

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

# "5.1 Депозитные учреждения" sheet, column 1кв2024/2024Q1 — the sheet's
# own true last populated column (see round-1 fix note above). Row numbers
# are THIS sheet's own numbering, which differs from the NFC sheet's (an
# extra income-statement line inserted earlier in this sheet shifts every
# subsequent row number by +2 — round-1 fix, Finding 10: the original
# script wrongly borrowed the NFC sheet's row numbers "21."/"29."/"12.").
DT_2024Q1 = {
    "annualized_net_income_after_taxes": 2_278_165_455.14275,  # row "64. Чистая прибыль за вычетом налогов в годовом исчислении", FSNERAB
    "annualized_net_income_before_taxes": 2_635_929_099.75667,  # row "63. Чистая прибыль до вычета налогов в годовом исчислении", FSNERA — see roa.note (Finding 3)
    "average_total_assets": 53_225_651_311.3566,  # row "65. Средний объем совокупных активов", FSDERA
    "average_capital_and_reserves": 7_185_953_307.73007,  # row "66. Средний объем капитала и резервов", FSDERE
    "liabilities": 46_463_766_360.62876,  # row "23. Обязательства (= 28 + 29 + 30)", FS_ODX_L
    "capital_and_reserves": 7_511_585_568.15927,  # row "31. Капитал и резервы", FS_ODX_CR
    "total_assets": 53_975_351_928.78816,  # row "14. Совокупные активы (= 15 + 16 = 23 + 31)", FS_ODX_A
}


def pct(numer: float, denom: float) -> float:
    return round(numer / denom * 100, 2)


def ratio(numer: float, denom: float) -> float:
    return round(numer / denom, 3)


def build_all_bucket() -> dict:
    # Every entry here carries scope="economy_wide" — the UI (round-1 fix,
    # Finding 1) renders a distinct label for these vs. banking's
    # scope="industry" entries below, so a reader can't mistake an
    # aggregate across ALL non-financial corporations for a figure
    # specific to their own industry.
    d = NFC_2024Q1
    avg_total_assets = (d["total_assets"] + NFC_2023Q4_TOTAL_ASSETS) / 2
    return {
        "net_margin": {
            "value": pct(d["net_income_after_taxes"], d["revenue"]),
            "note": "Чистая прибыль / выручка, нефинансовые организации РК, 2024 Q1 (нарастающим итогом с начала года)."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "economy_wide",
        },
        "operating_margin": {
            "value": pct(d["revenue"] - d["cost_of_sales"], d["revenue"]),
            "note": "Прокси: «чистый операционный доход» источника (выручка минус себестоимость "
            "реализации, МВФ FSI Табл. 5.5) — состав себестоимости в этой методологии может "
            "отличаться от operating_income в отчётности конкретной компании."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "economy_wide",
        },
        "interest_coverage": {
            "value": ratio(d["ebit"], d["interest_expense"]),
            "note": "EBIT / проценты к уплате, нефинансовые организации РК, 2024 Q1."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "economy_wide",
        },
        "liabilities_to_equity": {
            "value": ratio(d["liabilities"], d["capital_and_reserves"]),
            "note": "Обязательства / капитал и резервы, нефинансовые организации РК, 2024 Q1."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "economy_wide",
        },
        "debt_ratio": {
            "value": ratio(d["liabilities"], d["total_assets"]),
            "note": "Обязательства / активы, нефинансовые организации РК, 2024 Q1." + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "economy_wide",
        },
        "roe": {
            "value": pct(d["annualized_net_income_after_taxes"], d["average_capital_and_reserves"]),
            "note": "ROE (аннуализировано источником), нефинансовые организации РК, 2024 Q1."
            + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "economy_wide",
        },
        "roa": {
            "value": pct(d["annualized_net_income_after_taxes"], avg_total_assets),
            "note": "ROA = аннуализированная чистая прибыль (источник) / средние активы "
            "(среднее 2023 Q4 и 2024 Q1 — источник не публикует отдельный ряд «средние активы» "
            "для этой таблицы; усреднение по той же схеме, что и в собственных расчётах "
            "приложения)." + ALL_NOTE_SUFFIX,
            "source": SOURCE_NFC, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "economy_wide",
        },
    }


def build_banking_bucket() -> dict:
    # scope="industry": unlike the "all" bucket, this genuinely IS the
    # banking sector specifically — no economy-wide caveat needed.
    d = DT_2024Q1
    pretax_roa = pct(d["annualized_net_income_before_taxes"], d["average_total_assets"])
    return {
        "roa": {
            "value": pct(d["annualized_net_income_after_taxes"], d["average_total_assets"]),
            # Round-1 fix, Finding 3: the app's own roa formula
            # (net_income / average_total_assets) is after-tax, so this
            # entry deliberately uses the source's after-tax numerator
            # (FSNERAB) rather than its own pre-tax "headline" FSI ROA
            # (FSERA) — disclosed here the same way the operating_margin
            # proxy is, so a reader cross-checking against the source
            # isn't left to wonder why the numbers differ.
            "note": f"ROA (аннуализировано источником), банковский сектор РК, 2024 Q1. "
            f"Использован показатель ПОСЛЕ налогов (FSNERAB), как и в формуле приложения "
            f"(net_income / average_total_assets); собственный «базовый» ИФУ-показатель "
            f"источника (FSERA, ДО налогов) на ту же дату = {pretax_roa}%.",
            "source": SOURCE_DT, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "industry",
        },
        "roe": {
            "value": pct(d["annualized_net_income_after_taxes"], d["average_capital_and_reserves"]),
            "note": "ROE (аннуализировано источником), банковский сектор РК, 2024 Q1.",
            "source": SOURCE_DT, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "industry",
        },
        "liabilities_to_equity": {
            "value": ratio(d["liabilities"], d["capital_and_reserves"]),
            "note": "Обязательства / капитал и резервы, банковский сектор РК, 2024 Q1 — "
            "структурно высокое значение ожидаемо для банков (депозиты — обязательства).",
            "source": SOURCE_DT, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "industry",
        },
        "debt_ratio": {
            "value": ratio(d["liabilities"], d["total_assets"]),
            "note": "Обязательства / активы, банковский сектор РК, 2024 Q1.",
            "source": SOURCE_DT, "source_url": SOURCE_URL, "as_of": "2024Q1", "method": METHOD,
            "scope": "industry",
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
            for field in ("value", "source", "source_url", "as_of", "method", "scope"):
                if not bm.get(field) and bm.get(field) != 0:
                    raise ValueError(f"industries.{ind_id}.ratios.{rk}.{field} is missing")
            if bm["scope"] not in ("economy_wide", "industry"):
                raise ValueError(f"industries.{ind_id}.ratios.{rk}.scope: unknown {bm['scope']!r}")


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
