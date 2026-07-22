import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-auth";
import { canAttachStepEvidence, canViewExecution } from "@/lib/execution-auth";
import {
  addStepEvidence,
  getExecutionDetail,
} from "@/lib/execution-runtime";

type RouteParams = {
  params: Promise<{ executionId: string; stepId: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { executionId, stepId } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const existing = await getExecutionDetail(executionId);
  if (!existing) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }

  const canView = await canViewExecution(authResult.user, existing.eventId);
  if (!canView) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const step = existing.steps.find((item) => item.id === stepId);
  if (!step) {
    return NextResponse.json({ error: "Paso no encontrado." }, { status: 404 });
  }

  const canAttach = await canAttachStepEvidence({
    user: authResult.user,
    eventId: existing.eventId,
    step,
  });
  if (!canAttach) {
    return NextResponse.json(
      { error: "No puedes adjuntar evidencia a este paso." },
      { status: 403 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido." }, { status: 400 });
  }
  const captionRaw = form?.get("caption");
  const caption =
    typeof captionRaw === "string" ? captionRaw : undefined;

  try {
    const next = await addStepEvidence({
      executionId,
      stepId,
      file,
      caption,
      actorId: authResult.user.id,
      actorLabel: authResult.user.email,
    });
    return NextResponse.json({ step: next });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 400 },
    );
  }
}
