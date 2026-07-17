import "server-only";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "No autorizado." }, { status: 401 }),
    } as const;
  }
  return { user } as const;
}

export async function requireSuperAdmin() {
  const result = await requireUser();
  if ("error" in result || !result.user.isSuperAdmin) {
    return {
      error: NextResponse.json(
        { error: "No autorizado." },
        { status: 401 },
      ),
    } as const;
  }

  return result;
}
