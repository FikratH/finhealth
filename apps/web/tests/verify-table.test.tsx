import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { VerifyTable } from "@/components/analyze/verify-table";
import ruMessages from "@/messages/ru.json";
import type { ExtractedValue } from "@/lib/api-types";

function extractedValue(overrides: Partial<ExtractedValue>): ExtractedValue {
  return {
    metric: "revenue",
    original_label: "Доход от реализации",
    value: 3245900,
    currency: null,
    scale: null,
    period: "31.12.2024",
    source: "CSV:3",
    confidence: 95,
    snippet: "Доход от реализации;3 245 900;2 987 400",
    manually_edited: false,
    ...overrides,
  };
}

function renderTable(props: Partial<Parameters<typeof VerifyTable>[0]> = {}) {
  const onEditLatest = vi.fn();
  const onEditPrevious = vi.fn();
  const values = props.values ?? [
    extractedValue({ metric: "revenue", value: 3245900 }),
    extractedValue({
      metric: "ebitda",
      original_label: "",
      value: null,
      source: "",
      confidence: 0,
      snippet: "",
    }),
  ];

  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <VerifyTable
        values={values}
        previousValues={props.previousValues ?? []}
        hasPreviousPeriod={props.hasPreviousPeriod ?? false}
        locale="ru"
        onEditLatest={onEditLatest}
        onEditPrevious={onEditPrevious}
      />
    </NextIntlClientProvider>,
  );

  return { onEditLatest, onEditPrevious };
}

describe("VerifyTable", () => {
  it("shows each row under its display name from the metric-names map", () => {
    renderTable();
    expect(screen.getByText("Выручка")).toBeInTheDocument();
    expect(screen.getByText("EBITDA")).toBeInTheDocument();
  });

  it("marks an edited value manually_edited by dispatching the parsed number on blur", () => {
    const { onEditLatest } = renderTable();
    const input = screen.getByLabelText("Выручка — Текущий период");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "4 000 000" } });
    fireEvent.blur(input);

    expect(onEditLatest).toHaveBeenCalledWith("revenue", 4000000);
  });

  it("offers manual entry on an N/A row: empty input, «Н/Д» placeholder, editable like any other", () => {
    const { onEditLatest } = renderTable();
    const input = screen.getByLabelText("EBITDA — Текущий период");

    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "Н/Д");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "500000" } });
    fireEvent.blur(input);

    expect(onEditLatest).toHaveBeenCalledWith("ebitda", 500000);
  });

  it("shows a 'manually entered' chip instead of a confidence meter once a value is edited", () => {
    renderTable({
      values: [extractedValue({ metric: "revenue", value: 4000000, manually_edited: true })],
    });
    expect(screen.getByText("Введено вручную")).toBeInTheDocument();
  });

  it("renders the previous-period column only when the extraction found one", () => {
    renderTable({ hasPreviousPeriod: false });
    expect(screen.queryByText("Предыдущий период")).not.toBeInTheDocument();
  });
});
