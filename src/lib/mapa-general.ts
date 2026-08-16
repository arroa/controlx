import {
  isTerminalStepStatus,
  RUNTIME_STEP_STATUS_LABELS,
  type ExecutionDetail,
  type RuntimeStepStatus,
  type RuntimeStepSummary,
} from "@/lib/execution-types";

const DEFAULT_DURATION_MIN = 30;

export const NOVEDAD_MINUTES_OPTIONS = [5, 15, 30, 60] as const;
export const DEFAULT_NOVEDAD_MINUTES = 15;

export type LioReason = "not_started" | "failed" | "overrun";

export const LIO_REASON_LABELS: Record<LioReason, string> = {
  not_started: "No arrancó a tiempo",
  failed: "Fallido",
  overrun: "Demorado vs plan",
};

export type MapaGeneralRow = {
  step: RuntimeStepSummary;
  lio: LioReason | null;
  novedadAt: number | null;
  runCount: number;
  executorName: string;
  approverNames: string;
  statusLabel: string;
  searchText: string;
};

export type MapaSortKey =
  | "lio"
  | "novedad"
  | "runs"
  | "workstream"
  | "block"
  | "activity"
  | "step"
  | "status"
  | "executor"
  | "approver";

export type MapaSortDir = "asc" | "desc";

function durationMin(step: RuntimeStepSummary) {
  const n = step.estimatedDurationMinutes;
  return n != null && Number.isFinite(n) && n > 0 ? n : DEFAULT_DURATION_MIN;
}

function plannedStartMs(step: RuntimeStepSummary) {
  if (!step.plannedStartAt) return null;
  const t = new Date(step.plannedStartAt).getTime();
  return Number.isFinite(t) ? t : null;
}

function plannedEndMs(step: RuntimeStepSummary) {
  const start = plannedStartMs(step);
  if (start == null) return null;
  return start + durationMin(step) * 60_000;
}

function hasStarted(step: RuntimeStepSummary) {
  return (
    step.status !== "PLANIFICADO" ||
    Boolean(step.actualStartedAt) ||
    step.iterations.length > 0
  );
}

export function classifyLio(
  step: RuntimeStepSummary,
  nowMs: number,
  executionType: ExecutionDetail["type"],
): LioReason | null {
  if (step.status === "FALLIDO" || step.status === "RECHAZADO") {
    return "failed";
  }
  if (isTerminalStepStatus(step.status, executionType)) {
    return null;
  }
  if (!hasStarted(step)) {
    const start = plannedStartMs(step);
    if (start != null && start < nowMs) return "not_started";
    return null;
  }
  if (step.status === "INICIADO" || step.status === "PENDIENTE_APROBACION") {
    const fromActual = step.actualStartedAt
      ? new Date(step.actualStartedAt).getTime() + durationMin(step) * 60_000
      : null;
    const fromPlan = plannedEndMs(step);
    const due =
      fromActual != null && Number.isFinite(fromActual)
        ? fromActual
        : fromPlan;
    if (due != null && due < nowMs) return "overrun";
  }
  return null;
}

export function lastStatusChangeMs(step: RuntimeStepSummary): number | null {
  const times: number[] = [];
  const push = (iso?: string | null) => {
    if (!iso) return;
    const t = new Date(iso).getTime();
    if (Number.isFinite(t)) times.push(t);
  };

  for (const comment of step.comments ?? []) {
    if (comment.kind && comment.kind !== "note") {
      push(comment.occurredAt ?? comment.createdAt);
    }
  }
  for (const iteration of step.iterations ?? []) {
    push(iteration.start.at);
    push(iteration.end?.at);
  }
  push(step.actualStartedAt);
  push(step.actualEndedAt);
  if (!times.length && step.status !== "PLANIFICADO") {
    push(step.updatedAt);
  }
  if (!times.length) return null;
  return Math.max(...times);
}

export function runCount(step: RuntimeStepSummary) {
  if (step.iterations.length) return step.iterations.length;
  return step.actualStartedAt ? 1 : 0;
}

export function buildMapaGeneralRows(
  detail: ExecutionDetail,
  nowMs: number,
  novedadMinutes: number,
  actorNameById: Map<string, string>,
): MapaGeneralRow[] {
  const windowMs = Math.max(1, novedadMinutes) * 60_000;
  const floor = nowMs - windowMs;

  return detail.steps.map((step) => {
    const changedAt = lastStatusChangeMs(step);
    const novedadAt =
      changedAt != null && changedAt >= floor && changedAt <= nowMs
        ? changedAt
        : null;
    const executorName =
      step.executorName?.trim() ||
      (step.executorActorId
        ? (actorNameById.get(step.executorActorId) ?? "—")
        : "—");
    const approverNames =
      (step.approverActorIds ?? [])
        .map((id) => actorNameById.get(id) ?? "")
        .filter(Boolean)
        .join(", ") || "—";
    return {
      step,
      lio: classifyLio(step, nowMs, detail.type),
      novedadAt,
      runCount: runCount(step),
      executorName,
      approverNames,
      statusLabel: RUNTIME_STEP_STATUS_LABELS[step.status],
      searchText:
        `${step.workstreamName} ${step.blockName} ${step.activityName} ${step.name} ${executorName} ${approverNames} ${RUNTIME_STEP_STATUS_LABELS[step.status]}`.toLowerCase(),
    };
  });
}

export function compareMapaRows(
  a: MapaGeneralRow,
  b: MapaGeneralRow,
  key: MapaSortKey,
  dir: MapaSortDir,
): number {
  const factor = dir === "asc" ? 1 : -1;
  const primary = (() => {
    switch (key) {
      case "lio":
        return Number(Boolean(a.lio)) - Number(Boolean(b.lio));
      case "novedad":
        return (a.novedadAt ?? 0) - (b.novedadAt ?? 0);
      case "runs":
        return a.runCount - b.runCount;
      case "workstream":
        return a.step.workstreamName.localeCompare(b.step.workstreamName, "es");
      case "block":
        return a.step.blockName.localeCompare(b.step.blockName, "es");
      case "activity":
        return a.step.activityName.localeCompare(b.step.activityName, "es");
      case "status":
        return a.statusLabel.localeCompare(b.statusLabel, "es");
      case "executor":
        return a.executorName.localeCompare(b.executorName, "es");
      case "approver":
        return a.approverNames.localeCompare(b.approverNames, "es");
      default:
        return (
          a.step.name.localeCompare(b.step.name, "es") ||
          a.step.order - b.step.order
        );
    }
  })();
  if (primary) return primary * factor;
  if (a.lio && !b.lio) return -1;
  if (!a.lio && b.lio) return 1;
  const byWs = a.step.workstreamName.localeCompare(b.step.workstreamName, "es");
  if (byWs) return byWs;
  return a.step.order - b.step.order;
}

export const ALL_STATUSES: RuntimeStepStatus[] = [
  "PLANIFICADO",
  "INICIADO",
  "PENDIENTE_APROBACION",
  "EXITOSO",
  "APROBADO",
  "FALLIDO",
  "RECHAZADO",
  "OMITIDO",
  "SIMULADO",
];
