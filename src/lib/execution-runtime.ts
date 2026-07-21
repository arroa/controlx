import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";

import { getEventDesign } from "@/lib/admin-data";
import {
  EVIDENCE_MAX_PER_STEP,
  uploadEvidenceBlob,
} from "@/lib/evidence-blob";
import { assertCanCreateExecution } from "@/lib/event-readiness";
import {
  runtimeStepActionSchema,
  stepIsOverdue,
  type EvidenceMeta,
  type ExecutionDetail,
  type RuntimeStepAction,
  type RuntimeStepStatus,
  type RuntimeStepSummary,
  type StepComment,
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
  status: ExecutionDetail["status"];
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
  order: number;
  plannedStartAt: Date | null;
  estimatedDurationMinutes: number | null;
  dependencyStepIds: ObjectId[];
  executorActorId: ObjectId | null;
  executorName: string | null;
  approverActorIds: ObjectId[];
  status: RuntimeStepStatus;
  forced: boolean;
  comments: StepComment[];
  evidence: EvidenceMeta[];
  createdAt: Date;
  updatedAt: Date;
};

export const stepTransitionSchema = z.object({
  action: runtimeStepActionSchema,
  comment: z.string().trim().max(4000).optional(),
});

function toStepSummary(doc: RuntimeStepDoc): RuntimeStepSummary {
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
    order: doc.order,
    plannedStartAt,
    estimatedDurationMinutes: doc.estimatedDurationMinutes,
    dependencyStepIds: doc.dependencyStepIds.map((id) => id.toHexString()),
    executorActorId: doc.executorActorId?.toHexString() ?? null,
    executorName: doc.executorName,
    approverActorIds: doc.approverActorIds.map((id) => id.toHexString()),
    status: doc.status,
    forced: doc.forced,
    overdue: stepIsOverdue({ status: doc.status, plannedStartAt }),
    comments: doc.comments ?? [],
    evidence: doc.evidence ?? [],
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function requireComment(
  action: RuntimeStepAction,
  comment: string | undefined,
) {
  const needs = new Set<RuntimeStepAction>([
    "complete_fail",
    "omit",
    "simulate",
    "reject",
    "force_success",
  ]);
  if (needs.has(action) && !comment?.trim()) {
    throw new Error("Este cambio de estado requiere un comentario.");
  }
}

function requireEvidenceForReal(input: {
  action: RuntimeStepAction;
  executionType: "SIMULACRO" | "REAL";
  evidenceCount: number;
}) {
  if (input.executionType !== "REAL") return;
  if (
    input.action === "complete_success" ||
    input.action === "complete_fail"
  ) {
    if (input.evidenceCount < 1) {
      throw new Error(
        "En ejecución real debes adjuntar al menos una evidencia antes de cerrar el paso.",
      );
    }
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
    default:
      return "note";
  }
}

export async function materializeExecutionSteps(input: {
  executionId: ObjectId;
  eventId: string;
  actorId: string;
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
      order: step.order,
      plannedStartAt: step.plannedStartAt
        ? new Date(step.plannedStartAt)
        : null,
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

export async function getExecutionDetail(
  executionId: string,
): Promise<ExecutionDetail | null> {
  if (!ObjectId.isValid(executionId)) return null;
  const database = await getDatabase();
  const id = new ObjectId(executionId);
  const execution = await database
    .collection<ExecutionDoc>("eventInstances")
    .findOne({ _id: id });
  if (!execution) return null;

  const steps = await database
    .collection<RuntimeStepDoc>("executionSteps")
    .find({ eventInstanceId: id })
    .sort({ workstreamName: 1, order: 1, name: 1 })
    .toArray();

  return {
    id: execution._id!.toHexString(),
    eventId: execution.eventId.toHexString(),
    organizationId: execution.organizationId.toHexString(),
    name: execution.name,
    type: execution.type,
    timezone: execution.timezone,
    status: execution.status,
    createdAt: execution.createdAt.toISOString(),
    steps: steps.map(toStepSummary),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
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
  actorId: string;
  actorLabel: string;
}): Promise<RuntimeStepSummary> {
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

  requireEvidenceForReal({
    action: input.action,
    executionType: execution.type,
    evidenceCount: (step.evidence ?? []).length,
  });

  if (
    (input.action === "omit" || input.action === "simulate") &&
    execution.type === "REAL"
  ) {
    throw new Error("Omitido y Simulado solo aplican en simulacro.");
  }

  const status = nextStatus({
    action: input.action,
    current: step.status,
    executionType: execution.type,
    hasApprovers: step.approverActorIds.length > 0,
  });

  const now = new Date();
  const comments = [...(step.comments ?? [])];
  if (input.comment?.trim() || input.action !== "start") {
    const text =
      input.comment?.trim() ||
      (input.action === "start" ? "Paso iniciado." : undefined);
    if (text) {
      comments.push({
        id: new ObjectId().toHexString(),
        text,
        authorId: input.actorId,
        authorLabel: input.actorLabel,
        createdAt: now.toISOString(),
        kind: commentKind(input.action),
      });
    }
  }

  const forced = input.action === "force_success" ? true : step.forced;
  const updated = await steps.findOneAndUpdate(
    { _id: stepId },
    {
      $set: {
        status,
        forced,
        comments,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new Error("No fue posible actualizar el paso.");

  if (execution.status === "PREPARADO" || execution.status === "BORRADOR") {
    await database.collection<ExecutionDoc>("eventInstances").updateOne(
      { _id: executionId },
      { $set: { status: "EN_EJECUCION", updatedAt: now } },
    );
  }

  await database.collection("timelineEntries").insertOne({
    eventInstanceId: executionId,
    occurredAt: now,
    actorClerkUserId: input.actorId,
    action: `STEP_${input.action.toUpperCase()}`,
    entityType: "step",
    entityId: input.stepId,
    previousState: { status: step.status },
    nextState: { status, forced },
    description: `${step.name}: ${step.status} → ${status}`,
  });

  return toStepSummary(updated);
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
