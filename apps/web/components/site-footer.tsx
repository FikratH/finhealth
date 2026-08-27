import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    // Same bezel-panel treatment as SiteHeader — the console strip closing
    // the instrument, not a flush extension of the page ground.
    <footer className="border-t border-line bg-panel print:hidden">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <p className="max-w-prose text-sm text-ink-muted">{t("disclaimer")}</p>
      </div>
    </footer>
  );
}
