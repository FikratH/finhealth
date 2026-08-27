import { SectionHeading } from "@/components/section-heading";
import { RatioRow } from "./ratio-row";
import type { CategoryScore, RatioResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface RatioSectionProps {
  category: CategoryScore;
  ratios: RatioResult[];
  locale: Locale;
  footnoteIndex: Map<string, number>;
}

// One category's ratios, grouped under its own heading — every ratio the
// API returns renders, applicable or not (a non-public company's P/E still
// shows as a properly-explained "Н/Д" row, not a hidden one).
export function RatioSection({
  category,
  ratios,
  locale,
  footnoteIndex,
}: RatioSectionProps) {
  if (ratios.length === 0) return null;

  return (
    <div className="space-y-1">
      <SectionHeading level={3}>{category.label}</SectionHeading>
      <div>
        {ratios.map((ratio) => (
          <RatioRow
            key={ratio.key}
            ratio={ratio}
            locale={locale}
            footnoteNumber={
              ratio.benchmark?.source
                ? footnoteIndex.get(ratio.benchmark.source)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
