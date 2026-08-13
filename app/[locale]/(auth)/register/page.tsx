import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthSplit, AuthSplitSkeleton } from "@/components/auth/auth-split";
import { authRichTags } from "@/components/auth/rich-tags";
import { isPublicRegistrationEnabled } from "@/lib/features";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { RegisterForm } from "./register-form";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ verification?: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "auth.register" });
  return { title: t("metaTitle") };
}

export default function RegisterPage(props: PageProps) {
  return <Suspense fallback={<AuthSplitSkeleton />}><RegisterContent {...props} /></Suspense>;
}

async function RegisterContent({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  await connection();
  if (!isPublicRegistrationEnabled()) notFound();

  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "auth.register" });
  const verificationInvalid = (await searchParams).verification === "invalid";

  return (
    <AuthSplit
      panelEyebrow={t("eyebrow")}
      panelTitle={t.rich("panelTitle", authRichTags)}
      panelDescription={t("panelDescription")}
      points={[t("point1"), t("point2")]}
    >
      <div>
        <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">
          {t("eyebrow")}
        </p>
        <h1 className="headline-sm mt-4 text-3xl">{t("title")}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{t("lead")}</p>
        {verificationInvalid ? (
          <p role="alert" className="mt-6 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {t("verificationInvalid")}
          </p>
        ) : null}
        <RegisterForm />
        <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
          {t("haveAccount")}
          <Link href={localePath("/login", locale)} className="ml-1 font-semibold text-primary hover:underline">
            {t("loginLink")}
          </Link>
        </p>
      </div>
    </AuthSplit>
  );
}
