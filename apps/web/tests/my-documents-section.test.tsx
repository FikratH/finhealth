import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";
import type { MyDocumentSummary } from "@/lib/api-types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getMyDocuments: vi.fn(), deleteMyDocument: vi.fn() };
});

const { ApiError, deleteMyDocument, getMyDocuments } = await import("@/lib/api");
const { MyDocumentsSection } = await import("@/components/my/my-documents-section");

const fixtures: MyDocumentSummary[] = [
  { doc_id: "doc_1", filename: "Баланс.csv", kind: "csv", size_bytes: 1024 * 1024, created_at: "2026-08-27T10:00:00Z" },
  { doc_id: "doc_2", filename: "otchet.pdf", kind: "pdf", size_bytes: 2048 * 1024, created_at: "2026-08-01T00:00:00Z" },
];

function renderSection(onSessionExpired = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <MyDocumentsSection locale="ru" onSessionExpired={onSessionExpired} />
    </NextIntlClientProvider>,
  );
  return { onSessionExpired };
}

afterEach(() => {
  vi.mocked(getMyDocuments).mockReset();
  vi.mocked(deleteMyDocument).mockReset();
});

describe("MyDocumentsSection", () => {
  it("fetches and renders a row per retained document", async () => {
    vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
    renderSection();

    expect(await screen.findByText("Баланс.csv")).toBeInTheDocument();
    expect(screen.getByText("otchet.pdf")).toBeInTheDocument();
  });

  it("no retained documents: shows the composed empty state, not an error", async () => {
    vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: [] });
    renderSection();

    expect(await screen.findByText(ruMessages.My.documents.empty.body)).toBeInTheDocument();
  });

  it("a non-401 load failure shows a visible error line", async () => {
    vi.mocked(getMyDocuments).mockRejectedValueOnce(new ApiError(0, "errors.network"));
    renderSection();

    expect(await screen.findByText(ruMessages.My.documents.loadError)).toBeInTheDocument();
  });

  it("a 401 on load calls onSessionExpired instead of showing the error line", async () => {
    vi.mocked(getMyDocuments).mockRejectedValueOnce(new ApiError(401, "auth_required"));
    const { onSessionExpired } = renderSection();

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
    expect(screen.queryByText(ruMessages.My.documents.loadError)).not.toBeInTheDocument();
  });

  it("delete flow: confirming removes the row after the API call succeeds", async () => {
    vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
    vi.mocked(deleteMyDocument).mockResolvedValueOnce({ deleted: "doc_1" });
    renderSection();

    await screen.findByText("Баланс.csv");
    fireEvent.click(
      screen.getByRole("button", {
        name: ruMessages.My.documents.table.deleteAria
          .replace("{filename}", "Баланс.csv")
          .replace("{date}", "27.08.2026"),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.documents.deleteDialog.confirm }));

    expect(deleteMyDocument).toHaveBeenCalledWith("doc_1");
    await waitFor(() => {
      expect(screen.queryByText("Баланс.csv")).not.toBeInTheDocument();
    });
    expect(screen.getByText("otchet.pdf")).toBeInTheDocument();
  });

  it("a failed delete shows a visible error line and leaves the row in place", async () => {
    vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
    vi.mocked(deleteMyDocument).mockRejectedValueOnce(new ApiError(500, "errors.unknown"));
    renderSection();

    await screen.findByText("Баланс.csv");
    fireEvent.click(
      screen.getByRole("button", {
        name: ruMessages.My.documents.table.deleteAria
          .replace("{filename}", "Баланс.csv")
          .replace("{date}", "27.08.2026"),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.documents.deleteDialog.confirm }));

    expect(await screen.findByText(ruMessages.My.documents.deleteError)).toBeInTheDocument();
    expect(screen.getByText("Баланс.csv")).toBeInTheDocument();
  });

  it("a 401 on delete calls onSessionExpired", async () => {
    vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
    vi.mocked(deleteMyDocument).mockRejectedValueOnce(new ApiError(401, "auth_required"));
    const { onSessionExpired } = renderSection();

    await screen.findByText("Баланс.csv");
    fireEvent.click(
      screen.getByRole("button", {
        name: ruMessages.My.documents.table.deleteAria
          .replace("{filename}", "Баланс.csv")
          .replace("{date}", "27.08.2026"),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.documents.deleteDialog.confirm }));

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  });
});
