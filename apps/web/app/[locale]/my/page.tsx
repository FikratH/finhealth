import { getTranslations, setRequestLocale } from "next-intl/server";
import { MyAnalysesView } from "@/components/my/my-analyses-view";
import type { Locale } from "@/lib/format";

type MyPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: MyPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "My.meta" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

// The session gate itself lives in MyAnalysesView (client-side — Better
// Auth's session isn't readable during the server render); this page only
// supplies locale plumbing and metadata, the same split as app/[locale]/
// analyze/page.tsx.
export default async function MyPage({ params }: MyPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MyAnalysesView locale={locale as Locale} />;
}
