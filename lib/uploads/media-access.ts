export function canAccessMediaLibrary(role: string) {
  return role !== "reader";
}

export function canManageMediaAsset(
  user: { id: string; role: string },
  uploadedBy: string,
) {
  return user.role === "admin" || user.id === uploadedBy;
}
