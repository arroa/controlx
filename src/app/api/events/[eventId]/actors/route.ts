import { NextResponse } from "next/server";

import {
  canAccessEvent,
  canManageEventAdmins,
  eventActorInputSchema,
  listEventActors,
  upsertEventActor,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

export async function GET(_: Request, { params }: RouteParams) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { eventId } = await params;
  const canAccess =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  if (!canAccess) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const actors = await listEventActors(eventId);
  return NextResponse.json({ actors });
}

export async function POST(request: Request, { params }: RouteParams) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { eventId } = await params;
  const canAccess =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  if (!canAccess) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const parsed = eventActorInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  if (parsed.data.roles.includes("EVENT_ADMIN")) {
    const canManage =
      authResult.user.isSuperAdmin ||
      (await canManageEventAdmins(authResult.user.email, eventId));
    if (!canManage) {
      return NextResponse.json(
        { error: "Solo OrgAdmin o SuperAdmin puede asignar EventAdmin." },
        { status: 403 },
      );
    }
  }

  try {
    const actor = await upsertEventActor(
      eventId,
      parsed.data,
      authResult.user.id,
    );
    return NextResponse.json({ actor }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
