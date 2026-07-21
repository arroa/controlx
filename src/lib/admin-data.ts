import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";

import { getDatabase, isMongoConfigured } from "@/lib/mongodb";
import { validateGateGraph } from "@/lib/gate-validation";
import { isSupportedTimezone } from "@/lib/timezones";
import { approvalRoleSchema } from "@/domain/controlx";
import {
  EVENT_ACTOR_ROLE_OPTIONS,
  emailLocalPart,
  eventActorInputSchema,
  eventActorRoleSchema,
  type EventActorRole,
  type EventActorSummary,
} from "@/lib/event-actors";

export {
  EVENT_ACTOR_ROLE_OPTIONS,
  emailLocalPart,
  eventActorInputSchema,
  eventActorRoleSchema,
  type EventActorRole,
  type EventActorSummary,
} from "@/lib/event-actors";

/** Cualquier cambio de preparación invalida el readiness cacheado. */
async function touchPrepReadiness(eventId: string) {
  const { markEventReadinessStale } = await import(
    "@/lib/event-readiness-store"
  );
  await markEventReadinessStale(eventId);
}

const timezoneSchema = z
  .string()
  .trim()
  .refine(isSupportedTimezone, "Zona horaria inválida");

export const organizationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
});

/** Evento = diseño / plantilla. No es una ejecución. */
export const eventInputSchema = z.object({
  organizationId: z.string().refine(ObjectId.isValid, "Organización inválida"),
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).default(""),
  timezone: timezoneSchema,
  dayDStartAt: z.iso.datetime().nullable().optional(),
});

export const eventUpdateSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  timezone: timezoneSchema.optional(),
  dayDStartAt: z.iso.datetime().nullable().optional(),
});

/** Ejecución = instancia del evento (simulacro o real). */
export const executionInputSchema = z.object({
  eventId: z.string().refine(ObjectId.isValid, "Evento inválido"),
  name: z.string().trim().min(3).max(160).optional(),
  type: z.enum(["SIMULACRO", "REAL"]),
  timezone: timezoneSchema.optional(),
});

export const adminInputSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
});

export const workstreamInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
});

export const blockInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
});

export const activityInputSchema = z.object({
  workstreamId: z.string().refine(ObjectId.isValid, "Workstream inválido"),
  blockId: z.string().refine(ObjectId.isValid, "Bloque inválido"),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
});

export const designStepInputSchema = z.object({
  activityId: z.string().refine(ObjectId.isValid, "Actividad inválida"),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(""),
});

export const activityUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
});

export const designStepUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(""),
});

export const moveDirectionSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export const gateTargetSchema = z.object({
  workstreamId: z.string().refine(ObjectId.isValid, "Workstream inválido"),
  /** null = abre todo el workstream; si hay id, solo ese bloque del WS. */
  blockId: z
    .string()
    .refine(ObjectId.isValid, "Bloque inválido")
    .nullable(),
});

export const gateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  /** Qué workstreams/bloques libera cuando el gate se activa. */
  opensTargets: z.array(gateTargetSchema).default([]),
  /** Condiciones de activación (AND). Todas opcionales. */
  plannedOpenAt: z.iso.datetime().nullable().default(null),
  approvalRoles: z.array(approvalRoleSchema).default([]),
  /** Cierre (OK) de estos WS/bloques para activar el gate. */
  closesAfterTargets: z.array(gateTargetSchema).default([]),
}).superRefine((value, ctx) => {
  for (const open of value.opensTargets) {
    const conflict = value.closesAfterTargets.some((close) => {
      if (close.workstreamId !== open.workstreamId) return false;
      if (close.blockId == null || open.blockId == null) return true;
      return close.blockId === open.blockId;
    });
    if (conflict) {
      ctx.addIssue({
        code: "custom",
        message:
          "Un gate no puede requerir y abrir el mismo workstream/bloque.",
        path: ["opensTargets"],
      });
      return;
    }
  }
});

export type GateTarget = z.infer<typeof gateTargetSchema>;

export const stepPlanningInputSchema = z.object({
  plannedStartAt: z.iso.datetime().nullable(),
  estimatedDurationMinutes: z
    .number()
    .int()
    .min(1)
    .max(60 * 24 * 14)
    .nullable(),
  dependencyStepIds: z
    .array(z.string().refine(ObjectId.isValid, "Dependencia inválida"))
    .default([]),
  approvalRoles: z.array(approvalRoleSchema).default([]),
  producesGateId: z
    .string()
    .refine(ObjectId.isValid, "Gate inválido")
    .nullable()
    .default(null),
  requiresGateIds: z
    .array(z.string().refine(ObjectId.isValid, "Gate inválido"))
    .default([]),
});

/** Asignar un ejecutor (actor del evento) a varios pasos sin ejecutor. */
export const assignStepExecutorsSchema = z.object({
  executorActorId: z.string().refine(ObjectId.isValid, "Ejecutor inválido"),
  stepIds: z
    .array(z.string().refine(ObjectId.isValid, "Paso inválido"))
    .min(1, "Elige al menos un paso."),
});

export const unassignStepExecutorsSchema = z.object({
  stepIds: z
    .array(z.string().refine(ObjectId.isValid, "Paso inválido"))
    .min(1, "Elige al menos un paso."),
});

/** Asignar un aprobador (APPROVER o STEERCO) a varios pasos. */
export const assignStepApproversSchema = z.object({
  approverActorId: z.string().refine(ObjectId.isValid, "Aprobador inválido"),
  stepIds: z
    .array(z.string().refine(ObjectId.isValid, "Paso inválido"))
    .min(1, "Elige al menos un paso."),
});

export const unassignStepApproversSchema = z.object({
  approverActorId: z.string().refine(ObjectId.isValid, "Aprobador inválido"),
  stepIds: z
    .array(z.string().refine(ObjectId.isValid, "Paso inválido"))
    .min(1, "Elige al menos un paso."),
});

export type OrganizationSummary = {
  id: string;
  name: string;
  description: string;
  status: "ACTIVE";
  createdAt: string;
};

export type EventSummary = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  timezone: string;
  /** Origen absoluto del Día D (timeline). null = aún no definido. */
  dayDStartAt: string | null;
  status: "BORRADOR" | "ACTIVO";
  executionCount: number;
  createdAt: string;
};

export type ExecutionSummary = {
  id: string;
  eventId: string;
  organizationId: string;
  name: string;
  type: "SIMULACRO" | "REAL";
  timezone: string;
  status:
    | "BORRADOR"
    | "PREPARADO"
    | "EN_EJECUCION"
    | "PAUSADO"
    | "FINALIZADO"
    | "CANCELADO";
  createdAt: string;
};

export type AdminSummary = {
  id: string;
  email: string;
  role: "ORG_ADMIN" | "EVENT_ADMIN";
  createdAt: string;
};

export type WorkstreamSummary = {
  id: string;
  eventId: string;
  name: string;
  description: string;
  order: number;
  createdAt: string;
};

export type BlockSummary = {
  id: string;
  eventId: string;
  name: string;
  description: string;
  order: number;
  createdAt: string;
};

export type ActivitySummary = {
  id: string;
  eventId: string;
  workstreamId: string;
  blockId: string;
  name: string;
  description: string;
  order: number;
  createdAt: string;
};

export type GateSummary = {
  id: string;
  eventId: string;
  name: string;
  description: string;
  order: number;
  /** Workstreams (o WS×bloque) que este gate abre / libera. */
  opensTargets: Array<{
    workstreamId: string;
    blockId: string | null;
  }>;
  /** Activación: no antes de esta hora (opcional). */
  plannedOpenAt: string | null;
  /** Activación: roles que deben aprobar (opcional, AND). */
  approvalRoles: Array<
    "EVENT_ADMIN" | "WORKSTREAM_ADMIN" | "APPROVER" | "STEERCO"
  >;
  /** Activación: cierre OK de estos WS/bloques (opcional). */
  closesAfterTargets: Array<{
    workstreamId: string;
    blockId: string | null;
  }>;
  createdAt: string;
};

export type DesignStepSummary = {
  id: string;
  eventId: string;
  workstreamId: string;
  blockId: string;
  activityId: string;
  name: string;
  description: string;
  order: number;
  plannedStartAt: string | null;
  estimatedDurationMinutes: number | null;
  dependencyStepIds: string[];
  approvalRoles: Array<
    "EVENT_ADMIN" | "WORKSTREAM_ADMIN" | "APPROVER" | "STEERCO"
  >;
  /** Actor del mapa con rol EXECUTOR. null = sin asignar. */
  executorActorId: string | null;
  /** Actores con rol APPROVER o STEERCO. Varios por paso. */
  approverActorIds: string[];
  producesGateId: string | null;
  requiresGateIds: string[];
  createdAt: string;
};

export type ActivityTreeNode = ActivitySummary & {
  steps: DesignStepSummary[];
};

export type DesignPair = {
  workstream: WorkstreamSummary;
  block: BlockSummary;
  activities: ActivityTreeNode[];
};

type OrganizationDocument = {
  _id?: ObjectId;
  name: string;
  slug: string;
  description: string;
  status: "ACTIVE";
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type EventDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  name: string;
  description: string;
  timezone: string;
  dayDStartAt?: Date | null;
  status: "BORRADOR" | "ACTIVO";
  readiness?: {
    stale: boolean;
    computedAt: Date | null;
    canStart: boolean;
    blockers: string[];
  };
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type ExecutionDocument = {
  _id?: ObjectId;
  eventId: ObjectId;
  organizationId: ObjectId;
  name: string;
  type: "SIMULACRO" | "REAL";
  timezone: string;
  status: ExecutionSummary["status"];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type OrganizationMembershipDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  email: string;
  role: "ORG_ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt?: Date;
  deactivatedBy?: string;
  deactivatedAt?: Date;
};

type EventMembershipDocument = {
  _id?: ObjectId;
  eventId: ObjectId;
  organizationId: ObjectId;
  email: string;
  name?: string;
  area?: string;
  /**
   * Legacy: memberships antiguos solo tenían `role: "EVENT_ADMIN"`.
   * Fuente de verdad nueva: `roles`.
   */
  role?: "EVENT_ADMIN";
  roles?: EventActorRole[];
  status: "ACTIVE" | "INACTIVE";
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt?: Date;
  deactivatedBy?: string;
  deactivatedAt?: Date;
};

function normalizeActorRoles(roles: EventActorRole[]): EventActorRole[] {
  return EVENT_ACTOR_ROLE_OPTIONS.map((option) => option.value).filter((role) =>
    roles.includes(role),
  );
}

function membershipRoles(doc: EventMembershipDocument): EventActorRole[] {
  if (doc.roles?.length) return normalizeActorRoles(doc.roles);
  if (doc.role === "EVENT_ADMIN") return ["EVENT_ADMIN"];
  return [];
}

function hasEventAdminRole(doc: EventMembershipDocument): boolean {
  return membershipRoles(doc).includes("EVENT_ADMIN");
}

function toEventActorSummary(doc: EventMembershipDocument): EventActorSummary {
  return {
    id: doc._id!.toHexString(),
    name: doc.name?.trim() || emailLocalPart(doc.email),
    email: doc.email,
    area: doc.area?.trim() || "",
    roles: membershipRoles(doc),
    createdAt: doc.createdAt.toISOString(),
  };
}

type WorkstreamDocument = {
  _id?: ObjectId;
  eventId: ObjectId;
  name: string;
  description: string;
  order: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type BlockDocument = {
  _id?: ObjectId;
  eventId: ObjectId;
  name: string;
  description: string;
  order: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type ActivityDocument = {
  _id?: ObjectId;
  eventId: ObjectId;
  workstreamId: ObjectId;
  blockId: ObjectId;
  name: string;
  description: string;
  order: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type GateDocument = {
  _id?: ObjectId;
  eventId: ObjectId;
  name: string;
  description: string;
  order: number;
  opensTargets?: Array<{
    workstreamId: ObjectId;
    blockId: ObjectId | null;
  }>;
  plannedOpenAt?: Date | null;
  approvalRoles?: Array<
    "EVENT_ADMIN" | "WORKSTREAM_ADMIN" | "APPROVER" | "STEERCO"
  >;
  closesAfterTargets?: Array<{
    workstreamId: ObjectId;
    blockId: ObjectId | null;
  }>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type DesignStepDocument = {
  _id?: ObjectId;
  eventId: ObjectId;
  workstreamId: ObjectId;
  blockId: ObjectId;
  activityId: ObjectId;
  name: string;
  description: string;
  order: number;
  plannedStartAt?: Date | null;
  estimatedDurationMinutes?: number | null;
  dependencyStepIds?: ObjectId[];
  approvalRoles?: Array<
    "EVENT_ADMIN" | "WORKSTREAM_ADMIN" | "APPROVER" | "STEERCO"
  >;
  executorActorId?: ObjectId | null;
  approverActorIds?: ObjectId[];
  producesGateId?: ObjectId | null;
  requiresGateIds?: ObjectId[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function listOrganizations(): Promise<{
  databaseReady: boolean;
  organizations: OrganizationSummary[];
}> {
  if (!isMongoConfigured()) {
    return { databaseReady: false, organizations: [] };
  }

  const database = await getDatabase();
  const organizations = await database
    .collection<OrganizationDocument>("organizations")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  return {
    databaseReady: true,
    organizations: organizations.map((organization) => ({
      id: organization._id!.toHexString(),
      name: organization.name,
      description: organization.description,
      status: organization.status,
      createdAt: organization.createdAt.toISOString(),
    })),
  };
}

export async function getOrganizationWorkspace(organizationId: string) {
  if (!ObjectId.isValid(organizationId)) return null;
  const database = await getDatabase();
  const id = new ObjectId(organizationId);
  const [organization, admins, events, executionCounts] = await Promise.all([
    database.collection<OrganizationDocument>("organizations").findOne({ _id: id }),
    database
      .collection<OrganizationMembershipDocument>("organizationMemberships")
      .find({ organizationId: id, status: "ACTIVE" })
      .sort({ createdAt: 1 })
      .toArray(),
    database
      .collection<EventDocument>("events")
      .find({ organizationId: id })
      .sort({ createdAt: -1 })
      .toArray(),
    database
      .collection<ExecutionDocument>("eventInstances")
      .aggregate<{ _id: ObjectId; count: number }>([
        { $match: { organizationId: id, eventId: { $exists: true } } },
        { $group: { _id: "$eventId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  if (!organization) return null;

  const countByEvent = new Map(
    executionCounts.map((item) => [item._id.toHexString(), item.count]),
  );
  return {
    organization: {
      id: organization._id!.toHexString(),
      name: organization.name,
      description: organization.description,
      status: organization.status,
      createdAt: organization.createdAt.toISOString(),
    } satisfies OrganizationSummary,
    admins: admins.map((admin) => ({
      id: admin._id!.toHexString(),
      email: admin.email,
      role: admin.role,
      createdAt: admin.createdAt.toISOString(),
    })) satisfies AdminSummary[],
    events: events.map((event) => ({
      id: event._id!.toHexString(),
      organizationId: event.organizationId.toHexString(),
      name: event.name,
      description: event.description,
      timezone: event.timezone,
      dayDStartAt: event.dayDStartAt?.toISOString() ?? null,
      status: event.status,
      executionCount: countByEvent.get(event._id!.toHexString()) ?? 0,
      createdAt: event.createdAt.toISOString(),
    })) satisfies EventSummary[],
  };
}

export async function getEventWorkspace(eventId: string) {
  if (!ObjectId.isValid(eventId)) return null;
  const database = await getDatabase();
  const id = new ObjectId(eventId);
  const event = await database.collection<EventDocument>("events").findOne({ _id: id });
  if (!event) return null;

  const [organization, admins, executions] = await Promise.all([
    database
      .collection<OrganizationDocument>("organizations")
      .findOne({ _id: event.organizationId }),
    database
      .collection<EventMembershipDocument>("eventMemberships")
      .find({ eventId: id, status: "ACTIVE" })
      .sort({ createdAt: 1 })
      .toArray(),
    database
      .collection<ExecutionDocument>("eventInstances")
      .find({ eventId: id })
      .sort({ createdAt: -1 })
      .toArray(),
  ]);

  return {
    organization: organization
      ? { id: organization._id!.toHexString(), name: organization.name }
      : null,
    event: {
      id: event._id!.toHexString(),
      organizationId: event.organizationId.toHexString(),
      name: event.name,
      description: event.description,
      timezone: event.timezone,
      dayDStartAt: event.dayDStartAt?.toISOString() ?? null,
      status: event.status,
      executionCount: executions.length,
      createdAt: event.createdAt.toISOString(),
    } satisfies EventSummary,
    admins: admins
      .filter((admin) => hasEventAdminRole(admin))
      .map((admin) => ({
        id: admin._id!.toHexString(),
        email: admin.email,
        role: "EVENT_ADMIN" as const,
        createdAt: admin.createdAt.toISOString(),
      })) satisfies AdminSummary[],
    executions: executions.map((execution) => ({
      id: execution._id!.toHexString(),
      eventId: execution.eventId.toHexString(),
      organizationId: execution.organizationId.toHexString(),
      name: execution.name,
      type: execution.type,
      timezone: execution.timezone,
      status: execution.status,
      createdAt: execution.createdAt.toISOString(),
    })) satisfies ExecutionSummary[],
  };
}

export async function getEventDesign(eventId: string) {
  const workspace = await getEventWorkspace(eventId);
  if (!workspace) return null;
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);

  const [workstreams, blocks, activities, steps, gates] = await Promise.all([
    database
      .collection<WorkstreamDocument>("workstreams")
      .find({ eventId: eventObjectId })
      .sort({ order: 1, createdAt: 1 })
      .toArray(),
    database
      .collection<BlockDocument>("blocks")
      .find({ eventId: eventObjectId })
      .sort({ order: 1, createdAt: 1 })
      .toArray(),
    database
      .collection<ActivityDocument>("activities")
      .find({ eventId: eventObjectId, blockId: { $exists: true } })
      .sort({ order: 1, createdAt: 1 })
      .toArray(),
    database
      .collection<DesignStepDocument>("designSteps")
      .find({ eventId: eventObjectId, blockId: { $exists: true } })
      .sort({ order: 1, createdAt: 1 })
      .toArray(),
    database
      .collection<GateDocument>("gates")
      .find({ eventId: eventObjectId })
      .sort({ order: 1, createdAt: 1 })
      .toArray(),
  ]);

  const stepsByActivity = new Map<string, DesignStepSummary[]>();
  for (const step of steps) {
    const activityId = step.activityId.toHexString();
    const list = stepsByActivity.get(activityId) ?? [];
    list.push(toDesignStepSummary(eventId, step));
    stepsByActivity.set(activityId, list);
  }

  const activitiesByPair = new Map<string, ActivityTreeNode[]>();
  for (const activity of activities) {
    const workstreamId = activity.workstreamId.toHexString();
    const blockId = activity.blockId.toHexString();
    const pairKey = `${workstreamId}:${blockId}`;
    const activityId = activity._id!.toHexString();
    const list = activitiesByPair.get(pairKey) ?? [];
    list.push({
      id: activityId,
      eventId: activity.eventId.toHexString(),
      workstreamId,
      blockId,
      name: activity.name,
      description: activity.description,
      order: activity.order,
      createdAt: activity.createdAt.toISOString(),
      steps: stepsByActivity.get(activityId) ?? [],
    });
    activitiesByPair.set(pairKey, list);
  }

  const workstreamSummaries: WorkstreamSummary[] = workstreams.map(
    (workstream) => ({
      id: workstream._id!.toHexString(),
      eventId: workstream.eventId.toHexString(),
      name: workstream.name,
      description: workstream.description,
      order: workstream.order,
      createdAt: workstream.createdAt.toISOString(),
    }),
  );
  const blockSummaries: BlockSummary[] = blocks.map((block) => ({
    id: block._id!.toHexString(),
    eventId: block.eventId.toHexString(),
    name: block.name,
    description: block.description,
    order: block.order,
    createdAt: block.createdAt.toISOString(),
  }));
  const pairs: DesignPair[] = [];
  for (const workstream of workstreamSummaries) {
    for (const block of blockSummaries) {
      pairs.push({
        workstream,
        block,
        activities:
          activitiesByPair.get(`${workstream.id}:${block.id}`) ?? [],
      });
    }
  }

  return {
    organization: workspace.organization,
    event: workspace.event,
    workstreams: workstreamSummaries,
    blocks: blockSummaries,
    gates: gates.map((gate) => toGateSummary(eventId, gate)),
    pairs,
  };
}

export async function createOrganization(
  input: z.infer<typeof organizationInputSchema>,
  actorId: string,
): Promise<OrganizationSummary> {
  const database = await getDatabase();
  const collection =
    database.collection<OrganizationDocument>("organizations");
  const now = new Date();
  const baseSlug = toSlug(input.name);
  let slug = baseSlug;
  let suffix = 2;

  while (await collection.findOne({ slug }, { projection: { _id: 1 } })) {
    slug = `${baseSlug}-${suffix++}`;
  }

  const document: OrganizationDocument = {
    name: input.name,
    slug,
    description: input.description,
    status: "ACTIVE",
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(document);

  return {
    id: result.insertedId.toHexString(),
    name: document.name,
    description: document.description,
    status: document.status,
    createdAt: now.toISOString(),
  };
}

export async function createEvent(
  input: z.infer<typeof eventInputSchema>,
  actorId: string,
): Promise<EventSummary> {
  const database = await getDatabase();
  const organizationId = new ObjectId(input.organizationId);
  const organization = await database
    .collection<OrganizationDocument>("organizations")
    .findOne({ _id: organizationId }, { projection: { _id: 1 } });

  if (!organization) {
    throw new Error("La organización seleccionada no existe.");
  }

  const now = new Date();
  const document: EventDocument = {
    organizationId,
    name: input.name,
    description: input.description,
    timezone: input.timezone,
    dayDStartAt: input.dayDStartAt ? new Date(input.dayDStartAt) : null,
    status: "BORRADOR",
    readiness: {
      stale: true,
      computedAt: null,
      canStart: false,
      blockers: ["Pendiente calcular readiness"],
    },
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await database
    .collection<EventDocument>("events")
    .insertOne(document);

  return {
    id: result.insertedId.toHexString(),
    organizationId: input.organizationId,
    name: document.name,
    description: document.description,
    timezone: document.timezone,
    dayDStartAt: document.dayDStartAt?.toISOString() ?? null,
    status: document.status,
    executionCount: 0,
    createdAt: now.toISOString(),
  };
}

export async function updateEvent(
  eventId: string,
  input: z.infer<typeof eventUpdateSchema>,
): Promise<EventSummary> {
  if (!ObjectId.isValid(eventId)) throw new Error("Evento inválido.");
  const database = await getDatabase();
  const id = new ObjectId(eventId);
  const current = await database
    .collection<EventDocument>("events")
    .findOne({ _id: id });
  if (!current) throw new Error("El evento no existe.");

  const $set: Partial<EventDocument> = { updatedAt: new Date() };
  if (input.name !== undefined) $set.name = input.name;
  if (input.description !== undefined) $set.description = input.description;
  if (input.timezone !== undefined) $set.timezone = input.timezone;
  if (input.dayDStartAt !== undefined) {
    $set.dayDStartAt = input.dayDStartAt ? new Date(input.dayDStartAt) : null;
  }

  const result = await database
    .collection<EventDocument>("events")
    .findOneAndUpdate({ _id: id }, { $set }, { returnDocument: "after" });
  if (!result) throw new Error("El evento no existe.");

  await touchPrepReadiness(eventId);

  const executionCount = await database
    .collection<ExecutionDocument>("eventInstances")
    .countDocuments({ eventId: id });

  return {
    id: result._id!.toHexString(),
    organizationId: result.organizationId.toHexString(),
    name: result.name,
    description: result.description,
    timezone: result.timezone,
    dayDStartAt: result.dayDStartAt?.toISOString() ?? null,
    status: result.status,
    executionCount,
    createdAt: result.createdAt.toISOString(),
  };
}

export async function createExecution(
  input: z.infer<typeof executionInputSchema>,
  actorId: string,
): Promise<ExecutionSummary> {
  const { assertCanCreateExecution, materializeExecutionSteps } = await import(
    "@/lib/execution-runtime"
  );
  await assertCanCreateExecution(input.eventId, input.type);

  const database = await getDatabase();
  const eventId = new ObjectId(input.eventId);
  const event = await database
    .collection<EventDocument>("events")
    .findOne({ _id: eventId });

  if (!event) {
    throw new Error("El evento seleccionado no existe.");
  }

  const now = new Date();
  const typeLabel = input.type === "SIMULACRO" ? "Simulacro" : "Ejecución real";
  const document: ExecutionDocument = {
    eventId,
    organizationId: event.organizationId,
    name: input.name?.trim() || `${event.name} · ${typeLabel}`,
    type: input.type,
    timezone: input.timezone?.trim() || event.timezone,
    status: "PREPARADO",
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await database
    .collection<ExecutionDocument>("eventInstances")
    .insertOne(document);

  await materializeExecutionSteps({
    executionId: result.insertedId,
    eventId: input.eventId,
    actorId,
  });

  return {
    id: result.insertedId.toHexString(),
    eventId: input.eventId,
    organizationId: event.organizationId.toHexString(),
    name: document.name,
    type: document.type,
    timezone: document.timezone,
    status: document.status,
    createdAt: now.toISOString(),
  };
}

export async function addOrganizationAdmin(
  organizationId: string,
  email: string,
  actorId: string,
): Promise<AdminSummary> {
  const database = await getDatabase();
  const id = new ObjectId(organizationId);
  const organization = await database
    .collection<OrganizationDocument>("organizations")
    .findOne({ _id: id }, { projection: { _id: 1 } });
  if (!organization) throw new Error("La organización no existe.");

  const { ensureClerkUser, normalizeEmail } = await import(
    "@/lib/clerk-users"
  );
  const normalizedEmail = normalizeEmail(email);
  await ensureClerkUser(normalizedEmail);

  const now = new Date();
  const collection =
    database.collection<OrganizationMembershipDocument>(
      "organizationMemberships",
    );
  await collection.updateOne(
    { organizationId: id, email: normalizedEmail, role: "ORG_ADMIN" },
    {
      $set: { status: "ACTIVE" },
      $setOnInsert: { createdBy: actorId, createdAt: now },
    },
    { upsert: true },
  );
  const membership = await collection.findOne({
    organizationId: id,
    email: normalizedEmail,
    role: "ORG_ADMIN",
  });

  return {
    id: membership!._id!.toHexString(),
    email: normalizedEmail,
    role: "ORG_ADMIN",
    createdAt: membership!.createdAt.toISOString(),
  };
}

export async function addEventAdmin(
  eventId: string,
  email: string,
  actorId: string,
): Promise<AdminSummary> {
  const actor = await upsertEventActor(
    eventId,
    {
      email,
      name: emailLocalPart(email),
      area: "General",
      roles: ["EVENT_ADMIN"],
    },
    actorId,
    { mergeRoles: true },
  );
  return {
    id: actor.id,
    email: actor.email,
    role: "EVENT_ADMIN",
    createdAt: actor.createdAt,
  };
}

export async function updateOrganizationAdmin(
  organizationId: string,
  adminId: string,
  email: string,
  actorId: string,
): Promise<AdminSummary> {
  if (!ObjectId.isValid(organizationId) || !ObjectId.isValid(adminId)) {
    throw new Error("Administrador inválido.");
  }
  const { ensureClerkUser, normalizeEmail } = await import(
    "@/lib/clerk-users"
  );
  const normalizedEmail = normalizeEmail(email);
  await ensureClerkUser(normalizedEmail);

  const database = await getDatabase();
  const result = await database
    .collection<OrganizationMembershipDocument>("organizationMemberships")
    .findOneAndUpdate(
      {
        _id: new ObjectId(adminId),
        organizationId: new ObjectId(organizationId),
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
      {
        $set: {
          email: normalizedEmail,
          updatedBy: actorId,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  if (!result) throw new Error("El OrgAdmin no existe.");

  return {
    id: result._id!.toHexString(),
    email: result.email,
    role: result.role,
    createdAt: result.createdAt.toISOString(),
  };
}

export async function deactivateOrganizationAdmin(
  organizationId: string,
  adminId: string,
  actorId: string,
): Promise<void> {
  if (!ObjectId.isValid(organizationId) || !ObjectId.isValid(adminId)) {
    throw new Error("Administrador inválido.");
  }
  const database = await getDatabase();
  const result = await database
    .collection<OrganizationMembershipDocument>("organizationMemberships")
    .updateOne(
      {
        _id: new ObjectId(adminId),
        organizationId: new ObjectId(organizationId),
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
      {
        $set: {
          status: "INACTIVE",
          deactivatedBy: actorId,
          deactivatedAt: new Date(),
        },
      },
    );
  if (!result.matchedCount) throw new Error("El OrgAdmin no existe.");
}

export async function updateEventAdmin(
  eventId: string,
  adminId: string,
  email: string,
  actorId: string,
): Promise<AdminSummary> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(adminId)) {
    throw new Error("Administrador inválido.");
  }
  const database = await getDatabase();
  const existing = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .findOne({
      _id: new ObjectId(adminId),
      eventId: new ObjectId(eventId),
      status: "ACTIVE",
    });
  if (!existing || !hasEventAdminRole(existing)) {
    throw new Error("El EventAdmin no existe.");
  }

  const actor = await updateEventActor(
    eventId,
    adminId,
    {
      email,
      name: existing.name?.trim() || emailLocalPart(email),
      area: existing.area?.trim() || "General",
      roles: membershipRoles(existing),
    },
    actorId,
  );
  return {
    id: actor.id,
    email: actor.email,
    role: "EVENT_ADMIN",
    createdAt: actor.createdAt,
  };
}

export async function deactivateEventAdmin(
  eventId: string,
  adminId: string,
  actorId: string,
): Promise<void> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(adminId)) {
    throw new Error("Administrador inválido.");
  }
  const database = await getDatabase();
  const existing = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .findOne({
      _id: new ObjectId(adminId),
      eventId: new ObjectId(eventId),
      status: "ACTIVE",
    });
  if (!existing || !hasEventAdminRole(existing)) {
    throw new Error("El EventAdmin no existe.");
  }

  const remaining = membershipRoles(existing).filter(
    (role) => role !== "EVENT_ADMIN",
  );
  if (remaining.length === 0) {
    await deactivateEventActor(eventId, adminId, actorId);
    return;
  }
  await updateEventActor(
    eventId,
    adminId,
    {
      email: existing.email,
      name: existing.name?.trim() || emailLocalPart(existing.email),
      area: existing.area?.trim() || "General",
      roles: remaining,
    },
    actorId,
  );
}

export async function hasAssignedAccess(email: string): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  const database = await getDatabase();
  const [organizationAdmin, eventMemberships] = await Promise.all([
    database
      .collection<OrganizationMembershipDocument>("organizationMemberships")
      .findOne({ email, status: "ACTIVE" }, { projection: { _id: 1 } }),
    database
      .collection<EventMembershipDocument>("eventMemberships")
      .find({ email, status: "ACTIVE" })
      .toArray(),
  ]);
  return Boolean(
    organizationAdmin || eventMemberships.some((doc) => hasEventAdminRole(doc)),
  );
}

export async function getFirstAssignedPath(email: string): Promise<string> {
  if (!isMongoConfigured()) return "/";
  const database = await getDatabase();
  const organizationAdmin = await database
    .collection<OrganizationMembershipDocument>("organizationMemberships")
    .findOne({ email, status: "ACTIVE" }, { sort: { createdAt: 1 } });
  if (organizationAdmin) {
    return `/organizations/${organizationAdmin.organizationId.toHexString()}`;
  }

  const eventMemberships = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .find({ email, status: "ACTIVE" })
    .sort({ createdAt: 1 })
    .toArray();
  const eventAdmin = eventMemberships.find((doc) => hasEventAdminRole(doc));
  return eventAdmin ? `/events/${eventAdmin.eventId.toHexString()}` : "/";
}

export async function canAccessOrganization(
  email: string,
  organizationId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(organizationId)) return false;
  const database = await getDatabase();
  const membership = await database
    .collection<OrganizationMembershipDocument>("organizationMemberships")
    .findOne(
      {
        organizationId: new ObjectId(organizationId),
        email,
        status: "ACTIVE",
      },
      { projection: { _id: 1 } },
    );
  return Boolean(membership);
}

export async function canAccessEvent(
  email: string,
  eventId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(eventId)) return false;
  const database = await getDatabase();
  const id = new ObjectId(eventId);
  const event = await database
    .collection<EventDocument>("events")
    .findOne({ _id: id }, { projection: { organizationId: 1 } });
  if (!event) return false;

  const [eventMembership, organizationAdmin] = await Promise.all([
    database
      .collection<EventMembershipDocument>("eventMemberships")
      .findOne({ eventId: id, email, status: "ACTIVE" }),
    database
      .collection<OrganizationMembershipDocument>("organizationMemberships")
      .findOne(
        { organizationId: event.organizationId, email, status: "ACTIVE" },
        { projection: { _id: 1 } },
      ),
  ]);
  return Boolean(
    organizationAdmin ||
      (eventMembership && hasEventAdminRole(eventMembership)),
  );
}

/** Asignar/editar EventAdmins: solo SuperAdmin u OrgAdmin de la org del evento. */
export async function canManageEventAdmins(
  email: string,
  eventId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(eventId)) return false;
  const database = await getDatabase();
  const event = await database
    .collection<EventDocument>("events")
    .findOne(
      { _id: new ObjectId(eventId) },
      { projection: { organizationId: 1 } },
    );
  if (!event) return false;
  return canAccessOrganization(email, event.organizationId.toHexString());
}

export type EventWorkspaceRole = "SuperAdmin" | "OrgAdmin" | "EventAdmin";

export async function getEventWorkspaceRole(
  email: string,
  eventId: string,
  isSuperAdmin: boolean,
): Promise<EventWorkspaceRole | null> {
  if (isSuperAdmin) return "SuperAdmin";
  if (!ObjectId.isValid(eventId)) return null;
  const database = await getDatabase();
  const id = new ObjectId(eventId);
  const event = await database
    .collection<EventDocument>("events")
    .findOne({ _id: id }, { projection: { organizationId: 1 } });
  if (!event) return null;

  const [organizationAdmin, eventMembership] = await Promise.all([
    database
      .collection<OrganizationMembershipDocument>("organizationMemberships")
      .findOne(
        {
          organizationId: event.organizationId,
          email,
          status: "ACTIVE",
        },
        { projection: { _id: 1 } },
      ),
    database
      .collection<EventMembershipDocument>("eventMemberships")
      .findOne({ eventId: id, email, status: "ACTIVE" }),
  ]);

  if (organizationAdmin) return "OrgAdmin";
  if (eventMembership && hasEventAdminRole(eventMembership)) {
    return "EventAdmin";
  }
  return null;
}

export async function listEventActors(
  eventId: string,
): Promise<EventActorSummary[]> {
  if (!ObjectId.isValid(eventId)) return [];
  const database = await getDatabase();
  const actors = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .find({ eventId: new ObjectId(eventId), status: "ACTIVE" })
    .sort({ createdAt: 1 })
    .toArray();
  return actors
    .map(toEventActorSummary)
    .filter((actor) => actor.roles.length > 0);
}

export async function upsertEventActor(
  eventId: string,
  input: z.infer<typeof eventActorInputSchema>,
  actorId: string,
  options?: { mergeRoles?: boolean },
): Promise<EventActorSummary> {
  if (!ObjectId.isValid(eventId)) throw new Error("Evento inválido.");
  const roles = normalizeActorRoles(input.roles);
  if (!roles.length) throw new Error("Elige al menos un rol.");

  const database = await getDatabase();
  const id = new ObjectId(eventId);
  const event = await database
    .collection<EventDocument>("events")
    .findOne({ _id: id }, { projection: { organizationId: 1 } });
  if (!event) throw new Error("El evento no existe.");

  const { ensureClerkUser, normalizeEmail } = await import(
    "@/lib/clerk-users"
  );
  const normalizedEmail = normalizeEmail(input.email);

  const collection =
    database.collection<EventMembershipDocument>("eventMemberships");
  const existing = await collection.findOne({
    eventId: id,
    email: normalizedEmail,
  });

  const nextRoles = normalizeActorRoles(
    options?.mergeRoles && existing
      ? [...membershipRoles(existing), ...roles]
      : roles,
  );
  if (!nextRoles.length) throw new Error("Elige al menos un rol.");

  const nextName =
    options?.mergeRoles && existing?.name?.trim()
      ? existing.name.trim()
      : input.name.trim();
  const nextArea =
    options?.mergeRoles && existing?.area?.trim()
      ? existing.area.trim()
      : input.area.trim();

  const now = new Date();
  if (existing) {
    // Solo sincroniza Clerk al crear/reactivar, no en cada cambio de roles.
    if (existing.status !== "ACTIVE") {
      await ensureClerkUser(normalizedEmail);
    }
    const result = await collection.findOneAndUpdate(
      { _id: existing._id },
      {
        $set: {
          email: normalizedEmail,
          name: nextName,
          area: nextArea,
          roles: nextRoles,
          status: "ACTIVE",
          updatedBy: actorId,
          updatedAt: now,
          ...(nextRoles.includes("EVENT_ADMIN")
            ? { role: "EVENT_ADMIN" as const }
            : {}),
        },
        ...(nextRoles.includes("EVENT_ADMIN")
          ? {}
          : { $unset: { role: "" } }),
      },
      { returnDocument: "after" },
    );
    if (!result) throw new Error("No fue posible guardar el actor.");
    return toEventActorSummary(result);
  }

  await ensureClerkUser(normalizedEmail);
  const document: EventMembershipDocument = {
    eventId: id,
    organizationId: event.organizationId,
    email: normalizedEmail,
    name: nextName,
    area: nextArea,
    roles: nextRoles,
    ...(nextRoles.includes("EVENT_ADMIN")
      ? { role: "EVENT_ADMIN" as const }
      : {}),
    status: "ACTIVE",
    createdBy: actorId,
    createdAt: now,
  };
  const inserted = await collection.insertOne(document);
  await touchPrepReadiness(eventId);

  return toEventActorSummary({ ...document, _id: inserted.insertedId });
}

export async function updateEventActor(
  eventId: string,
  actorId: string,
  input: z.infer<typeof eventActorInputSchema>,
  updatedBy: string,
): Promise<EventActorSummary> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(actorId)) {
    throw new Error("Actor inválido.");
  }
  const roles = normalizeActorRoles(input.roles);
  if (!roles.length) throw new Error("Elige al menos un rol.");

  const { ensureClerkUser, normalizeEmail } = await import(
    "@/lib/clerk-users"
  );
  const normalizedEmail = normalizeEmail(input.email);

  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const collection =
    database.collection<EventMembershipDocument>("eventMemberships");

  const current = await collection.findOne({
    _id: new ObjectId(actorId),
    eventId: eventObjectId,
    status: "ACTIVE",
  });
  if (!current) throw new Error("El actor no existe.");

  const emailChanged = current.email !== normalizedEmail;
  if (emailChanged) {
    const duplicate = await collection.findOne({
      eventId: eventObjectId,
      email: normalizedEmail,
      status: "ACTIVE",
      _id: { $ne: new ObjectId(actorId) },
    });
    if (duplicate) {
      throw new Error("Ese correo ya está en el mapa de actores.");
    }
    await ensureClerkUser(normalizedEmail);
  }

  const unsetRole = !roles.includes("EVENT_ADMIN");
  const result = await collection.findOneAndUpdate(
    {
      _id: new ObjectId(actorId),
      eventId: eventObjectId,
      status: "ACTIVE",
    },
    {
      $set: {
        email: normalizedEmail,
        name: input.name.trim(),
        area: input.area.trim(),
        roles,
        ...(roles.includes("EVENT_ADMIN") ? { role: "EVENT_ADMIN" as const } : {}),
        updatedBy,
        updatedAt: new Date(),
      },
      ...(unsetRole ? { $unset: { role: "" } } : {}),
    },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("El actor no existe.");
  await touchPrepReadiness(eventId);

  return toEventActorSummary(result);
}

export async function deactivateEventActor(
  eventId: string,
  actorId: string,
  deactivatedBy: string,
): Promise<void> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(actorId)) {
    throw new Error("Actor inválido.");
  }
  const database = await getDatabase();
  const result = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .updateOne(
      {
        _id: new ObjectId(actorId),
        eventId: new ObjectId(eventId),
        status: "ACTIVE",
      },
      {
        $set: {
          status: "INACTIVE",
          deactivatedBy,
          deactivatedAt: new Date(),
        },
      },
    );
  if (!result.matchedCount) throw new Error("El actor no existe.");
  await touchPrepReadiness(eventId);
}

export async function createWorkstream(
  eventId: string,
  input: z.infer<typeof workstreamInputSchema>,
  actorId: string,
): Promise<WorkstreamSummary> {
  const database = await getDatabase();
  const id = new ObjectId(eventId);
  const event = await database
    .collection<EventDocument>("events")
    .findOne({ _id: id }, { projection: { _id: 1 } });
  if (!event) throw new Error("El evento no existe.");

  const collection = database.collection<WorkstreamDocument>("workstreams");
  const duplicate = await collection.findOne({
    eventId: id,
    name: input.name,
  });
  if (duplicate) throw new Error("Ese workstream ya existe en el evento.");
  const last = await collection.find({ eventId: id }).sort({ order: -1 }).limit(1).next();
  const now = new Date();
  const document: WorkstreamDocument = {
    eventId: id,
    name: input.name,
    description: input.description,
    order: (last?.order ?? 0) + 1,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(document);

  await touchPrepReadiness(eventId);

  return {
    id: result.insertedId.toHexString(),
    eventId,
    name: document.name,
    description: document.description,
    order: document.order,
    createdAt: now.toISOString(),
  };
}

export async function createBlock(
  eventId: string,
  input: z.infer<typeof blockInputSchema>,
  actorId: string,
): Promise<BlockSummary> {
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const event = await database
    .collection<EventDocument>("events")
    .findOne({ _id: eventObjectId }, { projection: { _id: 1 } });
  if (!event) throw new Error("El evento no existe.");

  const collection = database.collection<BlockDocument>("blocks");
  const duplicate = await collection.findOne({
    eventId: eventObjectId,
    name: input.name,
  });
  if (duplicate) throw new Error("Ese bloque ya existe en el evento.");
  const last = await collection
    .find({ eventId: eventObjectId })
    .sort({ order: -1 })
    .limit(1)
    .next();
  const now = new Date();
  const document: BlockDocument = {
    eventId: eventObjectId,
    name: input.name,
    description: input.description,
    order: (last?.order ?? 0) + 1,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(document);

  await touchPrepReadiness(eventId);

  return {
    id: result.insertedId.toHexString(),
    eventId,
    name: document.name,
    description: document.description,
    order: document.order,
    createdAt: now.toISOString(),
  };
}

export async function updateWorkstream(
  eventId: string,
  workstreamId: string,
  input: z.infer<typeof workstreamInputSchema>,
): Promise<WorkstreamSummary> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(workstreamId)) {
    throw new Error("Workstream inválido.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const id = new ObjectId(workstreamId);
  const collection = database.collection<WorkstreamDocument>("workstreams");
  const duplicate = await collection.findOne({
    _id: { $ne: id },
    eventId: eventObjectId,
    name: input.name,
  });
  if (duplicate) throw new Error("Ese workstream ya existe en el evento.");

  const result = await collection.findOneAndUpdate(
    { _id: id, eventId: eventObjectId },
    {
      $set: {
        name: input.name,
        description: input.description,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("El workstream no existe.");
  await touchPrepReadiness(eventId);

  return {
    id: result._id!.toHexString(),
    eventId,
    name: result.name,
    description: result.description,
    order: result.order,
    createdAt: result.createdAt.toISOString(),
  };
}

export async function deleteWorkstream(
  eventId: string,
  workstreamId: string,
): Promise<void> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(workstreamId)) {
    throw new Error("Workstream inválido.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const id = new ObjectId(workstreamId);

  const activities = await database
    .collection<ActivityDocument>("activities")
    .find({ eventId: eventObjectId, workstreamId: id }, { projection: { _id: 1 } })
    .toArray();
  const activityIds = activities.map((item) => item._id!);
  if (activityIds.length) {
    await database.collection<DesignStepDocument>("designSteps").deleteMany({
      eventId: eventObjectId,
      activityId: { $in: activityIds },
    });
    await database.collection<ActivityDocument>("activities").deleteMany({
      eventId: eventObjectId,
      workstreamId: id,
    });
  }

  const result = await database
    .collection<WorkstreamDocument>("workstreams")
    .deleteOne({ _id: id, eventId: eventObjectId });
  if (!result.deletedCount) throw new Error("El workstream no existe.");
  await touchPrepReadiness(eventId);
}

export async function updateBlock(
  eventId: string,
  blockId: string,
  input: z.infer<typeof blockInputSchema>,
): Promise<BlockSummary> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(blockId)) {
    throw new Error("Bloque inválido.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const id = new ObjectId(blockId);
  const collection = database.collection<BlockDocument>("blocks");
  const duplicate = await collection.findOne({
    _id: { $ne: id },
    eventId: eventObjectId,
    name: input.name,
  });
  if (duplicate) throw new Error("Ese bloque ya existe en el evento.");

  const result = await collection.findOneAndUpdate(
    { _id: id, eventId: eventObjectId },
    {
      $set: {
        name: input.name,
        description: input.description,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("El bloque no existe.");
  await touchPrepReadiness(eventId);

  return {
    id: result._id!.toHexString(),
    eventId,
    name: result.name,
    description: result.description,
    order: result.order,
    createdAt: result.createdAt.toISOString(),
  };
}

export async function deleteBlock(
  eventId: string,
  blockId: string,
): Promise<void> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(blockId)) {
    throw new Error("Bloque inválido.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const id = new ObjectId(blockId);

  const activities = await database
    .collection<ActivityDocument>("activities")
    .find({ eventId: eventObjectId, blockId: id }, { projection: { _id: 1 } })
    .toArray();
  const activityIds = activities.map((item) => item._id!);
  if (activityIds.length) {
    await database.collection<DesignStepDocument>("designSteps").deleteMany({
      eventId: eventObjectId,
      activityId: { $in: activityIds },
    });
    await database.collection<ActivityDocument>("activities").deleteMany({
      eventId: eventObjectId,
      blockId: id,
    });
  }

  const result = await database
    .collection<BlockDocument>("blocks")
    .deleteOne({ _id: id, eventId: eventObjectId });
  if (!result.deletedCount) throw new Error("El bloque no existe.");
  await touchPrepReadiness(eventId);
}

export async function createActivity(
  eventId: string,
  input: z.infer<typeof activityInputSchema>,
  actorId: string,
): Promise<ActivitySummary> {
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const workstreamId = new ObjectId(input.workstreamId);
  const blockId = new ObjectId(input.blockId);

  const [workstream, block] = await Promise.all([
    database
      .collection<WorkstreamDocument>("workstreams")
      .findOne({ _id: workstreamId, eventId: eventObjectId }),
    database
      .collection<BlockDocument>("blocks")
      .findOne({ _id: blockId, eventId: eventObjectId }),
  ]);
  if (!workstream || !block) {
    throw new Error("El workstream o bloque no pertenece a este evento.");
  }

  const collection = database.collection<ActivityDocument>("activities");
  const last = await collection
    .find({ workstreamId, blockId })
    .sort({ order: -1 })
    .limit(1)
    .next();
  const now = new Date();
  const document: ActivityDocument = {
    eventId: eventObjectId,
    workstreamId,
    blockId,
    name: input.name,
    description: input.description,
    order: (last?.order ?? 0) + 1,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(document);

  await touchPrepReadiness(eventId);

  return {
    id: result.insertedId.toHexString(),
    eventId,
    workstreamId: input.workstreamId,
    blockId: input.blockId,
    name: document.name,
    description: document.description,
    order: document.order,
    createdAt: now.toISOString(),
  };
}

export async function createDesignStep(
  eventId: string,
  input: z.infer<typeof designStepInputSchema>,
  actorId: string,
): Promise<DesignStepSummary> {
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const activityId = new ObjectId(input.activityId);

  const activity = await database
    .collection<ActivityDocument>("activities")
    .findOne({ _id: activityId, eventId: eventObjectId });
  if (!activity) throw new Error("La actividad no existe en este evento.");

  const collection = database.collection<DesignStepDocument>("designSteps");
  const last = await collection
    .find({ activityId })
    .sort({ order: -1 })
    .limit(1)
    .next();
  const now = new Date();
  const document: DesignStepDocument = {
    eventId: eventObjectId,
    workstreamId: activity.workstreamId,
    blockId: activity.blockId,
    activityId,
    name: input.name,
    description: input.description,
    order: (last?.order ?? 0) + 1,
    plannedStartAt: null,
    estimatedDurationMinutes: null,
    dependencyStepIds: [],
    approvalRoles: [],
    executorActorId: null,
    approverActorIds: [],
    producesGateId: null,
    requiresGateIds: [],
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(document);

  await touchPrepReadiness(eventId);

  return {
    id: result.insertedId.toHexString(),
    eventId,
    workstreamId: activity.workstreamId.toHexString(),
    blockId: activity.blockId.toHexString(),
    activityId: input.activityId,
    name: document.name,
    description: document.description,
    order: document.order,
    plannedStartAt: null,
    estimatedDurationMinutes: null,
    dependencyStepIds: [],
    approvalRoles: [],
    executorActorId: null,
    approverActorIds: [],
    producesGateId: null,
    requiresGateIds: [],
    createdAt: now.toISOString(),
  };
}

function toActivitySummary(
  eventId: string,
  activity: ActivityDocument,
): ActivitySummary {
  return {
    id: activity._id!.toHexString(),
    eventId,
    workstreamId: activity.workstreamId.toHexString(),
    blockId: activity.blockId.toHexString(),
    name: activity.name,
    description: activity.description,
    order: activity.order,
    createdAt: activity.createdAt.toISOString(),
  };
}

function toGateSummary(eventId: string, gate: GateDocument): GateSummary {
  return {
    id: gate._id!.toHexString(),
    eventId,
    name: gate.name,
    description: gate.description,
    order: gate.order,
    opensTargets: (gate.opensTargets ?? []).map((target) => ({
      workstreamId: target.workstreamId.toHexString(),
      blockId: target.blockId ? target.blockId.toHexString() : null,
    })),
    plannedOpenAt: gate.plannedOpenAt?.toISOString() ?? null,
    approvalRoles: gate.approvalRoles ?? [],
    closesAfterTargets: (gate.closesAfterTargets ?? []).map((target) => ({
      workstreamId: target.workstreamId.toHexString(),
      blockId: target.blockId ? target.blockId.toHexString() : null,
    })),
    createdAt: gate.createdAt.toISOString(),
  };
}

async function resolveGateTargets(
  eventId: string,
  targets: Array<{ workstreamId: string; blockId: string | null }>,
): Promise<
  Array<{ workstreamId: ObjectId; blockId: ObjectId | null }>
> {
  if (!targets.length) return [];

  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const workstreamIds = [
    ...new Set(targets.map((target) => target.workstreamId)),
  ].map((id) => new ObjectId(id));
  const blockIds = [
    ...new Set(
      targets
        .map((target) => target.blockId)
        .filter((id): id is string => Boolean(id)),
    ),
  ].map((id) => new ObjectId(id));

  const [workstreams, blocks] = await Promise.all([
    database
      .collection<WorkstreamDocument>("workstreams")
      .find(
        { eventId: eventObjectId, _id: { $in: workstreamIds } },
        { projection: { _id: 1 } },
      )
      .toArray(),
    blockIds.length
      ? database
          .collection<BlockDocument>("blocks")
          .find(
            { eventId: eventObjectId, _id: { $in: blockIds } },
            { projection: { _id: 1 } },
          )
          .toArray()
      : Promise.resolve([]),
  ]);

  if (workstreams.length !== workstreamIds.length) {
    throw new Error("Un workstream del gate no pertenece a este evento.");
  }
  if (blocks.length !== blockIds.length) {
    throw new Error("Un bloque del gate no pertenece a este evento.");
  }

  // Normaliza: si hay “todo el WS”, no guardar bloques sueltos del mismo WS.
  const wholeWorkstreams = new Set(
    targets
      .filter((target) => target.blockId == null)
      .map((target) => target.workstreamId),
  );
  const normalized: Array<{ workstreamId: ObjectId; blockId: ObjectId | null }> =
    [];
  const seen = new Set<string>();

  for (const target of targets) {
    if (wholeWorkstreams.has(target.workstreamId) && target.blockId != null) {
      continue;
    }
    if (
      wholeWorkstreams.has(target.workstreamId) &&
      target.blockId == null
    ) {
      const key = `${target.workstreamId}:*`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({
        workstreamId: new ObjectId(target.workstreamId),
        blockId: null,
      });
      continue;
    }
    if (!target.blockId) continue;
    const key = `${target.workstreamId}:${target.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      workstreamId: new ObjectId(target.workstreamId),
      blockId: new ObjectId(target.blockId),
    });
  }

  return normalized;
}

function objectIdToString(
  value: ObjectId | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.toHexString();
}

function toDesignStepSummary(
  eventId: string,
  step: DesignStepDocument,
): DesignStepSummary {
  return {
    id: step._id!.toHexString(),
    eventId,
    workstreamId: step.workstreamId.toHexString(),
    blockId: step.blockId.toHexString(),
    activityId: step.activityId.toHexString(),
    name: step.name,
    description: step.description,
    order: step.order,
    plannedStartAt: step.plannedStartAt?.toISOString() ?? null,
    estimatedDurationMinutes: step.estimatedDurationMinutes ?? null,
    dependencyStepIds:
      step.dependencyStepIds?.map((id) => id.toHexString()) ?? [],
    approvalRoles: step.approvalRoles ?? [],
    executorActorId: objectIdToString(step.executorActorId),
    approverActorIds:
      step.approverActorIds?.map((id) => id.toHexString()) ?? [],
    producesGateId: objectIdToString(step.producesGateId),
    requiresGateIds:
      step.requiresGateIds?.map((id) => id.toHexString()) ?? [],
    createdAt: step.createdAt.toISOString(),
  };
}

export async function assignStepsExecutor(
  eventId: string,
  input: z.infer<typeof assignStepExecutorsSchema>,
): Promise<DesignStepSummary[]> {
  if (!ObjectId.isValid(eventId)) throw new Error("Evento inválido.");
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const executorId = new ObjectId(input.executorActorId);
  const stepObjectIds = input.stepIds.map((id) => new ObjectId(id));

  const actor = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .findOne({
      _id: executorId,
      eventId: eventObjectId,
      status: "ACTIVE",
    });
  if (!actor || !membershipRoles(actor).includes("EXECUTOR")) {
    throw new Error("El actor no es Ejecutor de este evento.");
  }

  const collection = database.collection<DesignStepDocument>("designSteps");
  const matched = await collection.countDocuments({
    eventId: eventObjectId,
    _id: { $in: stepObjectIds },
  });
  if (matched !== stepObjectIds.length) {
    throw new Error("Uno o más pasos no pertenecen a este evento.");
  }

  const now = new Date();
  await collection.updateMany(
    {
      eventId: eventObjectId,
      _id: { $in: stepObjectIds },
      $or: [
        { executorActorId: null },
        { executorActorId: { $exists: false } },
      ],
    },
    { $set: { executorActorId: executorId, updatedAt: now } },
  );

  const steps = await collection
    .find({ eventId: eventObjectId, _id: { $in: stepObjectIds } })
    .toArray();
  await touchPrepReadiness(eventId);

  return steps.map((step) => toDesignStepSummary(eventId, step));
}

export async function unassignStepsExecutor(
  eventId: string,
  input: z.infer<typeof unassignStepExecutorsSchema>,
): Promise<DesignStepSummary[]> {
  if (!ObjectId.isValid(eventId)) throw new Error("Evento inválido.");
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const stepObjectIds = input.stepIds.map((id) => new ObjectId(id));

  const collection = database.collection<DesignStepDocument>("designSteps");
  const now = new Date();
  await collection.updateMany(
    {
      eventId: eventObjectId,
      _id: { $in: stepObjectIds },
    },
    { $set: { executorActorId: null, updatedAt: now } },
  );

  const steps = await collection
    .find({ eventId: eventObjectId, _id: { $in: stepObjectIds } })
    .toArray();
  await touchPrepReadiness(eventId);
  return steps.map((step) => toDesignStepSummary(eventId, step));
}

function isApproverActor(doc: EventMembershipDocument): boolean {
  const roles = membershipRoles(doc);
  return roles.includes("APPROVER") || roles.includes("STEERCO");
}

export async function assignStepsApprover(
  eventId: string,
  input: z.infer<typeof assignStepApproversSchema>,
): Promise<DesignStepSummary[]> {
  if (!ObjectId.isValid(eventId)) throw new Error("Evento inválido.");
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const approverId = new ObjectId(input.approverActorId);
  const stepObjectIds = input.stepIds.map((id) => new ObjectId(id));

  const actor = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .findOne({
      _id: approverId,
      eventId: eventObjectId,
      status: "ACTIVE",
    });
  if (!actor || !isApproverActor(actor)) {
    throw new Error("El actor no es Aprobador ni SteerCo de este evento.");
  }

  const collection = database.collection<DesignStepDocument>("designSteps");
  const matched = await collection.countDocuments({
    eventId: eventObjectId,
    _id: { $in: stepObjectIds },
  });
  if (matched !== stepObjectIds.length) {
    throw new Error("Uno o más pasos no pertenecen a este evento.");
  }

  const now = new Date();
  await collection.updateMany(
    {
      eventId: eventObjectId,
      _id: { $in: stepObjectIds },
      approverActorIds: { $ne: approverId },
    },
    {
      $addToSet: { approverActorIds: approverId },
      $set: { updatedAt: now },
    },
  );
  // Pasos legacy sin el campo
  await collection.updateMany(
    {
      eventId: eventObjectId,
      _id: { $in: stepObjectIds },
      approverActorIds: { $exists: false },
    },
    {
      $set: { approverActorIds: [approverId], updatedAt: now },
    },
  );

  const steps = await collection
    .find({ eventId: eventObjectId, _id: { $in: stepObjectIds } })
    .toArray();
  await touchPrepReadiness(eventId);

  return steps.map((step) => toDesignStepSummary(eventId, step));
}

export async function unassignStepsApprover(
  eventId: string,
  input: z.infer<typeof unassignStepApproversSchema>,
): Promise<DesignStepSummary[]> {
  if (!ObjectId.isValid(eventId)) throw new Error("Evento inválido.");
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const approverId = new ObjectId(input.approverActorId);
  const stepObjectIds = input.stepIds.map((id) => new ObjectId(id));

  const collection = database.collection<DesignStepDocument>("designSteps");
  const now = new Date();
  await collection.updateMany(
    {
      eventId: eventObjectId,
      _id: { $in: stepObjectIds },
    },
    {
      $pull: { approverActorIds: approverId },
      $set: { updatedAt: now },
    },
  );

  const steps = await collection
    .find({ eventId: eventObjectId, _id: { $in: stepObjectIds } })
    .toArray();
  await touchPrepReadiness(eventId);

  return steps.map((step) => toDesignStepSummary(eventId, step));
}

export async function updateActivity(
  eventId: string,
  activityId: string,
  input: z.infer<typeof activityUpdateSchema>,
): Promise<ActivitySummary> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(activityId)) {
    throw new Error("Actividad inválida.");
  }
  const database = await getDatabase();
  const result = await database
    .collection<ActivityDocument>("activities")
    .findOneAndUpdate(
      { _id: new ObjectId(activityId), eventId: new ObjectId(eventId) },
      {
        $set: {
          name: input.name,
          description: input.description,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  if (!result) throw new Error("La actividad no existe.");
  await touchPrepReadiness(eventId);

  return toActivitySummary(eventId, result);
}

export async function deleteActivity(
  eventId: string,
  activityId: string,
): Promise<void> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(activityId)) {
    throw new Error("Actividad inválida.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const id = new ObjectId(activityId);
  const activity = await database
    .collection<ActivityDocument>("activities")
    .findOne({ _id: id, eventId: eventObjectId }, { projection: { _id: 1 } });
  if (!activity) throw new Error("La actividad no existe.");

  await database
    .collection<DesignStepDocument>("designSteps")
    .deleteMany({ eventId: eventObjectId, activityId: id });
  await database
    .collection<ActivityDocument>("activities")
    .deleteOne({ _id: id, eventId: eventObjectId });
  await touchPrepReadiness(eventId);
}

export async function moveActivity(
  eventId: string,
  activityId: string,
  direction: "up" | "down",
): Promise<ActivitySummary[]> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(activityId)) {
    throw new Error("Actividad inválida.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const collection = database.collection<ActivityDocument>("activities");
  const current = await collection.findOne({
    _id: new ObjectId(activityId),
    eventId: eventObjectId,
  });
  if (!current) throw new Error("La actividad no existe.");

  const siblings = await collection
    .find({
      eventId: eventObjectId,
      workstreamId: current.workstreamId,
      blockId: current.blockId,
    })
    .sort({ order: 1, createdAt: 1 })
    .toArray();
  const index = siblings.findIndex((item) => item._id!.equals(current._id!));
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) {
    return siblings.map((item) => toActivitySummary(eventId, item));
  }

  const neighbor = siblings[swapIndex]!;
  const now = new Date();
  await Promise.all([
    collection.updateOne(
      { _id: current._id },
      { $set: { order: neighbor.order, updatedAt: now } },
    ),
    collection.updateOne(
      { _id: neighbor._id },
      { $set: { order: current.order, updatedAt: now } },
    ),
  ]);

  const refreshed = await collection
    .find({
      eventId: eventObjectId,
      workstreamId: current.workstreamId,
      blockId: current.blockId,
    })
    .sort({ order: 1, createdAt: 1 })
    .toArray();
  await touchPrepReadiness(eventId);

  return refreshed.map((item) => toActivitySummary(eventId, item));
}

export async function updateDesignStep(
  eventId: string,
  stepId: string,
  input: z.infer<typeof designStepUpdateSchema>,
): Promise<DesignStepSummary> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(stepId)) {
    throw new Error("Paso inválido.");
  }
  const database = await getDatabase();
  const result = await database
    .collection<DesignStepDocument>("designSteps")
    .findOneAndUpdate(
      { _id: new ObjectId(stepId), eventId: new ObjectId(eventId) },
      {
        $set: {
          name: input.name,
          description: input.description,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  if (!result) throw new Error("El paso no existe.");
  await touchPrepReadiness(eventId);

  return toDesignStepSummary(eventId, result);
}

export async function deleteDesignStep(
  eventId: string,
  stepId: string,
): Promise<{ deletedActivityId: string | null }> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(stepId)) {
    throw new Error("Paso inválido.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const collection = database.collection<DesignStepDocument>("designSteps");
  const current = await collection.findOne({
    _id: new ObjectId(stepId),
    eventId: eventObjectId,
  });
  if (!current) throw new Error("El paso no existe.");

  const siblingCount = await collection.countDocuments({
    eventId: eventObjectId,
    activityId: current.activityId,
  });

  // Unidad de diseño = W-B-A-P. Si era el único paso, se elimina toda la actividad.
  if (siblingCount <= 1) {
    const activityId = current.activityId.toHexString();
    await deleteActivity(eventId, activityId);
    return { deletedActivityId: activityId };
  }

  const result = await collection.deleteOne({
    _id: new ObjectId(stepId),
    eventId: eventObjectId,
  });
  if (!result.deletedCount) throw new Error("El paso no existe.");
  await touchPrepReadiness(eventId);

  return { deletedActivityId: null };
}

export async function moveDesignStep(
  eventId: string,
  stepId: string,
  direction: "up" | "down",
): Promise<DesignStepSummary[]> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(stepId)) {
    throw new Error("Paso inválido.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const collection = database.collection<DesignStepDocument>("designSteps");
  const current = await collection.findOne({
    _id: new ObjectId(stepId),
    eventId: eventObjectId,
  });
  if (!current) throw new Error("El paso no existe.");

  const siblings = await collection
    .find({ eventId: eventObjectId, activityId: current.activityId })
    .sort({ order: 1, createdAt: 1 })
    .toArray();
  const index = siblings.findIndex((item) => item._id!.equals(current._id!));
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) {
    return siblings.map((item) => toDesignStepSummary(eventId, item));
  }

  const neighbor = siblings[swapIndex]!;
  const now = new Date();
  await Promise.all([
    collection.updateOne(
      { _id: current._id },
      { $set: { order: neighbor.order, updatedAt: now } },
    ),
    collection.updateOne(
      { _id: neighbor._id },
      { $set: { order: current.order, updatedAt: now } },
    ),
  ]);

  const refreshed = await collection
    .find({ eventId: eventObjectId, activityId: current.activityId })
    .sort({ order: 1, createdAt: 1 })
    .toArray();
  return refreshed.map((item) => toDesignStepSummary(eventId, item));
}

async function loadDesignedPairRefs(
  eventId: string,
): Promise<Array<{ workstreamId: string; blockId: string }>> {
  if (!ObjectId.isValid(eventId)) return [];
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const activities = await database
    .collection<ActivityDocument>("activities")
    .find(
      { eventId: eventObjectId, blockId: { $exists: true } },
      { projection: { workstreamId: 1, blockId: 1 } },
    )
    .toArray();

  const seen = new Set<string>();
  const pairs: Array<{ workstreamId: string; blockId: string }> = [];
  for (const activity of activities) {
    const workstreamId = activity.workstreamId.toHexString();
    const blockId = activity.blockId.toHexString();
    const key = `${workstreamId}:${blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ workstreamId, blockId });
  }
  await touchPrepReadiness(eventId);

  return pairs;
}

async function assertGateGraphValid(
  eventId: string,
  draft: {
    id: string | null;
    name: string;
    opensTargets: Array<{ workstreamId: string; blockId: string | null }>;
    closesAfterTargets: Array<{ workstreamId: string; blockId: string | null }>;
  },
) {
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const [existing, designedPairs] = await Promise.all([
    database
      .collection<GateDocument>("gates")
      .find({ eventId: eventObjectId })
      .toArray(),
    loadDesignedPairRefs(eventId),
  ]);

  const result = validateGateGraph({
    gates: existing.map((gate) => ({
      id: gate._id!.toHexString(),
      name: gate.name,
      opensTargets: (gate.opensTargets ?? []).map((target) => ({
        workstreamId: target.workstreamId.toHexString(),
        blockId: target.blockId ? target.blockId.toHexString() : null,
      })),
      closesAfterTargets: (gate.closesAfterTargets ?? []).map((target) => ({
        workstreamId: target.workstreamId.toHexString(),
        blockId: target.blockId ? target.blockId.toHexString() : null,
      })),
    })),
    draft,
    designedPairs,
  });
  if (!result.ok) throw new Error(result.message);
}

export async function createGate(
  eventId: string,
  input: z.infer<typeof gateInputSchema>,
  actorId: string,
): Promise<GateSummary> {
  if (!ObjectId.isValid(eventId)) throw new Error("Evento inválido.");
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const event = await database
    .collection<EventDocument>("events")
    .findOne({ _id: eventObjectId }, { projection: { _id: 1 } });
  if (!event) throw new Error("El evento no existe.");

  await assertGateGraphValid(eventId, {
    id: null,
    name: input.name,
    opensTargets: input.opensTargets,
    closesAfterTargets: input.closesAfterTargets,
  });

  const opensTargets = await resolveGateTargets(eventId, input.opensTargets);
  const closesAfterTargets = await resolveGateTargets(
    eventId,
    input.closesAfterTargets,
  );
  const collection = database.collection<GateDocument>("gates");
  const duplicate = await collection.findOne({
    eventId: eventObjectId,
    name: input.name,
  });
  if (duplicate) throw new Error("Ya existe un gate con ese nombre.");

  const last = await collection
    .find({ eventId: eventObjectId })
    .sort({ order: -1 })
    .limit(1)
    .next();
  const now = new Date();
  const document: GateDocument = {
    eventId: eventObjectId,
    name: input.name,
    description: input.description,
    order: (last?.order ?? 0) + 1,
    opensTargets,
    plannedOpenAt: input.plannedOpenAt ? new Date(input.plannedOpenAt) : null,
    approvalRoles: input.approvalRoles,
    closesAfterTargets,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(document);
  await touchPrepReadiness(eventId);

  return toGateSummary(eventId, { ...document, _id: result.insertedId });
}

export async function updateGate(
  eventId: string,
  gateId: string,
  input: z.infer<typeof gateInputSchema>,
): Promise<GateSummary> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(gateId)) {
    throw new Error("Gate inválido.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);

  await assertGateGraphValid(eventId, {
    id: gateId,
    name: input.name,
    opensTargets: input.opensTargets,
    closesAfterTargets: input.closesAfterTargets,
  });

  const opensTargets = await resolveGateTargets(eventId, input.opensTargets);
  const closesAfterTargets = await resolveGateTargets(
    eventId,
    input.closesAfterTargets,
  );
  const collection = database.collection<GateDocument>("gates");
  const duplicate = await collection.findOne({
    eventId: eventObjectId,
    name: input.name,
    _id: { $ne: new ObjectId(gateId) },
  });
  if (duplicate) throw new Error("Ya existe un gate con ese nombre.");

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(gateId), eventId: eventObjectId },
    {
      $set: {
        name: input.name,
        description: input.description,
        opensTargets,
        plannedOpenAt: input.plannedOpenAt
          ? new Date(input.plannedOpenAt)
          : null,
        approvalRoles: input.approvalRoles,
        closesAfterTargets,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("El gate no existe.");
  await touchPrepReadiness(eventId);

  return toGateSummary(eventId, result);
}

export async function deleteGate(
  eventId: string,
  gateId: string,
): Promise<void> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(gateId)) {
    throw new Error("Gate inválido.");
  }
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const id = new ObjectId(gateId);
  const result = await database.collection<GateDocument>("gates").deleteOne({
    _id: id,
    eventId: eventObjectId,
  });
  if (!result.deletedCount) throw new Error("El gate no existe.");

  await database.collection<DesignStepDocument>("designSteps").updateMany(
    { eventId: eventObjectId, producesGateId: id },
    { $set: { producesGateId: null, updatedAt: new Date() } },
  );
  await database.collection<DesignStepDocument>("designSteps").updateMany(
    { eventId: eventObjectId, requiresGateIds: id },
    { $pull: { requiresGateIds: id }, $set: { updatedAt: new Date() } },
  );
  await touchPrepReadiness(eventId);
}

export async function updateStepPlanning(
  eventId: string,
  stepId: string,
  input: z.infer<typeof stepPlanningInputSchema>,
): Promise<DesignStepSummary> {
  if (!ObjectId.isValid(eventId) || !ObjectId.isValid(stepId)) {
    throw new Error("Paso inválido.");
  }
  if (input.dependencyStepIds.includes(stepId)) {
    throw new Error("Un paso no puede depender de sí mismo.");
  }
  if (
    input.producesGateId &&
    input.requiresGateIds.includes(input.producesGateId)
  ) {
    throw new Error("Un paso no puede producir y requerir el mismo gate.");
  }

  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const dependencyIds = input.dependencyStepIds.map((id) => new ObjectId(id));
  const requireGateIds = input.requiresGateIds.map((id) => new ObjectId(id));
  const produceGateId = input.producesGateId
    ? new ObjectId(input.producesGateId)
    : null;

  const gateIds = [
    ...new Set([
      ...input.requiresGateIds,
      ...(input.producesGateId ? [input.producesGateId] : []),
    ]),
  ];
  if (gateIds.length) {
    const gateCount = await database.collection<GateDocument>("gates").countDocuments({
      eventId: eventObjectId,
      _id: { $in: gateIds.map((id) => new ObjectId(id)) },
    });
    if (gateCount !== gateIds.length) {
      throw new Error("Un gate no pertenece a este evento.");
    }
  }

  const steps = await database
    .collection<DesignStepDocument>("designSteps")
    .find(
      { eventId: eventObjectId, blockId: { $exists: true } },
      {
        projection: {
          _id: 1,
          dependencyStepIds: 1,
          producesGateId: 1,
          requiresGateIds: 1,
        },
      },
    )
    .toArray();
  const dependencyCount = steps.filter((step) =>
    dependencyIds.some((id) => id.equals(step._id)),
  ).length;
  if (dependencyCount !== dependencyIds.length) {
    throw new Error("Una dependencia no pertenece a este evento.");
  }

  const producerByGate = new Map<string, string>();
  for (const step of steps) {
    if (!step.producesGateId) continue;
    const gateKey = step.producesGateId.toHexString();
    if (step._id!.toHexString() === stepId) continue;
    producerByGate.set(gateKey, step._id!.toHexString());
  }
  if (input.producesGateId) {
    const other = producerByGate.get(input.producesGateId);
    if (other) {
      throw new Error("Ese gate ya lo produce otro paso.");
    }
    producerByGate.set(input.producesGateId, stepId);
  }

  const graph = new Map(
    steps.map((step) => [
      step._id!.toHexString(),
      (step.dependencyStepIds ?? []).map((id) => id.toHexString()),
    ]),
  );
  graph.set(stepId, input.dependencyStepIds);

  // Edges vía gates: productor → consumidores que requieren el gate.
  for (const step of steps) {
    const id = step._id!.toHexString();
    const required =
      id === stepId
        ? input.requiresGateIds
        : (step.requiresGateIds ?? []).map((gateId) => gateId.toHexString());
    for (const gateId of required) {
      const producerId = producerByGate.get(gateId);
      if (!producerId || producerId === id) continue;
      const list = graph.get(id) ?? [];
      if (!list.includes(producerId)) list.push(producerId);
      graph.set(id, list);
    }
  }

  if (hasDependencyCycle(graph)) {
    throw new Error("La dependencia o el gate crea un ciclo en el plan.");
  }

  if (produceGateId) {
    await database.collection<DesignStepDocument>("designSteps").updateMany(
      {
        eventId: eventObjectId,
        producesGateId: produceGateId,
        _id: { $ne: new ObjectId(stepId) },
      },
      { $set: { producesGateId: null, updatedAt: new Date() } },
    );
  }

  const result = await database
    .collection<DesignStepDocument>("designSteps")
    .findOneAndUpdate(
      { _id: new ObjectId(stepId), eventId: eventObjectId },
      {
        $set: {
          plannedStartAt: input.plannedStartAt
            ? new Date(input.plannedStartAt)
            : null,
          estimatedDurationMinutes: input.estimatedDurationMinutes,
          dependencyStepIds: dependencyIds,
          approvalRoles: input.approvalRoles,
          producesGateId: produceGateId,
          requiresGateIds: requireGateIds,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  if (!result) throw new Error("El paso no existe.");
  return toDesignStepSummary(eventId, result);
}

function hasDependencyCycle(graph: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const dependencyId of graph.get(nodeId) ?? []) {
      if (visit(dependencyId)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  return [...graph.keys()].some(visit);
}
