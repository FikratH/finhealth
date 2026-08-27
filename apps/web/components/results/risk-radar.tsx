import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { MetricNumber } from "@/components/metric-number";
import { StatusPill, type Status } from "@/components/status-pill";
import { InstrumentModule } from "@/components/instrument-module";
import type { RiskRadar as RiskRadarData } from "@/lib/api-types";
import type { Locale } from "@/lib/format";
import type { NumberUnit } from "@/lib/format";

export interface RiskRadarProps {
  riskRadar: RiskRadarData;
  locale: Locale;
}

interface DupontFactorProps {
  value: number | null;
  unit: NumberUnit;
  locale: Locale;
  naLabel: string;
  label: string;
}

// One DuPont factor: the PT Mono figure above, a small ink-muted caption
// naming it below — without the label, four bare numbers joined by ×/=
// read as arithmetic, not as net margin/turnover/leverage/ROE.
function DupontFactor({ value, unit, locale, naLabel, label }: DupontFactorProps) {
  return (
    <span className="inline-flex flex-col items-center">
      <MetricNumber value={value} unit={unit} locale={locale} naLabel={naLabel} className="text-lg" />
      <span className="mt-0.5 font-mono text-[0.65rem] uppercase tracking-wide text-ink-muted">
        {label}
      </span>
    </span>
  );
}

// Beneish's flag is a statistical association, never an accusation — the
// backend's own interpretation string is already written in careful,
// hedged language (services/beneish.py's _computed_interpretation), so
// this component renders it verbatim rather than summarizing it. The pill
// still carries the severity color; the paragraph carries the caveats.
const BENEISH_FLAG_STATUS: Record<string, Status> = {
  high: "critical",
  grey: "attention",
  low: "good",
};

export function RiskRadar({ riskRadar, locale }: RiskRadarProps) {
  const t = useTranslations("Results.riskRadar");
  const tStatus = useTranslations("Status");
  const tRatios = useTranslations("Results.ratios");
  const { altman, piotroski, beneish, dupont } = riskRadar;
  const naLabel = tRatios("naLabel");

  const beneishFlagLabel =
    beneish.flag === "high"
      ? t("beneish.flagHigh")
      : beneish.flag === "grey"
        ? t("beneish.flagGrey")
        : beneish.flag === "low"
          ? t("beneish.flagLow")
          : t("beneish.flagUnavailable");

  return (
    <section className="space-y-6">
      <SectionHeading>{t("heading")}</SectionHeading>
      {/* The four-instrument cluster: each model gets its own
       * InstrumentModule bezel — the same grammar every metric tile on the
       * monitor uses — rather than a bespoke bordered div per model. */}
      <div className="grid gap-6 md:grid-cols-2">
        {altman && (
          <InstrumentModule
            className="print:break-inside-avoid"
            // The API's own model name, verbatim — it carries a caveat
            // that a generic "Альтман Z" label drops: this build always
            // runs the private-company variant without X2 (see
            // altman.warnings), which understates the score. That caveat
            // belongs on the card, not buried in a details toggle.
            label={altman.name}
            figure={
              <MetricNumber
                value={altman.value}
                unit={altman.unit}
                locale={locale}
                naLabel={naLabel}
                className="text-2xl"
              />
            }
          >
            <StatusPill status={altman.status} label={tStatus(altman.status)} />
            <p className="mt-2 text-sm text-ink-muted">{altman.explanation}</p>
          </InstrumentModule>
        )}

        <InstrumentModule
          className="print:break-inside-avoid"
          label={t("piotroski.heading")}
          figure={
            <span className="font-mono text-2xl tabular-nums text-ink">
              {piotroski.score}/{piotroski.max}
            </span>
          }
        >
          <p className="text-sm text-ink-muted">{piotroski.interpretation}</p>
          <ul className="mt-3 space-y-1.5">
            {piotroski.signals.map((signal) => {
              const status: Status =
                signal.value === true ? "good" : signal.value === false ? "attention" : "na";
              const label =
                signal.value === true
                  ? t("piotroski.signalMet")
                  : signal.value === false
                    ? t("piotroski.signalNotMet")
                    : t("piotroski.signalUnavailable");
              return (
                <li key={signal.key} className="flex items-start gap-2 text-sm">
                  <StatusPill status={status} label={label} className="mt-0.5 shrink-0" />
                  <span className="text-ink-muted">
                    <span className="text-ink">{signal.name}.</span> {signal.detail}
                  </span>
                </li>
              );
            })}
          </ul>
        </InstrumentModule>

        <InstrumentModule
          className="print:break-inside-avoid"
          label={t("beneish.heading")}
          figure={
            <MetricNumber
              value={beneish.m_score}
              decimals={2}
              locale={locale}
              naLabel={naLabel}
              className="text-2xl"
            />
          }
        >
          <StatusPill
            status={beneish.flag ? BENEISH_FLAG_STATUS[beneish.flag] : "na"}
            label={beneishFlagLabel}
          />
          <p className="mt-2 text-sm text-ink-muted">{beneish.interpretation}</p>
        </InstrumentModule>

        <InstrumentModule
          className="print:break-inside-avoid"
          label={t("dupont.heading")}
          figure={
            dupont ? (
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <DupontFactor
                  value={dupont.net_margin}
                  unit="%"
                  locale={locale}
                  naLabel={naLabel}
                  label={t("dupont.netMargin")}
                />
                <span aria-hidden="true" className="pb-4 text-ink-muted">
                  ×
                </span>
                <DupontFactor
                  value={dupont.asset_turnover}
                  unit="x"
                  locale={locale}
                  naLabel={naLabel}
                  label={t("dupont.assetTurnover")}
                />
                <span aria-hidden="true" className="pb-4 text-ink-muted">
                  ×
                </span>
                <DupontFactor
                  value={dupont.equity_multiplier}
                  unit="x"
                  locale={locale}
                  naLabel={naLabel}
                  label={t("dupont.equityMultiplier")}
                />
                <span aria-hidden="true" className="pb-4 text-ink-muted">
                  =
                </span>
                <DupontFactor
                  value={dupont.roe}
                  unit="%"
                  locale={locale}
                  naLabel={naLabel}
                  label={t("dupont.roe")}
                />
              </div>
            ) : (
              <span className="text-sm text-ink-muted">{t("dupont.unavailable")}</span>
            )
          }
        />
      </div>
    </section>
  );
}
