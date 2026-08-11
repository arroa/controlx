import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { getEffectiveEventActor } from "@/lib/dev-impersonation";
import { canViewExecution } from "@/lib/execution-auth";
import {
  approveExecutionGate,
  approveExecutionGateSchema,
  getExecutionDetail,
} from "@/lib/execution-runtime";
import type { ApprovalRole } from "@/domain/controlx";

type RouteParams = {
  params: Promise<{ executionId: string; gateId: string }>;
};

function canApproveGateRole(input: {
  role: ApprovalRole;
  actorRoles: ApprovalRole[] | string[];
  canApproveAny: boolean;
}) {
  if (input.canApproveAny) return true;
  return input.actorRoles.includes(input.role);
}

export async function POST(request: Request, { params }: RouteParams) {
  const { executionId, gateId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const existing = await getExecutionDetail(executionId, { syncPlan: false });
  if (!existing) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }

  const canView = await canViewExecution(authResult.user, existing.eventId);
  if (!canView) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const parsed = approveExecutionGateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  const { actor, impersonating } = await getEffectiveEventActor(
    existing.eventId,
    authResult.user,
  );
  const isAdmin =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, existing.eventId));
  const canApproveAny =
    (isAdmin && !impersonating) ||
    Boolean(actor?.roles.includes("STEERCO")) ||
    Boolean(actor?.roles.includes("EVENT_ADMIN"));

  if (
    !canApproveGateRole({
      role: parsed.data.role,
      actorRoles: actor?.roles ?? [],
      canApproveAny,
    })
  ) {
    return NextResponse.json(
      { error: "No puedes aprobar este gate con tu rol." },
      { status: 403 },
    );
  }

  try {
    const execution = await approveExecutionGate({
      executionId,
      gateId,
      role: parsed.data.role,
      actorId: actor?.id ?? authResult.user.id,
      actorLabel: actor?.name ?? authResult.user.email,
    });
    return NextResponse.json({ execution });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No fue posible aprobar.",
      },
      { status: 400 },
    );
  }
}
