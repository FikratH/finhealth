import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ReportFragment } from "@/components/landing/report-fragment";

// FIRST VIEWPORT contract (design-direction.md): full-width teal band; left
// column — one-line offer + primary action; right — a life-size report
// fragment. The accent commits at region scale here (the whole band), not
// as a scattered chip — so full-bleed, no mx-auto wrapper on the section
// itself (only its inner content is measure-constrained).
export function LandingHero() {
  const t = useTranslations("Landing.hero");

  return (
    <section className="bg-brand">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
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
