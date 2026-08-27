"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LocaleSwitch() {
  const t = useTranslations("Header");
  const locale = useLocale();
  // Falls back to "/" outside a real Next.js App Router context (e.g. an
  // isolated component render in tests) — next-intl's usePathname reads a
  // React context whose default is `null`, and passing that straight to
  // its Link as `href` crashes (`typeof null === "object"`, so it tries to
  // read `null.pathname`). In the real app this hook always resolves to
  // the actual route.
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label={t("localeSwitchLabel")}
      className="flex items-center gap-1 font-mono text-xs uppercase tracking-wide"
    >
      {routing.locales.map((loc, index) => (
        <span key={loc} className="flex items-center gap-1">
          {index > 0 && (
            <span className="text-ink-muted" aria-hidden="true">
              /
            </span>
          )}
          <Link
            href={pathname}
            locale={loc}
            aria-current={loc === locale ? "true" : undefined}
            className={cn(
              "rounded-sm px-1 py-0.5 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              loc === locale ? "text-ink" : "text-ink-muted",
            )}
          >
            {loc}
          </Link>
        </span>
      ))}
    </nav>
  );
}
