import "server-only";

import { ObjectId } from "mongodb";

import type { EventReadiness } from "@/lib/event-readiness-types";
import { getDatabase } from "@/lib/mongodb";

export type StoredEventReadiness = {
  stale: boolean;
  computedAt: Date | null;
  canStart: boolean;
  blockers: string[];
  summary: EventReadiness["summary"];
  setup: EventReadiness["setup"];
  design: EventReadiness["design"];
  roles: EventReadiness["roles"];
  plan: EventReadiness["plan"];
  aiAnalysis?: EventReadiness["aiAnalysis"];
};

/** Marca readiness como sucio tras un cambio de preparación. */
export async function markEventReadinessStale(
  eventId: string,
): Promise<void> {
  if (!ObjectId.isValid(eventId)) return;
  const database = await getDatabase();
  await database.collection("events").updateOne(
    { _id: new ObjectId(eventId) },
    {
      $set: {
        "readiness.stale": true,
        updatedAt: new Date(),
      },
    },
  );
}

export async function loadStoredEventReadiness(
  eventId: string,
): Promise<StoredEventReadiness | null> {
  if (!ObjectId.isValid(eventId)) return null;
  const database = await getDatabase();
  const event = await database.collection("events").findOne(
    { _id: new ObjectId(eventId) },
    { projection: { readiness: 1 } },
  );
  const readiness = event?.readiness as StoredEventReadiness | undefined;
  if (!readiness) return null;
  return {
    ...readiness,
    computedAt: readiness.computedAt
      ? new Date(readiness.computedAt)
      : null,
  };
}

export async function saveEventReadinessSnapshot(
  eventId: string,
  readiness: Omit<EventReadiness, "eventId" | "stale" | "computedAt"> & {
    aiAnalysis?: EventReadiness["aiAnalysis"];
  },
): Promise<Date> {
  const now = new Date();
  const database = await getDatabase();
  const stored: StoredEventReadiness = {
    stale: false,
    computedAt: now,
    canStart: readiness.canStart,
    blockers: readiness.blockers,
    summary: readiness.summary,
    setup: readiness.setup,
    design: readiness.design,
    roles: readiness.roles,
    plan: readiness.plan,
    aiAnalysis: readiness.aiAnalysis ?? null,
  };
  await database.collection("events").updateOne(
    { _id: new ObjectId(eventId) },
    {
      $set: {
        readiness: stored,
        updatedAt: now,
      },
    },
  );
  return now;
}
