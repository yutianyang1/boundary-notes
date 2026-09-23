"use client";

import { Check, MessageCircle, MessageSquare, Send, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type SocialUser = { id: string; name: string; image: string | null };
type Relationship = { id: string; status: "pending" | "accepted"; requestedBy: string; peerId: string; peerName: string; peerImage: string | null; direction?: "incoming" | "outgoing" };
type Conversation = { id: string; peerId: string; peerName: string; peerImage: string | null; lastMessageAt: string | null; latestContent: string | null; unreadCount: number };
type Announcement = { id: string; content: string; createdAt: string; readAt: string | null };
type Summary = { friends: Relationship[]; requests: Relationship[]; conversations: Conversation[]; announcements: Announcement[]; unread: number };
type ChatMessage = { id: string; senderId: string; content: string; createdAt: string };
type Tab = "conversations" | "friends" | "announcements" | "broadcast";

const EMPTY_SUMMARY: Summary = { friends: [], requests: [], conversations: [], announcements: [], unread: 0 };

export function SocialChatWidget({ userId, userName, userImage, isAdmin }: { userId: string; userName: string; userImage: string | null; isAdmin: boolean }) {
  const [visible, setVisible] = useState(true);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("conversations");
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SocialUser[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [broadcastDraft, setBroadcastDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/social", { cache: "no-store" }).catch(() => null);
    if (response?.status === 401 || response?.status === 403) {
      setVisible(false);
      return;
    }
    if (!response?.ok) return;
    const value = await response.json() as Summary;
    setSummary(value);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 3) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch(`/api/social/users?q=${encodeURIComponent(value)}`, { cache: "no-store" })
        .then(async (response) => response.ok ? response.json() as Promise<{ users: SocialUser[] }> : { users: [] })
        .then((result) => { if (!cancelled) setSearchResults(result.users); })
        .catch(() => { if (!cancelled) setSearchResults([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const refreshMessages = useCallback(async (conversationId: string) => {
    const [response] = await Promise.all([
      fetch(`/api/social/conversations/${encodeURIComponent(conversationId)}/messages`, { cache: "no-store" }).catch(() => null),
      fetch(`/api/social/conversations/${encodeURIComponent(conversationId)}/read`, { method: "POST" }).catch(() => null),
    ]);
    if (!response?.ok) return;
    const value = await response.json() as { messages: ChatMessage[] };
    setMessages(value.messages);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeChat) return;
    void refreshMessages(activeChat.id);
    const timer = window.setInterval(() => void refreshMessages(activeChat.id), 3_000);
    return () => window.clearInterval(timer);
  }, [activeChat, refreshMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function post<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(value.error ?? "操作失败。");
    return value;
  }

  async function actFriend(action: string, item: Relationship | SocialUser) {
    setBusy(true);
    setNotice("");
    try {
      if (action === "request") await post("/api/social/friendships", { action, targetId: (item as SocialUser).id });
      else await post("/api/social/friendships", { action, friendshipId: (item as Relationship).id });
      await refresh();
      setQuery("");
      setSearchResults([]);
      if (action === "request") setNotice("好友申请已发送；对方回加时会自动成为好友。");
      else if (action === "accept") setNotice(`已和 ${(item as Relationship).peerName} 成为好友。`);
      else setNotice(action === "reject" ? "已忽略好友申请。" : "已移除好友关系。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function startChat(friend: Relationship) {
    try {
      const conversation = await post<{ id: string }>("/api/social/conversations", { friendId: friend.peerId });
      const existing = summary.conversations.find((item) => item.id === conversation.id);
      setActiveChat(existing ?? {
        id: conversation.id,
        peerId: friend.peerId,
        peerName: friend.peerName,
        peerImage: friend.peerImage,
        lastMessageAt: null,
        latestContent: null,
        unreadCount: 0,
      });
      setMessages([]);
      setTab("conversations");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法打开会话。");
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = messageDraft.trim();
    if (!activeChat || !content || busy) return;
    setBusy(true);
    try {
      await post(`/api/social/conversations/${encodeURIComponent(activeChat.id)}/messages`, { content });
      setMessageDraft("");
      await refreshMessages(activeChat.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "消息发送失败。");
    } finally {
      setBusy(false);
    }
  }

  function messageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function openAnnouncement(item: Announcement) {
    if (!item.readAt) {
      await fetch(`/api/social/announcements/${encodeURIComponent(item.id)}/read`, { method: "POST" }).catch(() => null);
      await refresh();
    }
  }

  async function sendBroadcast(event: FormEvent) {
    event.preventDefault();
    const content = broadcastDraft.trim();
    if (!content || busy) return;
    if (!window.confirm("确定向当前所有有效账号群发这条消息吗？发送后无法撤回。")) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await post<{ recipientCount: number }>("/api/admin/social/announcements", { content });
      setBroadcastDraft("");
      setNotice(`已向 ${result.recipientCount} 个账号发送。`);
      await refresh();
      setTab("announcements");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "群发失败。");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[80] font-sans">
      {open ? (
        <section aria-label="好友与消息" className="mb-3 flex h-[min(640px,calc(100dvh-7rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl">
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <div className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"><MessageCircle className="size-5" /></div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">好友与消息</p><p className="truncate text-xs text-muted-foreground">{userName}</p></div>
            <button type="button" aria-label="关闭聊天" className="rounded-md p-2 hover:bg-muted" onClick={() => setOpen(false)}><X className="size-4" /></button>
          </header>
          <nav className="flex border-b px-2" aria-label="消息分类">
            <WidgetTab selected={tab === "conversations"} onClick={() => { setTab("conversations"); setActiveChat(null); }}>会话</WidgetTab>
            <WidgetTab selected={tab === "friends"} onClick={() => { setTab("friends"); setActiveChat(null); }}>好友{summary.requests.some((item) => item.direction === "incoming") ? " ·" : ""}</WidgetTab>
            <WidgetTab selected={tab === "announcements"} onClick={() => { setTab("announcements"); setActiveChat(null); }}>公告</WidgetTab>
            {isAdmin ? <WidgetTab selected={tab === "broadcast"} onClick={() => { setTab("broadcast"); setActiveChat(null); }}>群发</WidgetTab> : null}
          </nav>
          {notice ? <p role="status" className="border-b bg-muted/60 px-4 py-2 text-xs">{notice}</p> : null}
          {activeChat && tab === "conversations" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <button type="button" className="text-sm text-primary" onClick={() => setActiveChat(null)}>← 会话</button>
                <Person user={{ id: activeChat.peerId, name: activeChat.peerName, image: activeChat.peerImage }} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-muted/25 p-3">
                {messages.map((message) => <div key={message.id} className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${message.senderId === userId ? "self-end bg-primary text-primary-foreground" : "self-start bg-card shadow-sm"}`}>
                  <p>{message.content}</p><time className="mt-1 block text-right text-[10px] opacity-65">{formatTime(message.createdAt)}</time>
                </div>)}
                {messages.length === 0 ? <p className="m-auto text-sm text-muted-foreground">发一条消息开始聊天</p> : null}
                <div ref={endRef} />
              </div>
              <form onSubmit={(event) => void sendMessage(event)} className="border-t p-3">
                <textarea aria-label="聊天消息" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} onKeyDown={messageKeyDown} maxLength={4000} rows={2} placeholder="输入消息，Enter 发送，Shift+Enter 换行" className="w-full resize-none rounded-xl border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-muted-foreground">{messageDraft.length}/4000</span><button disabled={busy || !messageDraft.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Send className="size-3.5" />发送</button></div>
              </form>
            </div>
          ) : tab === "conversations" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {summary.conversations.length ? summary.conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => setActiveChat(conversation)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted">
                <Avatar user={{ id: conversation.peerId, name: conversation.peerName, image: conversation.peerImage }} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{conversation.peerName}</span><span className="block truncate text-xs text-muted-foreground">{conversation.latestContent ?? "开始聊天"}</span></span>
                {conversation.unreadCount > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{conversation.unreadCount}</span> : null}
              </button>) : <Empty>还没有私聊。到“好友”里添加好友后即可聊天。</Empty>}
            </div>
          ) : tab === "friends" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <label className="mb-3 block text-xs font-medium">按注册邮箱或昵称精确查找
                <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={320} autoComplete="off" placeholder="输入至少 3 个字符" className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </label>
              {searchResults.map((result) => <div key={result.id} className="flex items-center gap-2 border-b py-2"><Person user={result} /><button disabled={busy || summary.friends.some((friend) => friend.peerId === result.id) || summary.requests.some((item) => item.peerId === result.id)} onClick={() => void actFriend("request", result)} className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50">{summary.friends.some((friend) => friend.peerId === result.id) ? "已是好友" : summary.requests.some((item) => item.peerId === result.id) ? "已申请" : "添加"}</button></div>)}
              {query.trim().length >= 3 && searchResults.length === 0 ? <p className="py-3 text-xs text-muted-foreground">没有找到匹配账号。</p> : null}
              {summary.requests.filter((item) => item.direction === "incoming").length ? <h3 className="mt-4 text-xs font-semibold">好友申请</h3> : null}
              {summary.requests.filter((item) => item.direction === "incoming").map((request) => <div key={request.id} className="flex items-center gap-2 border-b py-2"><Person user={{ id: request.peerId, name: request.peerName, image: request.peerImage }} /><button disabled={busy} onClick={() => void actFriend("accept", request)} className="rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground"><Check className="inline size-3.5" /> 接受</button><button disabled={busy} onClick={() => void actFriend("reject", request)} className="rounded-lg border px-2.5 py-1.5 text-xs">忽略</button></div>)}
              {summary.requests.filter((item) => item.direction === "outgoing").map((request) => <p key={request.id} className="py-1 text-xs text-muted-foreground">已向 {request.peerName} 发送申请</p>)}
              <h3 className="mt-4 text-xs font-semibold">好友 · {summary.friends.length}</h3>
              {summary.friends.map((friend) => <div key={friend.id} className="flex items-center gap-2 border-b py-2"><Person user={{ id: friend.peerId, name: friend.peerName, image: friend.peerImage }} /><button onClick={() => void startChat(friend)} className="rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground">聊天</button><button disabled={busy} onClick={() => void actFriend("remove", friend)} className="rounded-lg border px-2.5 py-1.5 text-xs">移除</button></div>)}
              {summary.friends.length === 0 ? <Empty>添加好友后，可以在这里发起私聊。</Empty> : null}
            </div>
          ) : tab === "announcements" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {summary.announcements.map((item) => <article key={item.id} onClick={() => void openAnnouncement(item)} className={`mb-2 rounded-xl border p-3 ${item.readAt ? "bg-card" : "border-primary/40 bg-primary/5"}`}>
                <div className="mb-1 flex items-center justify-between text-xs"><strong>{item.readAt ? "站内公告" : "新公告"}</strong><time className="text-muted-foreground">{formatTime(item.createdAt)}</time></div><p className="whitespace-pre-wrap break-words text-sm">{item.content}</p>
              </article>)}
              {summary.announcements.length === 0 ? <Empty>目前没有公告。</Empty> : null}
            </div>
          ) : (
            <form onSubmit={(event) => void sendBroadcast(event)} className="flex min-h-0 flex-1 flex-col gap-3 p-3">
              <p className="rounded-lg bg-muted p-3 text-xs leading-5">向发送时所有有效账号发布站内公告。用户下次打开博客时会看到未读提醒。</p>
              <textarea aria-label="管理员群发内容" value={broadcastDraft} onChange={(event) => setBroadcastDraft(event.target.value)} maxLength={4000} rows={8} placeholder="写一条公告…" className="min-h-32 flex-1 resize-none rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{broadcastDraft.length}/4000</span><button disabled={busy || !broadcastDraft.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Send className="size-3.5" />群发给全部用户</button></div>
            </form>
          )}
        </section>
      ) : null}
      <button type="button" aria-label="打开好友与消息" aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void refresh(); }} className="relative ml-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40">
        {open ? <X className="size-6" /> : <MessageSquare className="size-6" />}
        {summary.unread > 0 && !open ? <span aria-label={`${summary.unread} 条未读`} className="absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full border-2 border-background bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{summary.unread > 99 ? "99+" : summary.unread}</span> : null}
      </button>
    </div>
  );
}

function WidgetTab({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-current={selected ? "page" : undefined} onClick={onClick} className={`flex-1 border-b-2 px-2 py-2.5 text-xs font-medium ${selected ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{children}</button>;
}

function Avatar({ user }: { user: SocialUser }) {
  return user.image ? <Image src={user.image} alt="" width={36} height={36} unoptimized className="size-9 shrink-0 rounded-full object-cover" /> : <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{user.name.trim().slice(0, 1).toUpperCase()}</span>;
}

function Person({ user }: { user: SocialUser }) {
  return <span className="flex min-w-0 flex-1 items-center gap-2"><Avatar user={user} /><span className="truncate text-sm font-medium">{user.name}</span></span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-8 text-center text-xs leading-5 text-muted-foreground">{children}</p>;
}

function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" }).format(new Date(value));
}
