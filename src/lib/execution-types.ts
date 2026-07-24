import { z } from "zod";

/** Estado de la instancia de ejecución (evento en marcha). */
export const executionInstanceStatusSchema = z.enum([
  "BORRADOR",
  "PREPARADO",
  "EN_EJECUCION",
  "PAUSADO",
  "FINALIZADO",
  "CANCELADO",
]);

/**
 * Estados de un paso en runtime.
 * Atrasado y Forzado son overlays, no estados.
 */
export const runtimeStepStatusSchema = z.enum([
  "PLANIFICADO",
  "INICIADO",
  "EXITOSO",
  "FALLIDO",
  "OMITIDO",
  "SIMULADO",
  "PENDIENTE_APROBACION",
  "APROBADO",
  "RECHAZADO",
]);

export const runtimeStepActionSchema = z.enum([
  "start",
  "complete_success",
  "complete_fail",
  "omit",
  "simulate",
  "approve",
  "reject",
  "force_success",
  /** Reabrir un Fallido para intentarlo de nuevo (vuelve a Iniciado). */
  "restart",
]);

export const evidenceMetaSchema = z.object({
  url: z.string().url(),
  pathname: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  uploadedBy: z.string().min(1),
  uploadedAt: z.string().datetime(),
  caption: z.string().max(500).optional(),
});

export const stepCommentSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(4000),
  authorId: z.string().min(1),
  authorLabel: z.string().min(1),
  createdAt: z.string().datetime(),
  kind: z
    .enum([
      "note",
      "start",
      "success",
      "fail",
      "omit",
      "simulate",
      "approve",
      "reject",
      "force",
      "restart",
    ])
    .default("note"),
});

export type ExecutionInstanceStatus = z.infer<
  typeof executionInstanceStatusSchema
>;
export type RuntimeStepStatus = z.infer<typeof runtimeStepStatusSchema>;
export type RuntimeStepAction = z.infer<typeof runtimeStepActionSchema>;
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>;
export type StepComment = z.infer<typeof stepCommentSchema>;

export type RuntimeStepSummary = {
  id: string;
  executionId: string;
  eventId: string;
  designStepId: string;
  workstreamId: string;
  workstreamName: string;
  blockId: string;
  blockName: string;
  activityId: string;
  activityName: string;
  name: string;
  /** Descripción corta (tarjeta / resumen). */
  description: string;
  /** Descripción larga (instrucciones del ejecutor). */
  longDescription: string;
  order: number;
  plannedStartAt: string | null;
  estimatedDurationMinutes: number | null;
  dependencyStepIds: string[];
  /** Desde el diseño; sirve para calendarizar como el planificador. */
  producesGateId: string | null;
  requiresGateIds: string[];
  executorActorId: string | null;
  executorName: string | null;
  approverActorIds: string[];
  status: RuntimeStepStatus;
  forced: boolean;
  overdue: boolean;
  /** Inicio real declarado (reloj de la ejecución). */
  actualStartedAt: string | null;
  /** Fin real declarado al cerrar OK/fallo/forzado. */
  actualEndedAt: string | null;
  comments: StepComment[];
  evidence: EvidenceMeta[];
  updatedAt: string;
};

/** Acciones de cierre que piden hora real de término. */
export function actionNeedsOccurredAt(action: RuntimeStepAction): boolean {
  return (
    action === "complete_success" ||
    action === "complete_fail" ||
    action === "force_success"
  );
}

export type ExecutionGateSummary = {
  id: string;
  name: string;
  order: number;
  plannedOpenAt: string | null;
  opensTargets: Array<{
    workstreamId: string;
    blockId: string | null;
  }>;
  closesAfterTargets: Array<{
    workstreamId: string;
    blockId: string | null;
  }>;
  approvalRoles: Array<
    "EVENT_ADMIN" | "WORKSTREAM_ADMIN" | "APPROVER" | "STEERCO"
  >;
};

export type ExecutionDetail = {
  id: string;
  eventId: string;
  organizationId: string;
  name: string;
  type: "SIMULACRO" | "REAL";
  timezone: string;
  anchorStartAt: string | null;
  iteration: number;
  status: ExecutionInstanceStatus;
  createdAt: string;
  steps: RuntimeStepSummary[];
  /** Gates del diseño, con horas alineadas al ancla de esta ejecución. */
  gates: ExecutionGateSummary[];
  blobConfigured: boolean;
};

export const RUNTIME_STEP_STATUS_LABELS: Record<RuntimeStepStatus, string> = {
  PLANIFICADO: "Planificado",
  INICIADO: "Iniciado",
  EXITOSO: "Exitoso",
  FALLIDO: "Fallido",
  /** Legacy / raro: se muestra como omitido simulando el éxito. */
  OMITIDO: "Omitido · simulando éxito",
  SIMULADO: "Omitido · simulando éxito",
  PENDIENTE_APROBACION: "Pendiente aprobación",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
};

/** Terminales según tipo de ejecución. */
export function isTerminalStepStatus(
  status: RuntimeStepStatus,
  executionType: "SIMULACRO" | "REAL",
): boolean {
  if (status === "APROBADO" || status === "FALLIDO") return true;
  if (status === "EXITOSO") return true; // sin approvers; con approvers no debería quedarse aquí
  if (executionType === "SIMULACRO") {
    return status === "OMITIDO" || status === "SIMULADO";
  }
  return false;
}

/**
 * ¿Este cierre desbloquea pasos dependientes?
 * Solo Exitoso / Aprobado (incluye Forzado). Fallido no desbloquea.
 * Omitido/Simulado quedan fuera de la ecuación operativa.
 */
export function stepUnlocksDependents(status: RuntimeStepStatus): boolean {
  return status === "EXITOSO" || status === "APROBADO";
}

export type DependencyBlocker = {
  id: string;
  name: string;
  status: RuntimeStepStatus;
  reason: "pending" | "failed";
};

/** Deps explícitas que aún no permiten iniciar el paso. */
export function unmetStepDependencies(
  step: Pick<RuntimeStepSummary, "dependencyStepIds">,
  allSteps: Array<
    Pick<RuntimeStepSummary, "id" | "name" | "status">
  >,
): DependencyBlocker[] {
  const byId = new Map(allSteps.map((item) => [item.id, item]));
  const blockers: DependencyBlocker[] = [];
  for (const depId of step.dependencyStepIds) {
    const dep = byId.get(depId);
    if (!dep) {
      blockers.push({
        id: depId,
        name: "Dependencia faltante",
        status: "PLANIFICADO",
        reason: "pending",
      });
      continue;
    }
    if (stepUnlocksDependents(dep.status)) continue;
    blockers.push({
      id: dep.id,
      name: dep.name,
      status: dep.status,
      reason: dep.status === "FALLIDO" ? "failed" : "pending",
    });
  }
  return blockers;
}

export function isSimulacroOnlyStatus(status: RuntimeStepStatus): boolean {
  return status === "OMITIDO" || status === "SIMULADO";
}

export function stepIsOverdue(input: {
  status: RuntimeStepStatus;
  plannedStartAt: string | null;
  now?: Date;
}): boolean {
  if (!input.plannedStartAt) return false;
  if (
    input.status === "EXITOSO" ||
    input.status === "APROBADO" ||
    input.status === "OMITIDO" ||
    input.status === "SIMULADO" ||
    input.status === "FALLIDO"
  ) {
    return false;
  }
  const planned = new Date(input.plannedStartAt).getTime();
  if (Number.isNaN(planned)) return false;
  return (input.now ?? new Date()).getTime() > planned;
}
