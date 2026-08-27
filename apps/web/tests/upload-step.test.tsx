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
});
