import { auth } from "@/auth";
import { SocialChatWidget } from "@/components/social/social-chat-widget";

export async function SocialChatWidgetServer() {
  const session = await auth();
  if (!session?.user?.id || session.authState !== "full") return null;
  return <SocialChatWidget
    userId={session.user.id}
    userName={session.user.name ?? "读者"}
    userImage={session.user.image ?? null}
    isAdmin={session.user.role === "admin"}
  />;
}
