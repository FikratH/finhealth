import { useLocale, useTranslations } from "next-intl";
import { InstrumentModule } from "@/components/instrument-module";
import { SegmentDisplay } from "@/components/segment-display";
import { StatusPill } from "@/components/status-pill";
import { CalibrationScale } from "@/components/calibration-scale";
import { OriginTicket } from "@/components/origin-ticket";
import type { Locale } from "@/lib/format";

// Real figures from apps/api/demo/expected_analysis_example.json (ratio
// "net_margin") — the demo company's actual engine output, never invented.
// PRODUCT.md: demo data is usable in UI as long as it is labeled as such
// (the ДЕМО-ДАННЫЕ ticket below does that labeling).
const NET_MARGIN_VALUE = 4.5750023106072275;
const NET_MARGIN_LOW = 3.7267;
const NET_MARGIN_HIGH = 7.8918;
const BENCHMARK_SOURCE = "Damodaran (NYU Stern), Jan 2026";

// The hero's proof artifact: one live instrument module, built from the
// same primitives the real results page composes — not a screenshot of a
// dashboard in a browser frame. Replaces the retired paper-register
// ReportFragment (bordered "life-size report" card): no outer bezel wraps
// this — InstrumentModule already is the one bezel, and nesting a second
// frame around it is the "nested cards" anti-pattern the craft floor bans.
export function DemoInstrument() {
  const t = useTranslations("Landing.demo");
  const tStatus = useTranslations("Status");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <OriginTicket>{t("industry")}</OriginTicket>
        <OriginTicket>{t("period")}</OriginTicket>
        <OriginTicket>{t("currency")}</OriginTicket>
        <OriginTicket tone="attention">{t("demoLabel")}</OriginTicket>
      </div>

      <InstrumentModule
        label={t("ratioName")}
        figure={
          <SegmentDisplay
            value={NET_MARGIN_VALUE}
            decimals={2}
            locale={locale}
            caption={t("ratioName")}
          />
        }
        unit="%"
      >
        <StatusPill status="good" label={tStatus("good")} />
        <CalibrationScale
          className="mt-3"
          value={NET_MARGIN_VALUE}
          low={NET_MARGIN_LOW}
          high={NET_MARGIN_HIGH}
          unit="%"
          locale={locale}
          tone="good"
          label={t("calibrationLabel")}
        />
      </InstrumentModule>

      <p className="font-mono text-xs text-ink-muted">
        {t("sourceLabel")} {BENCHMARK_SOURCE}
      </p>
    </div>
  );
}
