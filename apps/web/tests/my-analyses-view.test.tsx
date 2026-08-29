import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";
import type { MyAnalysisSummary } from "@/lib/api-types";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ useSession }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getMyAnalyses: vi.fn(),
    deleteMyAnalysis: vi.fn(),
    // MyAnalysesView now also renders MyDocumentsSection (P5.T7) — mocked
    // here too so this file's tests (which are about the analyses table,
    // not the documents vault; see my-documents-section.test.tsx for that
    // component's own coverage) never make a real fetch() call and default
    // to an empty, quickly-resolved list rather than hanging in "loading".
    getMyDocuments: vi.fn(),
    deleteMyDocument: vi.fn(),
  };
});

const { ApiError, deleteMyAnalysis, deleteMyDocument, getMyAnalyses, getMyDocuments } =
  await import("@/lib/api");
const { MyAnalysesView } = await import("@/components/my/my-analyses-view");

const fixtures: MyAnalysisSummary[] = [
  {
    analysis_id: "an_1",
    created_at: "2026-08-27T10:00:00Z",
    industry_name: "Производство",
    industry_name_en: "Manufacturing",
    overall_score: 78.2,
    health_label: "Хорошее состояние",
  },
  {
    analysis_id: "an_2",
    created_at: "2026-08-01T00:00:00Z",
    industry_name: "Розница",
    industry_name_en: "Retail and e-commerce",
    overall_score: null,
    health_label: "Недостаточно данных для оценки",
  },
];

function renderView() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <MyAnalysesView locale="ru" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  // Sane default so every signed-in render below resolves the documents
  // section to its empty state quickly, without every single test having
  // to stub it individually — tests exercising the documents section
  // itself live in my-documents-section.test.tsx.
  vi.mocked(getMyDocuments).mockResolvedValue({ documents: [] });
});

afterEach(() => {
  vi.mocked(getMyAnalyses).mockReset();
  vi.mocked(deleteMyAnalysis).mockReset();
  vi.mocked(getMyDocuments).mockReset();
  vi.mocked(deleteMyDocument).mockReset();
});

describe("MyAnalysesView", () => {
  it("signed-out: shows the composed sign-in prompt, never calls the API", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    renderView();

    expect(screen.getByText(ruMessages.My.signedOut.heading)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: ruMessages.My.signedOut.cta });
    expect(link).toHaveAttribute("href", "/signin");
    expect(getMyAnalyses).not.toHaveBeenCalled();
    expect(getMyDocuments).not.toHaveBeenCalled();
  });

  it("while the session check is pending, shows the signed-out prompt rather than a loading flicker", () => {
    useSession.mockReturnValue({ data: null, isPending: true });
    renderView();

    expect(screen.getByText(ruMessages.My.signedOut.heading)).toBeInTheDocument();
    expect(getMyAnalyses).not.toHaveBeenCalled();
    expect(getMyDocuments).not.toHaveBeenCalled();
  });

  it("signed-in: fetches and renders the table with fixture rows, including the null-score row", async () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockResolvedValueOnce({ plan: "free", analyses: fixtures });
    renderView();

    expect(await screen.findByText("Производство")).toBeInTheDocument();
    expect(screen.getByText("Розница")).toBeInTheDocument();
    expect(screen.getByText(ruMessages.My.table.scoreNa)).toBeInTheDocument();
  });

  // Close-wave finish-review fix 4: the page had no <h1> at all before —
  // its first heading was an <h2>. "Мои документы" stays its own peer h2.
  it("signed-in: «Мои анализы» is the page's <h1>, exactly one", async () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockResolvedValueOnce({ plan: "free", analyses: fixtures });
    renderView();

    const h1s = await screen.findAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(ruMessages.My.heading);
  });

  it("signed-in, no saved analyses: shows the composed empty state with a CTA to /analyze", async () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockResolvedValueOnce({ plan: "free", analyses: [] });
    renderView();

    expect(await screen.findByText(ruMessages.My.empty.heading)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: ruMessages.My.empty.cta });
    expect(cta).toHaveAttribute("href", "/analyze");
  });

  it("delete flow: confirming removes the row after the API call succeeds", async () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockResolvedValueOnce({ plan: "free", analyses: fixtures });
    vi.mocked(deleteMyAnalysis).mockResolvedValueOnce({ deleted: "an_1" });
    renderView();

    await screen.findByText("Производство");
    fireEvent.click(
      screen.getByRole("button", {
        name: ruMessages.My.table.deleteAria
          .replace("{industry}", "Производство")
          .replace("{date}", "27.08.2026"),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.deleteDialog.confirm }));

    expect(deleteMyAnalysis).toHaveBeenCalledWith("an_1");
    await waitFor(() => {
      expect(screen.queryByText("Производство")).not.toBeInTheDocument();
    });
    // The other row is untouched.
    expect(screen.getByText("Розница")).toBeInTheDocument();
  });

  it("switching to a different signed-in user without a remount resets state — the previous user's rows never render under the new identity", async () => {
    useSession.mockReturnValue({ data: { user: { id: "user-a" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockResolvedValueOnce({ plan: "free", analyses: fixtures });
    const { rerender } = renderView();

    await screen.findByText("Производство");

    const otherUserFixture: MyAnalysisSummary[] = [
      {
        analysis_id: "an_9",
        created_at: "2026-08-20T00:00:00Z",
        industry_name: "Строительство",
        industry_name_en: "Construction",
        overall_score: 55,
        health_label: "Удовлетворительное состояние",
      },
    ];
    let resolveSecondFetch!: (value: { plan: string; analyses: MyAnalysisSummary[] }) => void;
    vi.mocked(getMyAnalyses).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecondFetch = resolve;
        }),
    );
    // A different user id, no unmount of MyAnalysesView itself — this is
    // exactly the scenario an internal setState reset can't guarantee but
    // a key change can.
    useSession.mockReturnValue({ data: { user: { id: "user-b" } }, isPending: false });
    rerender(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <MyAnalysesView locale="ru" />
      </NextIntlClientProvider>,
    );

    // Reset to loading immediately — user-a's row is gone before user-b's
    // fetch has even resolved, not lingering until it does. Both the
    // analyses table and the documents section (P5.T7) share the same
    // "Загрузка…" copy and both remount together on the identity switch,
    // so this is exactly two matches, not merely "at least one" — an
    // assertion of ">0" would also pass if only the (separately-mocked,
    // already-resolving) documents section were showing it, which would
    // no longer prove the thing this test exists to guard: that the
    // *analyses* section itself reset to loading.
    expect(screen.queryByText("Производство")).not.toBeInTheDocument();
    expect(screen.getAllByText(ruMessages.My.loading)).toHaveLength(2);

    resolveSecondFetch({ plan: "pro", analyses: otherUserFixture });
    expect(await screen.findByText("Строительство")).toBeInTheDocument();
  });

  it("a 401 mid-view (expired session) on load falls back to the signed-out prompt", async () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockRejectedValueOnce(new ApiError(401, "auth_required"));
    renderView();

    expect(await screen.findByText(ruMessages.My.signedOut.heading)).toBeInTheDocument();
  });

  it("a non-401 load failure shows a visible, retryable-looking error line, not the signed-out prompt", async () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockRejectedValueOnce(new ApiError(0, "errors.network"));
    renderView();

    expect(await screen.findByText(ruMessages.My.loadError)).toBeInTheDocument();
    expect(screen.queryByText(ruMessages.My.signedOut.heading)).not.toBeInTheDocument();
  });

  it("shows a quiet FREE plan chip once the response resolves", async () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockResolvedValueOnce({ plan: "free", analyses: fixtures });
    renderView();

    expect(await screen.findByText(ruMessages.My.plan.free)).toBeInTheDocument();
    expect(screen.queryByText(ruMessages.My.plan.pro)).not.toBeInTheDocument();
  });

  it("shows a PRO plan chip when the response carries plan: pro", async () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockResolvedValueOnce({ plan: "pro", analyses: fixtures });
    renderView();

    expect(await screen.findByText(ruMessages.My.plan.pro)).toBeInTheDocument();
    expect(screen.queryByText(ruMessages.My.plan.free)).not.toBeInTheDocument();
  });

  it("does not render a plan chip before the response has loaded", () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1" } }, isPending: false });
    vi.mocked(getMyAnalyses).mockReturnValueOnce(new Promise(() => {})); // never resolves
    renderView();

    expect(screen.queryByText(ruMessages.My.plan.free)).not.toBeInTheDocument();
    expect(screen.queryByText(ruMessages.My.plan.pro)).not.toBeInTheDocument();
  });
});
