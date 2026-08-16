import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { validateDesignBulkFile } from "@/lib/design-bulk";
import {
  designValidationFileName,
  stampValidationsSheet,
} from "@/lib/design-excel";

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
  let report: Awaited<ReturnType<typeof validateDesignBulkFile>>;
  try {
    report = await validateDesignBulkFile(eventId, buffer);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pude leer el Excel. Usá la plantilla de Carga masiva.",
      },
      { status: 400 },
    );
  }

  const stamped = await stampValidationsSheet(buffer, {
    eventName: report.eventName,
    rowCount: report.rowCount,
    errors: report.errors,
    warnings: report.warnings,
  });
  const filename = designValidationFileName(report.eventName);

  return NextResponse.json({
    ok: report.ok,
    rowCount: report.rowCount,
    errorCount: report.errors.length,
    warningCount: report.warnings.length,
    errors: report.errors,
    warnings: report.warnings,
    filename,
    fileBase64: stamped.toString("base64"),
  });
}
