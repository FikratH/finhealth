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

function renderTable(analyses: MyAnalysisSummary[] = fixtures, onDelete = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <MyAnalysesTable analyses={analyses} locale="ru" onDelete={onDelete} />
    </NextIntlClientProvider>,
  );
  return { onDelete };
}

describe("MyAnalysesTable", () => {
  it("renders a row per analysis: formatted date, industry chip, and a link to its results page", () => {
    renderTable();

    expect(screen.getByText("27.08.2026")).toBeInTheDocument();
    expect(screen.getByText("01.08.2026")).toBeInTheDocument();
    expect(screen.getByText("Производство")).toBeInTheDocument();
    expect(screen.getByText("Розница")).toBeInTheDocument();

    const openLinks = screen.getAllByRole("link", { name: ruMessages.My.table.open });
    expect(openLinks[0]).toHaveAttribute("href", "/results/an_1");
    expect(openLinks[1]).toHaveAttribute("href", "/results/an_2");
  });

  it("renders the health label via StatusPill, including the null-score row", () => {
    renderTable();

    expect(screen.getByLabelText("Хорошее состояние")).toBeInTheDocument();
    expect(screen.getByLabelText("Недостаточно данных для оценки")).toBeInTheDocument();
    // The null-score row shows the domain-specific "Н/Д", not a bare dash.
    expect(screen.getByText(ruMessages.My.table.scoreNa)).toBeInTheDocument();
  });

  it("opening the delete dialog and confirming calls onDelete with the row's id", () => {
    const { onDelete } = renderTable();

    const deleteButtons = screen.getAllByRole("button", { name: ruMessages.My.table.delete });
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText(ruMessages.My.deleteDialog.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.deleteDialog.confirm }));

    expect(onDelete).toHaveBeenCalledWith("an_1");
  });

  it("cancelling the dialog never calls onDelete", () => {
    const { onDelete } = renderTable();

    fireEvent.click(screen.getAllByRole("button", { name: ruMessages.My.table.delete })[0]);
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.deleteDialog.cancel }));

    expect(onDelete).not.toHaveBeenCalled();
  });
});
