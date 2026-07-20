import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-auth";
import {
  canAccessFeedback,
  deleteFeedback,
  feedbackUpdateSchema,
  updateFeedback,
} from "@/lib/feedback";

type RouteParams = {
  params: Promise<{ feedbackId: string }>;
};

async function authorize() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult;
  if (!(await canAccessFeedback(authResult.user))) {
    return {
      error: NextResponse.json({ error: "Sin acceso." }, { status: 403 }),
    } as const;
  }
  return authResult;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const authResult = await authorize();
  if ("error" in authResult) return authResult.error;

  const { feedbackId } = await params;
  const parsed = feedbackUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa el comentario y el estado." },
      { status: 400 },
    );
  }

  try {
    const item = await updateFeedback(feedbackId, parsed.data);
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No fue posible actualizar.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const authResult = await authorize();
  if ("error" in authResult) return authResult.error;

  const { feedbackId } = await params;
  try {
    await deleteFeedback(feedbackId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No fue posible eliminar.",
      },
      { status: 500 },
    );
  }
}
