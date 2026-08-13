import "next-auth";
import "next-auth/jwt";

type UserRole = "reader" | "author" | "editor" | "admin";

declare module "next-auth" {
  interface User {
    role: UserRole;
    sessionVersion: number;
    loginIp?: string | null;
    loginUserAgent?: string | null;
    loginDeviceName?: string | null;
    authState?: "full" | "mfa_pending" | "mfa_enrollment_required";
    aal?: 1 | 2;
  }

  interface Session {
    sessionId: string;
    authState: "full" | "mfa_pending" | "mfa_enrollment_required";
    aal: 1 | 2;
    mfaVerifiedAt?: number;
    user: {
      id: string;
      role: UserRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    sessionVersion: number;
    sessionJti: string;
    authState: "full" | "mfa_pending" | "mfa_enrollment_required";
    aal: 1 | 2;
    mfaVerifiedAt?: number;
  }
}
