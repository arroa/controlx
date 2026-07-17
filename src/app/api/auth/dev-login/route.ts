import { NextResponse } from "next/server";
import { z } from "zod";

import { isDevBypassEnabled } from "@/lib/dev-flags";
import {
  createDevSessionToken,
  devSessionCookieOptions,
} from "@/lib/dev-session";
import { getFirstAssignedPath, hasAssignedAccess } from "@/lib/admin-data";
import { getSuperAdminEmail } from "@/lib/current-user";

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
  const destination =
    email === getSuperAdminEmail()
      ? "/dashboard"
      : await getFirstAssignedPath(email);
  const response = NextResponse.json({ ok: true, userId, destination });
  const cookie = devSessionCookieOptions(token);
  response.cookies.set(cookie.name, cookie.value, cookie);

  return response;
}
