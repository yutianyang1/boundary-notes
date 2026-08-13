import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isStaffMfaEnforced } from "@/lib/features";
import { describeDevice, extractClientIp } from "@/lib/auth/device";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  fetchVerifiedPrimaryGitHubEmail,
  GitHubOAuthError,
  provisionGitHubUser,
} from "@/lib/auth/github";
import {
  createRegisteredSession,
  revokeRegisteredSession,
  SESSION_MAX_AGE_SECONDS,
  validateRegisteredSession,
} from "@/lib/auth/session-registry";
import { resolveInitialAuthState, verifyMfaUpgradeProof } from "@/lib/auth/mfa";
import { allowLoginAttempt } from "@/lib/auth/login-rate-limit";

const credentialsSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(1_024),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [
    GitHub({
      authorization: { params: { scope: "read:user user:email" } },
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login ?? "GitHub 用户",
          email: null,
          image: profile.avatar_url,
          role: "reader",
          sessionVersion: 0,
        };
      },
    }),
    Credentials({
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        if (!await allowLoginAttempt(extractClientIp(request.headers), parsed.data.email)) return null;

        const [user] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            passwordHash: users.passwordHash,
            role: users.role,
            sessionVersion: users.sessionVersion,
            emailVerified: users.emailVerified,
            mfaEnabled: users.mfaEnabled,
            mfaRequiredAfter: users.mfaRequiredAfter,
            disabledAt: users.disabledAt,
            deletedAt: users.deletedAt,
          })
          .from(users)
          .where(eq(users.email, parsed.data.email))
          .limit(1);

        if (!user?.passwordHash || user.disabledAt || user.deletedAt) return null;
        if (user.role === "reader" && !user.emailVerified) return null;
        const passwordResult = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!passwordResult.valid) return null;

        if (passwordResult.needsRehash) {
          await db.update(users).set({
            passwordHash: await hashPassword(parsed.data.password),
            passwordChangedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(users.id, user.id));
        }
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

        const assurance = resolveInitialAuthState({
          role: user.role,
          mfaEnabled: user.mfaEnabled,
          mfaRequiredAfter: user.mfaRequiredAfter,
          staffMfaEnforced: isStaffMfaEnforced(),
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
          loginIp: extractClientIp(request.headers),
          loginUserAgent: request.headers.get("user-agent"),
          loginDeviceName: describeDevice(request.headers.get("user-agent")),
          ...assurance,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "github") return true;
      try {
        if (!account.access_token || !account.providerAccountId) throw new GitHubOAuthError("EMAIL_UNVERIFIED");
        const email = await fetchVerifiedPrimaryGitHubEmail(account.access_token);
        const registered = await provisionGitHubUser({
          providerAccountId: account.providerAccountId,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          tokenType: account.token_type,
          scope: account.scope,
          name: user.name ?? "GitHub 用户",
          image: user.image,
          email,
        });
        const requestHeaders = await headers();
        user.id = registered.id;
        user.name = registered.name;
        user.email = registered.email;
        user.image = registered.image;
        user.role = registered.role;
        user.sessionVersion = registered.sessionVersion;
        user.loginIp = extractClientIp(requestHeaders);
        user.loginUserAgent = requestHeaders.get("user-agent");
        user.loginDeviceName = describeDevice(requestHeaders.get("user-agent"));
        return true;
      } catch (error) {
        const code = error instanceof GitHubOAuthError ? error.code : "OAUTH_FAILED";
        return `/login?error=${encodeURIComponent(code)}`;
      }
    },
    async jwt({ token, user, trigger, session }) {
      if (user?.id) {
        const registered = await createRegisteredSession(user.id, {
          ip: user.loginIp,
          userAgent: user.loginUserAgent,
          deviceName: user.loginDeviceName,
        });
        token.id = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
        // Auth.js owns the registered JWT "jti" claim and rewrites it while
        // encoding. Keep our database session identifier in a custom claim.
        token.sessionJti = registered.jti;
        token.authState = user.authState ?? "full";
        token.aal = user.aal ?? 1;
        return token;
      }

      if (trigger === "update" && token.id && token.sessionJti) {
        const proof = typeof session?.mfaUpgradeProof === "string" ? session.mfaUpgradeProof : "";
        if (proof && verifyMfaUpgradeProof(proof, token.id, token.sessionJti)) {
          token.authState = "full";
          token.aal = 2;
          token.mfaVerifiedAt = Date.now();
        }
      }

      if (!token.id || !token.sessionJti) return null;
      const state = await validateRegisteredSession(token.id, token.sessionJti);
      if (!state || state.sessionVersion !== token.sessionVersion) return null;
      token.name = state.name;
      token.email = state.email;
      token.picture = state.image;
      token.role = state.role;
      if (token.aal !== 2) {
        const assurance = resolveInitialAuthState({
          role: state.role,
          mfaEnabled: state.mfaEnabled,
          mfaRequiredAfter: state.mfaRequiredAfter,
          staffMfaEnforced: isStaffMfaEnforced(),
        });
        token.authState = assurance.authState;
        token.aal = assurance.aal;
      }
      return token;
    },
    session({ session, token }) {
      session.sessionId = token.sessionJti;
      session.authState = token.authState;
      session.aal = token.aal;
      session.mfaVerifiedAt = token.mfaVerifiedAt;
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role;
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && message.token?.sessionJti) {
        await revokeRegisteredSession(message.token.sessionJti);
      }
    },
  },
});
