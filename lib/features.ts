function enabled(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

export const isPublicRegistrationEnabled = () => enabled("PUBLIC_REGISTRATION_ENABLED");
export const areCommentsEnabled = () => enabled("COMMENTS_ENABLED");
export const isStaffMfaEnforced = () => enabled("STAFF_MFA_ENFORCED");
export const isSubscriptionEnabled = () => enabled("SUBSCRIPTIONS_ENABLED");
