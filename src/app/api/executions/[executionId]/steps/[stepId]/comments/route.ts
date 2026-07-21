import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessEvent } from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";
import {
  addStepComment,
  getExecutionDetail,
} from "@/lib/execution-runtime";

type RouteParams = {
  params: Promise<{ executionId: string; stepId: string }>;
};

const bodySchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request, { params }: RouteParams) {
  const { executionId, stepId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const existing = await getExecutionDetail(executionId);
  if (!existing) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }

  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessEvent(authResult.user.email, existing.eventId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Comentario inválido." }, { status: 400 });
  }

  try {
    const step = await addStepComment({
      executionId,
      stepId,
      text: parsed.data.text,
      actorId: authResult.user.id,
      actorLabel: authResult.user.email,
    });
    return NextResponse.json({ step });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 400 },
    );
  }
}
