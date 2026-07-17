import { NextResponse } from "next/server";

import {
  activityUpdateSchema,
  canAccessEvent,
  deleteActivity,
  moveActivity,
  moveDirectionSchema,
  updateActivity,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string; activityId: string }>;
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
  const { eventId, activityId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  const json = await request.json().catch(() => null);
  const moveParsed = moveDirectionSchema.safeParse(json);
  if (moveParsed.success) {
    try {
      const activities = await moveActivity(
        eventId,
        activityId,
        moveParsed.data.direction,
      );
      return NextResponse.json({ activities });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No fue posible." },
        { status: 500 },
      );
    }
  }

  const parsed = activityUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos de la actividad." },
      { status: 400 },
    );
  }

  try {
    const activity = await updateActivity(eventId, activityId, parsed.data);
    return NextResponse.json({ activity });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const { eventId, activityId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  try {
    await deleteActivity(eventId, activityId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
