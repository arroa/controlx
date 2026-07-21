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
  description: string;
  order: number;
  plannedStartAt: string | null;
  estimatedDurationMinutes: number | null;
  dependencyStepIds: string[];
  executorActorId: string | null;
  executorName: string | null;
  approverActorIds: string[];
  status: RuntimeStepStatus;
  forced: boolean;
  overdue: boolean;
  comments: StepComment[];
  evidence: EvidenceMeta[];
  updatedAt: string;
};

export type ExecutionDetail = {
  id: string;
  eventId: string;
  organizationId: string;
  name: string;
  type: "SIMULACRO" | "REAL";
  timezone: string;
  status: ExecutionInstanceStatus;
  createdAt: string;
  steps: RuntimeStepSummary[];
  blobConfigured: boolean;
};

export const RUNTIME_STEP_STATUS_LABELS: Record<RuntimeStepStatus, string> = {
  PLANIFICADO: "Planificado",
  INICIADO: "Iniciado",
  EXITOSO: "Exitoso",
  FALLIDO: "Fallido",
  OMITIDO: "Omitido",
  SIMULADO: "Simulado",
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
