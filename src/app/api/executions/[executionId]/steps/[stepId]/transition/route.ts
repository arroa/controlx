import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import {
  getExecutionDetail,
  stepTransitionSchema,
  transitionRuntimeStep,
} from "@/lib/execution-runtime";

type RouteParams = {
  params: Promise<{ executionId: string; stepId: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { executionId, stepId } = await params;
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

  const parsed = stepTransitionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  try {
    const step = await transitionRuntimeStep({
      executionId,
      stepId,
      action: parsed.data.action,
      comment: parsed.data.comment,
      actorId: authResult.user.id,
      actorLabel: authResult.user.email,
    });
    return NextResponse.json({ step });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 400 },
    );
  }
}
