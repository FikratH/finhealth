// Display names for the standardized metric keys the API returns in
// `ExtractedValue.metric` (e.g. "revenue", "cost_of_goods_sold"). Generated
// by hand from `apps/api/app/services/metrics.py` METRICS — RU names are
// copied verbatim from that dictionary (they're what the extraction engine
// itself calls each line item); EN names are natural business terms, not
// literal translations. When METRICS gains a new key, add it here too.
import type { Locale } from "./format";

export interface MetricNameEntry {
  ru: string;
  en: string;
}

export const METRIC_NAMES: Record<string, MetricNameEntry> = {
  revenue: { ru: "Выручка", en: "Revenue" },
  cost_of_goods_sold: { ru: "Себестоимость", en: "Cost of Goods Sold" },
  gross_profit: { ru: "Валовая прибыль", en: "Gross Profit" },
  operating_income: { ru: "Операционная прибыль (EBIT)", en: "Operating Income (EBIT)" },
  ebitda: { ru: "EBITDA", en: "EBITDA" },
  interest_expense: { ru: "Процентные расходы", en: "Interest Expense" },
  net_income: { ru: "Чистая прибыль", en: "Net Income" },
  total_assets: { ru: "Итого активы", en: "Total Assets" },
  current_assets: { ru: "Оборотные активы", en: "Current Assets" },
  cash: { ru: "Денежные средства", en: "Cash and Cash Equivalents" },
  short_term_investments: {
    ru: "Краткосрочные финансовые вложения",
    en: "Short-Term Investments",
  },
  accounts_receivable: { ru: "Дебиторская задолженность", en: "Accounts Receivable" },
  inventory: { ru: "Запасы", en: "Inventory" },
  total_liabilities: { ru: "Итого обязательства", en: "Total Liabilities" },
  current_liabilities: { ru: "Краткосрочные обязательства", en: "Current Liabilities" },
  accounts_payable: { ru: "Кредиторская задолженность", en: "Accounts Payable" },
  total_debt: { ru: "Процентный долг", en: "Interest-Bearing Debt" },
  shareholders_equity: { ru: "Собственный капитал", en: "Shareholders' Equity" },
  operating_cash_flow: {
    ru: "Денежный поток от операционной деятельности",
    en: "Operating Cash Flow",
  },
  capital_expenditures: { ru: "Капитальные затраты (CAPEX)", en: "Capital Expenditures (CapEx)" },
  shares_outstanding: { ru: "Количество акций", en: "Shares Outstanding" },
  eps: { ru: "Прибыль на акцию (EPS)", en: "Earnings Per Share (EPS)" },
  share_price: { ru: "Цена акции", en: "Share Price" },
  market_cap: { ru: "Рыночная капитализация", en: "Market Capitalization" },
  retained_earnings: { ru: "Нераспределённая прибыль", en: "Retained Earnings" },
  net_ppe: { ru: "Основные средства", en: "Property, Plant & Equipment" },
  long_term_debt: { ru: "Долгосрочные займы", en: "Long-Term Debt" },
  depreciation_amortization: { ru: "Амортизация", en: "Depreciation & Amortization" },
  sga_expense: {
    ru: "Коммерческие и управленческие расходы",
    en: "SG&A Expenses",
  },
};

/** Falls back to the raw key (rather than the document's original_label) so
 * a metric the map hasn't caught up with is still visibly a metric key, not
 * silently blank. */
export function metricDisplayName(metric: string, locale: Locale): string {
  const entry = METRIC_NAMES[metric];
  if (!entry) return metric;
  return locale === "ru" ? entry.ru : entry.en;
}

// Display names for `RatioResult.inputs` keys that are never a
// `source_values` metric at all (lib/results.ts's "derived" provenance
// status — see its own INPUT_KEY_ALIASES comment for the full audit of
// every such key across apps/api/app/services/ratios.py): an average
// (average_total_assets, average_shareholders_equity, average_inventory,
// average_accounts_receivable, average_accounts_payable), a subtotal
// (working_capital, net_debt, free_cash_flow, enterprise_value), or a
// conditionally-sourced figure (equity_or_market_cap). "ebit" is included
// defensively — ratio-row.tsx's own alias resolution already redirects it
// to operating_income's real METRIC_NAMES entry before it ever reaches a
// "derived" row, but a display name here means a future call site that
// skips that resolution still shows a real label, not the raw key.
export const DERIVED_NAMES: Record<string, MetricNameEntry> = {
  average_total_assets: { ru: "Средние совокупные активы", en: "Average Total Assets" },
  average_shareholders_equity: {
    ru: "Средний собственный капитал",
    en: "Average Shareholders' Equity",
  },
  average_inventory: { ru: "Средние запасы", en: "Average Inventory" },
  average_accounts_receivable: {
    ru: "Средняя дебиторская задолженность",
    en: "Average Accounts Receivable",
  },
  average_accounts_payable: {
    ru: "Средняя кредиторская задолженность",
    en: "Average Accounts Payable",
  },
  working_capital: { ru: "Оборотный капитал", en: "Working Capital" },
  net_debt: { ru: "Чистый долг", en: "Net Debt" },
  free_cash_flow: { ru: "Свободный денежный поток", en: "Free Cash Flow" },
  enterprise_value: { ru: "Стоимость компании (EV)", en: "Enterprise Value (EV)" },
  equity_or_market_cap: {
    ru: "Капитализация или собственный капитал",
    en: "Market Cap or Shareholders' Equity",
  },
  ebit: { ru: "Операционная прибыль (EBIT)", en: "Operating Income (EBIT)" },
};

/** Display name for a traced ratio input specifically — checks
 * DERIVED_NAMES first (a "derived" provenance row's key is never a real
 * METRIC_NAMES entry, so metricDisplayName alone would fall back to the
 * raw snake_case key) before falling back to metricDisplayName's own
 * sourced-metric lookup. Safe to use for sourced/not_found rows too: no
 * DERIVED_NAMES key collides with a METRIC_NAMES one. */
export function ratioInputDisplayName(key: string, locale: Locale): string {
  const derived = DERIVED_NAMES[key];
  if (derived) return locale === "ru" ? derived.ru : derived.en;
  return metricDisplayName(key, locale);
}
