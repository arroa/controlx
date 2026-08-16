import { NextResponse } from "next/server";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { clearEventDesignNuclear } from "@/lib/design-bulk";
import { peekEventReadinessSnapshot } from "@/lib/event-readiness";

type RouteParams = {
  params: Promise<{ eventId: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { eventId } = await params;
  const canAccess =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, eventId));
  if (!canAccess) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    confirm?: string;
  } | null;

  try {
    const result = await clearEventDesignNuclear({
      eventId,
      confirm: body?.confirm ?? "",
    });
    const readiness = await peekEventReadinessSnapshot(eventId);
    return NextResponse.json({ ...result, readiness });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No fue posible limpiar.",
      },
      { status: 400 },
    );
  }
}
