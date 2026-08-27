import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

type DevOgPageProps = {
  params: Promise<{ locale: string }>;
};

// Dev-only capture surface for the static branded OG image:
// scripts/generate-og.mjs screenshots this route at an exact 1200×630
// viewport and the result is committed to public/og/og-default.png (run
// once, not regenerated at build time — see that script's header
// comment). Not linked from product navigation; 404s outside dev, same
// discipline as /dev/tokens and /dev/motion.
//
// The composition is a `fixed inset-0` overlay rather than a normal
// in-flow page — SiteHeader/SiteFooter still render underneath it (this
// route sits inside the shared locale layout like every other page), but
// the overlay fully covers the viewport so a viewport-only screenshot
// never picks up that chrome. Logo + tagline only, on the Monitor
// world's own ground and grid texture (bg-paper + grid-paper — see
// globals.css) — no invented copy: the tagline is the landing hero's own
// sanctioned h1 line, not a separate marketing string.
export default async function DevOgPage({ params }: DevOgPageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Landing.hero" });

  return (
    <div
      data-og-capture
      className="grid-paper fixed inset-0 z-50 flex items-center justify-center bg-paper px-24"
    >
      <div className="flex flex-col items-center gap-10 text-center">
        <img src="/brand/logo-teal.png" alt="Tonus" width={800} height={450} className="h-28 w-auto" />
        <p className="max-w-3xl text-balance font-display text-5xl leading-tight text-ink">
          {t("h1")}
        </p>
      </div>
    </div>
  );
}
