import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/api-auth";
import {
  deleteNovedad,
  novedadUpdateSchema,
  updateNovedad,
} from "@/lib/novedades";

type RouteParams = {
  params: Promise<{ novedadId: string }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  const authResult = await requireSuperAdmin();
  if ("error" in authResult) return authResult.error;

  const { novedadId } = await params;
  const parsed = novedadUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  try {
    const item = await updateNovedad(novedadId, parsed.data);
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const authResult = await requireSuperAdmin();
  if ("error" in authResult) return authResult.error;

  const { novedadId } = await params;
  try {
    await deleteNovedad(novedadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
