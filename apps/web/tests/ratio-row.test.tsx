import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RatioRow } from "@/components/results/ratio-row";
import ruMessages from "@/messages/ru.json";
import type { RatioResult } from "@/lib/api-types";

// Real demo figures: a higher-is-better ratio whose value sits ABOVE the
// "good" band on the "higher" side — the API still scores this "good"
// (more turnover is better, without an upper bound), but NormBand only
// knows low/high, so an unguarded position check reads it as out-of-range.
const receivablesTurnover: RatioResult = {
  key: "receivables_turnover",
  name: "Receivables Turnover",
  category: "efficiency",
  formula: "revenue / accounts_receivable",
  inputs: { revenue: 3245900000, accounts_receivable: 285000000 },
  substitution: "revenue / accounts_receivable  →  revenue = 3 245 900 000 ; accounts_receivable = 285 000 000",
  value: 11.39,
  unit: "x",
  status: "good",
  score: 91.2,
  benchmark: {
    ratio: "receivables_turnover",
    weight: 1.0,
    direction: "higher",
    good: [4.81, 10.19],
    acceptable: [3.0, 14.0],
    note: "",
    source: "",
  },
  explanation: "Значение 11.39. Отраслевой ориентир: 4.81–10.19. Вывод: выше отраслевого ориентира.",
  applicable: true,
  warnings: [],
};

function renderRatioRow(ratio: RatioResult) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <RatioRow ratio={ratio} locale="ru" />
    </NextIntlClientProvider>,
  );
}

describe("RatioRow", () => {
  it("suppresses the ▲ flag when the API status is good, even though the value sits above the norm band", () => {
    // Regression: the StatusPill and NormBand used to disagree — a green
    // "Хорошо" pill next to a red ▲ "выше нормы" flag on the same row.
    // Flags must follow the API's status, not raw band position.
    renderRatioRow(receivablesTurnover);
    expect(screen.getByText(ruMessages.Status.good)).toBeInTheDocument();
    expect(screen.queryByText("▲")).not.toBeInTheDocument();
    expect(screen.queryByText(ruMessages.Results.ratios.aboveLabel)).not.toBeInTheDocument();
  });

  it("still shows the ▲ flag for the same above-band position when status is attention", () => {
    // Confirms the suppression is status-gated, not a blanket change to
    // NormBand's default out-of-range behavior. Queried by the flag's
    // sr-only pairing text, not the "▲" glyph itself — StatusPill's own
    // "attention" symbol is also "▲", so the glyph alone is ambiguous here.
    renderRatioRow({ ...receivablesTurnover, status: "attention" });
    expect(screen.getByText(ruMessages.Results.ratios.aboveLabel)).toBeInTheDocument();
  });
});
