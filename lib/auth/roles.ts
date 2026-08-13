export type UserRole = "reader" | "author" | "editor" | "admin";

export const roleLabels: Record<UserRole, string> = {
  reader: "读者",
  author: "作者",
  editor: "编辑",
  admin: "管理员",
};

const staffRoles = new Set<UserRole>(["author", "editor", "admin"]);
const editorRoles = new Set<UserRole>(["editor", "admin"]);

export function isStaffRole(role: UserRole) {
  return staffRoles.has(role);
}

export function isEditorRole(role: UserRole) {
  return editorRoles.has(role);
}

export function canManagePost(user: { id: string; role: string }, authorId: string) {
  return user.role === "admin" || user.role === "editor" || (user.role === "author" && user.id === authorId);
}
