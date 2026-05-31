import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/plan",
  "/map",
  "/requirements",
  "/chat",
  "/deadlines",
  "/emails",
  "/settings",
  "/onboarding",
  "/admin",
];

const AUTH_PAGES = new Set(["/login", "/signup"]);

const SESSION_COOKIE = "compass.session_token";

// In production over HTTPS, Better Auth prefixes the cookie with `__Secure-`
// (e.g. `__Secure-compass.session_token`); locally over HTTP it's unprefixed.
// The middleware must accept both, or authenticated users get bounced to
// /login on every protected route in prod.
const SESSION_COOKIE_NAMES = [
  SESSION_COOKIE,
  `__Secure-${SESSION_COOKIE}`,
  `${SESSION_COOKIE}.sig`,
  `__Secure-${SESSION_COOKIE}.sig`,
];

function hasSession(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const sessionPresent = hasSession(req);
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  // Protect app routes: kick anonymous users to /login with a return path.
  if (isProtected && !sessionPresent) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Don't show auth pages to signed-in users.
  if (AUTH_PAGES.has(pathname) && sessionPresent) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes (handled by route handlers)
     * - _next/static, _next/image, _next/data
     * - favicon, manifest, brand assets
     */
    "/((?!api|_next/static|_next/image|_next/data|favicon.ico|brand|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
