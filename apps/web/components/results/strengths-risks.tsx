import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";

export interface StrengthsRisksProps {
  strengths: string[];
  risks: string[];
}

// Reuses the app's existing status glyphs (✓/✕, from StatusPill's own
// vocabulary) rather than inventing a second icon language for the same
// good/bad distinction.
export function StrengthsRisks({ strengths, risks }: StrengthsRisksProps) {
  const tStrengths = useTranslations("Results.strengths");
  const tRisks = useTranslations("Results.risks");

  if (strengths.length === 0 && risks.length === 0) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {strengths.length > 0 && (
        <section className="space-y-3">
          <SectionHeading level={3}>{tStrengths("heading")}</SectionHeading>
          <ul className="space-y-2 text-sm text-ink">
            {strengths.map((strength) => (
              <li key={strength} className="flex gap-2">
                <span aria-hidden="true" className="text-good">
                  ✓
                </span>
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {risks.length > 0 && (
        <section className="space-y-3">
          <SectionHeading level={3}>{tRisks("heading")}</SectionHeading>
          <ul className="space-y-2 text-sm text-ink">
            {risks.map((risk) => (
              <li key={risk} className="flex gap-2">
                <span aria-hidden="true" className="text-critical">
                  ✕
                </span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
