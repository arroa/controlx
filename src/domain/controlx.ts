import { z } from "zod";

export const eventTypeSchema = z.enum(["SIMULACRO", "REAL"]);
export const eventStatusSchema = z.enum([
  "BORRADOR",
  "PREPARADO",
  "EN_EJECUCION",
  "PAUSADO",
  "FINALIZADO",
  "CANCELADO",
]);
export const stepStatusSchema = z.enum([
  "PENDIENTE",
  "DISPONIBLE",
  "EN_EJECUCION",
  "FALLIDO",
  "FINALIZADO",
  "OMITIDO",
  "SIMULADO",
  "CANCELADO",
]);
export const executionModeSchema = z.enum(["EJECUTAR", "SIMULAR", "OMITIR"]);
export const iterationResultSchema = z.enum([
  "EXITOSO",
  "FALLIDO",
  "CON_OBSERVACIONES",
]);
export const roleSchema = z.enum([
  "SUPER_ADMIN",
  "ORG_ADMIN",
  "EVENT_ADMIN",
  "WORKSTREAM_ADMIN",
  "EXECUTOR",
  "APPROVER",
  "STEERCO",
]);

/** Roles que pueden declararse como aprobadores de un paso en planificación. */
export const approvalRoleSchema = z.enum([
  "EVENT_ADMIN",
  "WORKSTREAM_ADMIN",
  "APPROVER",
  "STEERCO",
]);

export const APPROVAL_ROLE_OPTIONS = [
  { value: "EVENT_ADMIN" as const, label: "Event Admin" },
  { value: "WORKSTREAM_ADMIN" as const, label: "Workstream Admin" },
  { value: "APPROVER" as const, label: "Approver" },
  { value: "STEERCO" as const, label: "SteerCo" },
];

export const eventMembershipSchema = z.object({
  eventInstanceId: z.string().min(1),
  clerkUserId: z.string().min(1),
  roles: z.array(roleSchema).min(1),
  workstreamIds: z.array(z.string()).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const stepConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("STEP_RESULT"),
    sourceStepId: z.string().min(1),
    acceptedResults: z.array(iterationResultSchema).min(1),
  }),
  z.object({
    type: z.literal("MINIMUM_TIME"),
    availableAt: z.date(),
  }),
  z.object({
    type: z.literal("APPROVAL"),
    approvalRequirementId: z.string().min(1),
  }),
]);

export const iterationSchema = z.object({
  eventInstanceId: z.string().min(1),
  stepId: z.string().min(1),
  number: z.number().int().positive(),
  startedAt: z.date(),
  finishedAt: z.date().optional(),
  result: iterationResultSchema.optional(),
  executorClerkUserId: z.string().min(1),
  comments: z.string().max(4000).optional(),
  createdAt: z.date(),
});

export const timelineEntrySchema = z.object({
  eventInstanceId: z.string().min(1),
  occurredAt: z.date(),
  actorClerkUserId: z.string().min(1),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  previousState: z.record(z.string(), z.unknown()).optional(),
  nextState: z.record(z.string(), z.unknown()).optional(),
  description: z.string().min(1),
});

export type EventType = z.infer<typeof eventTypeSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type StepStatus = z.infer<typeof stepStatusSchema>;
export type ExecutionMode = z.infer<typeof executionModeSchema>;
export type IterationResult = z.infer<typeof iterationResultSchema>;
export type EventMembership = z.infer<typeof eventMembershipSchema>;
export type StepCondition = z.infer<typeof stepConditionSchema>;
export type Iteration = z.infer<typeof iterationSchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type ApprovalRole = z.infer<typeof approvalRoleSchema>;
export type Role = z.infer<typeof roleSchema>;

export const controlXIndexes = {
  organizations: [{ key: { slug: 1 }, unique: true }],
  events: [{ key: { organizationId: 1, createdAt: -1 } }],
  workstreams: [
    { key: { eventId: 1, order: 1 } },
    { key: { eventId: 1, name: 1 }, unique: true },
  ],
  blocks: [
    { key: { eventId: 1, order: 1 } },
    { key: { eventId: 1, name: 1 }, unique: true },
  ],
  activities: [
    { key: { eventId: 1, workstreamId: 1, blockId: 1, order: 1 } },
  ],
  designSteps: [
    { key: { eventId: 1, activityId: 1, order: 1 } },
    { key: { eventId: 1, plannedStartAt: 1 } },
  ],
  eventMemberships: [
    { key: { eventInstanceId: 1, clerkUserId: 1 }, unique: true },
    { key: { clerkUserId: 1, eventInstanceId: 1 } },
  ],
  eventInstances: [
    { key: { eventId: 1, createdAt: -1 } },
    { key: { organizationId: 1, type: 1, status: 1 } },
  ],
  steps: [
    { key: { eventInstanceId: 1, workstreamId: 1, status: 1 } },
    { key: { eventInstanceId: 1, plannedStartAt: 1 } },
  ],
  iterations: [
    { key: { stepId: 1, number: 1 }, unique: true },
    {
      key: { stepId: 1, isOpen: 1 },
      unique: true,
      partialFilterExpression: { isOpen: true },
    },
  ],
  timelineEntries: [
    { key: { eventInstanceId: 1, occurredAt: -1 } },
    { key: { eventInstanceId: 1, entityType: 1, entityId: 1 } },
  ],
} as const;
