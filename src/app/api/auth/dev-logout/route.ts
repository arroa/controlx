import { NextResponse } from "next/server";

import { clearDevSessionCookieOptions } from "@/lib/dev-session-token";
import { clearWorkspaceCookieOptions } from "@/lib/workspace-context";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const session = clearDevSessionCookieOptions();
  response.cookies.set(session.name, session.value, session);
  const workspace = clearWorkspaceCookieOptions();
  response.cookies.set(workspace.name, workspace.value, workspace);
  return response;
}
