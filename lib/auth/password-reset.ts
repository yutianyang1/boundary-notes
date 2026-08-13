export const PASSWORD_RESET_RESPONSE = "如果该邮箱可用，重置邮件将会发送";

type ResetEligibleUser = {
  passwordHash: string | null;
  disabledAt: Date | null;
  deletedAt: Date | null;
};

export function isPasswordResetEligible(user: ResetEligibleUser | null | undefined) {
  return Boolean(user?.passwordHash && !user.disabledAt && !user.deletedAt);
}
