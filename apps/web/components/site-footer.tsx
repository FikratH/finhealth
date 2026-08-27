import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className="border-t border-line bg-paper print:hidden">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <p className="max-w-prose text-sm text-ink-muted">{t("disclaimer")}</p>
      </div>
    </footer>
  );
}
