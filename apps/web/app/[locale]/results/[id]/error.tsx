"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Next's error boundary must be a Client Component. Designed absence
// grammar again: rule-framed, composed, no stack trace or raw error text
// surfaced to the reader (design-direction: never apologetic filler,
// never a debug dump) — just what happened and a way to recover.
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
      <div className="grid-paper border-2 border-ink p-10 text-center">
        <h1 className="font-display text-3xl text-ink">{t("heading")}</h1>
        <p className="mt-4 text-ink-muted">{t("body")}</p>
        <Button type="button" onClick={() => retry()} className="mt-6">
          {t("retry")}
        </Button>
      </div>
    </div>
  );
}
