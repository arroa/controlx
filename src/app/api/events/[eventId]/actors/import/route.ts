import { NextResponse } from "next/server";

import {
  canAccessEvent,
  canManageEventAdmins,
  importEventActors,
} from "@/lib/admin-data";
import { parseActorsWorkbook } from "@/lib/actor-excel";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

const MAX_BYTES = 2 * 1024 * 1024;

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
      { error: "El archivo supera 2 MB." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed: Awaited<ReturnType<typeof parseActorsWorkbook>>;
  try {
    parsed = await parseActorsWorkbook(buffer);
  } catch {
    return NextResponse.json(
      { error: "No pude leer el Excel. Usá el formato de Descargar." },
      { status: 400 },
    );
  }

  if (!parsed.rows.length && parsed.errors.length) {
    return NextResponse.json(
      {
        error: parsed.errors[0]?.message ?? "El archivo no tiene filas válidas.",
        errors: parsed.errors,
        created: 0,
        updated: 0,
        skipped: parsed.errors.length,
      },
      { status: 400 },
    );
  }

  const canManage =
    authResult.user.isSuperAdmin ||
    (await canManageEventAdmins(authResult.user.email, eventId));

  const result = await importEventActors(
    eventId,
    parsed.rows,
    authResult.user.id,
    { canManageEventAdmins: canManage },
  );

  return NextResponse.json({
    ...result,
    errors: [
      ...parsed.errors.map((item) => ({
        email: item.email,
        message: `Fila ${item.row}: ${item.message}`,
      })),
      ...result.errors,
    ],
    skipped: result.skipped + parsed.errors.length,
  });
}
