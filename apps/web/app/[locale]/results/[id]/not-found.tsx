import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

// Designed absence for a missing/expired analysis id — the same discipline
// as a null ratio value: composed, charged emptiness with a next action,
// never an apologetic blank page. No eyebrow above the heading (banned by
// the craft floor); the heading carries its own weight.
export default function ResultsNotFound() {
  const t = useTranslations("Results.notFound");

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <div className="grid-paper border-2 border-ink p-10 text-center">
        <h1 className="font-display text-3xl text-ink">{t("heading")}</h1>
        <p className="mt-4 text-ink-muted">{t("body")}</p>
        <Button asChild className="mt-6">
          <Link href="/analyze">{t("cta")}</Link>
        </Button>
      </div>
    </div>
  );
}
