import { NextResponse } from "next/server";

import {
  createOrganization,
  organizationInputSchema,
} from "@/lib/admin-data";
import { requireSuperAdmin } from "@/lib/api-auth";
import { isMongoConfigured } from "@/lib/mongodb";

export async function POST(request: Request) {
  const authResult = await requireSuperAdmin();
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
  const parsed = organizationInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa el nombre y la descripción." },
      { status: 400 },
    );
  }

  try {
    const organization = await createOrganization(
      parsed.data,
      authResult.user.id,
    );
    return NextResponse.json({ organization }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "No fue posible crear la organización." },
      { status: 500 },
    );
  }
}
