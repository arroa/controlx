import { NextResponse } from "next/server";

import {
  canAccessEvent,
  setStepRolesAssignments,
  setStepRolesSchema,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { refreshOpenExecutionsFromDesign } from "@/lib/execution-runtime";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const parsed = setStepRolesSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  try {
    const steps = await setStepRolesAssignments(eventId, parsed.data);
    await refreshOpenExecutionsFromDesign(eventId);
    return NextResponse.json({ steps });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 400 },
    );
  }
}
