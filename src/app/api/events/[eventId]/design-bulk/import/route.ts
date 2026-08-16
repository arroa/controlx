import { NextResponse } from "next/server";

import { canAccessEvent, getEventDesign, listEventActors } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { importDesignBulk, validateDesignBulkRows } from "@/lib/design-bulk";
import { parseDesignWorkbook } from "@/lib/design-excel";
import { peekEventReadinessSnapshot } from "@/lib/event-readiness";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

const MAX_BYTES = 4 * 1024 * 1024;

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

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Adjuntá un archivo .xlsx." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo supera 4 MB." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed: Awaited<ReturnType<typeof parseDesignWorkbook>>;
  try {
    parsed = await parseDesignWorkbook(buffer);
  } catch {
    return NextResponse.json(
      { error: "No pude leer el Excel. Usá la plantilla de Carga masiva." },
      { status: 400 },
    );
  }

  const [design, actors] = await Promise.all([
    getEventDesign(eventId),
    listEventActors(eventId),
  ]);
  if (!design) {
    return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
  }

  const validated = validateDesignBulkRows({
    rows: parsed.rows,
    parseErrors: parsed.errors.map((item) => ({
      row: item.row,
      message: item.message,
      level: "error",
    })),
    workstreams: design.workstreams,
    blocks: design.blocks,
    actors,
  });

  if (validated.errors.length || !validated.resolved.length) {
    return NextResponse.json(
      {
        error:
          validated.errors[0]?.message ?? "El archivo no tiene filas válidas.",
        errors: validated.errors,
        warnings: validated.warnings,
      },
      { status: 400 },
    );
  }

  try {
    const result = await importDesignBulk({
      eventId,
      actorId: authResult.user.id,
      resolved: validated.resolved,
    });
    const readiness = await peekEventReadinessSnapshot(eventId);
    return NextResponse.json({
      ...result,
      warnings: validated.warnings,
      errors: [],
      readiness,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No fue posible cargar.",
        errors: [],
        warnings: validated.warnings,
      },
      { status: 400 },
    );
  }
}
