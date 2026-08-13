import { isStaffRole } from "@/lib/auth/roles";

export function resolveCommentDepth(parent: { postId: string; depth: number } | null, postId: string) {
  if (!parent) return 0;
  if (parent.postId !== postId) throw new Error("COMMENT_PARENT_POST_MISMATCH");
  const depth = parent.depth + 1;
  if (depth > 1) throw new Error("COMMENT_DEPTH_EXCEEDED");
  return depth;
}

export function canDeleteComment(
  actor: { id: string; role: "reader" | "author" | "editor" | "admin" },
  ownerId: string | null,
) {
  return actor.id === ownerId || isStaffRole(actor.role);
}
