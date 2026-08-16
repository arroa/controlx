import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";

import { getEventDesign } from "@/lib/admin-data";
import { approvalRoleSchema, type ApprovalRole } from "@/domain/controlx";
import {
  deleteExecutionEvidenceBlobs,
  EVIDENCE_MAX_PER_STEP,
  isBlobConfigured,
  uploadEvidenceBlob,
} from "@/lib/evidence-blob";
import { assertCanCreateExecution } from "@/lib/event-readiness";
import { computeRuntimePlannedStarts } from "@/lib/execution-schedule";
import { unmetRequiredGates, requiredGateIdsForStep } from "@/lib/gate-runtime";
import {
  actionNeedsOccurredAt,
  runtimeStepActionSchema,
  stepIsOverdue,
  unmetStepDependencies,
  type EvidenceMeta,
  type ExecutionDetail,
  type GateApprovalSummary,
  type RuntimeStepAction,
  type RuntimeStepStatus,
  type RuntimeStepSummary,
  type StepAct,
  type StepComment,
  type StepIteration,
} from "@/lib/execution-types";
import { getDatabase } from "@/lib/mongodb";

export { assertCanCreateExecution } from "@/lib/event-readiness";
export type { ExecutionDetail, RuntimeStepSummary } from "@/lib/execution-types";

type ExecutionDoc = {
  _id?: ObjectId;
  eventId: ObjectId;
  organizationId: ObjectId;
  name: string;
  type: "SIMULACRO" | "REAL";
  timezone: string;
  anchorStartAt?: Date | null;
  anchorDayKey?: string | null;
  iteration?: number;
  status: ExecutionDetail["status"];
  gateApprovals?: Array<{
    gateId: ObjectId;
    role: ApprovalRole;
    actorId: string;
    actorLabel: string;
    approvedAt: Date;
  }>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type RuntimeStepDoc = {
  _id?: ObjectId;
  eventInstanceId: ObjectId;
  eventId: ObjectId;
  designStepId: ObjectId;
  workstreamId: ObjectId;
  workstreamName: string;
  blockId: ObjectId;
  blockName: string;
  activityId: ObjectId;
  activityName: string;
  name: string;
  description: string;
  longDescription?: string;
  evidenceRequired?: boolean;
  order: number;
  plannedStartAt: Date | null;
  estimatedDurationMinutes: number | null;
  dependencyStepIds: ObjectId[];
  executorActorId: ObjectId | null;
  executorName: string | null;
  approverActorIds: ObjectId[];
  status: RuntimeStepStatus;
  forced: boolean;
  actualStartedAt?: Date | null;
  actualEndedAt?: Date | null;
  iterations?: StepIteration[];
  comments: StepComment[];
  evidence: EvidenceMeta[];
  createdAt: Date;
  updatedAt: Date;
};

export const stepTransitionSchema = z.object({
  action: runtimeStepActionSchema,
  comment: z.string().trim().max(4000).optional(),
  /** Hora real del acto (inicio, rearranque o cierre). ISO. */
  occurredAt: z.string().datetime().optional(),
  /** Evidencias subidas en este acto (pathnames ya en el paso). */
  evidencePathnames: z.array(z.string().min(1)).max(8).optional(),
});

export const approveExecutionGateSchema = z.object({
  role: approvalRoleSchema,
});

const SCHEDULE_MUTABLE_STATUSES = new Set<RuntimeStepStatus>([
  "PLANIFICADO",
  "RECHAZADO",
]);

function toStepSummary(
  doc: RuntimeStepDoc,
  designMeta?: {
    producesGateId: string | null;
    requiresGateIds: string[];
    evidenceRequired?: boolean;
  },
): RuntimeStepSummary {
  const plannedStartAt = doc.plannedStartAt?.toISOString() ?? null;
  return {
    id: doc._id!.toHexString(),
    executionId: doc.eventInstanceId.toHexString(),
    eventId: doc.eventId.toHexString(),
    designStepId: doc.designStepId.toHexString(),
    workstreamId: doc.workstreamId.toHexString(),
    workstreamName: doc.workstreamName,
    blockId: doc.blockId.toHexString(),
    blockName: doc.blockName,
    activityId: doc.activityId.toHexString(),
    activityName: doc.activityName,
    name: doc.name,
    description: doc.description,
    longDescription: doc.longDescription ?? "",
    evidenceRequired:
      doc.evidenceRequired === true || designMeta?.evidenceRequired === true,
    order: doc.order,
    plannedStartAt,
    estimatedDurationMinutes: doc.estimatedDurationMinutes,
    dependencyStepIds: doc.dependencyStepIds.map((id) => id.toHexString()),
    producesGateId: designMeta?.producesGateId ?? null,
    requiresGateIds: designMeta?.requiresGateIds ?? [],
    executorActorId: doc.executorActorId?.toHexString() ?? null,
    executorName: doc.executorName,
    approverActorIds: doc.approverActorIds.map((id) => id.toHexString()),
    status: doc.status,
    forced: doc.forced,
    overdue: stepIsOverdue({ status: doc.status, plannedStartAt }),
    actualStartedAt: doc.actualStartedAt?.toISOString() ?? null,
    actualEndedAt: doc.actualEndedAt?.toISOString() ?? null,
    iterations: doc.iterations ?? [],
    comments: doc.comments ?? [],
    evidence: doc.evidence ?? [],
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Alinea plannedOpenAt de gates al ancla de la instancia (mismo delta que los pasos). */
function shiftGatesToAnchor(input: {
  gates: Array<{
    id: string;
    name: string;
    order: number;
    plannedOpenAt: string | null;
    opensTargets: Array<{
      workstreamId: string;
      blockId: string | null;
      stepId?: string | null;
    }>;
    closesAfterTargets: Array<{
      workstreamId: string;
      blockId: string | null;
      stepId?: string | null;
    }>;
    approvalRoles: Array<ApprovalRole>;
  }>;
  designDayDStartAt: string | null;
  instanceAnchorStartAt: Date | null;
}) {
  const { gates, designDayDStartAt, instanceAnchorStartAt } = input;
  if (!designDayDStartAt || !instanceAnchorStartAt) {
    return gates.map((gate) => ({
      id: gate.id,
      name: gate.name,
      order: gate.order,
      plannedOpenAt: gate.plannedOpenAt,
      opensTargets: gate.opensTargets,
      closesAfterTargets: gate.closesAfterTargets,
      approvalRoles: gate.approvalRoles,
    }));
  }
  const delta =
    instanceAnchorStartAt.getTime() - new Date(designDayDStartAt).getTime();
  return gates.map((gate) => ({
    id: gate.id,
    name: gate.name,
    order: gate.order,
    plannedOpenAt: gate.plannedOpenAt
      ? new Date(new Date(gate.plannedOpenAt).getTime() + delta).toISOString()
      : null,
    opensTargets: gate.opensTargets,
    closesAfterTargets: gate.closesAfterTargets,
    approvalRoles: gate.approvalRoles,
  }));
}

function toGateApprovalSummary(doc: {
  gateId: ObjectId;
  role: ApprovalRole;
  actorId: string;
  actorLabel: string;
  approvedAt: Date;
}): GateApprovalSummary {
  return {
    gateId: doc.gateId.toHexString(),
    role: doc.role,
    actorId: doc.actorId,
    actorLabel: doc.actorLabel,
    approvedAt: doc.approvedAt.toISOString(),
  };
}

function requireComment(
  action: RuntimeStepAction,
  comment: string | undefined,
) {
  // Fail/omit/simulate: comentario opcional por ahora (adjuntos también).
  const needs = new Set<RuntimeStepAction>(["reject", "force_success"]);
  if (needs.has(action) && !comment?.trim()) {
    throw new Error("Este cambio de estado requiere un comentario.");
  }
}

const SUCCESS_CLOSE_ACTIONS = new Set<RuntimeStepAction>([
  "complete_success",
]);

function requireEvidenceIfNeeded(input: {
  action: RuntimeStepAction;
  evidenceRequired: boolean;
  evidenceCount: number;
}) {
  if (!input.evidenceRequired) return;
  if (!SUCCESS_CLOSE_ACTIONS.has(input.action)) return;
  if (input.evidenceCount < 1) {
    throw new Error(
      "Este paso exige evidencia para marcarlo como Exitoso. Adjuntá al menos un archivo.",
    );
  }
}

function nextStatus(input: {
  action: RuntimeStepAction;
  current: RuntimeStepStatus;
  executionType: "SIMULACRO" | "REAL";
  hasApprovers: boolean;
}): RuntimeStepStatus {
  const { action, current, executionType, hasApprovers } = input;

  if (action === "omit" || action === "simulate") {
    if (executionType === "REAL") {
      throw new Error(
        "Omitido y Simulado solo aplican en simulacro.",
      );
    }
  }

  switch (action) {
    case "start":
      if (current !== "PLANIFICADO" && current !== "RECHAZADO") {
        throw new Error("Solo se puede iniciar desde Planificado o Rechazado.");
      }
      return "INICIADO";
    case "complete_success":
      if (current !== "INICIADO") {
        throw new Error("Solo un paso Iniciado puede marcarse exitoso.");
      }
      return hasApprovers ? "PENDIENTE_APROBACION" : "EXITOSO";
    case "complete_fail":
      if (current !== "INICIADO") {
        throw new Error("Solo un paso Iniciado puede marcarse fallido.");
      }
      return "FALLIDO";
    case "omit":
      if (current !== "PLANIFICADO" && current !== "INICIADO") {
        throw new Error("No se puede omitir en este estado.");
      }
      return "OMITIDO";
    case "simulate":
      if (current !== "PLANIFICADO" && current !== "INICIADO") {
        throw new Error("No se puede simular en este estado.");
      }
      return "SIMULADO";
    case "approve":
      if (current !== "PENDIENTE_APROBACION") {
        throw new Error("No hay aprobación pendiente.");
      }
      return "APROBADO";
    case "reject":
      if (current !== "PENDIENTE_APROBACION") {
        throw new Error("No hay aprobación pendiente.");
      }
      return "RECHAZADO";
    case "force_success":
      return hasApprovers ? "APROBADO" : "EXITOSO";
    case "restart":
      if (current !== "FALLIDO") {
        throw new Error("Solo se puede rearrancar un paso Fallido.");
      }
      return "INICIADO";
    default:
      throw new Error("Acción no soportada.");
  }
}

function commentKind(
  action: RuntimeStepAction,
): StepComment["kind"] {
  switch (action) {
    case "start":
      return "start";
    case "complete_success":
      return "success";
    case "complete_fail":
      return "fail";
    case "omit":
      return "omit";
    case "simulate":
      return "simulate";
    case "approve":
      return "approve";
    case "reject":
      return "reject";
    case "force_success":
      return "force";
    case "restart":
      return "restart";
    default:
      return "note";
  }
}

/**
 * Recalcula plannedStartAt de pasos aún no arrancados usando fines reales
 * (actualEndedAt) + anclas/deps del diseño.
 */
async function recomputeScheduleFromActuals(input: {
  executionId: ObjectId;
  eventId: string;
  anchorStartAt: Date;
  designDayDStartAt: string | null;
}): Promise<number> {
  const design = await getEventDesign(input.eventId);
  if (!design) return 0;

  const database = await getDatabase();
  const stepsCollection =
    database.collection<RuntimeStepDoc>("executionSteps");
  const existing = await stepsCollection
    .find({ eventInstanceId: input.executionId })
    .toArray();
  if (!existing.length) return 0;

  const runtimeByDesignId = new Map(
    existing.map((doc) => [doc.designStepId.toHexString(), doc]),
  );

  const designRows = design.pairs.flatMap((pair) =>
    pair.activities.flatMap((activity) =>
      activity.steps.map((step) => ({ pair, activity, step })),
    ),
  );

  const plannedByDesignId = computeRuntimePlannedStarts({
    steps: designRows.map(({ step }) => {
      const runtime = runtimeByDesignId.get(step.id);
      return {
        id: step.id,
        plannedStartAt: step.plannedStartAt,
        estimatedDurationMinutes:
          runtime?.estimatedDurationMinutes ?? step.estimatedDurationMinutes,
        dependencyStepIds: step.dependencyStepIds,
        producesGateId: step.producesGateId,
        requiresGateIds: step.requiresGateIds,
        workstreamId: step.workstreamId,
        blockId: step.blockId,
        actualStartedAt: runtime?.actualStartedAt?.toISOString() ?? null,
        actualEndedAt: runtime?.actualEndedAt?.toISOString() ?? null,
      };
    }),
    gates: design.gates.map((gate) => ({
      id: gate.id,
      plannedOpenAt: gate.plannedOpenAt,
      opensTargets: gate.opensTargets,
      closesAfterTargets: gate.closesAfterTargets,
    })),
    designDayDStartAt: input.designDayDStartAt,
    instanceAnchorStartAt: input.anchorStartAt,
  });

  const now = new Date();
  const ops: Array<{
    updateOne: {
      filter: { _id: ObjectId };
      update: { $set: { plannedStartAt: Date; updatedAt: Date } };
    };
  }> = [];

  for (const { step } of designRows) {
    const runtime = runtimeByDesignId.get(step.id);
    if (!runtime?._id) continue;
    if (!SCHEDULE_MUTABLE_STATUSES.has(runtime.status)) continue;
    const nextStart = plannedByDesignId.get(step.id) ?? input.anchorStartAt;
    if (sameInstant(runtime.plannedStartAt, nextStart)) continue;
    ops.push({
      updateOne: {
        filter: { _id: runtime._id },
        update: { $set: { plannedStartAt: nextStart, updatedAt: now } },
      },
    });
  }

  if (!ops.length) return 0;
  await stepsCollection.bulkWrite(ops);
  return ops.length;
}

export async function materializeExecutionSteps(input: {
  executionId: ObjectId;
  eventId: string;
  actorId: string;
  anchorStartAt: Date;
  designDayDStartAt: string | null;
}) {
  const design = await getEventDesign(input.eventId);
  if (!design) throw new Error("No hay diseño para materializar.");

  const database = await getDatabase();
  const stepsCollection =
    database.collection<RuntimeStepDoc>("executionSteps");
  const now = new Date();

  // Map designStepId → runtime step ObjectId (pre-allocate)
  const designRows = design.pairs.flatMap((pair) =>
    pair.activities.flatMap((activity) =>
      activity.steps.map((step) => ({
        pair,
        activity,
        step,
        runtimeId: new ObjectId(),
      })),
    ),
  );

  const designToRuntime = new Map(
    designRows.map((row) => [row.step.id, row.runtimeId]),
  );

  const plannedByDesignId = computeRuntimePlannedStarts({
    steps: designRows.map(({ step }) => ({
      id: step.id,
      plannedStartAt: step.plannedStartAt,
      estimatedDurationMinutes: step.estimatedDurationMinutes,
      dependencyStepIds: step.dependencyStepIds,
      producesGateId: step.producesGateId,
      requiresGateIds: step.requiresGateIds,
      workstreamId: step.workstreamId,
      blockId: step.blockId,
    })),
    gates: design.gates.map((gate) => ({
      id: gate.id,
      plannedOpenAt: gate.plannedOpenAt,
      opensTargets: gate.opensTargets,
      closesAfterTargets: gate.closesAfterTargets,
    })),
    designDayDStartAt: input.designDayDStartAt,
    instanceAnchorStartAt: input.anchorStartAt,
  });

  const docs: RuntimeStepDoc[] = designRows.map(
    ({ pair, activity, step, runtimeId }) => ({
      _id: runtimeId,
      eventInstanceId: input.executionId,
      eventId: new ObjectId(input.eventId),
      designStepId: new ObjectId(step.id),
      workstreamId: new ObjectId(pair.workstream.id),
      workstreamName: pair.workstream.name,
      blockId: new ObjectId(pair.block.id),
      blockName: pair.block.name,
      activityId: new ObjectId(activity.id),
      activityName: activity.name,
      name: step.name,
      description: step.description,
      longDescription: step.longDescription ?? "",
      evidenceRequired: step.evidenceRequired === true,
      order: step.order,
      plannedStartAt: plannedByDesignId.get(step.id) ?? input.anchorStartAt,
      estimatedDurationMinutes: step.estimatedDurationMinutes,
      dependencyStepIds: step.dependencyStepIds
        .map((id) => designToRuntime.get(id))
        .filter((id): id is ObjectId => Boolean(id)),
      executorActorId: step.executorActorId
        ? new ObjectId(step.executorActorId)
        : null,
      executorName: null,
      approverActorIds: (step.approverActorIds ?? []).map(
        (id) => new ObjectId(id),
      ),
      status: "PLANIFICADO",
      forced: false,
      iterations: [],
      comments: [],
      evidence: [],
      createdAt: now,
      updatedAt: now,
    }),
  );

  // Resolve executor names from memberships
  const actorIds = [
    ...new Set(
      docs
        .map((doc) => doc.executorActorId?.toHexString())
        .filter((id): id is string => Boolean(id)),
    ),
  ].map((id) => new ObjectId(id));
  if (actorIds.length) {
    const actors = await database
      .collection<{ _id: ObjectId; name?: string; email: string }>(
        "eventMemberships",
      )
      .find({ _id: { $in: actorIds } })
      .toArray();
    const nameById = new Map(
      actors.map((actor) => [
        actor._id.toHexString(),
        actor.name?.trim() || actor.email,
      ]),
    );
    for (const doc of docs) {
      if (doc.executorActorId) {
        doc.executorName =
          nameById.get(doc.executorActorId.toHexString()) ?? null;
      }
    }
  }

  if (docs.length) {
    await stepsCollection.insertMany(docs);
  }

  await database.collection("timelineEntries").insertOne({
    eventInstanceId: input.executionId,
    occurredAt: now,
    actorClerkUserId: input.actorId,
    action: "EXECUTION_MATERIALIZED",
    entityType: "execution",
    entityId: input.executionId.toHexString(),
    description: `Se materializaron ${docs.length} paso(s) en Planificado.`,
  });

  return docs.length;
}

function sameObjectIdList(a: ObjectId[], b: ObjectId[]) {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map((id) => id.toHexString()));
  return b.every((id) => keys.has(id.toHexString()));
}

function sameInstant(a: Date | null | undefined, b: Date | null | undefined) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.getTime() === b.getTime();
}

async function resolveExecutorNames(
  docs: Array<{ executorActorId: ObjectId | null; executorName: string | null }>,
) {
  const actorIds = [
    ...new Set(
      docs
        .map((doc) => doc.executorActorId?.toHexString())
        .filter((id): id is string => Boolean(id)),
    ),
  ].map((id) => new ObjectId(id));
  if (!actorIds.length) return;

  const database = await getDatabase();
  const actors = await database
    .collection<{ _id: ObjectId; name?: string; email: string }>(
      "eventMemberships",
    )
    .find({ _id: { $in: actorIds } })
    .toArray();
  const nameById = new Map(
    actors.map((actor) => [
      actor._id.toHexString(),
      actor.name?.trim() || actor.email,
    ]),
  );
  for (const doc of docs) {
    if (doc.executorActorId) {
      doc.executorName =
        nameById.get(doc.executorActorId.toHexString()) ?? null;
    }
  }
}

/**
 * Sincroniza una ejecución abierta con el diseño actual:
 * - añade pasos nuevos del plan;
 * - si refreshPlan, actualiza duración/deps/texto/horario/ejecutor/aprobadores
 *   y evidenceRequired de los ya materializados (en caliente si la ejecución está abierta).
 * No toca status, comentarios ni evidencias.
 */
export async function syncExecutionPlanFromDesign(input: {
  executionId: ObjectId;
  eventId: string;
  anchorStartAt: Date;
  designDayDStartAt: string | null;
  /** Releer plan del diseño sobre pasos existentes. */
  refreshPlan: boolean;
}): Promise<{ added: number; refreshed: number }> {
  const design = await getEventDesign(input.eventId);
  if (!design) return { added: 0, refreshed: 0 };

  const database = await getDatabase();
  const stepsCollection =
    database.collection<RuntimeStepDoc>("executionSteps");
  const existing = await stepsCollection
    .find({ eventInstanceId: input.executionId })
    .toArray();
  const existingByDesignId = new Map(
    existing.map((doc) => [doc.designStepId.toHexString(), doc]),
  );

  const designRows = design.pairs.flatMap((pair) =>
    pair.activities.flatMap((activity) =>
      activity.steps.map((step) => ({ pair, activity, step })),
    ),
  );
  const missing = designRows.filter(
    (row) => !existingByDesignId.has(row.step.id),
  );

  const designToRuntime = new Map(
    [...existingByDesignId.entries()].map(([designId, doc]) => [
      designId,
      doc._id!,
    ]),
  );
  for (const row of missing) {
    designToRuntime.set(row.step.id, new ObjectId());
  }

  const plannedByDesignId = computeRuntimePlannedStarts({
    steps: designRows.map(({ step }) => ({
      id: step.id,
      plannedStartAt: step.plannedStartAt,
      estimatedDurationMinutes: step.estimatedDurationMinutes,
      dependencyStepIds: step.dependencyStepIds,
      producesGateId: step.producesGateId,
      requiresGateIds: step.requiresGateIds,
      workstreamId: step.workstreamId,
      blockId: step.blockId,
    })),
    gates: design.gates.map((gate) => ({
      id: gate.id,
      plannedOpenAt: gate.plannedOpenAt,
      opensTargets: gate.opensTargets,
      closesAfterTargets: gate.closesAfterTargets,
    })),
    designDayDStartAt: input.designDayDStartAt,
    instanceAnchorStartAt: input.anchorStartAt,
  });

  const now = new Date();
  let added = 0;
  let refreshed = 0;

  if (missing.length) {
    const docs: RuntimeStepDoc[] = missing.map(({ pair, activity, step }) => ({
      _id: designToRuntime.get(step.id)!,
      eventInstanceId: input.executionId,
      eventId: new ObjectId(input.eventId),
      designStepId: new ObjectId(step.id),
      workstreamId: new ObjectId(pair.workstream.id),
      workstreamName: pair.workstream.name,
      blockId: new ObjectId(pair.block.id),
      blockName: pair.block.name,
      activityId: new ObjectId(activity.id),
      activityName: activity.name,
      name: step.name,
      description: step.description,
      longDescription: step.longDescription ?? "",
      evidenceRequired: step.evidenceRequired === true,
      order: step.order,
      plannedStartAt: plannedByDesignId.get(step.id) ?? input.anchorStartAt,
      estimatedDurationMinutes: step.estimatedDurationMinutes,
      dependencyStepIds: step.dependencyStepIds
        .map((id) => designToRuntime.get(id))
        .filter((id): id is ObjectId => Boolean(id)),
      executorActorId: step.executorActorId
        ? new ObjectId(step.executorActorId)
        : null,
      executorName: null,
      approverActorIds: (step.approverActorIds ?? []).map(
        (id) => new ObjectId(id),
      ),
      status: "PLANIFICADO",
      forced: false,
      iterations: [],
      comments: [],
      evidence: [],
      createdAt: now,
      updatedAt: now,
    }));
    await resolveExecutorNames(docs);
    await stepsCollection.insertMany(docs);
    added = docs.length;
  }

  if (input.refreshPlan) {
    const updates: Array<{
      _id: ObjectId;
      $set: Partial<RuntimeStepDoc>;
    }> = [];

    for (const { pair, activity, step } of designRows) {
      const current = existingByDesignId.get(step.id);
      if (!current?._id) continue;

      const dependencyStepIds = step.dependencyStepIds
        .map((id) => designToRuntime.get(id))
        .filter((id): id is ObjectId => Boolean(id));
      const plannedStartAt =
        plannedByDesignId.get(step.id) ?? input.anchorStartAt;
      const executorActorId = step.executorActorId
        ? new ObjectId(step.executorActorId)
        : null;
      const approverActorIds = (step.approverActorIds ?? []).map(
        (id) => new ObjectId(id),
      );
      const longDescription = step.longDescription ?? "";
      const evidenceRequired = step.evidenceRequired === true;

      const planChanged =
        current.name !== step.name ||
        current.description !== step.description ||
        (current.longDescription ?? "") !== longDescription ||
        Boolean(current.evidenceRequired) !== evidenceRequired ||
        current.order !== step.order ||
        current.estimatedDurationMinutes !== step.estimatedDurationMinutes ||
        !sameObjectIdList(current.dependencyStepIds ?? [], dependencyStepIds) ||
        !sameInstant(current.plannedStartAt, plannedStartAt) ||
        (current.executorActorId?.toHexString() ?? null) !==
          (executorActorId?.toHexString() ?? null) ||
        !sameObjectIdList(current.approverActorIds ?? [], approverActorIds) ||
        current.workstreamName !== pair.workstream.name ||
        current.blockName !== pair.block.name ||
        current.activityName !== activity.name;

      if (!planChanged) continue;

      updates.push({
        _id: current._id,
        $set: {
          workstreamName: pair.workstream.name,
          blockName: pair.block.name,
          activityName: activity.name,
          name: step.name,
          description: step.description,
          longDescription,
          evidenceRequired,
          order: step.order,
          plannedStartAt,
          estimatedDurationMinutes: step.estimatedDurationMinutes,
          dependencyStepIds,
          executorActorId,
          approverActorIds,
          updatedAt: now,
        },
      });
    }

    if (updates.length) {
      const withNames = updates.map((item) => ({
        executorActorId: item.$set.executorActorId ?? null,
        executorName: null as string | null,
        _id: item._id,
        $set: item.$set,
      }));
      await resolveExecutorNames(withNames);
      await stepsCollection.bulkWrite(
        withNames.map((item) => ({
          updateOne: {
            filter: { _id: item._id },
            update: {
              $set: {
                ...item.$set,
                executorName: item.executorName,
              },
            },
          },
        })),
      );
      refreshed = updates.length;
    }
  }

  // Tras refrescar desde diseño, reaplicar horarios con fines reales ya cargados.
  const rescheduled = await recomputeScheduleFromActuals({
    executionId: input.executionId,
    eventId: input.eventId,
    anchorStartAt: input.anchorStartAt,
    designDayDStartAt: input.designDayDStartAt,
  });

  if (added || refreshed || rescheduled) {
    const parts: string[] = [];
    if (added) parts.push(`${added} nuevo(s)`);
    if (refreshed) parts.push(`${refreshed} actualizado(s) desde el diseño`);
    if (rescheduled) {
      parts.push(`${rescheduled} replanificado(s) con tiempos reales`);
    }
    await database.collection("timelineEntries").insertOne({
      eventInstanceId: input.executionId,
      occurredAt: now,
      actorClerkUserId: "system",
      action: refreshed
        ? "EXECUTION_PLAN_REFRESHED"
        : "EXECUTION_STEPS_SYNCED",
      entityType: "execution",
      entityId: input.executionId.toHexString(),
      description: `Plan de ejecución: ${parts.join(", ")}.`,
    });
  }

  return { added, refreshed };
}

/** @deprecated Usar syncExecutionPlanFromDesign. */
export async function syncMissingExecutionSteps(input: {
  executionId: ObjectId;
  eventId: string;
  anchorStartAt: Date;
  designDayDStartAt: string | null;
}): Promise<number> {
  const result = await syncExecutionPlanFromDesign({
    ...input,
    refreshPlan: false,
  });
  return result.added;
}

/**
 * Tras cambiar Roles (ejecutor/aprobador) en el diseño, propaga en caliente
 * a todas las ejecuciones abiertas del evento.
 */
export async function refreshOpenExecutionsFromDesign(
  eventId: string,
): Promise<number> {
  if (!ObjectId.isValid(eventId)) return 0;
  const database = await getDatabase();
  const design = await getEventDesign(eventId);
  const designDayDStartAt = design?.event.dayDStartAt ?? null;
  const open = await database
    .collection<ExecutionDoc>("eventInstances")
    .find({
      eventId: new ObjectId(eventId),
      status: { $in: ["PREPARADO", "EN_EJECUCION", "PAUSADO"] },
      anchorStartAt: { $ne: null },
    })
    .toArray();

  let touched = 0;
  for (const execution of open) {
    if (!execution._id || !execution.anchorStartAt) continue;
    const result = await syncExecutionPlanFromDesign({
      executionId: execution._id,
      eventId,
      anchorStartAt: execution.anchorStartAt,
      designDayDStartAt,
      refreshPlan: true,
    });
    if (result.added || result.refreshed) touched += 1;
  }
  return touched;
}

export async function getExecutionDetail(
  executionId: string,
  options?: { syncPlan?: boolean },
): Promise<ExecutionDetail | null> {
  if (!ObjectId.isValid(executionId)) return null;
  const database = await getDatabase();
  const id = new ObjectId(executionId);
  const execution = await database
    .collection<ExecutionDoc>("eventInstances")
    .findOne({ _id: id });
  if (!execution) return null;

  const design = await getEventDesign(execution.eventId.toHexString());
  const designDayDStartAt = design?.event.dayDStartAt ?? null;

  const openStatuses = new Set(["PREPARADO", "EN_EJECUCION", "PAUSADO"]);
  const shouldSync = options?.syncPlan !== false;
  if (
    shouldSync &&
    openStatuses.has(execution.status) &&
    execution.anchorStartAt
  ) {
    // Siempre en caliente: simulacro o real, mientras esté abierta.
    await syncExecutionPlanFromDesign({
      executionId: id,
      eventId: execution.eventId.toHexString(),
      anchorStartAt: execution.anchorStartAt,
      designDayDStartAt,
      refreshPlan: true,
    });
  }

  const steps = await database
    .collection<RuntimeStepDoc>("executionSteps")
    .find({ eventInstanceId: id })
    .sort({ workstreamName: 1, order: 1, name: 1 })
    .toArray();

  const gateMetaByDesignStep = new Map<
    string,
    { producesGateId: string | null; requiresGateIds: string[] }
  >();
  if (design) {
    for (const pair of design.pairs) {
      for (const activity of pair.activities) {
        for (const step of activity.steps) {
          gateMetaByDesignStep.set(step.id, {
            producesGateId: step.producesGateId ?? null,
            requiresGateIds: step.requiresGateIds ?? [],
            evidenceRequired: step.evidenceRequired === true,
          });
        }
      }
    }
  }

  const gateApprovals = (execution.gateApprovals ?? []).map(toGateApprovalSummary);

  const shiftedGates = shiftGatesToAnchor({
    gates: design?.gates ?? [],
    designDayDStartAt,
    instanceAnchorStartAt: execution.anchorStartAt ?? null,
  });

  const stepSummaries = steps.map((doc) =>
    toStepSummary(
      doc,
      gateMetaByDesignStep.get(doc.designStepId.toHexString()),
    ),
  );

  const now = new Date();
  const gates = shiftedGates.map((gate) => {
    const approvals = gateApprovals.filter((item) => item.gateId === gate.id);
    const unmet = unmetRequiredGates({
      requiresGateIds: [gate.id],
      gates: shiftedGates,
      steps: stepSummaries,
      approvals: gateApprovals,
      now,
    });
    const blockers = unmet[0]?.blockers ?? [];
    return {
      ...gate,
      approvals,
      open: blockers.length === 0,
      blockers,
    };
  });

  return {
    id: execution._id!.toHexString(),
    eventId: execution.eventId.toHexString(),
    organizationId: execution.organizationId.toHexString(),
    name: execution.name,
    type: execution.type,
    timezone: execution.timezone,
    anchorStartAt: execution.anchorStartAt?.toISOString() ?? null,
    iteration: execution.iteration ?? 1,
    status: execution.status,
    createdAt: execution.createdAt.toISOString(),
    steps: stepSummaries,
    gates,
    gateApprovals,
    blobConfigured: isBlobConfigured(),
  };
}

export async function startExecution(
  executionId: string,
  actorId: string,
): Promise<ExecutionDetail> {
  const database = await getDatabase();
  const id = new ObjectId(executionId);
  const now = new Date();
  const result = await database.collection<ExecutionDoc>("eventInstances").findOneAndUpdate(
    {
      _id: id,
      status: { $in: ["PREPARADO", "BORRADOR", "PAUSADO"] },
    },
    { $set: { status: "EN_EJECUCION", updatedAt: now } },
    { returnDocument: "after" },
  );
  if (!result) {
    throw new Error("La ejecución no se puede iniciar en este estado.");
  }
  await database.collection("timelineEntries").insertOne({
    eventInstanceId: id,
    occurredAt: now,
    actorClerkUserId: actorId,
    action: "EXECUTION_STARTED",
    entityType: "execution",
    entityId: executionId,
    description: "Ejecución iniciada.",
  });
  const detail = await getExecutionDetail(executionId);
  if (!detail) throw new Error("Ejecución no encontrada.");
  return detail;
}

export async function transitionRuntimeStep(input: {
  executionId: string;
  stepId: string;
  action: RuntimeStepAction;
  comment?: string;
  occurredAt?: string;
  evidencePathnames?: string[];
  actorId: string;
  actorLabel: string;
  /** Si actúa por contingencia sin reemplazar al asignado. */
  onBehalfOfLabel?: string | null;
}): Promise<{ step: RuntimeStepSummary; steps: RuntimeStepSummary[] }> {
  requireComment(input.action, input.comment);
  if (!ObjectId.isValid(input.executionId) || !ObjectId.isValid(input.stepId)) {
    throw new Error("Identificadores inválidos.");
  }

  const database = await getDatabase();
  const executionId = new ObjectId(input.executionId);
  const stepId = new ObjectId(input.stepId);
  const execution = await database
    .collection<ExecutionDoc>("eventInstances")
    .findOne({ _id: executionId });
  if (!execution) throw new Error("Ejecución no encontrada.");
  if (execution.status === "FINALIZADO" || execution.status === "CANCELADO") {
    throw new Error("La ejecución ya está cerrada.");
  }

  const steps = database.collection<RuntimeStepDoc>("executionSteps");
  const step = await steps.findOne({
    _id: stepId,
    eventInstanceId: executionId,
  });
  if (!step) throw new Error("Paso no encontrado.");

  let evidenceRequired = step.evidenceRequired === true;
  if (!evidenceRequired) {
    const designFlag = await database
      .collection<{ evidenceRequired?: boolean }>("designSteps")
      .findOne(
        { _id: step.designStepId },
        { projection: { evidenceRequired: 1 } },
      );
    evidenceRequired = designFlag?.evidenceRequired === true;
  }
  const evidenceNames = new Set(
    (step.evidence ?? []).map((item) => item.pathname),
  );
  for (const pathname of input.evidencePathnames ?? []) {
    evidenceNames.add(pathname);
  }
  requireEvidenceIfNeeded({
    action: input.action,
    evidenceRequired,
    evidenceCount: evidenceNames.size,
  });

  if (
    (input.action === "omit" || input.action === "simulate") &&
    execution.type === "REAL"
  ) {
    throw new Error("Omitido y Simulado solo aplican en simulacro.");
  }

  if (input.action === "force_success" && step.status !== "FALLIDO") {
    throw new Error("Solo se puede forzar un paso Fallido.");
  }

  const now = new Date();
  let occurredAt = now;
  if (actionNeedsOccurredAt(input.action)) {
    const isStartTime =
      input.action === "start" || input.action === "restart";
    if (!input.occurredAt) {
      throw new Error(
        isStartTime
          ? "Indica la hora en que arrancó la actividad."
          : "Indica la hora en que terminó la actividad.",
      );
    }
    occurredAt = new Date(input.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error(
        isStartTime ? "Hora de inicio inválida." : "Hora de término inválida.",
      );
    }
    if (execution.anchorStartAt && occurredAt < execution.anchorStartAt) {
      throw new Error(
        isStartTime
          ? "La hora de inicio no puede ser anterior al arranque de la ejecución."
          : "La hora de término no puede ser anterior al arranque de la ejecución.",
      );
    }
    if (
      !isStartTime &&
      step.actualStartedAt &&
      occurredAt < step.actualStartedAt
    ) {
      throw new Error(
        "La hora de término no puede ser anterior al inicio del paso.",
      );
    }
    if (input.action === "restart") {
      const prevEnd = step.actualEndedAt ?? step.actualStartedAt;
      if (prevEnd && occurredAt < prevEnd) {
        throw new Error(
          "La hora de rearranque no puede ser anterior al fin de la iteración anterior.",
        );
      }
    }
  }

  if (input.action === "start") {
    const siblings = await steps
      .find({ eventInstanceId: executionId })
      .toArray();

    const design = await getEventDesign(execution.eventId.toHexString());
    const gateMetaByDesignStep = new Map<
      string,
      { producesGateId: string | null; requiresGateIds: string[] }
    >();
    if (design) {
      for (const pair of design.pairs) {
        for (const activity of pair.activities) {
          for (const designStep of activity.steps) {
            gateMetaByDesignStep.set(designStep.id, {
              producesGateId: designStep.producesGateId ?? null,
              requiresGateIds: designStep.requiresGateIds ?? [],
              evidenceRequired: designStep.evidenceRequired === true,
            });
          }
        }
      }
    }

    const summaries = siblings.map((doc) =>
      toStepSummary(
        doc,
        gateMetaByDesignStep.get(doc.designStepId.toHexString()),
      ),
    );
    const blockers = unmetStepDependencies(
      {
        dependencyStepIds: step.dependencyStepIds.map((id) =>
          id.toHexString(),
        ),
      },
      summaries,
    );
    if (blockers.length) {
      const failed = blockers.filter((item) => item.reason === "failed");
      const pending = blockers.filter((item) => item.reason === "pending");
      const parts: string[] = [];
      if (pending.length) {
        parts.push(
          `pendiente(s): ${pending.map((item) => item.name).join(", ")}`,
        );
      }
      if (failed.length) {
        parts.push(
          `fallido(s) — Event Admin puede Forzar, o rearrancar el fallido: ${failed.map((item) => item.name).join(", ")}`,
        );
      }
      throw new Error(
        `No se puede iniciar: dependencias sin cierre OK (${parts.join("; ")}).`,
      );
    }

    const stepGateMeta = gateMetaByDesignStep.get(
      step.designStepId.toHexString(),
    );
    const shiftedGates = shiftGatesToAnchor({
      gates: design?.gates ?? [],
      designDayDStartAt: design?.event.dayDStartAt ?? null,
      instanceAnchorStartAt: execution.anchorStartAt ?? null,
    });
    const requiresGateIds = requiredGateIdsForStep(
      {
        id: step._id!.toHexString(),
        designStepId: step.designStepId.toHexString(),
        workstreamId: step.workstreamId.toHexString(),
        blockId: step.blockId.toHexString(),
        requiresGateIds: stepGateMeta?.requiresGateIds ?? [],
      },
      shiftedGates,
    );
    if (requiresGateIds.length) {
      const gateApprovals = (execution.gateApprovals ?? []).map(
        toGateApprovalSummary,
      );
      const unmetGates = unmetRequiredGates({
        requiresGateIds,
        gates: shiftedGates,
        steps: summaries.map((item) => ({
          ...item,
          designStepId: item.designStepId,
        })),
        approvals: gateApprovals,
        now: occurredAt,
      });
      if (unmetGates.length) {
        const parts = unmetGates.map((item) => {
          const details = item.blockers.map((b) => b.detail).join(", ");
          return `${item.gateName} (${details})`;
        });
        throw new Error(
          `No se puede iniciar: gates pendientes — ${parts.join("; ")}.`,
        );
      }
    }
  }

  const status = nextStatus({
    action: input.action,
    current: step.status,
    executionType: execution.type,
    hasApprovers: step.approverActorIds.length > 0,
  });

  const actEvidence = pickActEvidence(
    step.evidence ?? [],
    input.evidencePathnames,
  );
  const actBase: StepAct = {
    at: occurredAt.toISOString(),
    comment: input.comment?.trim() || undefined,
    evidence: actEvidence,
    by: { id: input.actorId, label: input.actorLabel },
    recordedAt: now.toISOString(),
  };

  const iterations = [...(step.iterations ?? [])];
  if (input.action === "start") {
    if (iterations.length) {
      throw new Error("El paso ya tiene iteraciones; usa Rearrancar.");
    }
    iterations.push({
      n: 1,
      status: "EN_CURSO",
      start: actBase,
    });
  } else if (input.action === "restart") {
    const last = iterations[iterations.length - 1];
    if (!last || last.status !== "FALLIDA") {
      throw new Error("Solo se puede rearrancar tras un fallo.");
    }
    iterations.push({
      n: last.n + 1,
      status: "EN_CURSO",
      start: actBase,
    });
  } else if (
    input.action === "complete_success" ||
    input.action === "complete_fail" ||
    input.action === "force_success"
  ) {
    const last = iterations[iterations.length - 1];
    const outcome =
      input.action === "complete_success"
        ? ("success" as const)
        : input.action === "complete_fail"
          ? ("fail" as const)
          : ("force" as const);
    const iterStatus =
      outcome === "success"
        ? ("EXITOSA" as const)
        : outcome === "fail"
          ? ("FALLIDA" as const)
          : ("FORZADA_OK" as const);

    if (input.action === "force_success") {
      if (!last || last.status !== "FALLIDA") {
        throw new Error("Solo se puede forzar una iteración fallida.");
      }
      last.end = { ...actBase, outcome };
      last.status = iterStatus;
    } else {
      if (!last || last.status !== "EN_CURSO" || last.end) {
        throw new Error("No hay una iteración en curso para cerrar.");
      }
      last.end = { ...actBase, outcome };
      last.status = iterStatus;
    }
  }

  const comments = [...(step.comments ?? [])];
  const text =
    input.comment?.trim() ||
    (input.action === "start"
      ? "Paso iniciado."
      : input.action === "restart"
        ? "Paso rearrancado tras fallo."
        : input.action === "complete_success"
          ? "Marcado como exitoso."
          : input.action === "complete_fail"
            ? "Marcado como fallido."
            : input.action === "force_success"
              ? "Forzado a OK."
              : undefined);
  if (text) {
    comments.push({
      id: new ObjectId().toHexString(),
      text,
      authorId: input.actorId,
      authorLabel: input.actorLabel,
      createdAt: now.toISOString(),
      occurredAt: actionNeedsOccurredAt(input.action)
        ? occurredAt.toISOString()
        : undefined,
      kind: commentKind(input.action),
    });
  }

  const forced = input.action === "force_success" ? true : step.forced;
  const $set: Partial<RuntimeStepDoc> = {
    status,
    forced,
    comments,
    iterations,
    updatedAt: now,
  };

  if (input.action === "start" || input.action === "restart") {
    $set.actualStartedAt = occurredAt;
    $set.actualEndedAt = null;
    if (input.action === "restart") $set.forced = false;
  } else if (actionNeedsOccurredAt(input.action)) {
    $set.actualEndedAt = occurredAt;
    if (!step.actualStartedAt) {
      $set.actualStartedAt = step.plannedStartAt ?? occurredAt;
    }
  }

  const updated = await steps.findOneAndUpdate(
    { _id: stepId },
    { $set },
    { returnDocument: "after" },
  );
  if (!updated) throw new Error("No fue posible actualizar el paso.");

  if (execution.status === "PREPARADO" || execution.status === "BORRADOR") {
    await database.collection<ExecutionDoc>("eventInstances").updateOne(
      { _id: executionId },
      { $set: { status: "EN_EJECUCION", updatedAt: now } },
    );
  }

  if (execution.anchorStartAt && actionNeedsOccurredAt(input.action)) {
    const design = await getEventDesign(execution.eventId.toHexString());
    await recomputeScheduleFromActuals({
      executionId,
      eventId: execution.eventId.toHexString(),
      anchorStartAt: execution.anchorStartAt,
      designDayDStartAt: design?.event.dayDStartAt ?? null,
    });
  }

  await database.collection("timelineEntries").insertOne({
    eventInstanceId: executionId,
    occurredAt: actionNeedsOccurredAt(input.action) ? occurredAt : now,
    actorClerkUserId: input.actorId,
    action: `STEP_${input.action.toUpperCase()}`,
    entityType: "step",
    entityId: input.stepId,
    previousState: { status: step.status },
    nextState: {
      status,
      forced: Boolean($set.forced ?? forced),
      actualEndedAt: updated.actualEndedAt?.toISOString() ?? null,
    },
    description: input.onBehalfOfLabel
      ? `${step.name}: ${step.status} → ${status} (contingencia en nombre de ${input.onBehalfOfLabel})`
      : `${step.name}: ${step.status} → ${status}`,
  });

  // Sin sync: ya replanificamos con tiempos reales en esta transición.
  const detail = await getExecutionDetail(input.executionId, {
    syncPlan: false,
  });
  if (!detail) throw new Error("Ejecución no encontrada tras actualizar.");
  const nextStep =
    detail.steps.find((item) => item.id === input.stepId) ??
    toStepSummary(updated);
  return { step: nextStep, steps: detail.steps };
}

function pickActEvidence(
  all: EvidenceMeta[],
  pathnames: string[] | undefined,
): EvidenceMeta[] {
  if (!pathnames?.length) return [];
  const wanted = new Set(pathnames);
  return all.filter((item) => wanted.has(item.pathname));
}

export async function addStepComment(input: {
  executionId: string;
  stepId: string;
  text: string;
  actorId: string;
  actorLabel: string;
}): Promise<RuntimeStepSummary> {
  const text = input.text.trim();
  if (text.length < 1) throw new Error("El comentario no puede estar vacío.");
  const database = await getDatabase();
  const stepId = new ObjectId(input.stepId);
  const executionId = new ObjectId(input.executionId);
  const now = new Date();
  const comment: StepComment = {
    id: new ObjectId().toHexString(),
    text,
    authorId: input.actorId,
    authorLabel: input.actorLabel,
    createdAt: now.toISOString(),
    kind: "note",
  };
  const updated = await database
    .collection<RuntimeStepDoc>("executionSteps")
    .findOneAndUpdate(
      { _id: stepId, eventInstanceId: executionId },
      {
        $push: { comments: comment },
        $set: { updatedAt: now },
      },
      { returnDocument: "after" },
    );
  if (!updated) throw new Error("Paso no encontrado.");
  return toStepSummary(updated);
}

export async function addStepEvidence(input: {
  executionId: string;
  stepId: string;
  file: File;
  caption: string | undefined;
  actorId: string;
  actorLabel: string;
}): Promise<RuntimeStepSummary> {
  const database = await getDatabase();
  const stepId = new ObjectId(input.stepId);
  const executionId = new ObjectId(input.executionId);
  const step = await database.collection<RuntimeStepDoc>("executionSteps").findOne({
    _id: stepId,
    eventInstanceId: executionId,
  });
  if (!step) throw new Error("Paso no encontrado.");
  if ((step.evidence ?? []).length >= EVIDENCE_MAX_PER_STEP) {
    throw new Error(`Máximo ${EVIDENCE_MAX_PER_STEP} evidencias por paso.`);
  }

  const uploaded = await uploadEvidenceBlob({
    executionId: input.executionId,
    stepId: input.stepId,
    file: input.file,
    uploadedBy: input.actorId,
  });
  const evidence: EvidenceMeta = {
    ...uploaded,
    caption: input.caption?.trim() || undefined,
  };
  const now = new Date();
  const comment: StepComment = {
    id: new ObjectId().toHexString(),
    text: `Evidencia: ${input.file.name}${evidence.caption ? ` — ${evidence.caption}` : ""}`,
    authorId: input.actorId,
    authorLabel: input.actorLabel,
    createdAt: now.toISOString(),
    kind: "note",
  };

  const updated = await database
    .collection<RuntimeStepDoc>("executionSteps")
    .findOneAndUpdate(
      { _id: stepId },
      {
        $push: { evidence, comments: comment },
        $set: { updatedAt: now },
      },
      { returnDocument: "after" },
    );
  if (!updated) throw new Error("No fue posible guardar la evidencia.");
  return toStepSummary(updated);
}

export type DeletedExecutionSummary = {
  id: string;
  eventId: string;
  name: string;
  type: "SIMULACRO" | "REAL";
};

export async function getExecutionAccessContext(executionId: string): Promise<{
  eventId: string;
  name: string;
  type: "SIMULACRO" | "REAL";
} | null> {
  if (!ObjectId.isValid(executionId)) return null;
  const database = await getDatabase();
  const execution = await database
    .collection<ExecutionDoc>("eventInstances")
    .findOne(
      { _id: new ObjectId(executionId) },
      { projection: { eventId: 1, type: 1, name: 1 } },
    );
  if (!execution) return null;
  return {
    eventId: execution.eventId.toHexString(),
    name: execution.name,
    type: execution.type,
  };
}

/**
 * Elimina una ejecución y su runtime (pasos, timeline, blobs).
 * Por defecto solo SIMULACRO (protege REAL).
 */
export async function deleteExecution(
  executionId: string,
  options?: { allowReal?: boolean },
): Promise<DeletedExecutionSummary> {
  if (!ObjectId.isValid(executionId)) {
    throw new Error("Ejecución inválida.");
  }

  const database = await getDatabase();
  const id = new ObjectId(executionId);
  const execution = await database
    .collection<ExecutionDoc>("eventInstances")
    .findOne({ _id: id });
  if (!execution) throw new Error("La ejecución no existe.");

  if (execution.type === "REAL" && !options?.allowReal) {
    throw new Error(
      "No se pueden borrar ejecuciones REAL desde esta acción. Solo simulacros.",
    );
  }

  await Promise.all([
    database.collection("executionSteps").deleteMany({ eventInstanceId: id }),
    database.collection("timelineEntries").deleteMany({ eventInstanceId: id }),
  ]);

  const deleted = await database
    .collection<ExecutionDoc>("eventInstances")
    .deleteOne({ _id: id });
  if (!deleted.deletedCount) throw new Error("La ejecución no existe.");

  await deleteExecutionEvidenceBlobs(executionId);

  return {
    id: executionId,
    eventId: execution.eventId.toHexString(),
    name: execution.name,
    type: execution.type,
  };
}

/** Purge de todos los SIMULACRO de un evento. No toca REAL. */
export async function purgeEventSimulacros(eventId: string): Promise<{
  deletedCount: number;
  deleted: DeletedExecutionSummary[];
}> {
  if (!ObjectId.isValid(eventId)) {
    throw new Error("Evento inválido.");
  }

  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const simulacros = await database
    .collection<ExecutionDoc>("eventInstances")
    .find({ eventId: eventObjectId, type: "SIMULACRO" })
    .project({ _id: 1, name: 1, type: 1, eventId: 1 })
    .toArray();

  const deleted: DeletedExecutionSummary[] = [];
  for (const item of simulacros) {
    const id = item._id!.toHexString();
    const result = await deleteExecution(id);
    deleted.push(result);
  }

  return { deletedCount: deleted.length, deleted };
}

/** Registra la aprobación de un rol requerido por un gate en esta ejecución. */
export async function approveExecutionGate(input: {
  executionId: string;
  gateId: string;
  role: ApprovalRole;
  actorId: string;
  actorLabel: string;
}): Promise<ExecutionDetail> {
  if (
    !ObjectId.isValid(input.executionId) ||
    !ObjectId.isValid(input.gateId)
  ) {
    throw new Error("Identificadores inválidos.");
  }

  const database = await getDatabase();
  const executionId = new ObjectId(input.executionId);
  const gateId = new ObjectId(input.gateId);
  const execution = await database
    .collection<ExecutionDoc>("eventInstances")
    .findOne({ _id: executionId });
  if (!execution) throw new Error("Ejecución no encontrada.");
  if (execution.status === "FINALIZADO" || execution.status === "CANCELADO") {
    throw new Error("La ejecución ya está cerrada.");
  }

  const design = await getEventDesign(execution.eventId.toHexString());
  const gate = design?.gates.find((item) => item.id === input.gateId);
  if (!gate) throw new Error("Gate no encontrado en el diseño.");
  if (!(gate.approvalRoles ?? []).includes(input.role)) {
    throw new Error("Este gate no requiere esa aprobación.");
  }

  const already = (execution.gateApprovals ?? []).some(
    (item) =>
      item.gateId.equals(gateId) && item.role === input.role,
  );
  if (already) {
    const detail = await getExecutionDetail(input.executionId, {
      syncPlan: false,
    });
    if (!detail) throw new Error("Ejecución no encontrada.");
    return detail;
  }

  const approvedAt = new Date();
  await database.collection<ExecutionDoc>("eventInstances").updateOne(
    { _id: executionId },
    {
      $push: {
        gateApprovals: {
          gateId,
          role: input.role,
          actorId: input.actorId,
          actorLabel: input.actorLabel,
          approvedAt,
        },
      },
      $set: { updatedAt: approvedAt },
    },
  );

  await database.collection("timelineEntries").insertOne({
    eventInstanceId: executionId,
    occurredAt: approvedAt,
    actorClerkUserId: input.actorId,
    action: "GATE_APPROVED",
    entityType: "gate",
    entityId: input.gateId,
    description: `Gate “${gate.name}” aprobado como ${input.role} por ${input.actorLabel}.`,
  });

  const detail = await getExecutionDetail(input.executionId, {
    syncPlan: false,
  });
  if (!detail) throw new Error("Ejecución no encontrada.");
  return detail;
}

