import { NextResponse } from "next/server";

import {
  assignStepApproversSchema,
  assignStepsApprover,
  canAccessEvent,
  unassignStepApproversSchema,
  unassignStepsApprover,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

async function authorize(eventId: string) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult;
  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  return canManage
    ? authResult
    : {
        error: NextResponse.json({ error: "Sin acceso." }, { status: 403 }),
      };
}

export async function POST(request: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  const parsed = assignStepApproversSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  try {
    const steps = await assignStepsApprover(eventId, parsed.data);
    return NextResponse.json({ steps });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  const parsed = unassignStepApproversSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  try {
    const steps = await unassignStepsApprover(eventId, parsed.data);
    return NextResponse.json({ steps });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
