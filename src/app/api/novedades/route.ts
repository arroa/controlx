import { NextResponse } from "next/server";

import { requireSuperAdmin, requireUser } from "@/lib/api-auth";
import {
  createNovedad,
  listNovedades,
  novedadInputSchema,
} from "@/lib/novedades";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const items = await listNovedades();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const authResult = await requireSuperAdmin();
  if ("error" in authResult) return authResult.error;

  const parsed = novedadInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  try {
    const item = await createNovedad(parsed.data, authResult.user.id);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
