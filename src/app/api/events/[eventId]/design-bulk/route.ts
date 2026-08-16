import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { getDesignBulkStatus } from "@/lib/design-bulk";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { eventId } = await params;
  const canAccess =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  if (!canAccess) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const status = await getDesignBulkStatus(eventId);
  if (!status) {
    return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
  }
  return NextResponse.json(status);
}
