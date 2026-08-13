import { auth } from "@/auth";
import { UserMenu } from "@/components/auth/user-menu";

export async function UserMenuServer() {
  return <UserMenu session={await auth()} />;
}
