import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.AUTH_PROXY_ENABLED === "false") {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has("access_token");
  const { pathname } = request.nextUrl;

  if ((pathname === "/login" || pathname === "/cadastro") && hasSession) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  if (
    (pathname.startsWith("/home") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/ranking")) &&
    !hasSession
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/cadastro",
    "/home/:path*",
    "/admin/:path*",
    "/ranking/:path*",
  ],
};
