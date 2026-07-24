import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { canViewExecution } from "@/lib/execution-auth";
import {
  deleteExecution,
  getExecutionAccessContext,
  getExecutionDetail,
} from "@/lib/execution-runtime";
import { isMongoConfigured } from "@/lib/mongodb";

type RouteParams = {
  params: Promise<{ executionId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { executionId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const detail = await getExecutionDetail(executionId);
  if (!detail) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }

  const canView = await canViewExecution(authResult.user, detail.eventId);
  if (!canView) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  return NextResponse.json({ execution: detail });
}

/** Elimina un SIMULACRO (cascade runtime + blobs). No borra REAL. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { executionId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "MongoDB todavía no está configurado." },
      { status: 503 },
    );
  }

  const existing = await getExecutionAccessContext(executionId);
  if (!existing) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }

  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, existing.eventId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  try {
    const deleted = await deleteExecution(executionId);
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible eliminar la ejecución.",
      },
      { status: 400 },
    );
  }
}
