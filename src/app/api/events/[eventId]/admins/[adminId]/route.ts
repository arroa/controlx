import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";

import {
  adminInputSchema,
  canAccessEvent,
  deactivateEventAdmin,
  updateEventAdmin,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string; adminId: string }>;
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
  const { eventId, adminId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  const parsed = adminInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Correo inválido." }, { status: 400 });
  }

  try {
    const admin = await updateEventAdmin(
      eventId,
      adminId,
      parsed.data.email,
      authResult.user.id,
    );
    return NextResponse.json({ admin });
  } catch (error) {
    const duplicate = error instanceof MongoServerError && error.code === 11000;
    return NextResponse.json(
      {
        error: duplicate
          ? "Ese correo ya es EventAdmin."
          : error instanceof Error
            ? error.message
            : "No fue posible actualizar.",
      },
      { status: duplicate ? 409 : 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const { eventId, adminId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  try {
    await deactivateEventAdmin(eventId, adminId, authResult.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
