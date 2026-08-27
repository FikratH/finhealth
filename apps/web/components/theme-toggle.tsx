"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEMES = ["light", "dark", "system"] as const;
type ThemeName = (typeof THEMES)[number];

const ICONS: Record<ThemeName, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABEL_KEYS: Record<ThemeName, "themeLight" | "themeDark" | "themeSystem"> = {
  light: "themeLight",
  dark: "themeDark",
  system: "themeSystem",
};

// Server and first client render agree the icon is unresolved (avoids a
// hydration mismatch); useSyncExternalStore is the React-blessed way to
// read that divergence without setting state from inside an effect.
const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export interface ThemeToggleProps {
  /** "muted" (default) reads against paper, as everywhere in SiteHeader.
   * "onBrand" reads against the teal hero band — the landing route's
   * header row, merged into the band per the FIRST VIEWPORT contract. */
  tone?: "muted" | "onBrand";
}

export function ThemeToggle({ tone = "muted" }: ThemeToggleProps) {
  const t = useTranslations("Header");
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const current: ThemeName = mounted && THEMES.includes(theme as ThemeName)
    ? (theme as ThemeName)
    : "system";
  const Icon = ICONS[current];

  function cycle() {
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    setTheme(next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={t("themeToggleLabel")}
      title={t(LABEL_KEYS[current])}
      className={
        tone === "onBrand"
          ? "text-paper hover:bg-paper/10 hover:text-paper focus-visible:border-paper/40 focus-visible:ring-paper/40"
          : undefined
      }
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );
}
