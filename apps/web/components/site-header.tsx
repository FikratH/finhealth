"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu, CURRENT_LINK_CLASS, IDLE_LINK_CLASS } from "@/components/account-menu";
import { cn } from "@/lib/utils";

// The landing route composes its own utility row (locale switch, theme
// toggle) directly, and its own hero-scale logo reveal is the page's one
// brand mark (design-direction's FIRST VIEWPORT contract). Rendering this
// header there too would put a second logo on the page, so it renders
// nothing on "/"; every other route keeps this header unchanged.
export function SiteHeader() {
  const t = useTranslations("Header");
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

  return (
    // The console strip: a bezel surface (bg-panel), not flush page ground
    // — every other persistent instrument chrome in this world (rails,
    // module bezels, the origin-ticket bar) sits on the panel tone so it
    // reads as a distinct console rather than blending into the body.
    <header className="border-b border-line bg-panel print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="inline-flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Two theme-scoped copies, swapped by a pure CSS selector on the
           * .paper ancestor class (no useTheme()/mounted-gating needed,
           * so no hydration-flash risk) — teal for the Monitor register
           * (the default; also what bare :root / .dark both resolve to),
           * black for the secondary Paper register. Both are decorative
           * (aria-hidden): the link's one real accessible name comes from
           * the sr-only label below, so a test environment or AT that
           * doesn't apply real CSS display:none never double-announces
           * two copies of the same word. */}
          <img
            src="/brand/logo-teal.png"
            alt=""
            aria-hidden="true"
            width={800}
            height={450}
            className="h-7 w-auto [.paper_&]:hidden"
          />
          <img
            src="/brand/logo-black.png"
            alt=""
            aria-hidden="true"
            width={800}
            height={266}
            className="hidden h-7 w-auto [.paper_&]:block"
          />
          <span className="sr-only">{t("wordmark")}</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            aria-current={pathname === "/pricing" ? "page" : undefined}
            className={cn(
              "rounded-sm font-mono text-xs uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pathname === "/pricing" ? CURRENT_LINK_CLASS : IDLE_LINK_CLASS,
            )}
          >
            {t("pricing")}
          </Link>
          <AccountMenu />
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
