import { useTranslations } from "next-intl";

// A slim, standalone restatement of the privacy default — deliberately not
// folded into the methodology excerpt above, so a scanning reader can find
// it without parsing the full trust paragraph.
export function PrivacyStrip() {
  const t = useTranslations("Landing.privacy");

  return (
    <section className="grid-paper border-y border-line">
      <p className="mx-auto max-w-5xl px-6 py-6 text-sm text-ink-muted">
        {t("body")}
      </p>
    </section>
  );
}
