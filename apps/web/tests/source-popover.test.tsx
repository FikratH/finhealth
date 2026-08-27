import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SourcePopover } from "@/components/analyze/source-popover";
import ruMessages from "@/messages/ru.json";

function renderPopover(props: Partial<Parameters<typeof SourcePopover>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <SourcePopover
        source={props.source ?? "sheet1!B4"}
        snippet={props.snippet ?? "3 245 900"}
        context={props.context ?? "Выручка, Текущий период"}
      />
    </NextIntlClientProvider>,
  );
}

describe("SourcePopover", () => {
  it("starts the trigger's accessible name with its own visible label, per WCAG 2.5.3 (Label in Name)", () => {
    renderPopover();
    const trigger = screen.getByRole("button", { name: /^Источник/ });
    expect(trigger).toHaveTextContent("Источник");
    expect(trigger).toHaveAccessibleName("Источник: Выручка, Текущий период");
  });

  it("shows the no-source message instead of a trigger when there is nothing to disclose", () => {
    renderPopover({ source: "", snippet: "" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(ruMessages.Analyze.verify.source.noSource)).toBeInTheDocument();
  });
});
