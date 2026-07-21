import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { recomputeEventReadiness } from "@/lib/event-readiness";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

export async function POST(_request: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  try {
    const readiness = await recomputeEventReadiness(eventId);
    if (!readiness) {
      return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    }
    return NextResponse.json({ readiness });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
