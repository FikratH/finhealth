import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";
import type { MyDocumentSummary } from "@/lib/api-types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getMyDocuments: vi.fn(),
    deleteMyDocument: vi.fn(),
    downloadMyDocument: vi.fn(),
  };
});

const { ApiError, deleteMyDocument, downloadMyDocument, getMyDocuments } = await import("@/lib/api");
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
  vi.mocked(downloadMyDocument).mockReset();
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

  it("download flow: clicking download calls downloadMyDocument with the row's id and filename, no dialog involved", async () => {
    vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
    vi.mocked(downloadMyDocument).mockResolvedValueOnce(undefined);
    renderSection();

    await screen.findByText("Баланс.csv");
    fireEvent.click(
      screen.getByRole("button", {
        name: ruMessages.My.documents.table.downloadAria
          .replace("{filename}", "Баланс.csv")
          .replace("{date}", "27.08.2026"),
      }),
    );

    await waitFor(() => expect(downloadMyDocument).toHaveBeenCalledWith("doc_1", "Баланс.csv"));
    // The row itself is untouched — unlike delete, a successful download
    // doesn't remove anything from the list.
    expect(screen.getByText("Баланс.csv")).toBeInTheDocument();
  });

  it("a failed download shows a visible error line and leaves the row in place", async () => {
    vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
    vi.mocked(downloadMyDocument).mockRejectedValueOnce(new ApiError(503, "vault_unavailable"));
    renderSection();

    await screen.findByText("Баланс.csv");
    fireEvent.click(
      screen.getByRole("button", {
        name: ruMessages.My.documents.table.downloadAria
          .replace("{filename}", "Баланс.csv")
          .replace("{date}", "27.08.2026"),
      }),
    );

    expect(await screen.findByText(ruMessages.My.documents.downloadError)).toBeInTheDocument();
    expect(screen.getByText("Баланс.csv")).toBeInTheDocument();
  });

  it("a 401 on download calls onSessionExpired instead of showing the error line", async () => {
    vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
    vi.mocked(downloadMyDocument).mockRejectedValueOnce(new ApiError(401, "auth_required"));
    const { onSessionExpired } = renderSection();

    await screen.findByText("Баланс.csv");
    fireEvent.click(
      screen.getByRole("button", {
        name: ruMessages.My.documents.table.downloadAria
          .replace("{filename}", "Баланс.csv")
          .replace("{date}", "27.08.2026"),
      }),
    );

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
    expect(screen.queryByText(ruMessages.My.documents.downloadError)).not.toBeInTheDocument();
  });

  // P6.T5 review round 1, Finding 5: the section owns downloadingId and
  // must actually flip it around the await, not just accept the prop —
  // these need a promise the test controls the timing of, since a
  // same-tick mock resolution would never let the "in flight" state be
  // observed at all.
  describe("in-flight download state", () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    it("the clicked row's button goes busy while the download is in flight, then returns to normal on success", async () => {
      vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
      const { promise, resolve } = deferred<void>();
      vi.mocked(downloadMyDocument).mockReturnValueOnce(promise);
      renderSection();

      await screen.findByText("Баланс.csv");
      const button = screen.getByRole("button", {
        name: ruMessages.My.documents.table.downloadAria
          .replace("{filename}", "Баланс.csv")
          .replace("{date}", "27.08.2026"),
      });
      fireEvent.click(button);

      await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(ruMessages.My.documents.table.downloading);

      resolve();
      await waitFor(() => expect(button).toHaveAttribute("aria-busy", "false"));
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent(ruMessages.My.documents.table.download);
    });

    it("busy state clears on a failed download too — the button doesn't stay stuck", async () => {
      vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
      const { promise, reject } = deferred<void>();
      vi.mocked(downloadMyDocument).mockReturnValueOnce(promise);
      renderSection();

      await screen.findByText("Баланс.csv");
      const button = screen.getByRole("button", {
        name: ruMessages.My.documents.table.downloadAria
          .replace("{filename}", "Баланс.csv")
          .replace("{date}", "27.08.2026"),
      });
      fireEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());

      reject(new ApiError(503, "vault_unavailable"));
      await waitFor(() => expect(button).toBeEnabled());
      expect(await screen.findByText(ruMessages.My.documents.downloadError)).toBeInTheDocument();
    });

    it("a second click on the SAME row while its download is in flight does not start a second call", async () => {
      vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
      const { promise } = deferred<void>();
      vi.mocked(downloadMyDocument).mockReturnValueOnce(promise);
      renderSection();

      await screen.findByText("Баланс.csv");
      const button = screen.getByRole("button", {
        name: ruMessages.My.documents.table.downloadAria
          .replace("{filename}", "Баланс.csv")
          .replace("{date}", "27.08.2026"),
      });
      fireEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());
      // The button is disabled now, so a real user can't click it again —
      // but fire the event directly anyway, to prove the section's own
      // guard (not just the disabled attribute) is what's holding the line.
      fireEvent.click(button);

      expect(downloadMyDocument).toHaveBeenCalledTimes(1);
    });

    it("the OTHER row's download button is also disabled while one download is in flight (single global pending id)", async () => {
      vi.mocked(getMyDocuments).mockResolvedValueOnce({ documents: fixtures });
      const { promise } = deferred<void>();
      vi.mocked(downloadMyDocument).mockReturnValueOnce(promise);
      renderSection();

      await screen.findByText("Баланс.csv");
      fireEvent.click(
        screen.getByRole("button", {
          name: ruMessages.My.documents.table.downloadAria
            .replace("{filename}", "Баланс.csv")
            .replace("{date}", "27.08.2026"),
        }),
      );

      const otherButton = screen.getByRole("button", {
        name: ruMessages.My.documents.table.downloadAria
          .replace("{filename}", "otchet.pdf")
          .replace("{date}", "01.08.2026"),
      });
      await waitFor(() => expect(otherButton).toBeDisabled());
      // It's disabled, but it's not the one downloading — its own label
      // and aria-busy stay in the idle state.
      expect(otherButton).toHaveTextContent(ruMessages.My.documents.table.download);
      expect(otherButton).toHaveAttribute("aria-busy", "false");
    });
  });
});
