import { auth } from "@/auth";
import { UserMenu } from "@/components/auth/user-menu";
import type { Locale } from "@/i18n/routing";

export async function UserMenuServer({ locale }: { locale: Locale }) {
  return <UserMenu locale={locale} session={await auth()} />;
}
