import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { MetricNumber } from "@/components/metric-number";
import { StatusPill, type Status } from "@/components/status-pill";
import type { RiskRadar as RiskRadarData } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface RiskRadarProps {
  riskRadar: RiskRadarData;
  locale: Locale;
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
  const { altman, piotroski, beneish, dupont } = riskRadar;

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
      <div className="grid gap-6 md:grid-cols-2">
        {altman && (
          <div className="border border-line p-4 print:break-inside-avoid">
            <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
              {t("altmanHeading")}
            </p>
            <div className="mt-2 flex items-baseline gap-3">
              <MetricNumber
                value={altman.value}
                unit={altman.unit}
                locale={locale}
                className="text-2xl"
              />
              <StatusPill status={altman.status} label={tStatus(altman.status)} />
            </div>
          </div>
        )}

        <div className="border border-line p-4 print:break-inside-avoid">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
            {t("piotroski.heading")}
          </p>
          <p className="mt-2 font-mono text-2xl tabular-nums text-ink">
            {piotroski.score}/{piotroski.max}
          </p>
          <p className="mt-1 text-sm text-ink-muted">{piotroski.interpretation}</p>
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
        </div>

        <div className="border border-line p-4 print:break-inside-avoid">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
            {t("beneish.heading")}
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <MetricNumber value={beneish.m_score} decimals={2} locale={locale} className="text-2xl" />
            <StatusPill
              status={beneish.flag ? BENEISH_FLAG_STATUS[beneish.flag] : "na"}
              label={beneishFlagLabel}
            />
          </div>
          <p className="mt-2 text-sm text-ink-muted">{beneish.interpretation}</p>
        </div>

        <div className="border border-line p-4 print:break-inside-avoid">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
            {t("dupont.heading")}
          </p>
          {dupont ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <MetricNumber value={dupont.net_margin} unit="%" locale={locale} />
              <span aria-hidden="true" className="text-ink-muted">
                ×
              </span>
              <MetricNumber value={dupont.asset_turnover} unit="x" locale={locale} />
              <span aria-hidden="true" className="text-ink-muted">
                ×
              </span>
              <MetricNumber value={dupont.equity_multiplier} unit="x" locale={locale} />
              <span aria-hidden="true" className="text-ink-muted">
                =
              </span>
              <MetricNumber value={dupont.roe} unit="%" locale={locale} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">{t("dupont.unavailable")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
