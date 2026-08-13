export function safeLocalRedirect(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
}
