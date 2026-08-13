import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, users } from "@/lib/db/schema";

export type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

export class GitHubOAuthError extends Error {
  constructor(public readonly code: "EMAIL_UNVERIFIED" | "ACCOUNT_DISABLED" | "STAFF_FORBIDDEN" | "ACCOUNT_CONFLICT") {
    super(code);
    this.name = "GitHubOAuthError";
  }
}

export function selectVerifiedPrimaryGitHubEmail(emails: GitHubEmail[]) {
  const candidate = emails.find((item) => item.primary && item.verified)?.email.trim().toLowerCase();
  return candidate && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate) ? candidate : null;
}

export function assertGitHubUserEligible(user: {
  role: "reader" | "author" | "editor" | "admin";
  disabledAt: Date | null;
  deletedAt: Date | null;
}) {
  if (user.disabledAt || user.deletedAt) throw new GitHubOAuthError("ACCOUNT_DISABLED");
  if (user.role !== "reader") throw new GitHubOAuthError("STAFF_FORBIDDEN");
}

export function newGitHubReader(input: { email: string; name: string; image?: string | null }, now = new Date()) {
  return {
    email: input.email,
    name: input.name.slice(0, 120) || "GitHub 用户",
    image: input.image,
    role: "reader" as const,
    emailVerified: now,
    lastLoginAt: now,
  };
}

export async function fetchVerifiedPrimaryGitHubEmail(accessToken: string) {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "xiudou-blog",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new GitHubOAuthError("EMAIL_UNVERIFIED");
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new GitHubOAuthError("EMAIL_UNVERIFIED");
  const emails = payload.flatMap((item): GitHubEmail[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    return typeof value.email === "string" && typeof value.primary === "boolean" && typeof value.verified === "boolean"
      ? [{ email: value.email, primary: value.primary, verified: value.verified }]
      : [];
  });
  const email = selectVerifiedPrimaryGitHubEmail(emails);
  if (!email) throw new GitHubOAuthError("EMAIL_UNVERIFIED");
  return email;
}

type GitHubAccountInput = {
  providerAccountId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  tokenType?: string | null;
  scope?: string | null;
  name: string;
  image?: string | null;
  email: string;
};

export async function provisionGitHubUser(input: GitHubAccountInput) {
  return db.transaction(async (tx) => {
    const [linked] = await tx.select({
      userId: accounts.userId,
      email: users.email,
      name: users.name,
      image: users.image,
      role: users.role,
      sessionVersion: users.sessionVersion,
      disabledAt: users.disabledAt,
      deletedAt: users.deletedAt,
    }).from(accounts)
      .innerJoin(users, eq(accounts.userId, users.id))
      .where(and(eq(accounts.provider, "github"), eq(accounts.providerAccountId, input.providerAccountId)))
      .limit(1);

    if (linked && linked.email.toLowerCase() !== input.email) {
      throw new GitHubOAuthError("ACCOUNT_CONFLICT");
    }

    let user = linked ? {
      id: linked.userId,
      email: linked.email,
      name: linked.name,
      image: linked.image,
      role: linked.role,
      sessionVersion: linked.sessionVersion,
      disabledAt: linked.disabledAt,
      deletedAt: linked.deletedAt,
    } : (await tx.select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: users.role,
      sessionVersion: users.sessionVersion,
      disabledAt: users.disabledAt,
      deletedAt: users.deletedAt,
    }).from(users).where(eq(users.email, input.email)).limit(1))[0];

    if (!user) {
      const [created] = await tx.insert(users).values(newGitHubReader(input)).onConflictDoNothing({ target: users.email }).returning({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        role: users.role,
        sessionVersion: users.sessionVersion,
        disabledAt: users.disabledAt,
        deletedAt: users.deletedAt,
      });
      user = created ?? (await tx.select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        role: users.role,
        sessionVersion: users.sessionVersion,
        disabledAt: users.disabledAt,
        deletedAt: users.deletedAt,
      }).from(users).where(eq(users.email, input.email)).limit(1))[0];
    }

    if (!user) throw new GitHubOAuthError("ACCOUNT_CONFLICT");
    assertGitHubUserEligible(user);

    await tx.insert(accounts).values({
      userId: user.id,
      type: "oauth",
      provider: "github",
      providerAccountId: input.providerAccountId,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
      tokenType: input.tokenType,
      scope: input.scope,
    }).onConflictDoUpdate({
      target: [accounts.provider, accounts.providerAccountId],
      set: {
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        tokenType: input.tokenType,
        scope: input.scope,
      },
    });
    await tx.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    return user;
  });
}
