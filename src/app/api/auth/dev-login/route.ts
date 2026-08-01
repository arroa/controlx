import { NextResponse } from "next/server";
import { z } from "zod";

import { isDevBypassEnabled } from "@/lib/dev-flags";
import {
  createDevSessionToken,
  devSessionCookieOptions,
} from "@/lib/dev-session";
import { getPostLoginPath, hasAssignedAccess } from "@/lib/admin-data";
import { getSuperAdminEmail } from "@/lib/current-user";
import { isMobileUserAgent } from "@/lib/request-device";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  if (!isDevBypassEnabled()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const isAuthorized =
    email === getSuperAdminEmail() || (await hasAssignedAccess(email));
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Este correo no tiene acceso a la beta." },
      { status: 403 },
    );
  }

  const userId = `dev:${email}`;
  const token = await createDevSessionToken(userId);
  const isMobile = isMobileUserAgent(
    request.headers.get("user-agent"),
    request.headers.get("sec-ch-ua-mobile"),
  );
  const destination = await getPostLoginPath(email, {
    isMobile,
    isSuperAdmin: email === getSuperAdminEmail(),
  });
  const response = NextResponse.json({ ok: true, userId, destination });
  const cookie = devSessionCookieOptions(token);
  response.cookies.set(cookie.name, cookie.value, cookie);

  return response;
}
