import type {
  RuntimeStepStatus,
  RuntimeStepSummary,
} from "@/lib/execution-types";

export type ExecutionFocusMode = "all" | "highlight-mine" | "mine-only";

export const EXECUTION_FOCUS_OPTIONS: Array<{
  value: ExecutionFocusMode;
  label: string;
}> = [
  { value: "all", label: "Todas" },
  { value: "highlight-mine", label: "Destacar mías" },
  { value: "mine-only", label: "Solo mías" },
];

export function isMineStep(
  step: RuntimeStepSummary,
  actorId: string | null,
): boolean {
  return Boolean(actorId && step.executorActorId === actorId);
}

export function filterStepsByFocus(
  steps: RuntimeStepSummary[],
  actorId: string | null,
  focusMode: ExecutionFocusMode,
): RuntimeStepSummary[] {
  if (focusMode !== "mine-only" || !actorId) return steps;
  return steps.filter((step) => isMineStep(step, actorId));
}

/**
 * Colores del mapa de ejecución.
 * - dimOthers: en "Destacar mías", ajenos van grises
 * - en "Todas", todos muestran color por estado
 */
export function runtimeBarTone(input: {
  status: RuntimeStepStatus;
  mine: boolean;
  isNext: boolean;
  dimOthers: boolean;
}) {
  const { status, mine, isNext, dimOthers } = input;

  if (
    status === "EXITOSO" ||
    status === "APROBADO" ||
    status === "SIMULADO" ||
    status === "OMITIDO"
  ) {
    if (dimOthers && !mine) {
      return "border-emerald-500/30 bg-emerald-500/25 text-emerald-100";
    }
    return "border-emerald-300 bg-emerald-500 text-emerald-950";
  }
  if (status === "FALLIDO") {
    if (dimOthers && !mine) {
      return "border-rose-500/30 bg-rose-500/25 text-rose-100";
    }
    return "border-rose-300 bg-rose-500 text-rose-50";
  }
  if (status === "PENDIENTE_APROBACION") {
    if (dimOthers && !mine) {
      return "border-amber-500/30 bg-amber-500/25 text-amber-100";
    }
    return "border-amber-300 bg-amber-400 text-amber-950";
  }
  if (status === "INICIADO" || isNext) {
    if (dimOthers && !mine) {
      return "border-sky-500/30 bg-sky-500/20 text-sky-100";
    }
    return "border-sky-200 bg-sky-300 text-sky-950";
  }
  // Pendiente
  if (dimOthers && !mine) {
    return "border-zinc-400/50 bg-zinc-300 text-zinc-800";
  }
  return "border-blue-300 bg-blue-600 text-white";
}

export function nextMineStepId(
  steps: RuntimeStepSummary[],
  actorId: string | null,
  t0Ms: number,
): string | null {
  if (!actorId) return null;
  const mineSteps = steps.filter((step) => isMineStep(step, actorId));
  const started = mineSteps.find((step) => step.status === "INICIADO");
  if (started) return started.id;
  const pending = mineSteps
    .filter(
      (step) => step.status === "PLANIFICADO" || step.status === "RECHAZADO",
    )
    .sort((a, b) => {
      const aStart = a.plannedStartAt
        ? new Date(a.plannedStartAt).getTime()
        : t0Ms;
      const bStart = b.plannedStartAt
        ? new Date(b.plannedStartAt).getTime()
        : t0Ms;
      return aStart - bStart || a.order - b.order;
    });
  return pending[0]?.id ?? null;
}
