import { getTranslations, setRequestLocale } from "next-intl/server";
import { googleAuthEnabled } from "@/lib/auth";
import { SectionHeading } from "@/components/section-heading";
import { SigninForm } from "@/components/signin-form";

type SigninPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SigninPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "SignIn.meta" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

// Google availability is computed server-side (env vars aren't readable
// client-side) and passed down as a plain prop — SigninForm renders no
// Google button at all, rather than a disabled one, when it's false.
export default async function SigninPage({ params }: SigninPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "SignIn" });

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <SectionHeading>{t("heading")}</SectionHeading>
      <p className="mt-4 text-sm text-ink-muted">{t("intro")}</p>
      <div className="mt-6">
        <SigninForm googleEnabled={googleAuthEnabled} />
      </div>
    </div>
  );
}
