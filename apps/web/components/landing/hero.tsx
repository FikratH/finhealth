import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { WordmarkIgnite } from "@/components/wordmark-ignite";
import { DemoInstrument } from "@/components/landing/demo-instrument";

// FIRST VIEWPORT contract (design-direction.md, «Tonus Monitor»): full-bleed
// monitor ground (bg-paper resolves to the near-black instrument ground on
// the default register — see globals.css's theme-inversion note); the
// wordmark ignites segment by segment as the hero moment (WordmarkIgnite —
// see its own header comment for the seven-segment letter truth table); a
// single h1 carries the offer — the wordmark is the brand mark, not a
// heading, so it stays outside the heading tree and the page keeps exactly
// one h1; one live demo instrument beneath it; one physical-button primary
// action. No dashboards-in-frames, no logo walls.
export function LandingHero() {
  const t = useTranslations("Landing.hero");

  return (
    <section className="bg-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-end gap-4 px-6 pt-4">
        <LocaleSwitch />
        <ThemeToggle />
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 md:pb-24 md:pt-12">
        <Link
          href="/"
          data-testid="hero-wordmark"
          className="inline-block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <WordmarkIgnite className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl" />
        </Link>

        <div className="mt-10 grid gap-10 md:grid-cols-2 md:items-start">
          <div className="space-y-6">
            <h1 className="text-balance font-display text-3xl leading-tight text-ink sm:text-4xl">
              {t("h1")}
            </h1>
            <p className="max-w-prose text-lg text-ink-muted">{t("lede")}</p>
            <Button
              asChild
              size="lg"
              className="h-auto gap-2 border-2 border-brand bg-panel px-8 py-3.5 font-mono text-sm uppercase tracking-wide text-brand shadow-[0_0_16px_2px_color-mix(in_oklch,var(--accent)_40%,transparent)] hover:bg-brand/10 hover:shadow-[0_0_20px_3px_color-mix(in_oklch,var(--accent)_50%,transparent)] active:shadow-[0_0_8px_1px_color-mix(in_oklch,var(--accent)_40%,transparent)] focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              <Link href="/analyze">
                <Play aria-hidden="true" className="size-4" />
                {t("cta")}
              </Link>
            </Button>
          </div>

          <DemoInstrument />
        </div>
      </div>
    </section>
  );
}
