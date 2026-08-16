import { NextResponse } from "next/server";

import {
  canAccessEvent,
  canManageEventAdmins,
  deactivateAllEventActors,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

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

  const body = (await request.json().catch(() => null)) as {
    confirm?: string;
  } | null;
  if (body?.confirm !== "LIMPIAR") {
    return NextResponse.json(
      { error: "Escribí LIMPIAR para confirmar." },
      { status: 400 },
    );
  }

  const includeEventAdmins =
    authResult.user.isSuperAdmin ||
    (await canManageEventAdmins(authResult.user.email, eventId));

  const result = await deactivateAllEventActors(
    eventId,
    authResult.user.id,
    { includeEventAdmins, operatorEmail: authResult.user.email },
  );
  return NextResponse.json(result);
}
