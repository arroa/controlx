import "server-only";

import { ObjectId } from "mongodb";

import {
  getEventDesign,
  getEventWorkspace,
  listEventActors,
} from "@/lib/admin-data";
import type { DesignExcelPhotoRow, DesignExcelRow } from "@/lib/design-excel";
import { parseDesignWorkbook } from "@/lib/design-excel";
import { markEventReadinessStale } from "@/lib/event-readiness";
import { deleteExecution } from "@/lib/execution-runtime";
import { getDatabase } from "@/lib/mongodb";

export type DesignBulkIssue = {
  row: number;
  message: string;
  level: "error" | "warn";
};

export type DesignBulkStatus = {
  stepCount: number;
  activityCount: number;
  gateCount: number;
  executionCount: number;
  canImport: boolean;
  archived: boolean;
};

function catalogKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findCycle(deps: Map<string, string[]>): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  function dfs(id: string): string[] | null {
    const current = state.get(id) ?? 0;
    if (current === 1) {
      const start = stack.indexOf(id);
      return [...stack.slice(Math.max(0, start)), id];
    }
    if (current === 2) return null;
    state.set(id, 1);
    stack.push(id);
    for (const next of deps.get(id) ?? []) {
      const cycle = dfs(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  }

  for (const id of deps.keys()) {
    const cycle = dfs(id);
    if (cycle) return cycle;
  }
  return null;
}

export async function getDesignBulkStatus(
  eventId: string,
): Promise<DesignBulkStatus | null> {
  if (!ObjectId.isValid(eventId)) return null;
  const workspace = await getEventWorkspace(eventId);
  if (!workspace) return null;
  const database = await getDatabase();
  const eventObjectId = new ObjectId(eventId);
  const [stepCount, activityCount, gateCount, executionCount] =
    await Promise.all([
      database.collection("designSteps").countDocuments({ eventId: eventObjectId }),
      database.collection("activities").countDocuments({ eventId: eventObjectId }),
      database.collection("gates").countDocuments({ eventId: eventObjectId }),
      database
        .collection("eventInstances")
        .countDocuments({ eventId: eventObjectId }),
    ]);
  return {
    stepCount,
    activityCount,
    gateCount,
    executionCount,
    canImport:
      workspace.event.status !== "ARCHIVED" &&
      stepCount + activityCount + gateCount + executionCount === 0,
    archived: workspace.event.status === "ARCHIVED",
  };
}

export async function getDesignExcelCatalog(eventId: string) {
  const [design, actors] = await Promise.all([
    getEventDesign(eventId),
    listEventActors(eventId),
  ]);
  if (!design) return null;
  return {
    eventName: design.event.name,
    archived: design.event.status === "ARCHIVED",
    workstreams: design.workstreams.map((item) => item.name),
    blocks: design.blocks.map((item) => item.name),
    executorEmails: actors
      .filter((actor) => actor.roles.includes("EXECUTOR"))
      .map((actor) => actor.email),
    approverEmails: actors
      .filter(
        (actor) =>
          actor.roles.includes("APPROVER") || actor.roles.includes("STEERCO"),
      )
      .map((actor) => actor.email),
  };
}

export async function buildDesignPhotoRows(
  eventId: string,
): Promise<DesignExcelPhotoRow[] | null> {
  const [design, actors] = await Promise.all([
    getEventDesign(eventId),
    listEventActors(eventId),
  ]);
  if (!design) return null;
  const emailById = new Map(actors.map((actor) => [actor.id, actor.email]));
  const excelIdByStepId = new Map<string, string>();
  let nextId = 1;
  const ordered: Array<{
    workstream: string;
    block: string;
    activity: string;
    step: {
      id: string;
      name: string;
      estimatedDurationMinutes: number | null;
      dependencyStepIds: string[];
      executorActorId: string | null;
      approverActorIds: string[];
    };
  }> = [];

  for (const pair of design.pairs) {
    for (const activity of pair.activities) {
      for (const step of activity.steps) {
        excelIdByStepId.set(step.id, String(nextId));
        nextId += 1;
        ordered.push({
          workstream: pair.workstream.name,
          block: pair.block.name,
          activity: activity.name,
          step,
        });
      }
    }
  }

  return ordered.map((item, index) => ({
    rowNumber: index + 4,
    excelId: excelIdByStepId.get(item.step.id) ?? String(index + 1),
    workstream: item.workstream,
    block: item.block,
    activity: item.activity,
    step: item.step.name,
    durationRaw: String(item.step.estimatedDurationMinutes ?? 30),
    depIds: item.step.dependencyStepIds
      .map((id) => excelIdByStepId.get(id))
      .filter((id): id is string => Boolean(id)),
    executorEmail: item.step.executorActorId
      ? (emailById.get(item.step.executorActorId) ?? "")
      : "",
    approverEmail: item.step.approverActorIds[0]
      ? (emailById.get(item.step.approverActorIds[0]) ?? "")
      : "",
    stepId: item.step.id,
  }));
}

type ResolvedRow = {
  rowNumber: number;
  excelId: string;
  workstreamId: string;
  blockId: string;
  activityName: string;
  stepName: string;
  duration: number;
  depExcelIds: string[];
  executorActorId: string;
  approverActorId: string | null;
};

export function validateDesignBulkRows(input: {
  rows: DesignExcelRow[];
  parseErrors: DesignBulkIssue[];
  workstreams: Array<{ id: string; name: string }>;
  blocks: Array<{ id: string; name: string }>;
  actors: Array<{
    id: string;
    email: string;
    roles: string[];
  }>;
}): { errors: DesignBulkIssue[]; warnings: DesignBulkIssue[]; resolved: ResolvedRow[] } {
  const errors: DesignBulkIssue[] = [...input.parseErrors];
  const warnings: DesignBulkIssue[] = [];
  const resolved: ResolvedRow[] = [];

  const wsByKey = new Map(
    input.workstreams.map((item) => [catalogKey(item.name), item]),
  );
  const blockByKey = new Map(
    input.blocks.map((item) => [catalogKey(item.name), item]),
  );
  const actorByEmail = new Map(
    input.actors.map((actor) => [actor.email.toLowerCase(), actor]),
  );
  const idsInFile = new Set(input.rows.map((row) => row.excelId));

  for (const row of input.rows) {
    const ws = wsByKey.get(catalogKey(row.workstream));
    const block = blockByKey.get(catalogKey(row.block));
    if (!row.workstream || !ws) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: row.workstream
          ? `Workstream “${row.workstream}” no está en Setup.`
          : "Falta el workstream.",
      });
    }
    if (!row.block || !block) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: row.block
          ? `Bloque “${row.block}” no está en Setup.`
          : "Falta el bloque.",
      });
    }
    if (!row.activity.trim()) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: "Falta la actividad.",
      });
    }
    if (!row.step.trim()) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: "Falta el paso.",
      });
    }

    const duration = Number(row.durationRaw);
    if (
      row.durationRaw.trim() === "" ||
      !Number.isInteger(duration) ||
      duration < 1
    ) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: "La duración debe ser un entero de al menos 1 minuto.",
      });
    }

    for (const depId of row.depIds) {
      if (depId === row.excelId) {
        errors.push({
          row: row.rowNumber,
          level: "error",
          message: "Un paso no puede depender de sí mismo.",
        });
      } else if (!idsInFile.has(depId)) {
        errors.push({
          row: row.rowNumber,
          level: "error",
          message: `La dependencia ${depId} no existe en el archivo.`,
        });
      }
    }

    const executor = row.executorEmail
      ? actorByEmail.get(row.executorEmail)
      : undefined;
    if (!row.executorEmail) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: "Falta el ejecutor (email).",
      });
    } else if (!executor) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: `El email ${row.executorEmail} no está en el mapa de actores.`,
      });
    } else if (!executor.roles.includes("EXECUTOR")) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: `${row.executorEmail} no tiene rol Ejecutor.`,
      });
    }

    const approver = row.approverEmail
      ? actorByEmail.get(row.approverEmail)
      : undefined;
    if (!row.approverEmail) {
      warnings.push({
        row: row.rowNumber,
        level: "warn",
        message: `Paso “${row.step || row.excelId}” sin aprobador.`,
      });
    } else if (!approver) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: `El email ${row.approverEmail} no está en el mapa de actores.`,
      });
    } else if (
      !approver.roles.includes("APPROVER") &&
      !approver.roles.includes("STEERCO")
    ) {
      errors.push({
        row: row.rowNumber,
        level: "error",
        message: `${row.approverEmail} no tiene rol Aprobador ni SteerCo.`,
      });
    }

    if (ws && block && row.activity.trim() && row.step.trim() && executor) {
      if (Number.isInteger(duration) && duration >= 1) {
        resolved.push({
          rowNumber: row.rowNumber,
          excelId: row.excelId,
          workstreamId: ws.id,
          blockId: block.id,
          activityName: row.activity.trim(),
          stepName: row.step.trim(),
          duration,
          depExcelIds: row.depIds.filter((id) => idsInFile.has(id)),
          executorActorId: executor.id,
          approverActorId: approver?.id ?? null,
        });
      }
    }
  }

  const depMap = new Map(
    resolved.map((row) => [row.excelId, row.depExcelIds]),
  );
  const cycle = findCycle(depMap);
  if (cycle) {
    errors.push({
      row: 0,
      level: "error",
      message: `Hay una referencia circular: ${cycle.join(" → ")}.`,
    });
  }

  return { errors, warnings, resolved };
}

export type DesignBulkValidationReport = {
  eventName: string;
  rowCount: number;
  ok: boolean;
  errors: DesignBulkIssue[];
  warnings: DesignBulkIssue[];
  resolvedCount: number;
};

export async function validateDesignBulkFile(
  eventId: string,
  buffer: Buffer,
): Promise<DesignBulkValidationReport> {
  const parsed = await parseDesignWorkbook(buffer);
  const [design, actors] = await Promise.all([
    getEventDesign(eventId),
    listEventActors(eventId),
  ]);
  if (!design) throw new Error("El evento no existe.");

  const validated = validateDesignBulkRows({
    rows: parsed.rows,
    parseErrors: parsed.errors.map((item) => ({
      row: item.row,
      message: item.message,
      level: "error",
    })),
    workstreams: design.workstreams,
    blocks: design.blocks,
    actors,
  });

  return {
    eventName: design.event.name,
    rowCount: parsed.rows.length,
    ok: validated.errors.length === 0 && parsed.rows.length > 0,
    errors: validated.errors,
    warnings: validated.warnings,
    resolvedCount: validated.resolved.length,
  };
}

export async function importDesignBulk(input: {
  eventId: string;
  actorId: string;
  resolved: ResolvedRow[];
}): Promise<{ activityCount: number; stepCount: number }> {
  const status = await getDesignBulkStatus(input.eventId);
  if (!status) throw new Error("El evento no existe.");
  if (status.archived) throw new Error("El evento está archivado.");
  if (!status.canImport) {
    throw new Error(
      "Ya hay diseño, gates o ejecuciones. Limpiá para partir de cero.",
    );
  }
  if (!input.resolved.length) throw new Error("No hay filas para cargar.");

  const database = await getDatabase();
  const eventObjectId = new ObjectId(input.eventId);
  const now = new Date();

  const activityKey = (row: ResolvedRow) =>
    `${row.workstreamId}:${row.blockId}:${catalogKey(row.activityName)}`;
  const activityIdByKey = new Map<string, ObjectId>();
  const activityOrderByPair = new Map<string, number>();
  const activityDocs: Array<{
    _id: ObjectId;
    eventId: ObjectId;
    workstreamId: ObjectId;
    blockId: ObjectId;
    name: string;
    description: string;
    order: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  for (const row of input.resolved) {
    const key = activityKey(row);
    if (activityIdByKey.has(key)) continue;
    const pairKey = `${row.workstreamId}:${row.blockId}`;
    const order = (activityOrderByPair.get(pairKey) ?? 0) + 1;
    activityOrderByPair.set(pairKey, order);
    const id = new ObjectId();
    activityIdByKey.set(key, id);
    activityDocs.push({
      _id: id,
      eventId: eventObjectId,
      workstreamId: new ObjectId(row.workstreamId),
      blockId: new ObjectId(row.blockId),
      name: row.activityName,
      description: "",
      order,
      createdBy: input.actorId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const excelIdToObjectId = new Map<string, ObjectId>();
  for (const row of input.resolved) {
    excelIdToObjectId.set(row.excelId, new ObjectId());
  }

  const stepOrderByActivity = new Map<string, number>();
  const stepDocs = input.resolved.map((row) => {
    const activityId = activityIdByKey.get(activityKey(row))!;
    const activityKeyHex = activityId.toHexString();
    const order = (stepOrderByActivity.get(activityKeyHex) ?? 0) + 1;
    stepOrderByActivity.set(activityKeyHex, order);
    return {
      _id: excelIdToObjectId.get(row.excelId)!,
      eventId: eventObjectId,
      workstreamId: new ObjectId(row.workstreamId),
      blockId: new ObjectId(row.blockId),
      activityId,
      name: row.stepName,
      description: "",
      longDescription: "",
      evidenceRequired: false,
      order,
      plannedStartAt: null,
      estimatedDurationMinutes: row.duration,
      dependencyStepIds: row.depExcelIds.map(
        (id) => excelIdToObjectId.get(id)!,
      ),
      approvalRoles: [],
      executorActorId: new ObjectId(row.executorActorId),
      approverActorIds: row.approverActorId
        ? [new ObjectId(row.approverActorId)]
        : [],
      producesGateId: null,
      requiresGateIds: [],
      createdBy: input.actorId,
      createdAt: now,
      updatedAt: now,
    };
  });

  try {
    if (activityDocs.length) {
      await database.collection("activities").insertMany(activityDocs);
    }
    if (stepDocs.length) {
      await database.collection("designSteps").insertMany(stepDocs);
    }
  } catch (error) {
    await Promise.all([
      database.collection("activities").deleteMany({
        _id: { $in: activityDocs.map((doc) => doc._id) },
      }),
      database.collection("designSteps").deleteMany({
        _id: { $in: stepDocs.map((doc) => doc._id) },
      }),
    ]);
    throw error;
  }
  await markEventReadinessStale(input.eventId);

  return {
    activityCount: activityDocs.length,
    stepCount: stepDocs.length,
  };
}

export async function clearEventDesignNuclear(input: {
  eventId: string;
  confirm: string;
}): Promise<{
  deletedSteps: number;
  deletedActivities: number;
  deletedGates: number;
  deletedExecutions: number;
}> {
  if (input.confirm !== "LIMPIAR") {
    throw new Error("Escribí LIMPIAR para confirmar.");
  }
  const status = await getDesignBulkStatus(input.eventId);
  if (!status) throw new Error("El evento no existe.");
  if (status.archived) throw new Error("El evento está archivado.");

  const database = await getDatabase();
  const eventObjectId = new ObjectId(input.eventId);
  const executions = await database
    .collection<{ _id: ObjectId }>("eventInstances")
    .find({ eventId: eventObjectId }, { projection: { _id: 1 } })
    .toArray();

  let deletedExecutions = 0;
  for (const execution of executions) {
    await deleteExecution(execution._id.toHexString(), { allowReal: true });
    deletedExecutions += 1;
  }

  const [steps, activities, gates] = await Promise.all([
    database.collection("designSteps").deleteMany({ eventId: eventObjectId }),
    database.collection("activities").deleteMany({ eventId: eventObjectId }),
    database.collection("gates").deleteMany({ eventId: eventObjectId }),
  ]);
  await markEventReadinessStale(input.eventId);

  return {
    deletedSteps: steps.deletedCount ?? 0,
    deletedActivities: activities.deletedCount ?? 0,
    deletedGates: gates.deletedCount ?? 0,
    deletedExecutions,
  };
}
