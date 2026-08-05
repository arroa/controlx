import "server-only";

import { cookies } from "next/headers";
import { ObjectId } from "mongodb";

export const WORKSPACE_COOKIE = "cx_workspace";

export type WorkspaceContext = {
  organizationId: string | null;
  eventId: string | null;
};

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function cookieSecure() {
  return process.env.NODE_ENV === "production";
}

/** Serializa org|event (event puede ir vacío). */
export function encodeWorkspaceContext(ctx: WorkspaceContext): string {
  const org = ctx.organizationId && ObjectId.isValid(ctx.organizationId)
    ? ctx.organizationId
    : "";
  const event =
    ctx.eventId && ObjectId.isValid(ctx.eventId) ? ctx.eventId : "";
  return `${org}|${event}`;
}

export function decodeWorkspaceContext(raw: string | undefined | null): WorkspaceContext {
  if (!raw) return { organizationId: null, eventId: null };
  const [org = "", event = ""] = raw.split("|");
  return {
    organizationId: ObjectId.isValid(org) ? org : null,
    eventId: ObjectId.isValid(event) ? event : null,
  };
}

export function workspaceCookieOptions(value: string) {
  return {
    name: WORKSPACE_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

export function clearWorkspaceCookieOptions() {
  return {
    name: WORKSPACE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge: 0,
  };
}

export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const store = await cookies();
  return decodeWorkspaceContext(store.get(WORKSPACE_COOKIE)?.value);
}

/**
 * Home del logo: respeta org/evento activos.
 * - Con org → hub de ejecuciones de esa org (sticky)
 * - Sin org → post-login clásico
 */
export async function getWorkspaceHomePath(input: {
  email: string;
  isMobile: boolean;
  isSuperAdmin?: boolean;
}): Promise<string> {
  const ctx = await getWorkspaceContext();
  if (ctx.organizationId) {
    return `/ejecuciones?org=${ctx.organizationId}`;
  }
  const { getPostLoginPath } = await import("@/lib/admin-data");
  return getPostLoginPath(input.email, {
    isMobile: input.isMobile,
    isSuperAdmin: input.isSuperAdmin,
  });
}
