import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionHeading } from "@/components/section-heading";
import { StatusPill } from "@/components/status-pill";
import { ScoreDial } from "@/components/score-dial";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { MetricNumber } from "@/components/metric-number";
import { SpecimenChip } from "@/components/specimen-chip";
import { NormBand } from "@/components/norm-band";
import type { Locale } from "@/lib/format";

// Dev-only visual QA surface — every primitive, every state, both themes
// side by side. Not linked from product navigation; 404s outside dev.
const PALETTE = [
  { name: "--paper", light: "#FBFAF7", dark: "#111413" },
  { name: "--ink", light: "#1A1D1C", dark: "#E9E7E2" },
  { name: "--ink-muted", light: "#5A605D", dark: "#9AA19D" },
  { name: "--line", light: "#E3E1DA", dark: "#2A2E2C" },
  { name: "--accent", light: "#0E7569", dark: "#2FA394" },
  { name: "--good", light: "#177E4D", dark: "#3FAE76" },
  { name: "--attention", light: "#A8681C", dark: "#C98A3A" },
  { name: "--critical", light: "#B23B2E", dark: "#D1655A" },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <SectionHeading>{title}</SectionHeading>
      {children}
    </section>
  );
}

// Class-scoped preview: the "dark" half wears the .dark class locally, so
// both themes render side by side regardless of the page's active theme.
function ThemePreview({
  children,
  lightLabel,
  darkLabel,
}: {
  children: ReactNode;
  lightLabel: string;
  darkLabel: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border border-line bg-paper p-6 text-ink">
        <p className="mb-4 font-mono text-xs uppercase tracking-wide text-ink-muted">
          {lightLabel}
        </p>
        {children}
      </div>
      <div className="dark border border-line bg-paper p-6 text-ink">
        <p className="mb-4 font-mono text-xs uppercase tracking-wide text-ink-muted">
          {darkLabel}
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
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PALETTE.map((token) => (
              <li key={token.name} className="space-y-1">
                <div
                  className="h-10 w-full border border-line"
                  style={{ backgroundColor: `var(${token.name})` }}
                />
                <p className="font-mono text-xs text-ink">{token.name}</p>
                <p className="font-mono text-[0.65rem] text-ink-muted">
                  {token.light} / {token.dark}
                </p>
              </li>
            ))}
          </ul>
        </ThemePreview>
      </Section>

      <Section title={t("typeHeading")}>
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
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
          </div>
        </ThemePreview>
      </Section>

      <Section title={t("gridHeading")}>
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
          <div className="grid-paper h-24 border border-line" />
        </ThemePreview>
      </Section>

      <Section title={t("statusHeading")}>
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
          <div className="flex flex-wrap gap-3">
            <StatusPill status="good" label={tStatus("good")} />
            <StatusPill status="attention" label={tStatus("attention")} />
            <StatusPill status="critical" label={tStatus("critical")} />
            <StatusPill status="na" label={tStatus("na")} />
          </div>
        </ThemePreview>
      </Section>

      <Section title={t("scoreHeading")}>
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
          <div className="flex flex-wrap gap-6">
            <ScoreDial score={86.8} locale={loc} />
            <ScoreDial score={41.2} locale={loc} />
            <ScoreDial score={null} locale={loc} caption={t("scoreInsufficientData")} />
          </div>
        </ThemePreview>
      </Section>

      <Section title={t("confidenceHeading")}>
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
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
        </ThemePreview>
      </Section>

      <Section title={t("metricHeading")}>
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
          <div className="flex flex-wrap items-baseline gap-6 text-lg">
            <MetricNumber value={1.66} unit="x" locale={loc} />
            <MetricNumber value={42.5} unit="%" locale={loc} />
            <MetricNumber value={2271100} unit="money" locale={loc} decimals={0} muted />
            <MetricNumber value={null} locale={loc} naLabel={t("naLabel")} />
          </div>
        </ThemePreview>
      </Section>

      <Section title={t("headingHeading")}>
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
          <SectionHeading level={3}>{t("headingSample")}</SectionHeading>
        </ThemePreview>
      </Section>

      <Section title={t("chipHeading")}>
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
          <div className="flex flex-wrap gap-2">
            <SpecimenChip>{t("chipIndustry")}</SpecimenChip>
            <SpecimenChip tone="accent">{t("chipPeriod")}</SpecimenChip>
            <SpecimenChip tone="attention">{t("chipDemo")}</SpecimenChip>
          </div>
        </ThemePreview>
      </Section>

      <Section title={t("normBandHeading")}>
        <ThemePreview lightLabel={t("themeLight")} darkLabel={t("themeDark")}>
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
        </ThemePreview>
      </Section>
    </div>
  );
}
