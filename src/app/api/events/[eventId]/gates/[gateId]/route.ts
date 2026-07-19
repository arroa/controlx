import { NextResponse } from "next/server";

import {
  canAccessEvent,
  deleteGate,
  gateInputSchema,
  updateGate,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string; gateId: string }>;
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

export async function PATCH(request: Request, { params }: RouteParams) {
  const { eventId, gateId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  const parsed = gateInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos del gate." },
      { status: 400 },
    );
  }

  try {
    const gate = await updateGate(eventId, gateId, parsed.data);
    return NextResponse.json({ gate });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const { eventId, gateId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  try {
    await deleteGate(eventId, gateId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
