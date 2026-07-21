import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { getExecutionDetail } from "@/lib/execution-runtime";

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

  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, detail.eventId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  return NextResponse.json({ execution: detail });
}
