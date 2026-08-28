import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { OriginTicket } from "@/components/origin-ticket";
import { CheckIcon } from "@/components/icons";
import { WaitlistForm } from "@/components/pricing/waitlist-form";
import { PriceFigure } from "@/components/pricing/price-figure";
import { PHYSICAL_BUTTON_CLASS } from "@/components/pricing/physical-button-class";

// Static content + the Free tier's navigation CTA render as a plain server
// component (no client JS needed for either) — only the Pro tier's email
// form (WaitlistForm) is a client island, the same server/client split
// MethodologyDocument's own header comment describes for its page.
const FREE_FEATURES = ["feature1", "feature2", "feature3"] as const;
const PRO_FEATURES = ["feature1", "feature2", "feature3", "feature4"] as const;

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((label, index) => (
        <li key={index} className="flex items-start gap-2 text-sm text-ink">
          <CheckIcon className="mt-0.5 shrink-0 text-brand" />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}

export function PricingTiers() {
  const t = useTranslations("Pricing");
  const tFree = useTranslations("Pricing.free");
  const tPro = useTranslations("Pricing.pro");

  const freeFeatures = FREE_FEATURES.map((key) => tFree(key));
  const proFeatures = PRO_FEATURES.map((key) => tPro(key));

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading level={1}>{t("heading")}</SectionHeading>
      <p className="mt-4 max-w-prose text-ink-muted">{t("intro")}</p>

      <div className="mt-10 grid gap-6 md:grid-cols-2 md:items-start">
        {/* Free — an instrument-panel bezel, same grammar as SigninForm's
         * panel (border border-line bg-panel). */}
        <div className="border border-line bg-panel p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
            {tFree("title")}
          </p>
          {/* finish-wave material_fix 1: the price is a real, headline
           * figure ("every headline figure" per DESIGN.md's typography
           * hierarchy, and the North Star's own "price totem" rendition)
           * — the segment voice, not Inter. A lit segment zero is correct
           * here: Free's price is genuinely 0, a real value, not designed
           * absence («Н/Д» is reserved for missing data, which this
           * isn't). */}
          <p className="mt-2">
            <PriceFigure
              value={Number(tFree("price"))}
              className="text-4xl"
              caption={t("priceCaption")}
            />
          </p>

          <FeatureList items={freeFeatures} />

          <Button asChild className={`mt-8 ${PHYSICAL_BUTTON_CLASS}`}>
            <Link href="/analyze">{tFree("cta")}</Link>
          </Button>
        </div>

        {/* Pro — the waitlist tier: same bezel, plus the launch-pricing
         * disclosure chip (PRODUCT.md's honesty rule: prices are marked
         * launch-pricing-subject-to-change) and the email capture form. */}
        <div className="border border-line bg-panel p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
            {tPro("title")}
          </p>
          {/* Currency symbol and period are PT Mono adjuncts OUTSIDE the
           * segment mask — DESIGN.md: "a SegmentDisplay/DSEG7 mask
           * carries numeric figures only." Same pattern InstrumentModule
           * uses for its own figure+unit row. */}
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-mono text-lg text-ink-muted">{tPro("priceCurrency")}</span>
            <PriceFigure
              value={Number(tPro("price"))}
              className="text-4xl"
              caption={t("priceCaption")}
            />
            <span className="font-mono text-sm text-ink-muted">{tPro("pricePeriod")}</span>
          </div>
          <OriginTicket tone="attention" className="mt-3">
            {tPro("priceNote")}
          </OriginTicket>

          <FeatureList items={proFeatures} />

          <p className="mt-6 text-sm text-ink-muted">{tPro("intro")}</p>

          <div className="mt-4">
            <WaitlistForm />
          </div>
        </div>
      </div>
    </div>
  );
}
