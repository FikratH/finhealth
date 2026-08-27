"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export interface LocaleSwitchProps {
  /** "muted" (default) reads against paper, as everywhere in SiteHeader.
   * "onBrand" reads against the teal hero band — the landing route's
   * header row, merged into the band per the FIRST VIEWPORT contract. */
  tone?: "muted" | "onBrand";
}

export function LocaleSwitch({ tone = "muted" }: LocaleSwitchProps) {
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
            <span
              className={tone === "onBrand" ? "text-paper/50" : "text-ink-muted"}
              aria-hidden="true"
            >
              /
            </span>
          )}
          <Link
            href={pathname}
            locale={loc}
            aria-current={loc === locale ? "true" : undefined}
            className={cn(
              "rounded-sm px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2",
              tone === "onBrand"
                ? cn(
                    "hover:text-paper focus-visible:ring-paper/50",
                    loc === locale ? "text-paper" : "text-paper/70",
                  )
                : cn(
                    "hover:text-ink focus-visible:ring-ring",
                    loc === locale ? "text-ink" : "text-ink-muted",
                  ),
            )}
          >
            {loc}
          </Link>
        </span>
      ))}
    </nav>
  );
}
