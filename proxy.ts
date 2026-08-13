import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const registrationEnabled = process.env.PUBLIC_REGISTRATION_ENABLED?.toLowerCase() === "true";
  if (!registrationEnabled && (
    request.nextUrl.pathname.startsWith("/register") ||
    request.nextUrl.pathname === "/verify-email"
  )) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-current-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/register/:path*", "/verify-email", "/admin/:path*"],
};
