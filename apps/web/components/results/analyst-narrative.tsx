"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { ApiError, generateNarrative } from "@/lib/api";
import type { AnalysisResult, NarrativeResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface AnalystNarrativeProps {
  analysis: AnalysisResult;
  locale: Locale;
  /** Called once the POST confirms no LLM key is configured (503) — lets a
   * parent that wraps this component in its own section chrome
   * (results-document.tsx's RevealSection, with its own hairline rule)
   * drop that chrome too, so a designed-absence 503 leaves nothing behind
   * at all, not even an empty rule. */
  onUnavailable?: () => void;
  /** Called once a `generate` click swaps the button for real prose — lets
   * a parent that already knows the *initial* state from
   * `analysis.narrative` (results-document.tsx's own `narrativeHasContent`
   * seed) track the one client-side transition that can add content after
   * mount. Never fires on the initial cached-narrative render — the parent
   * already accounted for that case in its own seed. */
  onGenerated?: () => void;
}

type GenerateState = "idle" | "loading" | "unavailable";

// «Заключение аналитика» — the LLM narrative layer's one surface: prose
// AROUND the numbers everywhere else in this document already computed
// (apps/api/app/services/narrative.py's prompt contract forbids it from
// computing or contradicting any of them). Optional and provider-agnostic:
// when the API has no OPENAI_API_KEY configured, the POST below 503s and
// this component collapses to rendering nothing — no error banner, no
// retry prompt, no trace that the feature was ever offered. A deployment
// without a key never shows this section past its own button click.
export function AnalystNarrative({
  analysis,
  locale,
  onUnavailable,
  onGenerated,
}: AnalystNarrativeProps) {
  const t = useTranslations("Results.narrative");
  const [narrative, setNarrative] = useState<NarrativeResult | undefined>(analysis.narrative);
  const [state, setState] = useState<GenerateState>("idle");
  // A transient failure (502 provider error, network/timeout) — distinct
  // from `state === "unavailable"`'s permanent 503 collapse. Cleared at the
  // start of every generate attempt so a second click's own outcome is
  // never shown alongside a stale message from the first.
  const [error, setError] = useState(false);

  if (state === "unavailable") return null;

  async function handleGenerate() {
    setState("loading");
    setError(false);
    try {
      const result = await generateNarrative(analysis.analysis_id);
      setNarrative(result);
      setState("idle");
      onGenerated?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        // The designed-absence path: no key configured server-side, so the
        // feature doesn't exist for this deployment — collapse silently.
        setState("unavailable");
        onUnavailable?.();
        return;
      }
      // Any other failure (502 provider error, network/timeout) is
      // transient rather than structural — back to the action so the
      // reader can retry, but with a visible composed error line now
      // (not silent: a 503's total invisibility is a designed absence,
      // this isn't).
      setState("idle");
      setError(true);
    }
  }

  if (!narrative) {
    return (
      <section className="space-y-4 print:hidden">
        <SectionHeading>{t("heading")}</SectionHeading>
        {error && <p className="text-sm text-critical">{t("generateError")}</p>}
        <Button
          type="button"
          variant="outline"
          onClick={handleGenerate}
          disabled={state === "loading"}
        >
          {state === "loading" ? t("generating") : t("generateButton")}
        </Button>
      </section>
    );
  }

  const text = locale === "en" ? narrative.text_en : narrative.text_ru;
  const paragraphs = text
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <section className="space-y-4">
      <SectionHeading>{t("heading")}</SectionHeading>
      <div className="space-y-3 text-sm text-ink">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      <p className="border-t border-line pt-4 text-xs text-ink-muted">{t("disclosure")}</p>
      <p className="font-mono text-xs text-ink-muted">
        {t("modelLabel")}: {narrative.model} · {t("generatedAtLabel")}: {narrative.generated_at}
      </p>
    </section>
  );
}
