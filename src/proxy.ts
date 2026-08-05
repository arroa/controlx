import { NextResponse, type NextRequest } from "next/server";

import { isDevBypassEnabled } from "@/lib/dev-flags";
import { getDevSessionUserIdFromRequest } from "@/lib/dev-session-edge";

const publicPathPrefixes = [
  "/",
  "/sign-in",
  "/sign-up",
  "/api/health",
  "/api/auth/dev-login",
  "/api/auth/dev-logout",
  "/manifest.webmanifest",
  "/sw.js",
];

function isPublicPath(pathname: string): boolean {
  return publicPathPrefixes.some((prefix) => {
    if (prefix === "/") {
      return pathname === "/";
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

function withPathnameHeader(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  requestHeaders.set("x-pathname", path);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

async function handleDevBypass(request: NextRequest) {
  if (await getDevSessionUserIdFromRequest(request)) {
    return withPathnameHeader(request);
  }

  if (!isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return withPathnameHeader(request);
}

export default async function proxy(
  request: NextRequest,
  event: unknown,
) {
  if (isDevBypassEnabled()) {
    return handleDevBypass(request);
  }

  const { clerkMiddleware, createRouteMatcher } = await import(
    "@clerk/nextjs/server"
  );

  const isPublicRoute = createRouteMatcher([
    "/",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/health(.*)",
    "/api/auth/dev-login(.*)",
    "/api/auth/dev-logout(.*)",
    "/manifest.webmanifest",
    "/sw.js",
  ]);

  const clerkHandler = clerkMiddleware(async (auth, req) => {
    if (await getDevSessionUserIdFromRequest(req)) {
      return;
    }

    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  });

  // Clerk middleware no reescribe x-pathname; lo añadimos en un wrap.
  const result = await clerkHandler(request, event as never);
  if (result) return result;
  return withPathnameHeader(request);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
