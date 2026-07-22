import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { listEventActors } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import {
  canUseDevActorImpersonation,
  DEV_ACTOR_COOKIE,
  encodeActAsCookie,
  isDevActorImpersonationEnabled,
} from "@/lib/dev-impersonation";

const bodySchema = z.object({
  eventId: z.string().min(1),
  actorId: z.string().min(1).nullable(),
});

export async function POST(request: Request) {
  if (!isDevActorImpersonationEnabled()) {
    return NextResponse.json(
      { error: "Impersonación mock deshabilitada." },
      { status: 403 },
    );
  }

  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  if (!canUseDevActorImpersonation(authResult.user)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const jar = await cookies();

  if (!parsed.data.actorId) {
    jar.delete(DEV_ACTOR_COOKIE);
    return NextResponse.json({ ok: true, actorId: null });
  }

  const actors = await listEventActors(parsed.data.eventId);
  const actor = actors.find((item) => item.id === parsed.data.actorId);
  if (!actor) {
    return NextResponse.json(
      { error: "Actor no está en el mapa de este evento." },
      { status: 404 },
    );
  }

  jar.set(
    DEV_ACTOR_COOKIE,
    encodeActAsCookie(parsed.data.eventId, actor.id),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    },
  );

  return NextResponse.json({ ok: true, actorId: actor.id, name: actor.name });
}
