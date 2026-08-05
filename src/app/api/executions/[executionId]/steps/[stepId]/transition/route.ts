import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { getEffectiveEventActor } from "@/lib/dev-impersonation";
import { canOperateExecutionStep, canViewExecution } from "@/lib/execution-auth";
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

  const canView = await canViewExecution(authResult.user, existing.eventId);
  if (!canView) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const step = existing.steps.find((item) => item.id === stepId);
  if (!step) {
    return NextResponse.json({ error: "Paso no encontrado." }, { status: 404 });
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

  const allowed = await canOperateExecutionStep({
    user: authResult.user,
    eventId: existing.eventId,
    step,
    action: parsed.data.action,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "No puedes operar este paso con tu rol." },
      { status: 403 },
    );
  }

  const { actor, impersonating } = await getEffectiveEventActor(
    existing.eventId,
    authResult.user,
  );
  const isAdmin =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, existing.eventId));
  const contingencyAdmin = isAdmin && !impersonating;

  let onBehalfOfLabel: string | undefined;
  if (contingencyAdmin && parsed.data.action !== "force_success") {
    if (
      parsed.data.action === "approve" ||
      parsed.data.action === "reject"
    ) {
      const isAssignedApprover = Boolean(
        actor && step.approverActorIds.includes(actor.id),
      );
      if (!isAssignedApprover) {
        onBehalfOfLabel = step.executorName ?? "aprobador asignado";
      }
    } else {
      const isAssignedExecutor = Boolean(
        actor && step.executorActorId === actor.id,
      );
      if (!isAssignedExecutor) {
        onBehalfOfLabel = step.executorName ?? "ejecutor asignado";
      }
    }
  }

  try {
    const next = await transitionRuntimeStep({
      executionId,
      stepId,
      action: parsed.data.action,
      comment: parsed.data.comment,
      occurredAt: parsed.data.occurredAt,
      evidencePathnames: parsed.data.evidencePathnames,
      actorId: authResult.user.id,
      actorLabel: authResult.user.email,
      onBehalfOfLabel,
    });
    return NextResponse.json({ step: next.step, steps: next.steps });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 400 },
    );
  }
}
