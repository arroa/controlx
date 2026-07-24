import { NextResponse } from "next/server";

import {
  canAccessEvent,
  getEventDesign,
  listEventActors,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { pairsToRoleSteps } from "@/lib/role-steps";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

/** Snapshot fresco de actores + pasos con asignaciones (para Roles). */
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

  const [design, actors] = await Promise.all([
    getEventDesign(eventId),
    listEventActors(eventId),
  ]);
  if (!design) {
    return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    actors,
    steps: pairsToRoleSteps(design.pairs),
  });
}
