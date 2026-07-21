import { NextResponse } from "next/server";

import { ObjectId } from "mongodb";

import {
  canAccessEvent,
  canManageEventAdmins,
  deactivateEventActor,
  eventActorInputSchema,
  updateEventActor,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { getDatabase } from "@/lib/mongodb";

type RouteParams = {
  params: Promise<{ eventId: string; actorId: string }>;
};

async function authorizeConfig(eventId: string) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult;
  const canAccess =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  return canAccess
    ? authResult
    : {
        error: NextResponse.json({ error: "Sin acceso." }, { status: 403 }),
      };
}

async function getActorRoles(
  eventId: string,
  actorId: string,
): Promise<Array<"EVENT_ADMIN" | "EXECUTOR" | "APPROVER" | "STEERCO"> | null> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(actorId)) return null;
  const database = await getDatabase();
  const doc = await database.collection("eventMemberships").findOne(
    {
      _id: new ObjectId(actorId),
      eventId: new ObjectId(eventId),
      status: "ACTIVE",
    },
    { projection: { roles: 1, role: 1 } },
  );
  if (!doc) return null;
  if (Array.isArray(doc.roles) && doc.roles.length) {
    return doc.roles as Array<
      "EVENT_ADMIN" | "EXECUTOR" | "APPROVER" | "STEERCO"
    >;
  }
  if (doc.role === "EVENT_ADMIN") return ["EVENT_ADMIN"];
  return [];
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { eventId, actorId } = await params;
  const authResult = await authorizeConfig(eventId);
  if ("error" in authResult) return authResult.error;

  const parsed = eventActorInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  const existingRoles = await getActorRoles(eventId, actorId);
  if (!existingRoles) {
    return NextResponse.json({ error: "El actor no existe." }, { status: 404 });
  }

  const addingEventAdmin =
    parsed.data.roles.includes("EVENT_ADMIN") &&
    !existingRoles.includes("EVENT_ADMIN");
  const removingEventAdmin =
    !parsed.data.roles.includes("EVENT_ADMIN") &&
    existingRoles.includes("EVENT_ADMIN");
  if (addingEventAdmin || removingEventAdmin) {
    const canManage =
      authResult.user.isSuperAdmin ||
      (await canManageEventAdmins(authResult.user.email, eventId));
    if (!canManage) {
      return NextResponse.json(
        {
          error:
            "Solo OrgAdmin o SuperAdmin puede asignar o quitar EventAdmin.",
        },
        { status: 403 },
      );
    }
  }

  try {
    const actor = await updateEventActor(
      eventId,
      actorId,
      parsed.data,
      authResult.user.id,
    );
    return NextResponse.json({ actor });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const { eventId, actorId } = await params;
  const authResult = await authorizeConfig(eventId);
  if ("error" in authResult) return authResult.error;

  const existingRoles = await getActorRoles(eventId, actorId);
  if (!existingRoles) {
    return NextResponse.json({ error: "El actor no existe." }, { status: 404 });
  }

  if (existingRoles.includes("EVENT_ADMIN")) {
    const canManage =
      authResult.user.isSuperAdmin ||
      (await canManageEventAdmins(authResult.user.email, eventId));
    if (!canManage) {
      return NextResponse.json(
        {
          error:
            "Solo OrgAdmin o SuperAdmin puede quitar un actor con EventAdmin.",
        },
        { status: 403 },
      );
    }
  }

  try {
    await deactivateEventActor(eventId, actorId, authResult.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
