import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionHeading } from "@/components/section-heading";
import { StatusPill } from "@/components/status-pill";
import { ScoreDial } from "@/components/score-dial";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { MetricNumber } from "@/components/metric-number";
import { SpecimenChip } from "@/components/specimen-chip";
import { OriginTicket } from "@/components/origin-ticket";
import { NormBand } from "@/components/norm-band";
import { SegmentDisplay } from "@/components/segment-display";
import { InstrumentModule } from "@/components/instrument-module";
import { AnnunciatorCell } from "@/components/annunciator-cell";
import { CalibrationScale } from "@/components/calibration-scale";
import type { Locale } from "@/lib/format";

// Dev-only visual QA surface — every primitive, every state, both registers
// side by side. Not linked from product navigation; 404s outside dev.
const PALETTE = [
  { name: "--paper", monitor: "#0A0C0E", paper: "#FBFAF7" },
  { name: "--panel", monitor: "#101418", paper: "#FBFAF7" },
  { name: "--ink", monitor: "#E6EDF0", paper: "#1A1D1C" },
  { name: "--ink-muted", monitor: "#7C8A92", paper: "#5A605D" },
  { name: "--line", monitor: "#1E242A", paper: "#E3E1DA" },
  { name: "--accent", monitor: "#19C2B0", paper: "#0E7569" },
  { name: "--good", monitor: "#33E07A", paper: "#177E4D" },
  { name: "--attention", monitor: "#FFB020", paper: "#96601A" },
  { name: "--critical", monitor: "#FF4A3A", paper: "#B23B2E" },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <SectionHeading>{title}</SectionHeading>
      {children}
    </section>
  );
}

// Class-scoped preview: each column wears its register's theme class
// locally (.dark for Monitor, .paper for Paper), so both render correctly
// side by side regardless of which register the page itself is in — :root
// alone can't do this since it only matches the actual root element, not a
// nested preview div (see globals.css's theme-inversion comment).
function RegisterPreview({
  children,
  monitorLabel,
  paperLabel,
}: {
  children: ReactNode;
  monitorLabel: string;
  paperLabel: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="dark border border-line bg-paper p-6 text-ink">
        <p className="mb-4 font-mono text-xs uppercase tracking-wide text-ink-muted">
          {monitorLabel}
        </p>
        {children}
      </div>
      <div className="paper border border-line bg-paper p-6 text-ink">
        <p className="mb-4 font-mono text-xs uppercase tracking-wide text-ink-muted">
          {paperLabel}
        </p>
        {children}
      </div>
    </div>
  );
}

type DevTokensPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function DevTokensPage({ params }: DevTokensPageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("DevTokens");
  const tStatus = await getTranslations("Status");
  const loc = locale as Locale;

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-6 py-12">
      <div>
        <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
        <p className="mt-2 max-w-prose text-ink-muted">{t("lede")}</p>
      </div>

      <Section title={t("paletteHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PALETTE.map((token) => (
              <li key={token.name} className="space-y-1">
                <div
                  className="h-10 w-full border border-line"
                  style={{ backgroundColor: `var(${token.name})` }}
                />
                <p className="font-mono text-xs text-ink">{token.name}</p>
                <p className="font-mono text-[0.65rem] text-ink-muted">
                  {token.monitor} / {token.paper}
                </p>
              </li>
            ))}
          </ul>
        </RegisterPreview>
      </Section>

      <Section title={t("typeHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="space-y-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
                {t("typeDisplayLabel")}
              </p>
              <p className="font-display text-2xl text-ink">{t("typeDisplaySample")}</p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
                {t("typeSansLabel")}
              </p>
              <p className="max-w-prose text-ink">{t("typeSansSample")}</p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
                {t("typeMonoLabel")}
              </p>
              <p className="font-mono text-ink">{t("typeMonoSample")}</p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
                {t("typeSegmentLabel")}
              </p>
              <p className="font-segment text-2xl text-ink">{t("typeSegmentSample")}</p>
            </div>
          </div>
        </RegisterPreview>
      </Section>

      <Section title={t("gridHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="grid-paper h-24 border border-line" />
        </RegisterPreview>
      </Section>

      <Section title={t("segmentHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="flex flex-col gap-4">
            <SegmentDisplay value={4.58} decimals={2} locale={loc} />
            <SegmentDisplay value={-12.3} decimals={1} locale={loc} />
            <SegmentDisplay value={null} digits={4} naLabel={t("naLabel")} locale={loc} />
            <div>
              <p className="mb-1 font-mono text-[0.65rem] uppercase tracking-wide text-ink-muted">
                {t("segmentGhostLabel")}
              </p>
              <SegmentDisplay value={5} digits={5} locale={loc} />
            </div>
            <SegmentDisplay value={1234567} locale={loc} />
          </div>
        </RegisterPreview>
      </Section>

      <Section title={t("instrumentHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <InstrumentModule
            label={t("instrumentDemoLabel")}
            figure={<SegmentDisplay value={4.58} decimals={2} locale={loc} />}
            unit="%"
          >
            <CalibrationScale
              value={4.58}
              low={2}
              high={8}
              unit="%"
              locale={loc}
              tone="good"
              label={t("calibrationDemoLabel")}
            />
          </InstrumentModule>
        </RegisterPreview>
      </Section>

      <Section title={t("annunciatorHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="flex flex-col gap-3">
            <AnnunciatorCell status="good" label={tStatus("good")} />
            <AnnunciatorCell status="attention" label={tStatus("attention")} />
            <AnnunciatorCell status="critical" label={tStatus("critical")} />
            <AnnunciatorCell status="na" label={tStatus("na")} />
          </div>
        </RegisterPreview>
      </Section>

      <Section title={t("calibrationHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="flex max-w-xs flex-col gap-4">
            <CalibrationScale
              value={1.66}
              low={1.5}
              high={3.0}
              unit="x"
              locale={loc}
              tone="good"
              label={t("calibrationDemoLabel")}
            />
            <CalibrationScale
              value={0.8}
              low={1.5}
              high={3.0}
              unit="x"
              locale={loc}
              tone="critical"
              label={t("calibrationDemoLabel")}
            />
            <CalibrationScale
              value={null}
              low={1.5}
              high={3.0}
              unit="x"
              locale={loc}
              naLabel={t("naLabel")}
              label={t("calibrationDemoLabel")}
            />
          </div>
        </RegisterPreview>
      </Section>

      <Section title={t("statusHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="flex flex-wrap gap-3">
            <StatusPill status="good" label={tStatus("good")} />
            <StatusPill status="attention" label={tStatus("attention")} />
            <StatusPill status="critical" label={tStatus("critical")} />
            <StatusPill status="na" label={tStatus("na")} />
          </div>
        </RegisterPreview>
      </Section>

      <Section title={t("scoreHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="flex flex-wrap gap-6">
            <ScoreDial score={86.8} locale={loc} />
            <ScoreDial score={41.2} locale={loc} />
            <ScoreDial score={null} locale={loc} caption={t("scoreInsufficientData")} />
          </div>
        </RegisterPreview>
      </Section>

      <Section title={t("confidenceHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="flex max-w-xs flex-col gap-3">
            <ConfidenceMeter value={92} locale={loc} label={t("confidenceHighLabel")} />
            <ConfidenceMeter value={45} locale={loc} label={t("confidenceLowLabel")} />
            <ConfidenceMeter
              value={null}
              locale={loc}
              label={t("confidenceNaLabel")}
              naLabel={t("naLabel")}
            />
          </div>
        </RegisterPreview>
      </Section>

      <Section title={t("metricHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="flex flex-wrap items-baseline gap-6 text-lg">
            <MetricNumber value={1.66} unit="x" locale={loc} />
            <MetricNumber value={42.5} unit="%" locale={loc} />
            <MetricNumber value={2271100} unit="money" locale={loc} decimals={0} muted />
            <MetricNumber value={null} locale={loc} naLabel={t("naLabel")} />
          </div>
        </RegisterPreview>
      </Section>

      <Section title={t("headingHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <SectionHeading level={3}>{t("headingSample")}</SectionHeading>
        </RegisterPreview>
      </Section>

      <Section title={t("chipHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="flex flex-wrap gap-2">
            <OriginTicket>{t("chipIndustry")}</OriginTicket>
            <OriginTicket tone="accent">{t("chipPeriod")}</OriginTicket>
            <OriginTicket tone="attention">{t("chipDemo")}</OriginTicket>
            <SpecimenChip tone="accent">{t("chipDemo")}</SpecimenChip>
          </div>
        </RegisterPreview>
      </Section>

      <Section title={t("normBandHeading")}>
        <RegisterPreview monitorLabel={t("themeDark")} paperLabel={t("themeLight")}>
          <div className="flex flex-col gap-3">
            <NormBand
              value={1.66}
              low={1.5}
              high={3.0}
              unit="x"
              locale={loc}
              normLabel={t("normLabel")}
              aboveLabel={t("aboveRange")}
              belowLabel={t("belowRange")}
              naLabel={t("naLabel")}
            />
            <NormBand
              value={4.2}
              low={1.5}
              high={3.0}
              unit="x"
              locale={loc}
              normLabel={t("normLabel")}
              aboveLabel={t("aboveRange")}
              belowLabel={t("belowRange")}
              naLabel={t("naLabel")}
            />
            <NormBand
              value={0.8}
              low={1.5}
              high={3.0}
              unit="x"
              locale={loc}
              normLabel={t("normLabel")}
              aboveLabel={t("aboveRange")}
              belowLabel={t("belowRange")}
              naLabel={t("naLabel")}
            />
            <NormBand
              value={null}
              low={1.5}
              high={3.0}
              unit="x"
              locale={loc}
              normLabel={t("normLabel")}
              aboveLabel={t("aboveRange")}
              belowLabel={t("belowRange")}
              naLabel={t("naLabel")}
            />
          </div>
        </RegisterPreview>
      </Section>
    </div>
  );
}
