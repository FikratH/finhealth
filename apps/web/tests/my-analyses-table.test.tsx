import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MyAnalysesTable } from "@/components/my/my-analyses-table";
import ruMessages from "@/messages/ru.json";
import type { MyAnalysisSummary } from "@/lib/api-types";

const fixtures: MyAnalysisSummary[] = [
  {
    analysis_id: "an_1",
    created_at: "2026-08-27T10:00:00Z",
    industry_name: "Производство",
    overall_score: 78.2,
    health_label: "Хорошее состояние",
  },
  {
    analysis_id: "an_2",
    created_at: "2026-08-01T00:00:00Z",
    industry_name: "Розница",
    overall_score: null,
    health_label: "Недостаточно данных для оценки",
  },
];

// Mirrors next-intl's own {placeholder} interpolation for the two
// per-row aria-label templates, so tests can compute the exact expected
// accessible name for a given row instead of hardcoding it twice.
function ariaName(template: string, industry: string, date: string) {
  return template.replace("{industry}", industry).replace("{date}", date);
}

const ROW1_ARIA = { industry: "Производство", date: "27.08.2026" };
const ROW2_ARIA = { industry: "Розница", date: "01.08.2026" };

function renderTable(analyses: MyAnalysisSummary[] = fixtures, onDelete = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <MyAnalysesTable analyses={analyses} locale="ru" onDelete={onDelete} />
    </NextIntlClientProvider>,
  );
  return { onDelete };
}

describe("MyAnalysesTable", () => {
  // jsdom does no real layout (getBoundingClientRect/scrollWidth aren't
  // computed), so the actual bug this guards — the sr-only actions-column
  // <span> (position:absolute, no positioned ancestor) escaping this
  // wrapper's overflow-x-auto clipping and inflating the whole page's
  // scrollWidth at narrow viewports, confirmed live at 548px vs. a 390px
  // viewport before the fix — cannot be honestly asserted here. This is
  // narrower and weaker than that: a tripwire on the specific class that
  // fixes it (`relative`, making this element the containing block for
  // that span), so a future refactor that drops the class — not realizing
  // why it's there — fails a test instead of failing silently until the
  // next mobile capture.
  it("the scroll wrapper is a positioning context (relative) — see my-documents-table.test.tsx's identical guard for the full mechanism", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <MyAnalysesTable analyses={fixtures} locale="ru" onDelete={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const wrapper = container.querySelector(".overflow-x-auto");
    expect(wrapper).toHaveClass("relative");
  });

  // Close-wave finish-review fix 2: the mobile 390w capture showed cells
  // clipping mid-word with no cue that the table scrolls, leaving the
  // actions column unreachable in practice. jsdom does no rendering, so —
  // same honesty rule as above — this only guards the class that carries
  // the palette-themed scrollbar + edge-fade CSS (globals.css's
  // `.table-scroll-x`), not the visual result itself.
  it("the scroll wrapper carries the scroll-affordance class (table-scroll-x)", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <MyAnalysesTable analyses={fixtures} locale="ru" onDelete={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const wrapper = container.querySelector(".overflow-x-auto");
    expect(wrapper).toHaveClass("table-scroll-x");
  });

  it("renders a row per analysis: formatted date, industry chip, and a link to its results page", () => {
    renderTable();

    expect(screen.getByText("27.08.2026")).toBeInTheDocument();
    expect(screen.getByText("01.08.2026")).toBeInTheDocument();
    expect(screen.getByText("Производство")).toBeInTheDocument();
    expect(screen.getByText("Розница")).toBeInTheDocument();
    // The visible "Открыть" label is unchanged even though the accessible
    // name (below) is a fuller, row-specific string.
    expect(screen.getAllByText(ruMessages.My.table.open)).toHaveLength(2);

    const link1 = screen.getByRole("link", {
      name: ariaName(ruMessages.My.table.openAria, ROW1_ARIA.industry, ROW1_ARIA.date),
    });
    const link2 = screen.getByRole("link", {
      name: ariaName(ruMessages.My.table.openAria, ROW2_ARIA.industry, ROW2_ARIA.date),
    });
    expect(link1).toHaveAttribute("href", "/results/an_1");
    expect(link2).toHaveAttribute("href", "/results/an_2");
  });

  it("renders the health label via StatusPill, including the null-score row", () => {
    renderTable();

    expect(screen.getByLabelText("Хорошее состояние")).toBeInTheDocument();
    expect(screen.getByLabelText("Недостаточно данных для оценки")).toBeInTheDocument();
    // The null-score row shows the domain-specific "Н/Д", not a bare dash.
    expect(screen.getByText(ruMessages.My.table.scoreNa)).toBeInTheDocument();
  });

  it("gives each row's open link and delete button a contextual accessible name (industry + date), not the bare, ambiguous 'Открыть'/'Удалить'", () => {
    renderTable();

    // A bare-name query now matches nothing — both actions' accessible
    // names are the row-specific aria-label, proving the override took.
    expect(screen.queryByRole("link", { name: ruMessages.My.table.open })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ruMessages.My.table.delete }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: ariaName(ruMessages.My.table.deleteAria, ROW1_ARIA.industry, ROW1_ARIA.date),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: ariaName(ruMessages.My.table.deleteAria, ROW2_ARIA.industry, ROW2_ARIA.date),
      }),
    ).toBeInTheDocument();
  });

  it("opening the delete dialog and confirming calls onDelete with the row's id", () => {
    const { onDelete } = renderTable();

    fireEvent.click(
      screen.getByRole("button", {
        name: ariaName(ruMessages.My.table.deleteAria, ROW1_ARIA.industry, ROW1_ARIA.date),
      }),
    );

    expect(screen.getByText(ruMessages.My.deleteDialog.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.deleteDialog.confirm }));

    expect(onDelete).toHaveBeenCalledWith("an_1");
  });

  it("cancelling the dialog never calls onDelete", () => {
    const { onDelete } = renderTable();

    fireEvent.click(
      screen.getByRole("button", {
        name: ariaName(ruMessages.My.table.deleteAria, ROW1_ARIA.industry, ROW1_ARIA.date),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.deleteDialog.cancel }));

    expect(onDelete).not.toHaveBeenCalled();
  });
});
