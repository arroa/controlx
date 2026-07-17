import { NextResponse } from "next/server";

import {
  canAccessEvent,
  deleteWorkstream,
  updateWorkstream,
  workstreamInputSchema,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string; workstreamId: string }>;
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
  const { eventId, workstreamId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  const parsed = workstreamInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos del workstream." },
      { status: 400 },
    );
  }

  try {
    const workstream = await updateWorkstream(
      eventId,
      workstreamId,
      parsed.data,
    );
    return NextResponse.json({ workstream });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const { eventId, workstreamId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  try {
    await deleteWorkstream(eventId, workstreamId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
