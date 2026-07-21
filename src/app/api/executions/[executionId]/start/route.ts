import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import {
  getExecutionDetail,
  startExecution,
} from "@/lib/execution-runtime";

type RouteParams = {
  params: Promise<{ executionId: string }>;
};

export async function POST(_request: Request, { params }: RouteParams) {
  const { executionId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const existing = await getExecutionDetail(executionId);
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
    const execution = await startExecution(executionId, authResult.user.id);
    return NextResponse.json({ execution });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 400 },
    );
  }
}
