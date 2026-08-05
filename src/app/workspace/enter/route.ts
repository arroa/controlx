import { NextResponse } from "next/server";

import { canAccessOrganizationHub } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import {
  encodeWorkspaceContext,
  workspaceCookieOptions,
} from "@/lib/workspace-context";

/**
 * Fija el contexto de trabajo (org / evento) y redirige.
 * GET /workspace/enter?org=&event=&next=
 */
export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const url = new URL(request.url);
  const org = url.searchParams.get("org");
  const event = url.searchParams.get("event");
  const nextRaw = url.searchParams.get("next");

  if (!org) {
    return NextResponse.redirect(new URL("/elegir-organizacion", request.url));
  }

  const allowed =
    authResult.user.isSuperAdmin ||
    (await canAccessOrganizationHub(authResult.user.email, org));
  if (!allowed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  let nextPath = nextRaw || `/ejecuciones?org=${org}`;
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    nextPath = `/ejecuciones?org=${org}`;
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const cookie = workspaceCookieOptions(
    encodeWorkspaceContext({
      organizationId: org,
      eventId: event,
    }),
  );
  response.cookies.set(cookie.name, cookie.value, cookie);
  return response;
}
