import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { getDesignExcelCatalog } from "@/lib/design-bulk";
import {
  buildDesignTemplateWorkbook,
  designTemplateFileName,
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

  const catalog = await getDesignExcelCatalog(eventId);
  if (!catalog) {
    return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
  }

  const eventName =
    new URL(request.url).searchParams.get("name")?.trim() || catalog.eventName;
  const buffer = await buildDesignTemplateWorkbook(eventName, catalog);
  const filename = designTemplateFileName(eventName);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
