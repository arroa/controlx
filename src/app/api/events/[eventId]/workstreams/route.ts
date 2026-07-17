import { NextResponse } from "next/server";

import {
  canAccessEvent,
  createWorkstream,
  workstreamInputSchema,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { eventId } = await params;
  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

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
    const workstream = await createWorkstream(
      eventId,
      parsed.data,
      authResult.user.id,
    );
    return NextResponse.json({ workstream }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
