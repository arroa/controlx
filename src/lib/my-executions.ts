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
            $or: [
              { executorActorId: { $in: actorObjectIds } },
              { approverActorIds: { $in: actorObjectIds } },
            ],
          },
        },
        {
          $project: {
            eventInstanceId: 1,
            actors: {
              $setUnion: [
                {
                  $cond: [
                    { $in: ["$executorActorId", actorObjectIds] },
                    ["$executorActorId"],
                    [],
                  ],
                },
                {
                  $filter: {
                    input: { $ifNull: ["$approverActorIds", []] },
                    as: "approverId",
                    cond: { $in: ["$$approverId", actorObjectIds] },
                  },
                },
              ],
            },
          },
        },
        { $unwind: "$actors" },
        {
          $group: {
            _id: {
              executionId: "$eventInstanceId",
              actorId: "$actors",
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

export type AccessibleOrganization = {
  id: string;
  name: string;
};

/**
 * Organizaciones a las que el usuario puede entrar (OrgAdmin, actor de evento,
 * o todas si SuperAdmin).
 */
export async function listAccessibleOrganizationsForUser(
  email: string,
  options?: { isSuperAdmin?: boolean },
): Promise<AccessibleOrganization[]> {
  if (!isMongoConfigured()) return [];
  const database = await getDatabase();
  const normalized = email.trim().toLowerCase();

  if (options?.isSuperAdmin) {
    const orgs = await database
      .collection<OrgDoc>("organizations")
      .find({})
      .sort({ name: 1 })
      .limit(200)
      .toArray();
    return orgs.map((org) => ({
      id: org._id.toHexString(),
      name: org.name,
    }));
  }

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

  const orgIdSet = new Set<string>(
    orgMemberships.map((doc) => doc.organizationId.toHexString()),
  );

  const actorEventIds = eventMemberships
    .filter((doc) => membershipRoles(doc).length > 0)
    .map((doc) => doc.eventId);

  if (actorEventIds.length) {
    const events = await database
      .collection<EventDoc>("events")
      .find(
        { _id: { $in: actorEventIds } },
        { projection: { organizationId: 1 } },
      )
      .toArray();
    for (const event of events) {
      orgIdSet.add(event.organizationId.toHexString());
    }
  }

  if (!orgIdSet.size) return [];

  const orgs = await database
    .collection<OrgDoc>("organizations")
    .find({
      _id: { $in: [...orgIdSet].map((id) => new ObjectId(id)) },
    })
    .sort({ name: 1 })
    .toArray();

  return orgs.map((org) => ({
    id: org._id.toHexString(),
    name: org.name,
  }));
}

export type AccessibleEventCard = {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  roles: EventActorRole[];
  isOrgAdmin: boolean;
};

/**
 * Eventos a los que el usuario puede entrar (actor, OrgAdmin de la org, o todos si Super).
 * Opcional: filtrar por organizationId.
 */
export async function listAccessibleEventsForUser(
  email: string,
  options?: { isSuperAdmin?: boolean; organizationId?: string },
): Promise<AccessibleEventCard[]> {
  if (!isMongoConfigured()) return [];
  const database = await getDatabase();
  const normalized = email.trim().toLowerCase();

  const orgFilter =
    options?.organizationId && ObjectId.isValid(options.organizationId)
      ? new ObjectId(options.organizationId)
      : null;

  if (options?.isSuperAdmin) {
    const query = orgFilter ? { organizationId: orgFilter } : {};
    const events = await database
      .collection<EventDoc>("events")
      .find(query)
      .sort({ name: 1 })
      .limit(300)
      .toArray();
    const orgIds = [...new Set(events.map((e) => e.organizationId.toHexString()))];
    const orgs = await database
      .collection<OrgDoc>("organizations")
      .find({ _id: { $in: orgIds.map((id) => new ObjectId(id)) } })
      .toArray();
    const orgName = new Map(orgs.map((o) => [o._id.toHexString(), o.name]));
    return events.map((event) => ({
      id: event._id.toHexString(),
      name: event.name,
      organizationId: event.organizationId.toHexString(),
      organizationName:
        orgName.get(event.organizationId.toHexString()) ?? "Organización",
      roles: ["EVENT_ADMIN"] as EventActorRole[],
      isOrgAdmin: true,
    }));
  }

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

  const orgAdminIds = new Set(
    orgMemberships.map((doc) => doc.organizationId.toHexString()),
  );

  const actorByEvent = new Map<string, EventActorRole[]>();
  for (const doc of eventMemberships) {
    const roles = membershipRoles(doc);
    if (!roles.length) continue;
    actorByEvent.set(doc.eventId.toHexString(), roles);
  }

  const eventIdSet = new Set<string>(actorByEvent.keys());
  if (orgAdminIds.size) {
    const orgObjectIds = [...orgAdminIds].map((id) => new ObjectId(id));
    const orgEvents = await database
      .collection<EventDoc>("events")
      .find(
        orgFilter
          ? { organizationId: orgFilter }
          : { organizationId: { $in: orgObjectIds } },
        { projection: { _id: 1 } },
      )
      .toArray();
    for (const event of orgEvents) {
      eventIdSet.add(event._id.toHexString());
    }
  }

  if (!eventIdSet.size) return [];

  const events = await database
    .collection<EventDoc>("events")
    .find({
      _id: { $in: [...eventIdSet].map((id) => new ObjectId(id)) },
      ...(orgFilter ? { organizationId: orgFilter } : {}),
    })
    .sort({ name: 1 })
    .toArray();

  const orgIds = [...new Set(events.map((e) => e.organizationId.toHexString()))];
  const orgs = await database
    .collection<OrgDoc>("organizations")
    .find({ _id: { $in: orgIds.map((id) => new ObjectId(id)) } })
    .toArray();
  const orgName = new Map(orgs.map((o) => [o._id.toHexString(), o.name]));

  return events.map((event) => {
    const organizationId = event.organizationId.toHexString();
    const isOrgAdmin = orgAdminIds.has(organizationId);
    return {
      id: event._id.toHexString(),
      name: event.name,
      organizationId,
      organizationName: orgName.get(organizationId) ?? "Organización",
      roles: actorByEvent.get(event._id.toHexString()) ?? [],
      isOrgAdmin,
    };
  });
}
