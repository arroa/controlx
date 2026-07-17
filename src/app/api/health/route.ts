import { NextResponse } from "next/server";
import { getDatabase, isMongoConfigured } from "@/lib/mongodb";

export async function GET() {
  if (!isMongoConfigured()) {
    return NextResponse.json(
      {
        status: "degraded",
        services: { application: "ok", mongodb: "not_configured" },
      },
      { status: 503 },
    );
  }

  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });

    return NextResponse.json({
      status: "ok",
      services: { application: "ok", mongodb: "ok" },
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        services: { application: "ok", mongodb: "unavailable" },
      },
      { status: 503 },
    );
  }
}
