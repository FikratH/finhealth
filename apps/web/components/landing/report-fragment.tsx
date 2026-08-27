import { useLocale, useTranslations } from "next-intl";
import { SpecimenChip } from "@/components/specimen-chip";
import { StatusPill } from "@/components/status-pill";
import { NormBand } from "@/components/norm-band";
import { MetricNumber } from "@/components/metric-number";
import type { Locale } from "@/lib/format";

// Real figures from apps/api/demo/expected_analysis_example.json (ratio
// "net_margin") — the demo company's actual engine output, never invented.
// PRODUCT.md: demo data is usable in UI as long as it is labeled as such
// (the ДЕМО-ДАННЫЕ chip below does that labeling).
const NET_MARGIN_VALUE = 4.5750023106072275;
const NET_MARGIN_LOW = 3.7267;
const NET_MARGIN_HIGH = 7.8918;
const BENCHMARK_SOURCE = "Damodaran (NYU Stern), Jan 2026";

// The hero's proof artifact: a life-size fragment of a real report, built
// from the same T2 primitives the actual results page will use — not a
// screenshot-in-a-browser-frame.
export function ReportFragment() {
  const t = useTranslations("Landing.reportFragment");
  const tStatus = useTranslations("Status");
  const locale = useLocale() as Locale;

  return (
    <div className="grid-paper border border-line bg-paper p-6 text-ink">
      <div className="flex flex-wrap gap-2">
        <SpecimenChip>{t("industry")}</SpecimenChip>
        <SpecimenChip>{t("period")}</SpecimenChip>
        <SpecimenChip>{t("currency")}</SpecimenChip>
        <SpecimenChip tone="attention">{t("demoLabel")}</SpecimenChip>
      </div>

      <div className="mt-6 border-t border-line pt-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
          {t("ratioName")}
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <MetricNumber
            value={NET_MARGIN_VALUE}
            unit="%"
            locale={locale}
            decimals={2}
            className="text-4xl"
          />
          <StatusPill status="good" label={tStatus("good")} />
        </div>
        <NormBand
          className="mt-3"
          value={NET_MARGIN_VALUE}
          low={NET_MARGIN_LOW}
          high={NET_MARGIN_HIGH}
          unit="%"
          locale={locale}
          normLabel={t("normLabel")}
          aboveLabel={t("aboveLabel")}
          belowLabel={t("belowLabel")}
          naLabel={t("naLabel")}
        />
      </div>

      <p className="mt-6 font-mono text-xs text-ink-muted">
        {t("sourceLabel")} {BENCHMARK_SOURCE}
      </p>
    </div>
  );
}
