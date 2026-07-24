import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { purgeEventSimulacros } from "@/lib/execution-runtime";
import { isMongoConfigured } from "@/lib/mongodb";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

/** Purge de todos los SIMULACRO del evento. No toca REAL. */
export async function POST(_request: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "MongoDB todavía no está configurado." },
      { status: 503 },
    );
  }

  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  try {
    const result = await purgeEventSimulacros(eventId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible purgar los simulacros.",
      },
      { status: 400 },
    );
  }
}
