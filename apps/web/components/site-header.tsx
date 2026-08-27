import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  const t = useTranslations("Header");

  return (
    <header className="border-b border-line bg-paper print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="rounded-sm font-display text-xl text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("wordmark")}
        </Link>
        <div className="flex items-center gap-4">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
