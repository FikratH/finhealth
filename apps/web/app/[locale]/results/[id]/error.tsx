"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Next's error boundary must be a Client Component. Composed, never a
// stack trace or raw error text surfaced to the reader (design-direction:
// never apologetic filler, never a debug dump) — just what happened and a
// way to recover, re-skinned as a page-scale critical annunciator line
// (see the render below).
//
// This route's Next version (16.3.3) uses `retry` as the stable recovery
// prop (stable since v16.3.0); the older `reset` name still exists per the
// docs but they now recommend retry() for this case, so that's what's
// wired to the button.
export default function ResultsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("Results.error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      {/* The page-scale version of ErrorBanner's own glyph-plus-glow
       * discipline (components/analyze/error-banner.tsx): critical border,
       * panel surface, the same ✕ glyph with a text-shadow glow layered on
       * the AA-checked critical color — a real failure, so this is the one
       * exception page that carries status-red rather than the neutral
       * ink bezel the rest of the world's document blocks use. */}
      <div role="alert" className="border border-critical bg-panel p-10 text-center">
        <p
          aria-hidden="true"
          className="font-mono text-3xl leading-none text-critical [text-shadow:0_0_0.3em_var(--critical)]"
        >
          ✕
        </p>
        <h1 className="mt-4 font-display text-3xl text-ink">{t("heading")}</h1>
        <p className="mt-4 text-ink-muted">{t("body")}</p>
        <Button type="button" onClick={() => retry()} className="mt-6">
          {t("retry")}
        </Button>
      </div>
    </div>
  );
}
