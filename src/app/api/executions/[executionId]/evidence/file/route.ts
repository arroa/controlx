import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-auth";
import {
  getEvidenceBlob,
  isEvidencePathForExecution,
} from "@/lib/evidence-blob";
import { canViewExecution } from "@/lib/execution-auth";
import { getExecutionDetail } from "@/lib/execution-runtime";

type RouteParams = {
  params: Promise<{ executionId: string }>;
};

/** Sirve un blob privado solo si el usuario puede ver la ejecución. */
export async function GET(request: Request, { params }: RouteParams) {
  const { executionId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const pathname = new URL(request.url).searchParams.get("pathname")?.trim();
  if (!pathname || !isEvidencePathForExecution(executionId, pathname)) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }

  const existing = await getExecutionDetail(executionId);
  if (!existing) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }

  const canView = await canViewExecution(authResult.user, existing.eventId);
  if (!canView) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const belongsToExecution = existing.steps.some((step) =>
    step.evidence.some((item) => item.pathname === pathname),
  );
  if (!belongsToExecution) {
    return NextResponse.json({ error: "Evidencia no encontrada." }, { status: 404 });
  }

  try {
    const result = await getEvidenceBlob(pathname);
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Content-Disposition": result.blob.contentDisposition,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("[evidence/file]", error);
    return NextResponse.json(
      { error: "No fue posible leer el archivo." },
      { status: 500 },
    );
  }
}
