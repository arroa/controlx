import { NextResponse } from "next/server";

import {
  deleteOrganization,
  getOrganizationDetail,
  organizationUpdateSchema,
  updateOrganization,
} from "@/lib/admin-data";
import { requireSuperAdmin } from "@/lib/api-auth";
import { isMongoConfigured } from "@/lib/mongodb";

type RouteParams = {
  params: Promise<{ organizationId: string }>;
};

export async function GET(_: Request, { params }: RouteParams) {
  const authResult = await requireSuperAdmin();
  if ("error" in authResult) return authResult.error;

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "MongoDB todavía no está configurado." },
      { status: 503 },
    );
  }

  const { organizationId } = await params;
  const detail = await getOrganizationDetail(organizationId);
  if (!detail) {
    return NextResponse.json(
      { error: "Organización no encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const authResult = await requireSuperAdmin();
  if ("error" in authResult) return authResult.error;

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "MongoDB todavía no está configurado." },
      { status: 503 },
    );
  }

  const { organizationId } = await params;
  const parsed = organizationUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos de la organización." },
      { status: 400 },
    );
  }

  try {
    const organization = await updateOrganization(organizationId, parsed.data);
    return NextResponse.json({ organization });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar la organización.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const authResult = await requireSuperAdmin();
  if ("error" in authResult) return authResult.error;

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "MongoDB todavía no está configurado." },
      { status: 503 },
    );
  }

  const { organizationId } = await params;

  try {
    await deleteOrganization(organizationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible eliminar la organización.",
      },
      { status: 409 },
    );
  }
}
