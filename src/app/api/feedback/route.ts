import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-auth";
import {
  canAccessFeedback,
  createFeedback,
  feedbackInputSchema,
  listFeedback,
} from "@/lib/feedback";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  if (!(await canAccessFeedback(authResult.user))) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const items = await listFeedback();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  if (!(await canAccessFeedback(authResult.user))) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const parsed = feedbackInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa el comentario y el estado." },
      { status: 400 },
    );
  }

  try {
    const item = await createFeedback(parsed.data, {
      id: authResult.user.id,
      email: authResult.user.email,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No fue posible guardar.",
      },
      { status: 500 },
    );
  }
}
