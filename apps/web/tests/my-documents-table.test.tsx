import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MyDocumentsTable } from "@/components/my/my-documents-table";
import ruMessages from "@/messages/ru.json";
import type { MyDocumentSummary } from "@/lib/api-types";

const fixtures: MyDocumentSummary[] = [
  {
    doc_id: "doc_1",
    filename: "Баланс_2024.csv",
    kind: "csv",
    size_bytes: 2 * 1024 * 1024, // 2 MB
    created_at: "2026-08-27T10:00:00Z",
  },
  {
    doc_id: "doc_2",
    filename: "otchet.pdf",
    kind: "pdf",
    size_bytes: 512 * 1024, // 0.5 MB
    created_at: "2026-08-01T00:00:00Z",
  },
];

function ariaName(template: string, filename: string, date: string) {
  return template.replace("{filename}", filename).replace("{date}", date);
}

const ROW1_ARIA = { filename: "Баланс_2024.csv", date: "27.08.2026" };
const ROW2_ARIA = { filename: "otchet.pdf", date: "01.08.2026" };

function renderTable(documents: MyDocumentSummary[] = fixtures, onDelete = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <MyDocumentsTable documents={documents} locale="ru" onDelete={onDelete} />
    </NextIntlClientProvider>,
  );
  return { onDelete };
}

describe("MyDocumentsTable", () => {
  // Regression guard for a real mobile-overflow bug: /my signed-in at a
  // 390px viewport had 158px of horizontal PAGE overflow
  // (documentElement.scrollWidth 548 vs. clientWidth 390), traced to the
  // actions column's sr-only <span> (Tailwind's sr-only is
  // position:absolute). Without a positioned ancestor, its static position
  // is computed from its unscrolled location inside the wide
  // (min-w-[40rem]) table and escapes this wrapper's own overflow-x-auto
  // clipping entirely — invisible (1x1, clipped) but still a real box in
  // the document's coordinate space, inflating scrollWidth. `relative` on
  // the wrapper makes it the containing block instead, so the span's
  // position (and the table's own overflow) both stay properly contained.
  // Confirmed live: injecting `position:relative` on the wrapper alone
  // dropped documentElement.scrollWidth from 548 to exactly 390 (the
  // viewport width) with no other change.
  //
  // jsdom does no real layout — getBoundingClientRect/scrollWidth aren't
  // computed at all — so the actual overflow behavior can't be asserted
  // here (a fabricated "0" would be vacuous, not a guard). This narrower,
  // honest substitute asserts only that the specific class the fix depends
  // on is present, so a future refactor that drops it (not realizing why
  // it's there) fails a test here instead of failing silently until the
  // next mobile capture.
  it("the scroll wrapper is a positioning context (relative), the fix for the sr-only-span escape bug", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <MyDocumentsTable documents={fixtures} locale="ru" onDelete={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const wrapper = container.querySelector(".overflow-x-auto");
    expect(wrapper).toHaveClass("relative");
  });

  // Close-wave finish-review fix 2: same honesty rule as above — guards
  // only the class that carries the palette-themed scrollbar + edge-fade
  // CSS (globals.css's `.table-scroll-x`), not the rendered visual result.
  it("the scroll wrapper carries the scroll-affordance class (table-scroll-x)", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <MyDocumentsTable documents={fixtures} locale="ru" onDelete={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const wrapper = container.querySelector(".overflow-x-auto");
    expect(wrapper).toHaveClass("table-scroll-x");
  });

  it("renders a row per document: filename, kind chip, formatted date, and size in MB", () => {
    renderTable();

    expect(screen.getByText("Баланс_2024.csv")).toBeInTheDocument();
    expect(screen.getByText("otchet.pdf")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("27.08.2026")).toBeInTheDocument();
    expect(screen.getByText("01.08.2026")).toBeInTheDocument();
    expect(screen.getByText(ruMessages.My.documents.table.sizeMb.replace("{size}", "2,0"))).toBeInTheDocument();
    expect(screen.getByText(ruMessages.My.documents.table.sizeMb.replace("{size}", "0,5"))).toBeInTheDocument();
  });

  // Close-wave finish-review fix 1: a real, non-empty file must never
  // render as "0,0 МБ" — bytesToMB rounded to 1 decimal floors anything
  // under ~50KB to exactly that. A genuine value must never display as a
  // silent zero.
  it("a small (2 KB) file shows the explicit '<0,1 МБ' label, never '0,0 МБ'", () => {
    const small: MyDocumentSummary[] = [
      { doc_id: "doc_3", filename: "small.csv", kind: "csv", size_bytes: 2000, created_at: "2026-08-27T10:00:00Z" },
    ];
    renderTable(small);

    expect(screen.getByText(ruMessages.My.documents.table.sizeUnderMb)).toBeInTheDocument();
    expect(screen.queryByText(ruMessages.My.documents.table.sizeMb.replace("{size}", "0,0"))).not.toBeInTheDocument();
  });

  it("gives each row's delete button a contextual accessible name (filename + date), not the bare 'Удалить'", () => {
    renderTable();

    expect(
      screen.queryByRole("button", { name: ruMessages.My.documents.table.delete }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: ariaName(ruMessages.My.documents.table.deleteAria, ROW1_ARIA.filename, ROW1_ARIA.date),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: ariaName(ruMessages.My.documents.table.deleteAria, ROW2_ARIA.filename, ROW2_ARIA.date),
      }),
    ).toBeInTheDocument();
  });

  it("opening the delete dialog and confirming calls onDelete with the row's doc_id", () => {
    const { onDelete } = renderTable();

    fireEvent.click(
      screen.getByRole("button", {
        name: ariaName(ruMessages.My.documents.table.deleteAria, ROW1_ARIA.filename, ROW1_ARIA.date),
      }),
    );
    expect(screen.getByText(ruMessages.My.documents.deleteDialog.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.documents.deleteDialog.confirm }));

    expect(onDelete).toHaveBeenCalledWith("doc_1");
  });

  it("cancelling the dialog never calls onDelete", () => {
    const { onDelete } = renderTable();

    fireEvent.click(
      screen.getByRole("button", {
        name: ariaName(ruMessages.My.documents.table.deleteAria, ROW1_ARIA.filename, ROW1_ARIA.date),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: ruMessages.My.documents.deleteDialog.cancel }));

    expect(onDelete).not.toHaveBeenCalled();
  });
});
