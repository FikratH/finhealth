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
