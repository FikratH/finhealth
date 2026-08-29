import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";
import enMessages from "@/messages/en.json";
import type { Industry } from "@/lib/api-types";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ useSession }));

const { UploadStep } = await import("@/components/analyze/upload-step");

const industries: Industry[] = [
  { id: "retail", name: "Розничная торговля", name_en: "Retail and e-commerce", note: "", note_en: "" },
];

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
        locale="ru"
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
        locale: "ru" as const,
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

// Founder feedback R1: "Although I was in English, the industry is still
// in Russian" — this is the combobox the founder actually hit (Step 1's
// own industry select, not Step 2's DocumentControls — both share the
// same GET /api/industries data and the same lib/format.ts locale-picking
// logic, but Step 1 is the one an e2e/manual run reaches first).
describe("UploadStep — industry combobox locale", () => {
  it("en locale: the industry option renders the EN translation, not the RU name", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <UploadStep
          file={null}
          industries={industries}
          industry=""
          uploadPhase="idle"
          error={null}
          retain={false}
          vaultEnabled={true}
          ocrEnabled={false}
          locale="en"
          onFileSelected={vi.fn()}
          onFileCleared={vi.fn()}
          onIndustryChange={vi.fn()}
          onRetainChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Retail and e-commerce" })).toBeInTheDocument();
    expect(screen.queryByText("Розничная торговля")).not.toBeInTheDocument();
  });
});

// jsdom has no matchMedia of its own; tests/setup.ts stubs a default of
// matches: false (real motion) — same helper/override pattern as
// tests/motion.test.ts and tests/step-indicator.test.tsx.
function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom has no DragEvent at all (only MouseEvent/UIEvent) — testing-
// library's fireEvent.dragLeave(el, { relatedTarget }) therefore falls
// back to a plain `Event`, whose constructor silently drops any init key
// it doesn't recognize (relatedTarget included), so the property never
// actually lands on the fired event. Building the event by hand and
// attaching relatedTarget via defineProperty (Event instances are plain
// extensible objects once constructed) is the only way to exercise the
// component's real relatedTarget-checking branch in this environment.
function dragLeaveTo(relatedTarget: EventTarget): Event {
  const event = new Event("dragleave", { bubbles: true, cancelable: false });
  Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
  return event;
}

// The classic dragenter/dragleave-on-children bug: without a relatedTarget
// check, moving the pointer from the bay's own border onto its label text
// or Browse button (both children of the same drop zone) fires dragLeave
// on the parent, clearing `dragging` and switching the edge lighting off
// — while the user is still, genuinely, hovering the bay. Founder feedback
// R1 asked to "verify [the edge lighting] FEELS alive"; this is the bug
// that would have made it feel broken instead.
describe("UploadStep — drag-over edge lighting doesn't flicker over child elements", () => {
  afterEach(() => {
    mockMatchMedia(false);
  });

  it("dragOver lights the bay; dragLeave onto a CHILD inside the bay does not clear it", () => {
    mockMatchMedia(false);
    useSession.mockReturnValue({ data: null, isPending: false });
    const { container } = render(
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
          locale="ru"
          onFileSelected={vi.fn()}
          onFileCleared={vi.fn()}
          onIndustryChange={vi.fn()}
          onRetainChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    const bay = container.querySelector(".ghost-cell-texture") as HTMLElement;
    const childLabel = screen.getByText(ruMessages.Analyze.upload.dropzoneLabel);
    expect(bay.contains(childLabel)).toBe(true);

    fireEvent.dragOver(bay);
    expect(bay.className).toContain("border-brand");

    fireEvent(bay, dragLeaveTo(childLabel));
    expect(bay.className).toContain("border-brand");
    expect(bay.className).not.toContain("border-line");
  });

  it("dragLeave onto an element OUTSIDE the bay clears the edge lighting", () => {
    mockMatchMedia(false);
    useSession.mockReturnValue({ data: null, isPending: false });
    const { container } = render(
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
          locale="ru"
          onFileSelected={vi.fn()}
          onFileCleared={vi.fn()}
          onIndustryChange={vi.fn()}
          onRetainChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    const bay = container.querySelector(".ghost-cell-texture") as HTMLElement;

    fireEvent.dragOver(bay);
    expect(bay.className).toContain("border-brand");

    fireEvent(bay, dragLeaveTo(document.body));
    expect(bay.className).toContain("border-line");
    expect(bay.className).not.toContain("border-brand");
  });
});

// Founder feedback R1: a real in-progress state during upload+extraction
// — the bay itself used to sit visually inert for however long the two
// async legs (upload, then extract) actually take, with only the submit
// button's own label and the (elsewhere-rendered) step indicator's blink
// signaling anything was happening.
describe("UploadStep — busy scanline (upload+extraction in progress)", () => {
  function renderBusy(uploadPhase: "idle" | "uploading" | "extracting") {
    useSession.mockReturnValue({ data: null, isPending: false });
    return render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <UploadStep
          file={null}
          industries={industries}
          industry=""
          uploadPhase={uploadPhase}
          error={null}
          retain={false}
          vaultEnabled={true}
          ocrEnabled={false}
          locale="ru"
          onFileSelected={vi.fn()}
          onFileCleared={vi.fn()}
          onIndustryChange={vi.fn()}
          onRetainChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
  }

  it("idle: no scanline element, plain border", () => {
    const { container } = renderBusy("idle");
    const bay = container.querySelector(".ghost-cell-texture") as HTMLElement;
    expect(container.querySelector("[data-scanline]")).not.toBeInTheDocument();
    expect(bay.className).toContain("border-line");
  });

  it("uploading: renders the scanline line and switches to the busy edge tone", () => {
    const { container } = renderBusy("uploading");
    const bay = container.querySelector(".ghost-cell-texture") as HTMLElement;
    expect(container.querySelector("[data-scanline]")).toBeInTheDocument();
    expect(bay.className).toContain("border-brand/50");
  });

  it("extracting: the scanline stays up through the second async leg too, not just the first", () => {
    const { container } = renderBusy("extracting");
    expect(container.querySelector("[data-scanline]")).toBeInTheDocument();
  });
});

// Founder feedback R1: file-accepted feedback — the file docking INTO the
// bay via the boot grammar (igniteSequence, instant .set() cascade), not
// a fade-in. Exercises the real, un-mocked lib/motion primitive, same
// style as step-indicator.test.tsx's "honest blink" suite.
describe("UploadStep — file-accepted docking cascade", () => {
  afterEach(() => {
    mockMatchMedia(false);
  });

  function makeFile(name = "statement.csv") {
    return new File(["a,b,c"], name, { type: "text/csv" });
  }

  it("under reduced motion, the row's segments are docked (lit) immediately", () => {
    mockMatchMedia(true);
    useSession.mockReturnValue({ data: null, isPending: false });
    const { container } = render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <UploadStep
          file={makeFile()}
          industries={industries}
          industry=""
          uploadPhase="idle"
          error={null}
          retain={false}
          vaultEnabled={true}
          ocrEnabled={false}
          locale="ru"
          onFileSelected={vi.fn()}
          onFileCleared={vi.fn()}
          onIndustryChange={vi.fn()}
          onRetainChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    const segments = container.querySelectorAll("[data-dock-segment]");
    expect(segments.length).toBeGreaterThan(0);
    for (const el of segments) {
      expect(el).toHaveAttribute("data-docked", "true");
    }
  });

  it("without reduced motion, the cascade resets the row to undocked before re-lighting it — never a flash of the finished state first", () => {
    mockMatchMedia(false);
    useSession.mockReturnValue({ data: null, isPending: false });
    const { container } = render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <UploadStep
          file={makeFile()}
          industries={industries}
          industry=""
          uploadPhase="idle"
          error={null}
          retain={false}
          vaultEnabled={true}
          ocrEnabled={false}
          locale="ru"
          onFileSelected={vi.fn()}
          onFileCleared={vi.fn()}
          onIndustryChange={vi.fn()}
          onRetainChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    // Synchronously after mount (useLayoutEffect, not useEffect — see the
    // component's own comment): igniteSequence's initial .set() has
    // already reset every segment to undocked, before its timeline's
    // staggered re-light steps have had any time to run.
    const segments = container.querySelectorAll("[data-dock-segment]");
    expect(segments.length).toBeGreaterThan(0);
    for (const el of segments) {
      expect(el).toHaveAttribute("data-docked", "false");
    }
  });

  it("selecting a different file re-plays the dock rather than leaving the row silently updated", () => {
    mockMatchMedia(true); // deterministic: docked immediately either way
    useSession.mockReturnValue({ data: null, isPending: false });
    const { container, rerender } = render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <UploadStep
          file={makeFile("a.csv")}
          industries={industries}
          industry=""
          uploadPhase="idle"
          error={null}
          retain={false}
          vaultEnabled={true}
          ocrEnabled={false}
          locale="ru"
          onFileSelected={vi.fn()}
          onFileCleared={vi.fn()}
          onIndustryChange={vi.fn()}
          onRetainChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    const firstRow = container.querySelector("[data-dock-segment]")?.closest("div");

    rerender(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <UploadStep
          file={makeFile("b.csv")}
          industries={industries}
          industry=""
          uploadPhase="idle"
          error={null}
          retain={false}
          vaultEnabled={true}
          ocrEnabled={false}
          locale="ru"
          onFileSelected={vi.fn()}
          onFileCleared={vi.fn()}
          onIndustryChange={vi.fn()}
          onRetainChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    const secondRow = container.querySelector("[data-dock-segment]")?.closest("div");

    // The row's `key` is the file's own identity — a different file forces
    // a genuinely new DOM node, not an in-place text update.
    expect(firstRow).not.toBe(secondRow);
    expect(screen.getByText(ruMessages.Analyze.upload.selectedFile.replace("{name}", "b.csv"))).toBeInTheDocument();
  });
});
