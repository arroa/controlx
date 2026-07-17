import { NextResponse } from "next/server";

import { clearDevSessionCookieOptions } from "@/lib/dev-session-token";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookie = clearDevSessionCookieOptions();
  response.cookies.set(cookie.name, cookie.value, cookie);
  return response;
}
