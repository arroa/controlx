import { NextResponse } from "next/server";

import {
  canAccessEvent,
  createExecution,
  executionInputSchema,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import { isMongoConfigured } from "@/lib/mongodb";

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "MongoDB todavía no está configurado." },
      { status: 503 },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = executionInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos de la ejecución." },
      { status: 400 },
    );
  }

  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, parsed.data.eventId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  try {
    const execution = await createExecution(parsed.data, authResult.user.id);
    return NextResponse.json({ execution }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible crear la ejecución.",
      },
      { status: 500 },
    );
  }
}
