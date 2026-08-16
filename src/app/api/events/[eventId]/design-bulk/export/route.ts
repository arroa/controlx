import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import {
  buildDesignPhotoRows,
  getDesignExcelCatalog,
} from "@/lib/design-bulk";
import {
  buildDesignPhotoWorkbook,
  designPhotoFileName,
} from "@/lib/design-excel";

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

  const [catalog, rows] = await Promise.all([
    getDesignExcelCatalog(eventId),
    buildDesignPhotoRows(eventId),
  ]);
  if (!catalog || !rows) {
    return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
  }

  const eventName =
    new URL(request.url).searchParams.get("name")?.trim() || catalog.eventName;
  const buffer = await buildDesignPhotoWorkbook(eventName, catalog, rows);
  const filename = designPhotoFileName(eventName);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
