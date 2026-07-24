import { NextResponse } from "next/server";

import {
  canAccessEvent,
  deleteEvent,
  eventUpdateSchema,
  getEventDetail,
  updateEvent,
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

export async function GET(_: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  const detail = await getEventDetail(eventId);
  if (!detail) {
    return NextResponse.json(
      { error: "Evento no encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  const parsed = eventUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos del evento." },
      { status: 400 },
    );
  }

  try {
    const event = await updateEvent(eventId, parsed.data);
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  try {
    await deleteEvent(eventId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible eliminar el evento.",
      },
      { status: 409 },
    );
  }
}
