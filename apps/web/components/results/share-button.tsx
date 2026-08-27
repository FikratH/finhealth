"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// The public link IS the share mechanism (v1) — copy the current URL,
// with a window.prompt() fallback for browsers/contexts without Clipboard
// API access, and an aria-live region so screen-reader users get the same
// confirmation sighted users see from the button's own label change.
export function ShareButton() {
  const t = useTranslations("Results.share");
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt(t("promptFallback"), url);
      }
    } catch {
      window.prompt(t("promptFallback"), url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="print:hidden">
      <Button type="button" variant="outline" onClick={handleClick}>
        {copied ? t("copied") : t("button")}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t("copied") : ""}
      </span>
    </div>
  );
}
