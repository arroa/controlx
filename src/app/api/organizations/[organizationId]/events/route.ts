import { NextResponse } from "next/server";

import {
  canAccessOrganization,
  createEvent,
  eventInputSchema,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { organizationId } = await params;
  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessOrganization(authResult.user.email, organizationId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = eventInputSchema.safeParse({ ...payload, organizationId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos del evento." },
      { status: 400 },
    );
  }

  try {
    const event = await createEvent(parsed.data, authResult.user.id);
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
