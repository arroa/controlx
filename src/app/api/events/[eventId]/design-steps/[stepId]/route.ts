import { NextResponse } from "next/server";

import {
  canAccessEvent,
  deleteDesignStep,
  designStepUpdateSchema,
  moveDesignStep,
  moveDirectionSchema,
  stepPlanningInputSchema,
  updateDesignStep,
  updateStepPlanning,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

type RouteParams = {
  params: Promise<{ eventId: string; stepId: string }>;
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
  const { eventId, stepId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  const json = await request.json().catch(() => null);

  const moveParsed = moveDirectionSchema.safeParse(json);
  if (moveParsed.success) {
    try {
      const steps = await moveDesignStep(
        eventId,
        stepId,
        moveParsed.data.direction,
      );
      return NextResponse.json({ steps });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No fue posible." },
        { status: 500 },
      );
    }
  }

  const planningParsed = stepPlanningInputSchema.safeParse(json);
  if (planningParsed.success) {
    try {
      const step = await updateStepPlanning(
        eventId,
        stepId,
        planningParsed.data,
      );
      return NextResponse.json({ step });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No fue posible." },
        { status: 500 },
      );
    }
  }

  const updateParsed = designStepUpdateSchema.safeParse(json);
  if (!updateParsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos del paso." },
      { status: 400 },
    );
  }

  try {
    const step = await updateDesignStep(eventId, stepId, updateParsed.data);
    return NextResponse.json({ step });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const { eventId, stepId } = await params;
  const authResult = await authorize(eventId);
  if ("error" in authResult) return authResult.error;

  try {
    const result = await deleteDesignStep(eventId, stepId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
