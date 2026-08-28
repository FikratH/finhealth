import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";
import type { Industry } from "@/lib/api-types";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ useSession }));

const { UploadStep } = await import("@/components/analyze/upload-step");

const industries: Industry[] = [{ id: "retail", name: "Розничная торговля", note: "" }];

function renderStep(overrides: Partial<React.ComponentProps<typeof UploadStep>> = {}) {
  const onRetainChange = vi.fn();
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <UploadStep
        file={null}
        industries={industries}
        industry=""
        uploadPhase="idle"
        error={null}
        retain={false}
        vaultEnabled={true}
        ocrEnabled={false}
        onFileSelected={vi.fn()}
        onFileCleared={vi.fn()}
        onIndustryChange={vi.fn()}
        onRetainChange={onRetainChange}
        onSubmit={vi.fn()}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onRetainChange };
}

// P5.T7's opt-in vault checkbox: visible ONLY when signed in (default off
// — the privacy default per PRODUCT.md), never shown to an anonymous
// visitor since retain=1 requires an authenticated user server-side too.
describe("UploadStep — retain checkbox", () => {
  it("signed-out: the retain checkbox and its disclosure are entirely absent", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    renderStep();

    expect(screen.queryByText(ruMessages.Analyze.upload.retainLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(ruMessages.Analyze.upload.retainDisclosure)).not.toBeInTheDocument();
  });

  it("while the session check is pending, the checkbox stays absent rather than flashing in", () => {
    useSession.mockReturnValue({ data: null, isPending: true });
    renderStep();

    expect(screen.queryByText(ruMessages.Analyze.upload.retainLabel)).not.toBeInTheDocument();
  });

  it("signed-in: shows the checkbox, unchecked by default, with the retention disclosure line", () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    renderStep();

    const checkbox = screen.getByRole("checkbox", { name: ruMessages.Analyze.upload.retainLabel });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(ruMessages.Analyze.upload.retainDisclosure)).toBeInTheDocument();
  });

  it("signed-in: toggling the checkbox calls onRetainChange with the new value", () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    const { onRetainChange } = renderStep();

    const checkbox = screen.getByRole("checkbox", { name: ruMessages.Analyze.upload.retainLabel });
    fireEvent.click(checkbox);

    expect(onRetainChange).toHaveBeenCalledWith(true);
  });

  it("signed-in, retain=true: the checkbox renders checked", () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    renderStep({ retain: true });

    const checkbox = screen.getByRole("checkbox", { name: ruMessages.Analyze.upload.retainLabel });
    expect(checkbox).toBeChecked();
  });

  it("signed-in but busy (uploading): the checkbox is disabled", () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    renderStep({ uploadPhase: "uploading" });

    const checkbox = screen.getByRole("checkbox", { name: ruMessages.Analyze.upload.retainLabel });
    expect(checkbox).toBeDisabled();
  });

  // P5.T8, Finding 1's fix: signedIn alone is not enough — the server must
  // also report vault_enabled (GET /api/health), or a signed-in user in the
  // default (vault-disabled) configuration could tick the box and 503 the
  // whole upload.
  it("signed-in but the server doesn't offer retention (vaultEnabled=false): the checkbox is absent", () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    renderStep({ vaultEnabled: false });

    expect(screen.queryByText(ruMessages.Analyze.upload.retainLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(ruMessages.Analyze.upload.retainDisclosure)).not.toBeInTheDocument();
  });

  it("signed-out AND vaultEnabled=false: still absent (neither condition alone is sufficient)", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    renderStep({ vaultEnabled: false });

    expect(screen.queryByText(ruMessages.Analyze.upload.retainLabel)).not.toBeInTheDocument();
  });

  // Close-wave F4: a checked retain must not survive the checkbox's own
  // gating conditions lapsing mid-session (e.g. the user signs out from
  // the header in the same tab — useSession is reactive, no remount).
  describe("F4 — retain resets when its own visibility conditions lapse", () => {
    function renderWithRerender(overrides: Partial<React.ComponentProps<typeof UploadStep>> = {}) {
      const onRetainChange = vi.fn();
      const props = {
        file: null,
        industries,
        industry: "",
        uploadPhase: "idle" as const,
        error: null,
        retain: true,
        vaultEnabled: true,
        ocrEnabled: false,
        onFileSelected: vi.fn(),
        onFileCleared: vi.fn(),
        onIndustryChange: vi.fn(),
        onRetainChange,
        onSubmit: vi.fn(),
        ...overrides,
      };
      const { rerender } = render(
        <NextIntlClientProvider locale="ru" messages={ruMessages}>
          <UploadStep {...props} />
        </NextIntlClientProvider>,
      );
      return { onRetainChange, rerender, props };
    }

    it("signing out mid-flow (retain=true, checkbox was showing) calls onRetainChange(false)", () => {
      useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
      const { onRetainChange, rerender, props } = renderWithRerender();
      expect(onRetainChange).not.toHaveBeenCalled();

      useSession.mockReturnValue({ data: null, isPending: false });
      rerender(
        <NextIntlClientProvider locale="ru" messages={ruMessages}>
          <UploadStep {...props} />
        </NextIntlClientProvider>,
      );

      expect(onRetainChange).toHaveBeenCalledWith(false);
    });

    it("the server's vault_enabled flipping false mid-flow also resets retain", () => {
      useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
      const { onRetainChange, rerender, props } = renderWithRerender();

      rerender(
        <NextIntlClientProvider locale="ru" messages={ruMessages}>
          <UploadStep {...props} vaultEnabled={false} />
        </NextIntlClientProvider>,
      );

      expect(onRetainChange).toHaveBeenCalledWith(false);
    });

    it("does NOT fire when retain is already false — no spurious calls on mount or on unrelated re-renders", () => {
      useSession.mockReturnValue({ data: null, isPending: false });
      const { onRetainChange } = renderWithRerender({ retain: false, vaultEnabled: false });

      expect(onRetainChange).not.toHaveBeenCalled();
    });

    it("does NOT fire while retain stays true and both conditions still hold", () => {
      useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
      const { onRetainChange, rerender, props } = renderWithRerender();

      // Re-render with an unrelated prop change (e.g. uploadPhase) — retain
      // is still legitimately offered, so this must stay silent.
      rerender(
        <NextIntlClientProvider locale="ru" messages={ruMessages}>
          <UploadStep {...props} uploadPhase="uploading" />
        </NextIntlClientProvider>,
      );

      expect(onRetainChange).not.toHaveBeenCalled();
    });
  });
});

// P7.T4: a scanned-PDF 422 (backend code "scanned_pdf") gets an extra "or
// enable OCR" hint, but ONLY while the server doesn't already offer OCR
// (ocrEnabled=false) — see lib/analyze-errors.ts's errorHintKey for why
// the polarity runs this direction (telling a user to "enable OCR" when
// it's already on would be wrong: that error means OCR already ran).
describe("UploadStep — scanned-PDF OCR hint", () => {
  const scannedPdfError = {
    message: "PDF не содержит текстового слоя (вероятно, это скан).",
    status: 422,
    code: "scanned_pdf",
  };

  it("ocrEnabled=false: shows the OCR-mention hint", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    renderStep({ error: scannedPdfError, ocrEnabled: false });

    expect(
      screen.getByText(ruMessages.Analyze.upload.hints.unprocessableOcrOff),
    ).toBeInTheDocument();
  });

  it("ocrEnabled=true: shows the plain hint, no OCR mention (OCR already ran and still failed)", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    renderStep({ error: scannedPdfError, ocrEnabled: true });

    expect(screen.getByText(ruMessages.Analyze.upload.hints.unprocessable)).toBeInTheDocument();
    expect(
      screen.queryByText(ruMessages.Analyze.upload.hints.unprocessableOcrOff),
    ).not.toBeInTheDocument();
  });

  it("a non-scanned-PDF 422 never shows the OCR hint even with ocrEnabled=false", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    renderStep({ error: { message: "too complex", status: 422 }, ocrEnabled: false });

    expect(screen.getByText(ruMessages.Analyze.upload.hints.unprocessable)).toBeInTheDocument();
  });
});
