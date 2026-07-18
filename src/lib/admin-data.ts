import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";

import { getDatabase, isMongoConfigured } from "@/lib/mongodb";
import { isSupportedTimezone } from "@/lib/timezones";
import { approvalRoleSchema } from "@/domain/controlx";

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
  status: "BORRADOR" | "PREPARADO" | "EN_EJECUCION" | "FINALIZADO";
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
  status: "BORRADOR" | "ACTIVO";
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
  status: "BORRADOR" | "PREPARADO" | "EN_EJECUCION" | "FINALIZADO";
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
  role: "EVENT_ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt?: Date;
  deactivatedBy?: string;
  deactivatedAt?: Date;
};

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
      status: event.status,
      executionCount: executions.length,
      createdAt: event.createdAt.toISOString(),
    } satisfies EventSummary,
    admins: admins.map((admin) => ({
      id: admin._id!.toHexString(),
      email: admin.email,
      role: admin.role,
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

  const [workstreams, blocks, activities, steps] = await Promise.all([
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
  ]);

  const stepsByActivity = new Map<string, DesignStepSummary[]>();
  for (const step of steps) {
    const activityId = step.activityId.toHexString();
    const list = stepsByActivity.get(activityId) ?? [];
    list.push({
      id: step._id!.toHexString(),
      eventId: step.eventId.toHexString(),
      workstreamId: step.workstreamId.toHexString(),
      blockId: step.blockId.toHexString(),
      activityId,
      name: step.name,
      description: step.description,
      order: step.order,
      plannedStartAt: step.plannedStartAt?.toISOString() ?? null,
      estimatedDurationMinutes: step.estimatedDurationMinutes ?? null,
      dependencyStepIds:
        step.dependencyStepIds?.map((id) => id.toHexString()) ?? [],
      approvalRoles: step.approvalRoles ?? [],
      createdAt: step.createdAt.toISOString(),
    });
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
    status: "BORRADOR",
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
    status: document.status,
    executionCount: 0,
    createdAt: now.toISOString(),
  };
}

export async function createExecution(
  input: z.infer<typeof executionInputSchema>,
  actorId: string,
): Promise<ExecutionSummary> {
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
    status: "BORRADOR",
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await database
    .collection<ExecutionDocument>("eventInstances")
    .insertOne(document);

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

  const now = new Date();
  const collection =
    database.collection<OrganizationMembershipDocument>(
      "organizationMemberships",
    );
  await collection.updateOne(
    { organizationId: id, email, role: "ORG_ADMIN" },
    {
      $set: { status: "ACTIVE" },
      $setOnInsert: { createdBy: actorId, createdAt: now },
    },
    { upsert: true },
  );
  const membership = await collection.findOne({
    organizationId: id,
    email,
    role: "ORG_ADMIN",
  });

  return {
    id: membership!._id!.toHexString(),
    email,
    role: "ORG_ADMIN",
    createdAt: membership!.createdAt.toISOString(),
  };
}

export async function addEventAdmin(
  eventId: string,
  email: string,
  actorId: string,
): Promise<AdminSummary> {
  const database = await getDatabase();
  const id = new ObjectId(eventId);
  const event = await database
    .collection<EventDocument>("events")
    .findOne({ _id: id }, { projection: { organizationId: 1 } });
  if (!event) throw new Error("El evento no existe.");

  const now = new Date();
  const collection =
    database.collection<EventMembershipDocument>("eventMemberships");
  await collection.updateOne(
    { eventId: id, email, role: "EVENT_ADMIN" },
    {
      $set: { status: "ACTIVE" },
      $setOnInsert: {
        organizationId: event.organizationId,
        createdBy: actorId,
        createdAt: now,
      },
    },
    { upsert: true },
  );
  const membership = await collection.findOne({
    eventId: id,
    email,
    role: "EVENT_ADMIN",
  });

  return {
    id: membership!._id!.toHexString(),
    email,
    role: "EVENT_ADMIN",
    createdAt: membership!.createdAt.toISOString(),
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
          email,
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
  const result = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .findOneAndUpdate(
      {
        _id: new ObjectId(adminId),
        eventId: new ObjectId(eventId),
        role: "EVENT_ADMIN",
        status: "ACTIVE",
      },
      {
        $set: {
          email,
          updatedBy: actorId,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  if (!result) throw new Error("El EventAdmin no existe.");

  return {
    id: result._id!.toHexString(),
    email: result.email,
    role: result.role,
    createdAt: result.createdAt.toISOString(),
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
  const result = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .updateOne(
      {
        _id: new ObjectId(adminId),
        eventId: new ObjectId(eventId),
        role: "EVENT_ADMIN",
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
  if (!result.matchedCount) throw new Error("El EventAdmin no existe.");
}

export async function hasAssignedAccess(email: string): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  const database = await getDatabase();
  const [organizationAdmin, eventAdmin] = await Promise.all([
    database
      .collection<OrganizationMembershipDocument>("organizationMemberships")
      .findOne({ email, status: "ACTIVE" }, { projection: { _id: 1 } }),
    database
      .collection<EventMembershipDocument>("eventMemberships")
      .findOne({ email, status: "ACTIVE" }, { projection: { _id: 1 } }),
  ]);
  return Boolean(organizationAdmin || eventAdmin);
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

  const eventAdmin = await database
    .collection<EventMembershipDocument>("eventMemberships")
    .findOne({ email, status: "ACTIVE" }, { sort: { createdAt: 1 } });
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

  const [eventAdmin, organizationAdmin] = await Promise.all([
    database
      .collection<EventMembershipDocument>("eventMemberships")
      .findOne({ eventId: id, email, status: "ACTIVE" }, { projection: { _id: 1 } }),
    database
      .collection<OrganizationMembershipDocument>("organizationMemberships")
      .findOne(
        { organizationId: event.organizationId, email, status: "ACTIVE" },
        { projection: { _id: 1 } },
      ),
  ]);
  return Boolean(eventAdmin || organizationAdmin);
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
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await collection.insertOne(document);

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
    createdAt: step.createdAt.toISOString(),
  };
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

  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const dependencyIds = input.dependencyStepIds.map((id) => new ObjectId(id));
  const steps = await database
    .collection<DesignStepDocument>("designSteps")
    .find(
      { eventId: eventObjectId, blockId: { $exists: true } },
      { projection: { _id: 1, dependencyStepIds: 1 } },
    )
    .toArray();
  const dependencyCount = steps.filter((step) =>
    dependencyIds.some((id) => id.equals(step._id)),
  ).length;
  if (dependencyCount !== dependencyIds.length) {
    throw new Error("Una dependencia no pertenece a este evento.");
  }

  const graph = new Map(
    steps.map((step) => [
      step._id!.toHexString(),
      (step.dependencyStepIds ?? []).map((id) => id.toHexString()),
    ]),
  );
  graph.set(stepId, input.dependencyStepIds);
  if (hasDependencyCycle(graph)) {
    throw new Error("La dependencia crea un ciclo en el plan.");
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

  function visit(stepId: string): boolean {
    if (visiting.has(stepId)) return true;
    if (visited.has(stepId)) return false;
    visiting.add(stepId);
    for (const dependencyId of graph.get(stepId) ?? []) {
      if (visit(dependencyId)) return true;
    }
    visiting.delete(stepId);
    visited.add(stepId);
    return false;
  }

  return [...graph.keys()].some(visit);
}
