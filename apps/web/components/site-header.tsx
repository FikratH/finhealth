"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu, AccountNavLink } from "@/components/account-menu";
import { CURRENT_LINK_CLASS, IDLE_LINK_CLASS } from "@/components/nav-link-class";
import { cn } from "@/lib/utils";

// The hairline that separates the header's three right-side clusters (NAV /
// ACCOUNT / PREFS — founder round 3's regrouping, see the flex row below).
// Hidden below `sm`: at a cramped 390px header the gap rhythm alone still
// reads as grouped, and a bare 1px rule between five-plus items has less
// room to breathe than the spacing itself needs.
function ClusterDivider() {
  return <span aria-hidden="true" className="hidden h-4 w-px bg-line sm:block" />;
}

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
            // Founder round 1: h-7 (28px) read as an afterthought next to
            // the hero's own logo treatment (h-14 at its smallest
            // breakpoint, landing/hero.tsx) — bumped to a confident size
            // for a persistent console-strip header while staying well
            // under hero scale, and kept responsive (mobile stays h-9,
            // the header's own py-4 has plenty of room) rather than the
            // old flat single size.
            className="h-9 w-auto sm:h-10 [.paper_&]:hidden"
          />
          <img
            src="/brand/logo-black.png"
            alt=""
            aria-hidden="true"
            width={800}
            height={266}
            className="hidden h-9 w-auto sm:h-10 [.paper_&]:block"
          />
          <span className="sr-only">{t("wordmark")}</span>
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          {/* NAV cluster: primary navigation, unchanged grammar — mono-caps
           * links with the shared current-location glow. "Мои анализы"
           * joins Pricing here (not the ACCOUNT cluster) because it's a
           * destination, not an identity control. */}
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
            <AccountNavLink />
          </div>

          <ClusterDivider />

          {/* ACCOUNT cluster: the signed-in identity chip + "Выйти", or
           * "Войти" signed-out — see account-menu.tsx's own header comment
           * for the full split rationale. */}
          <AccountMenu />

          <ClusterDivider />

          {/* PREFS cluster: locale + theme, unchanged. */}
          <div className="flex items-center gap-3">
            <LocaleSwitch />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
