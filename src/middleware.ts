/**
 * Middleware — Route protection via session cookie.
 */

import { NextRequest, NextResponse } from "next/server";

const protectedRoutes = ["/dashboard", "/create", "/content", "/calendar", "/queue", "/voice-dna", "/settings", "/admin", "/onboarding"];
const authRoutes = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = request.cookies.has("better-auth.session_token") || request.cookies.has("linkedgrow_session");

  if (protectedRoutes.some((r) => pathname.startsWith(r)) && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (authRoutes.some((r) => pathname.startsWith(r)) && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
