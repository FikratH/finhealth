import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { OriginTicket } from "@/components/origin-ticket";
import { CheckIcon } from "@/components/icons";
import { WaitlistForm } from "@/components/pricing/waitlist-form";

// Static content + the Free tier's navigation CTA render as a plain server
// component (no client JS needed for either) — only the Pro tier's email
// form (WaitlistForm) is a client island, the same server/client split
// MethodologyDocument's own header comment describes for its page.
const FREE_FEATURES = ["feature1", "feature2", "feature3"] as const;
const PRO_FEATURES = ["feature1", "feature2", "feature3", "feature4"] as const;

// One shared physical-button class string (DESIGN.md's "the landing CTA —
// a literal physical button": border-2 border-brand bg-panel, a lit-LED
// glow that dims on :active) — duplicated from landing/hero.tsx rather
// than extracted into a shared component, matching that file's own choice
// to keep the classes inline instead of behind an abstraction.
const PHYSICAL_BUTTON_CLASS =
  "h-auto w-full border-2 border-brand bg-panel px-8 py-3.5 font-mono text-sm uppercase tracking-wide text-brand shadow-[0_0_16px_2px_color-mix(in_oklch,var(--accent)_40%,transparent)] hover:bg-brand/10 hover:shadow-[0_0_20px_3px_color-mix(in_oklch,var(--accent)_50%,transparent)] active:shadow-[0_0_8px_1px_color-mix(in_oklch,var(--accent)_40%,transparent)] focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper sm:w-auto";

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
          <p className="mt-2 font-display text-4xl text-ink">{tFree("price")}</p>

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
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-display text-4xl text-ink">{tPro("price")}</span>
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
