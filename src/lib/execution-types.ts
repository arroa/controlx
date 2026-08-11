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
  /** Hora declarada del acto (reloj de la ejecución), si aplica. */
  occurredAt: z.string().datetime().optional(),
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

/** Acto de una iteración (inicio o fin). */
export type StepAct = {
  at: string;
  comment?: string;
  evidence: EvidenceMeta[];
  by: { id: string; label: string };
  recordedAt: string;
};

export type StepIterationStatus =
  | "EN_CURSO"
  | "EXITOSA"
  | "FALLIDA"
  | "FORZADA_OK";

export type StepIteration = {
  n: number;
  status: StepIterationStatus;
  start: StepAct;
  end?: StepAct & { outcome: "success" | "fail" | "force" };
};

export const STEP_ITERATION_STATUS_LABELS: Record<
  StepIterationStatus,
  string
> = {
  EN_CURSO: "En curso",
  EXITOSA: "Exitosa",
  FALLIDA: "Fallida",
  FORZADA_OK: "Forzada OK",
};

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
  /** Intentos Inicio→Fin; el más nuevo tiene n más alto. */
  iterations: StepIteration[];
  comments: StepComment[];
  evidence: EvidenceMeta[];
  updatedAt: string;
};

/**
 * Acciones que piden hora real del acto (reloj de la ejecución).
 * En simulacro el reloj de pared no es el del ensayo; en real también conviene poder ajustarla.
 */
export function actionNeedsOccurredAt(action: RuntimeStepAction): boolean {
  return (
    action === "start" ||
    action === "restart" ||
    action === "complete_success" ||
    action === "complete_fail" ||
    action === "force_success"
  );
}

/** Inicio / rearranque: la hora pedida es de arranque, no de término. */
export function actionNeedsStartTime(action: RuntimeStepAction): boolean {
  return action === "start" || action === "restart";
}

/**
 * Default del reloj al abrir un acto.
 * No puede quedar antes del piso → max(ahora, piso).
 */
export function defaultActOccurredAt(floorIso?: string | null): string {
  const nowMs = Date.now();
  const floorMs = floorIso ? new Date(floorIso).getTime() : NaN;
  if (Number.isFinite(floorMs) && floorMs > nowMs) {
    return new Date(floorMs).toISOString();
  }
  return new Date(nowMs).toISOString();
}

/**
 * Piso del reloj según el acto:
 * - start: T0
 * - restart: fin (o inicio) de la iteración anterior
 * - cierre/forzar: inicio real del paso
 */
export function actTimeFloor(input: {
  action: RuntimeStepAction;
  anchorStartAt?: string | null;
  actualStartedAt?: string | null;
  actualEndedAt?: string | null;
}): string | null {
  const { action, anchorStartAt, actualStartedAt, actualEndedAt } = input;
  if (action === "start") return anchorStartAt ?? null;
  if (action === "restart") {
    return actualEndedAt ?? actualStartedAt ?? anchorStartAt ?? null;
  }
  return actualStartedAt ?? anchorStartAt ?? null;
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
  /** Aprobaciones registradas en esta ejecución para este gate. */
  approvals: GateApprovalSummary[];
  /** Evaluado al cargar el detalle (reloj de pared). */
  open: boolean;
  blockers: GateConditionBlocker[];
};

export type GateApprovalSummary = {
  gateId: string;
  role: "EVENT_ADMIN" | "WORKSTREAM_ADMIN" | "APPROVER" | "STEERCO";
  actorId: string;
  actorLabel: string;
  approvedAt: string;
};

export type GateConditionBlocker = {
  reason:
    | "missing_gate"
    | "producer_pending"
    | "producer_failed"
    | "time"
    | "closer_pending"
    | "closer_failed"
    | "approval";
  detail: string;
  role?: "EVENT_ADMIN" | "WORKSTREAM_ADMIN" | "APPROVER" | "STEERCO";
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
  /** Todas las aprobaciones de gates de la instancia. */
  gateApprovals: GateApprovalSummary[];
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

/** Estado “de botón” para el encabezado del paso (vista info). */
export function stepHeaderStatusLabel(step: {
  status: RuntimeStepStatus;
  forced: boolean;
}): string {
  if (step.status === "PLANIFICADO" || step.status === "RECHAZADO") {
    return "No iniciada";
  }
  if (step.status === "INICIADO" || step.status === "PENDIENTE_APROBACION") {
    return "En curso";
  }
  if (step.status === "FALLIDO") return "Fallida";
  if (step.status === "EXITOSO" || step.status === "APROBADO") {
    return step.forced ? "Forzada OK" : "Exitosa";
  }
  if (step.status === "OMITIDO" || step.status === "SIMULADO") {
    return "Omitida";
  }
  return RUNTIME_STEP_STATUS_LABELS[step.status];
}

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
