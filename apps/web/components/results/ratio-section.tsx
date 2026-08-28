import { SectionHeading } from "@/components/section-heading";
import { RatioRow } from "./ratio-row";
import type { CategoryScore, ExtractedValue, RatioResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface RatioSectionProps {
  category: CategoryScore;
  ratios: RatioResult[];
  locale: Locale;
  footnoteIndex: Map<string, number>;
  /** The analysis's source_values, passed through to each RatioRow so it
   * can render its provenance trace. Empty on analyses stored before that
   * field existed — RatioRow renders no trace section in that case. */
  sourceValues: ExtractedValue[];
}

// One category's ratios, grouped under its own heading — every ratio the
// API returns renders, applicable or not (a non-public company's P/E still
// shows as a properly-explained "Н/Д" row, not a hidden one).
export function RatioSection({
  category,
  ratios,
  locale,
  footnoteIndex,
  sourceValues,
}: RatioSectionProps) {
  if (ratios.length === 0) return null;

  return (
    <div className="space-y-1">
      <SectionHeading level={3}>{category.label}</SectionHeading>
      <div className="space-y-3">
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
            kzFootnoteNumber={
              ratio.benchmark_kz?.source
                ? footnoteIndex.get(ratio.benchmark_kz.source)
                : undefined
            }
            sourceValues={sourceValues}
          />
        ))}
      </div>
    </div>
  );
}
