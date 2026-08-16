import { NextResponse } from "next/server";

import { canAccessEvent, listEventActors } from "@/lib/admin-data";
import { actorExcelFileName, buildActorsWorkbook } from "@/lib/actor-excel";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { eventId } = await params;
  const canAccess =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  if (!canAccess) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const eventName =
    new URL(request.url).searchParams.get("name")?.trim() || "evento";
  const actors = await listEventActors(eventId);
  const buffer = await buildActorsWorkbook(eventName, actors);
  const filename = actorExcelFileName(eventName);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
