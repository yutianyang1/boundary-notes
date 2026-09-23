import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  auditLogs,
  conversations,
  directMessages,
  friendships,
  socialAnnouncementRecipients,
  socialAnnouncements,
  users,
} from "@/lib/db/schema";

function pair(a: string, b: string) {
  return a < b ? [a, b] as const : [b, a] as const;
}

export function consumeSocialRateLimit(key: string, max: number, windowMs: number) {
  const state = globalThis as typeof globalThis & {
    __socialRateLimit?: Map<string, { startedAt: number; count: number }>;
  };
  const now = Date.now();
  const limits = state.__socialRateLimit ??= new Map();
  let current = limits.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    current = { startedAt: now, count: 0 };
    limits.set(key, current);
  }
  current.count++;
  if (limits.size > 10_000) {
    for (const [itemKey, item] of limits) {
      if (now - item.startedAt >= windowMs) limits.delete(itemKey);
      if (limits.size <= 8_000) break;
    }
  }
  return current.count <= max;
}

export async function getSocialSummary(userId: string) {
  const peer = alias(users, "social_peer");
  const peerId = sql<string>`case when ${friendships.userAId} = ${userId} then ${friendships.userBId} else ${friendships.userAId} end`;
  const relationshipRows = await db
    .select({
      id: friendships.id,
      status: friendships.status,
      requestedBy: friendships.requestedBy,
      peerId,
      peerName: peer.name,
      peerImage: peer.image,
    })
    .from(friendships)
    .innerJoin(peer, eq(peer.id, peerId))
    .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)))
    .orderBy(desc(friendships.updatedAt))
    .limit(300);

  const chatPeer = alias(users, "conversation_peer");
  const conversationPeerId = sql<string>`case when ${conversations.userAId} = ${userId} then ${conversations.userBId} else ${conversations.userAId} end`;
  const conversationRows = await db
    .select({
      id: conversations.id,
      peerId: conversationPeerId,
      peerName: chatPeer.name,
      peerImage: chatPeer.image,
      lastMessageAt: conversations.lastMessageAt,
      latestContent: sql<string | null>`(
        select dm.content from direct_messages dm
        where dm.conversation_id = ${conversations.id}
        order by dm.created_at desc, dm.id desc limit 1
      )`,
      unreadCount: sql<number>`(
        select count(*)::int from direct_messages dm
        where dm.conversation_id = ${conversations.id}
          and dm.sender_id <> ${userId}
          and dm.created_at > coalesce(
            case when ${conversations.userAId} = ${userId}
              then ${conversations.userAReadAt} else ${conversations.userBReadAt} end,
            ${conversations.createdAt}
          )
      )`,
    })
    .from(conversations)
    .innerJoin(chatPeer, eq(chatPeer.id, conversationPeerId))
    .where(or(eq(conversations.userAId, userId), eq(conversations.userBId, userId)))
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))
    .limit(100);

  const announcementRows = await db
    .select({ id: socialAnnouncements.id, content: socialAnnouncements.content, createdAt: socialAnnouncements.createdAt, readAt: socialAnnouncementRecipients.readAt })
    .from(socialAnnouncementRecipients)
    .innerJoin(socialAnnouncements, eq(socialAnnouncements.id, socialAnnouncementRecipients.announcementId))
    .where(eq(socialAnnouncementRecipients.userId, userId))
    .orderBy(desc(socialAnnouncements.createdAt))
    .limit(20);

  const [incoming] = await db
    .select({ value: count() })
    .from(friendships)
    .where(and(
      eq(friendships.status, "pending"),
      or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
      sql`${friendships.requestedBy} <> ${userId}`,
    ));
  const [unreadAnnouncements] = await db
    .select({ value: count() })
    .from(socialAnnouncementRecipients)
    .where(and(
      eq(socialAnnouncementRecipients.userId, userId),
      isNull(socialAnnouncementRecipients.readAt),
    ));

  // Requests are stored in canonical UUID order; requestedBy tells us which side initiated.
  const requests = relationshipRows
    .filter((item) => item.status === "pending")
    .map((item) => ({ ...item, direction: item.requestedBy === userId ? "outgoing" as const : "incoming" as const }));
  const friends = relationshipRows.filter((item) => item.status === "accepted");
  const conversationsView = conversationRows.map((item) => ({ ...item, unreadCount: Number(item.unreadCount) }));
  const unreadMessages = conversationsView.reduce((total, item) => total + item.unreadCount, 0);
  const unreadBroadcasts = Number(unreadAnnouncements?.value ?? 0);

  return {
    friends,
    requests,
    conversations: conversationsView,
    announcements: announcementRows,
    unread: Number(incoming?.value ?? 0) + unreadMessages + unreadBroadcasts,
  };
}

export async function searchSocialUsers(userId: string, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length < 3 || normalized.length > 320) return [];
  const matches = await db
    .select({ id: users.id, name: users.name, image: users.image, email: users.email })
    .from(users)
    .where(and(
      isNull(users.disabledAt),
      isNull(users.deletedAt),
      sql`${users.id} <> ${userId}`,
      sql`(lower(${users.email}) = ${normalized} or lower(${users.name}) = ${normalized})`,
    ))
    .limit(10);
  return matches.map(({ email: _email, ...user }) => user);
}

export async function requestOrAcceptFriend(userId: string, targetId: string) {
  if (userId === targetId) throw new Error("不能添加自己为好友。");
  const [target] = await db.select({ id: users.id }).from(users).where(and(
    eq(users.id, targetId), isNull(users.disabledAt), isNull(users.deletedAt),
  )).limit(1);
  if (!target) throw new Error("找不到这个账号。");
  const [userAId, userBId] = pair(userId, targetId);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(friendships).where(and(
      eq(friendships.userAId, userAId), eq(friendships.userBId, userBId),
    )).limit(1);
    if (existing?.status === "accepted") return { status: "accepted" as const };
    if (existing?.status === "pending") {
      if (existing.requestedBy === userId) return { status: "pending" as const };
      await tx.update(friendships).set({ status: "accepted", updatedAt: new Date() }).where(eq(friendships.id, existing.id));
      return { status: "accepted" as const };
    }
    await tx.insert(friendships).values({ userAId, userBId, requestedBy: userId, status: "pending" });
    return { status: "pending" as const };
  });
}

export async function changeFriendship(userId: string, friendshipId: string, action: "accept" | "reject" | "remove") {
  return db.transaction(async (tx) => {
    const [relationship] = await tx.select().from(friendships).where(and(
      eq(friendships.id, friendshipId),
      or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
    )).limit(1);
    if (!relationship) throw new Error("好友关系不存在。");
    if (action === "accept") {
      if (relationship.status !== "pending" || relationship.requestedBy === userId) throw new Error("这条好友申请无法接受。");
      await tx.update(friendships).set({ status: "accepted", updatedAt: new Date() }).where(eq(friendships.id, friendshipId));
      return { status: "accepted" as const };
    }
    await tx.delete(friendships).where(eq(friendships.id, friendshipId));
    return { status: "removed" as const };
  });
}

export async function getOrCreateConversation(userId: string, friendId: string) {
  if (userId === friendId) throw new Error("不能和自己聊天。");
  const [userAId, userBId] = pair(userId, friendId);
  const [relationship] = await db.select({ id: friendships.id }).from(friendships).where(and(
    eq(friendships.userAId, userAId), eq(friendships.userBId, userBId), eq(friendships.status, "accepted"),
  )).limit(1);
  if (!relationship) throw new Error("只有互为好友后才能私聊。");
  const [conversation] = await db.insert(conversations).values({ userAId, userBId })
    .onConflictDoNothing({ target: [conversations.userAId, conversations.userBId] })
    .returning({ id: conversations.id });
  if (conversation) return conversation;
  const [existing] = await db.select({ id: conversations.id }).from(conversations).where(and(
    eq(conversations.userAId, userAId), eq(conversations.userBId, userBId),
  )).limit(1);
  if (!existing) throw new Error("无法创建会话。");
  return existing;
}

export async function listConversationMessages(userId: string, conversationId: string) {
  const [conversation] = await db.select().from(conversations).where(and(
    eq(conversations.id, conversationId),
    or(eq(conversations.userAId, userId), eq(conversations.userBId, userId)),
  )).limit(1);
  if (!conversation) throw new Error("会话不存在。");
  const rows = await db.select({ id: directMessages.id, senderId: directMessages.senderId, content: directMessages.content, createdAt: directMessages.createdAt })
    .from(directMessages).where(eq(directMessages.conversationId, conversationId))
    .orderBy(desc(directMessages.createdAt), desc(directMessages.id)).limit(50);
  return rows.reverse();
}

export async function markConversationRead(userId: string, conversationId: string) {
  const [conversation] = await db.select({ id: conversations.id, userAId: conversations.userAId, userBId: conversations.userBId })
    .from(conversations).where(and(
      eq(conversations.id, conversationId),
      or(eq(conversations.userAId, userId), eq(conversations.userBId, userId)),
    )).limit(1);
  if (!conversation) throw new Error("会话不存在。");
  await db.update(conversations).set(conversation.userAId === userId
    ? { userAReadAt: new Date(), updatedAt: new Date() }
    : { userBReadAt: new Date(), updatedAt: new Date() },
  ).where(eq(conversations.id, conversationId));
}

export async function sendDirectMessage(userId: string, conversationId: string, content: string) {
  const text = content.trim();
  if (!text || text.length > 4000) throw new Error("消息不能为空，且最多 4000 个字符。");
  return db.transaction(async (tx) => {
    const [conversation] = await tx.select().from(conversations).where(and(
      eq(conversations.id, conversationId),
      or(eq(conversations.userAId, userId), eq(conversations.userBId, userId)),
    )).limit(1);
    if (!conversation) throw new Error("会话不存在。");
    const [relationship] = await tx.select({ id: friendships.id }).from(friendships).where(and(
      eq(friendships.userAId, conversation.userAId),
      eq(friendships.userBId, conversation.userBId),
      eq(friendships.status, "accepted"),
    )).limit(1);
    if (!relationship) throw new Error("好友关系已结束，不能继续发送消息。");
    const now = new Date();
    const [message] = await tx.insert(directMessages).values({ conversationId, senderId: userId, content: text, createdAt: now }).returning({
      id: directMessages.id, senderId: directMessages.senderId, content: directMessages.content, createdAt: directMessages.createdAt,
    });
    await tx.update(conversations).set({
      lastMessageAt: now,
      updatedAt: now,
      ...(conversation.userAId === userId ? { userAReadAt: now } : { userBReadAt: now }),
    }).where(eq(conversations.id, conversationId));
    return message;
  });
}

export async function sendSocialAnnouncement(adminId: string, content: string) {
  const text = content.trim();
  if (!text || text.length > 4000) throw new Error("群发内容不能为空，且最多 4000 个字符。");
  return db.transaction(async (tx) => {
    const [announcement] = await tx.insert(socialAnnouncements).values({ adminId, content: text }).returning({ id: socialAnnouncements.id });
    const recipientRows = tx.select({
      announcementId: sql`${announcement.id}::uuid`.as("announcement_id"),
      userId: users.id,
    }).from(users).where(and(isNull(users.disabledAt), isNull(users.deletedAt)));
    const recipients = await tx.insert(socialAnnouncementRecipients).select(recipientRows).returning({ userId: socialAnnouncementRecipients.userId });
    await tx.update(socialAnnouncements).set({ recipientCount: recipients.length }).where(eq(socialAnnouncements.id, announcement.id));
    await tx.insert(auditLogs).values({
      actorId: adminId,
      action: "social.announcement.send",
      targetType: "social_announcement",
      targetId: announcement.id,
      after: { recipientCount: recipients.length },
    });
    return { id: announcement.id, recipientCount: recipients.length };
  });
}

export async function markAnnouncementRead(userId: string, announcementId: string) {
  await db.update(socialAnnouncementRecipients).set({ readAt: new Date() }).where(and(
    eq(socialAnnouncementRecipients.userId, userId),
    eq(socialAnnouncementRecipients.announcementId, announcementId),
    isNull(socialAnnouncementRecipients.readAt),
  ));
}
