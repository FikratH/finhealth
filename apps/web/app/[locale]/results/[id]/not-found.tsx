import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

// Designed absence for a missing/expired analysis id — the same discipline
// as a null ratio value: composed, charged emptiness with a next action,
// never an apologetic blank page. No eyebrow above the heading (banned by
// the craft floor); the heading carries its own weight.
//
// Reuses the annunciator idiom (glyph + status color + bezel) that
// error.tsx uses, but in the "na" tone (AnnunciatorCell/StatusPill's own
// ghost-dot glyph, ink-muted, no glow) rather than critical red: nothing
// failed here — the report simply isn't there, the same honest-absence
// read as an unlit segment cell, not an alarm.
export default function ResultsNotFound() {
  const t = useTranslations("Results.notFound");

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <div className="ghost-cell-texture border border-line bg-panel p-10 text-center">
        <p aria-hidden="true" className="font-mono text-3xl leading-none text-ink-muted">
          ·
        </p>
        <h1 className="mt-4 font-display text-3xl text-ink">{t("heading")}</h1>
        <p className="mt-4 text-ink-muted">{t("body")}</p>
        <Button asChild className="mt-6">
          <Link href="/analyze">{t("cta")}</Link>
        </Button>
      </div>
    </div>
  );
}
