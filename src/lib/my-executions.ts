import "server-only";

import { ObjectId } from "mongodb";

import type { ExecutionSummary } from "@/lib/admin-data";
import {
  EVENT_ACTOR_ROLE_OPTIONS,
  type EventActorRole,
} from "@/lib/event-actors";
import { getDatabase, isMongoConfigured } from "@/lib/mongodb";

export type AccessibleExecutionCard = ExecutionSummary & {
  eventName: string;
  organizationName: string;
  actorId: string | null;
  roles: EventActorRole[];
  isAdmin: boolean;
  assignedStepCount: number;
};

const STATUS_RANK: Record<ExecutionSummary["status"], number> = {
  EN_EJECUCION: 0,
  PAUSADO: 1,
  PREPARADO: 2,
  BORRADOR: 3,
  FINALIZADO: 4,
  CANCELADO: 5,
};

type MembershipDoc = {
  _id: ObjectId;
  eventId: ObjectId;
  email: string;
  roles?: EventActorRole[];
  role?: "EVENT_ADMIN";
  status: "ACTIVE" | "INACTIVE";
};

type OrgMembershipDoc = {
  organizationId: ObjectId;
  email: string;
  status: "ACTIVE" | "INACTIVE";
};

type EventDoc = {
  _id: ObjectId;
  name: string;
  organizationId: ObjectId;
};

type OrgDoc = {
  _id: ObjectId;
  name: string;
};

type ExecutionDoc = {
  _id: ObjectId;
  eventId: ObjectId;
  organizationId: ObjectId;
  name: string;
  type: "SIMULACRO" | "REAL";
  timezone: string;
  anchorStartAt?: Date | null;
  iteration?: number;
  status: ExecutionSummary["status"];
  createdAt: Date;
};

function normalizeRoles(roles: EventActorRole[]): EventActorRole[] {
  return EVENT_ACTOR_ROLE_OPTIONS.map((option) => option.value).filter((role) =>
    roles.includes(role),
  );
}

function membershipRoles(doc: MembershipDoc): EventActorRole[] {
  if (doc.roles?.length) return normalizeRoles(doc.roles);
  if (doc.role === "EVENT_ADMIN") return ["EVENT_ADMIN"];
  return [];
}

function toSummary(doc: ExecutionDoc): ExecutionSummary {
  return {
    id: doc._id.toHexString(),
    eventId: doc.eventId.toHexString(),
    organizationId: doc.organizationId.toHexString(),
    name: doc.name,
    type: doc.type,
    timezone: doc.timezone,
    anchorStartAt: doc.anchorStartAt?.toISOString() ?? null,
    iteration: doc.iteration ?? 1,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Ejecuciones visibles para el home PWA: orgs/eventos donde el usuario
 * es OrgAdmin o actor ACTIVE del mapa.
 */
export async function listAccessibleExecutionsForUser(
  email: string,
  options?: { isSuperAdmin?: boolean },
): Promise<AccessibleExecutionCard[]> {
  if (!isMongoConfigured()) return [];
  const database = await getDatabase();
  const normalized = email.trim().toLowerCase();

  const [orgMemberships, eventMemberships] = await Promise.all([
    database
      .collection<OrgMembershipDoc>("organizationMemberships")
      .find({ email: normalized, status: "ACTIVE" })
      .toArray(),
    database
      .collection<MembershipDoc>("eventMemberships")
      .find({ email: normalized, status: "ACTIVE" })
      .toArray(),
  ]);

  const actorByEvent = new Map<
    string,
    { actorId: string; roles: EventActorRole[] }
  >();
  for (const doc of eventMemberships) {
    const roles = membershipRoles(doc);
    if (!roles.length) continue;
    actorByEvent.set(doc.eventId.toHexString(), {
      actorId: doc._id.toHexString(),
      roles,
    });
  }

  const orgIds = orgMemberships.map((doc) => doc.organizationId);
  const orgAdminEventIds = new Set<string>();
  if (orgIds.length) {
    const orgEvents = await database
      .collection<EventDoc>("events")
      .find({ organizationId: { $in: orgIds } }, { projection: { _id: 1 } })
      .toArray();
    for (const event of orgEvents) {
      orgAdminEventIds.add(event._id.toHexString());
    }
  }

  const eventIdSet = new Set<string>([
    ...actorByEvent.keys(),
    ...orgAdminEventIds,
  ]);

  let executionDocs: ExecutionDoc[];
  if (options?.isSuperAdmin) {
    executionDocs = await database
      .collection<ExecutionDoc>("eventInstances")
      .find({})
      .sort({ createdAt: -1 })
      .limit(80)
      .toArray();
  } else if (eventIdSet.size) {
    executionDocs = await database
      .collection<ExecutionDoc>("eventInstances")
      .find({
        eventId: {
          $in: [...eventIdSet].map((id) => new ObjectId(id)),
        },
      })
      .sort({ createdAt: -1 })
      .limit(80)
      .toArray();
  } else {
    return [];
  }

  if (!executionDocs.length) return [];

  const neededEventIds = [
    ...new Set(executionDocs.map((doc) => doc.eventId.toHexString())),
  ].map((id) => new ObjectId(id));
  const neededOrgIds = [
    ...new Set(executionDocs.map((doc) => doc.organizationId.toHexString())),
  ].map((id) => new ObjectId(id));

  const [events, orgs] = await Promise.all([
    database
      .collection<EventDoc>("events")
      .find({ _id: { $in: neededEventIds } })
      .toArray(),
    database
      .collection<OrgDoc>("organizations")
      .find({ _id: { $in: neededOrgIds } })
      .toArray(),
  ]);

  const eventNameById = new Map(
    events.map((event) => [event._id.toHexString(), event.name]),
  );
  const orgNameById = new Map(
    orgs.map((org) => [org._id.toHexString(), org.name]),
  );

  const actorObjectIds = [...actorByEvent.values()].map(
    (item) => new ObjectId(item.actorId),
  );
  const assignedCountByKey = new Map<string, number>();
  if (actorObjectIds.length && executionDocs.length) {
    const counts = await database
      .collection("executionSteps")
      .aggregate<{
        _id: { executionId: ObjectId; actorId: ObjectId };
        count: number;
      }>([
        {
          $match: {
            eventInstanceId: { $in: executionDocs.map((doc) => doc._id) },
            executorActorId: { $in: actorObjectIds },
          },
        },
        {
          $group: {
            _id: {
              executionId: "$eventInstanceId",
              actorId: "$executorActorId",
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();
    for (const row of counts) {
      assignedCountByKey.set(
        `${row._id.executionId.toHexString()}:${row._id.actorId.toHexString()}`,
        row.count,
      );
    }
  }

  const cards: AccessibleExecutionCard[] = executionDocs.map((doc) => {
    const eventId = doc.eventId.toHexString();
    const actor = actorByEvent.get(eventId) ?? null;
    const isAdmin =
      Boolean(options?.isSuperAdmin) ||
      orgAdminEventIds.has(eventId) ||
      Boolean(actor?.roles.includes("EVENT_ADMIN"));
    const assignedStepCount =
      actor != null
        ? (assignedCountByKey.get(`${doc._id.toHexString()}:${actor.actorId}`) ??
          0)
        : 0;
    return {
      ...toSummary(doc),
      eventName: eventNameById.get(eventId) ?? "Evento",
      organizationName:
        orgNameById.get(doc.organizationId.toHexString()) ?? "Organización",
      actorId: actor?.actorId ?? null,
      roles: actor?.roles ?? [],
      isAdmin,
      assignedStepCount,
    };
  });

  cards.sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    const mine = Number(b.assignedStepCount > 0) - Number(a.assignedStepCount > 0);
    if (mine !== 0) return mine;
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  return cards;
}
