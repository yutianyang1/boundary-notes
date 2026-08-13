import type { Metadata } from "next";
import Link from "next/link";
import { createTranslator } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { AuthSplit } from "@/components/auth/auth-split";
import { authRichTags } from "@/components/auth/rich-tags";
import { localePath } from "@/i18n/href";
import { messagesFor } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { ForgotPasswordForm } from "./forgot-password-form";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator({ locale, messages: messagesFor(locale as Locale), namespace: "auth.forgotPassword" });
  return { title: t("metaTitle") };
}

export default async function ForgotPasswordPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const messages = messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: "auth.forgotPassword" });
  const tc = createTranslator({ locale, messages, namespace: "auth.common" });

  return (
    <AuthSplit
      panelEyebrow={t("eyebrow")}
      panelTitle={t.rich("panelTitle", authRichTags)}
      panelDescription={t("panelDescription")}
      points={[t("point1"), t("point2")]}
    >
      <div>
        <p className="eyebrow flex items-center gap-2 text-primary before:block before:h-[3px] before:w-6 before:rounded-full before:bg-primary">{t("eyebrow")}</p>
        <h1 className="headline-sm mt-4 text-3xl">{t("title")}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{t("lead")}</p>
        <ForgotPasswordForm />
        <p className="mt-6 border-t border-hairline pt-5 text-center text-sm text-muted-foreground">
          {t("remembered")}
          <Link href={localePath("/login", locale)} className="ml-1 font-semibold text-primary hover:underline">
            {tc("backToLogin")}
          </Link>
        </p>
      </div>
    </AuthSplit>
  );
}
