import { auth } from "@/auth";
import { isEditorRole, isStaffRole } from "@/lib/auth/roles";
export { canManagePost } from "@/lib/auth/roles";

export async function requireSession() {
  const session = await auth();
  if (!session?.user || !session.sessionId) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requireUser() {
  const session = await requireFullSession();
  return session.user;
}

export async function requireFullSession() {
  const session = await requireSession();
  if (session.authState !== "full") throw new Error("MFA_REQUIRED");
  return session;
}

export async function requireMfaChallenge() {
  const session = await requireSession();
  if (session.authState !== "mfa_pending") throw new Error("INVALID_AUTH_STATE");
  return session;
}

export async function requireMfaEnrollment() {
  const session = await requireSession();
  if (session.authState !== "mfa_enrollment_required") throw new Error("INVALID_AUTH_STATE");
  return session;
}

export async function requireStepUp() {
  const session = await requireSession();
  const freshAfter = Date.now() - 15 * 60 * 1_000;
  if (session.authState !== "full" || session.aal !== 2 || !session.mfaVerifiedAt || session.mfaVerifiedAt < freshAfter) {
    throw new Error("STEP_UP_REQUIRED");
  }
  return session;
}

export async function requireStaff() {
  const user = await requireUser();
  if (!isStaffRole(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function requireEditor() {
  const user = await requireUser();
  if (!isEditorRole(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}
