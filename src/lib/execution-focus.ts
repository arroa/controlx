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

/** Leyenda compacta del mapa (color = estado; ★ = tuyo). */
export const RUNTIME_BAR_LEGEND: Array<{
  key: string;
  label: string;
  swatch: string;
}> = [
  { key: "pending", label: "Pendiente", swatch: "bg-blue-600 border-blue-300" },
  { key: "running", label: "En curso", swatch: "bg-sky-300 border-sky-200" },
  { key: "approval", label: "Espera aprobación", swatch: "bg-amber-400 border-amber-300" },
  { key: "ok", label: "OK", swatch: "bg-emerald-500 border-emerald-300" },
  { key: "fail", label: "Fallido", swatch: "bg-rose-500 border-rose-300" },
  { key: "other", label: "De otro (Destacar)", swatch: "bg-zinc-500/45 border-zinc-400/50" },
];

/**
 * Colores del mapa de ejecución = estado del paso.
 * - ★ en la tarjeta = es tuyo
 * - dimOthers ("Destacar mías"): ajenos van gris neutro
 */
export function runtimeBarTone(input: {
  status: RuntimeStepStatus;
  mine: boolean;
  dimOthers: boolean;
}) {
  const { status, mine, dimOthers } = input;

  // En Destacar: ajenos siempre gris — el color solo habla de lo tuyo.
  if (dimOthers && !mine) {
    return "border-zinc-400/50 bg-zinc-500/40 text-zinc-200";
  }

  if (
    status === "EXITOSO" ||
    status === "APROBADO" ||
    status === "SIMULADO" ||
    status === "OMITIDO"
  ) {
    return "border-emerald-300 bg-emerald-500 text-emerald-950";
  }
  if (status === "FALLIDO") {
    return "border-rose-300 bg-rose-500 text-rose-50";
  }
  if (status === "PENDIENTE_APROBACION") {
    return "border-amber-300 bg-amber-400 text-amber-950";
  }
  if (status === "INICIADO") {
    return "border-sky-200 bg-sky-300 text-sky-950";
  }
  return "border-blue-300 bg-blue-600 text-white";
}
