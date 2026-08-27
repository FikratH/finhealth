"use client";

import { useEffect, useReducer, useRef } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { analyze, extract, getIndustries, uploadFile } from "@/lib/api";
import {
  analyzeReducer,
  buildAnalysisRequest,
  initialAnalyzeState,
} from "@/lib/analyze-reducer";
import { toAnalyzeError } from "@/lib/analyze-errors";
import { StepIndicator } from "./step-indicator";
import { UploadStep } from "./upload-step";
import { VerifyStep } from "./verify-step";
import type { Locale } from "@/lib/format";
import type { Scale } from "@/lib/api-types";

// Orchestrates the whole upload → verify document: one reducer, one
// component tree that swaps its content in place as `state.step` changes
// (design-direction: "one-document continuity" — never a route change
// until the final redirect to /results/[id], which is a genuinely new
// document — the diagnosis).
export function AnalyzeFlow() {
  const [state, dispatch] = useReducer(analyzeReducer, undefined, initialAnalyzeState);
  const router = useRouter();
  const locale = useLocale() as Locale;
  const stepRegionRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    let cancelled = false;
    getIndustries()
      .then((res) => {
        if (!cancelled) dispatch({ type: "industries_loaded", industries: res.industries });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: "upload_failed", error: toAnalyzeError(err, "errors.network") });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Move focus to the new step's root once the document transitions — a
  // keyboard/screen-reader user lands at the top of Step 2 (or back at
  // Step 1) instead of staying wherever the trigger control was, which by
  // then usually no longer exists in the DOM at all.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    stepRegionRef.current?.focus();
  }, [state.step]);

  useEffect(() => {
    if (state.analysisId) {
      router.push(`/results/${state.analysisId}`);
    }
  }, [state.analysisId, router]);

  async function handleUploadSubmit() {
    if (!state.file || state.industry === "") return;
    dispatch({ type: "upload_started" });
    try {
      const uploaded = await uploadFile(state.file);
      dispatch({ type: "upload_succeeded", upload: uploaded });
      const extraction = await extract(uploaded.upload_id);
      dispatch({ type: "extract_succeeded", extraction });
    } catch (err) {
      dispatch({ type: "upload_failed", error: toAnalyzeError(err, "errors.network") });
    }
  }

  async function handleAnalyzeSubmit() {
    if (state.industry === "") return;
    dispatch({ type: "analyze_started" });
    try {
      const result = await analyze(buildAnalysisRequest(state));
      dispatch({ type: "analyze_succeeded", analysisId: result.analysis_id });
    } catch (err) {
      dispatch({ type: "analyze_failed", error: toAnalyzeError(err, "errors.network") });
    }
  }

  // Display-only derivation for the step strip's blink gate — never fed
  // back into the reducer, so it can't affect analyze-reducer's behavior
  // or its own tests.
  const stepPending =
    state.step === "upload" ? state.uploadPhase !== "idle" : state.verifyPhase === "analyzing";

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <StepIndicator current={state.step} pending={stepPending} />
      <div ref={stepRegionRef} tabIndex={-1} className="rounded-sm outline-none focus:ring-2 focus:ring-ring">
        {state.step === "upload" || !state.extraction ? (
          <UploadStep
            file={state.file}
            industries={state.industries}
            industry={state.industry}
            uploadPhase={state.uploadPhase}
            error={state.error}
            onFileSelected={(file) => dispatch({ type: "file_selected", file })}
            onFileCleared={() => dispatch({ type: "file_cleared" })}
            onIndustryChange={(industry) => dispatch({ type: "industry_selected", industry })}
            onSubmit={handleUploadSubmit}
          />
        ) : (
          <VerifyStep
            extraction={state.extraction}
            values={state.values}
            previousValues={state.previousValues}
            industry={state.industry}
            industries={state.industries}
            suggestedIndustry={state.suggestedIndustry}
            scale={state.scale}
            currency={state.currency}
            audited={state.audited}
            verifyPhase={state.verifyPhase}
            error={state.error}
            locale={locale}
            onEditLatest={(metric, value) =>
              dispatch({ type: "value_edited", period: "latest", metric, value })
            }
            onEditPrevious={(metric, value) =>
              dispatch({ type: "value_edited", period: "previous", metric, value })
            }
            onIndustryChange={(industry) => dispatch({ type: "industry_selected", industry })}
            onApplySuggested={() => dispatch({ type: "apply_suggested_industry" })}
            onScaleChange={(scale: Scale) => dispatch({ type: "scale_changed", scale })}
            onCurrencyChange={(currency) => dispatch({ type: "currency_changed", currency })}
            onAuditedChange={(audited) => dispatch({ type: "audited_changed", audited })}
            onBack={() => dispatch({ type: "back_to_upload" })}
            onSubmit={handleAnalyzeSubmit}
          />
        )}
      </div>
    </div>
  );
}
