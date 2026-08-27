"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "@/components/account-menu";

// The landing route composes this exact header row itself — wordmark,
// locale switch, theme toggle — as the top row of the hero's teal band
// (design-direction's FIRST VIEWPORT contract: one wordmark, in the band).
// Rendering the paper SiteHeader there too would put a second wordmark on
// the page, so it renders nothing on "/"; every other route (Operate/Read
// surfaces) keeps this paper header unchanged.
export function SiteHeader() {
  const t = useTranslations("Header");
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

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
          <AccountMenu />
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
