import { NextResponse } from "next/server";

import {
  addOrganizationAdmin,
  adminInputSchema,
  canAccessOrganization,
} from "@/lib/admin-data";
import { requireUser } from "@/lib/api-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { organizationId } = await params;
  const canManage =
    authResult.user.isSuperAdmin ||
    (await canAccessOrganization(authResult.user.email, organizationId));
  if (!canManage) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }

  const parsed = adminInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Correo inválido." }, { status: 400 });
  }

  try {
    const admin = await addOrganizationAdmin(
      organizationId,
      parsed.data.email,
      authResult.user.id,
    );
    return NextResponse.json({ admin }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible." },
      { status: 500 },
    );
  }
}
