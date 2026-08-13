import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * locale 感知的导航原语。[locale] 段下面一律用这里的 Link / redirect，
 * 不要直接用 next/link，否则英文站点击后会掉回中文站。
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
