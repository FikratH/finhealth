import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReportFragment } from "@/components/landing/report-fragment";

// FIRST VIEWPORT contract (design-direction.md): full-width teal band with
// wordmark «Тонус»; left column — one-line offer + primary action; right —
// a life-size report fragment. Per the controller's ruling, the wordmark
// lives INSIDE this band as the band's own header row (SiteHeader renders
// nothing on this route — see site-header.tsx — so this is the page's only
// wordmark, not a second one layered on top of the paper chrome). The
// accent commits at region scale here (the whole band), not as a scattered
// chip — so full-bleed, no mx-auto wrapper on the section itself (only its
// inner content is measure-constrained).
export function LandingHero() {
  const t = useTranslations("Landing.hero");
  const tHeader = useTranslations("Header");

  return (
    <section className="bg-brand">
      <header className="border-b border-paper/15">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            data-testid="hero-wordmark"
            className="rounded-sm font-display text-xl text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/50"
          >
            {tHeader("wordmark")}
          </Link>
          <div className="flex items-center gap-4">
            <LocaleSwitch tone="onBrand" />
            <ThemeToggle tone="onBrand" />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-10 px-6 pb-16 pt-6 md:grid-cols-2 md:items-center md:pb-24 md:pt-10">
        <div className="hero-enter space-y-6">
          <h1 className="text-balance font-display text-4xl leading-tight text-paper sm:text-5xl">
            {t("h1")}
          </h1>
          <p className="max-w-prose text-lg text-paper">{t("lede")}</p>
          <Button
            asChild
            size="lg"
            className="bg-paper text-brand hover:bg-paper/90 focus-visible:ring-paper/50"
          >
            <Link href="/analyze">{t("cta")}</Link>
          </Button>
        </div>
        <div className="hero-enter hero-enter-2">
          <ReportFragment />
        </div>
      </div>
    </section>
  );
}
