import {
  isTerminalStepStatus,
  type ExecutionDetail,
  type RuntimeStepSummary,
} from "@/lib/execution-types";

const DEFAULT_DURATION_MIN = 30;
/** Dominio X = duración planificada × este factor (plan a cero ≈ 83% del eje). */
export const DOMAIN_PLAN_PAD = 1.2;

/** Rejilla X normalizada al plan (etiquetas visibles). */
export const AXIS_MAJOR_PCTS = [25, 50, 75, 100, 120] as const;
/** Rejilla X secundaria (solo línea). */
export const AXIS_MINOR_PCTS = [12.5, 37.5, 62.5, 87.5, 110] as const;

/** ms absolutos para un % del plan: 0%=inicio, 100%=fin plan, 120%=borde dominio. */
export function planPercentToMs(
  planStartMs: number,
  plannedSpanMs: number,
  pct: number,
): number {
  return planStartMs + plannedSpanMs * (pct / 100);
}

export type StairEvent = {
  t: number;
  stepId: string;
  label: string;
};

/** Delta de concurrencia: +1 al iniciar, −1 al dejar de estar en curso. */
export type RunningDelta = {
  t: number;
  delta: 1 | -1;
  stepId: string;
};

export type WorkstreamMonitorRow = {
  workstreamId: string;
  workstreamName: string;
  /** Debían cerrar ya según plan (fin planificado ≤ ahora). */
  plannedDone: number;
  /** Cierres OK (exitosas / aprobadas / omitidas / simuladas). */
  done: number;
  /** En ejecución activa (INICIADO). */
  running: number;
  /** Fallidos / rechazados actuales. */
  failed: number;
};

export type ThresholdMonitorModel = {
  nowMs: number;
  timezone: string;
  executionName: string;
  totalSteps: number;
  /** Inicio del eje = T0 / inicio plan. */
  domainStartMs: number;
  /** Fin del eje = inicio + duraciónPlan × 1.2. */
  domainEndMs: number;
  /** Fin teórico del plan (escalón plan llega a 0). = 100% del eje. */
  plannedEndMs: number | null;
  /** Duración planificada en ms (100% del eje). */
  plannedSpanMs: number | null;
  /** now está más allá del dominio (overrun > +20%). */
  nowBeyondDomain: boolean;
  /** Completaciones planificadas (fin planificado). */
  planEvents: StairEvent[];
  /** Completaciones reales hasta now (solo cierres OK; fallos no bajan restantes). */
  realEvents: StairEvent[];
  /**
   * Serie “en curso”: +1 al arrancar / −1 al cerrar el intento.
   * No es acumulativo: el escalón es la cantidad concurrente.
   */
  runningDeltas: RunningDelta[];
  /** Instantes de fallo (ticker rojo sobre En curso). */
  failMarkers: StairEvent[];
  runningNow: number;
  remainingNow: number;
  /** Ancla de holgura (gate o fin de plan). */
  anchor: {
    kind: "gate" | "plan_end";
    label: string;
    atMs: number;
  } | null;
  holguraMin: number | null;
  etaMs: number | null;
  startedAtMs: number | null;
  stats: {
    finalizadas: number;
    exitosas: number;
    withRestart: number;
    fallidas: number;
    pendientes: number;
    enCurso: number;
    tiempoUsadoMin: number | null;
  };
  workstreams: WorkstreamMonitorRow[];
};

function durationMin(step: RuntimeStepSummary): number {
  const n = step.estimatedDurationMinutes;
  return n != null && Number.isFinite(n) && n > 0 ? n : DEFAULT_DURATION_MIN;
}

function plannedEndMs(step: RuntimeStepSummary): number | null {
  if (!step.plannedStartAt) return null;
  const start = new Date(step.plannedStartAt).getTime();
  if (!Number.isFinite(start)) return null;
  return start + durationMin(step) * 60_000;
}

function isClosed(
  step: RuntimeStepSummary,
  executionType: ExecutionDetail["type"],
): boolean {
  return isTerminalStepStatus(step.status, executionType);
}

/** Cierre que sí consume backlog en el burndown Real. Fallo / rechazo no. */
function countsAsRealProgress(
  step: RuntimeStepSummary,
  executionType: ExecutionDetail["type"],
): boolean {
  if (step.status === "FALLIDO" || step.status === "RECHAZADO") return false;
  return isTerminalStepStatus(step.status, executionType);
}

function failEndedAtMs(step: RuntimeStepSummary): number | null {
  if (step.status !== "FALLIDO" && step.status !== "RECHAZADO") return null;
  if (step.actualEndedAt) {
    const ended = new Date(step.actualEndedAt).getTime();
    if (Number.isFinite(ended)) return ended;
  }
  for (let i = step.iterations.length - 1; i >= 0; i -= 1) {
    const endAt = step.iterations[i]?.end?.at;
    if (!endAt) continue;
    const ended = new Date(endAt).getTime();
    if (Number.isFinite(ended)) return ended;
  }
  if (step.updatedAt) {
    const updated = new Date(step.updatedAt).getTime();
    if (Number.isFinite(updated)) return updated;
  }
  return null;
}

function isRunning(step: RuntimeStepSummary): boolean {
  return (
    step.status === "INICIADO" || step.status === "PENDIENTE_APROBACION"
  );
}

/** ¿Activamente ejecutándose? (no cuenta espera de aprobación). */
function isActivelyRunning(step: RuntimeStepSummary): boolean {
  return step.status === "INICIADO";
}

/**
 * Eventos +1/−1 de concurrencia “en curso”.
 * Preferimos iterations; fallback a actualStartedAt/EndedAt.
 */
function buildRunningDeltas(
  steps: RuntimeStepSummary[],
  nowMs: number,
): RunningDelta[] {
  const deltas: RunningDelta[] = [];

  for (const step of steps) {
    if (step.iterations.length > 0) {
      for (const iteration of step.iterations) {
        const start = new Date(iteration.start.at).getTime();
        if (Number.isFinite(start) && start <= nowMs) {
          deltas.push({ t: start, delta: 1, stepId: step.id });
        }
        if (iteration.end?.at) {
          const end = new Date(iteration.end.at).getTime();
          if (Number.isFinite(end) && end <= nowMs) {
            deltas.push({ t: end, delta: -1, stepId: step.id });
          }
        }
      }
      continue;
    }

    if (!step.actualStartedAt) continue;
    const start = new Date(step.actualStartedAt).getTime();
    if (!Number.isFinite(start) || start > nowMs) continue;
    deltas.push({ t: start, delta: 1, stepId: step.id });

    if (step.actualEndedAt) {
      const end = new Date(step.actualEndedAt).getTime();
      if (Number.isFinite(end) && end <= nowMs) {
        deltas.push({ t: end, delta: -1, stepId: step.id });
      }
    } else if (!isActivelyRunning(step)) {
      const end = new Date(step.updatedAt).getTime();
      if (Number.isFinite(end) && end <= nowMs) {
        deltas.push({ t: end, delta: -1, stepId: step.id });
      }
    }
  }

  // Mismo instante: +1 antes que −1 (pico de ancho 0 si start=end).
  deltas.sort(
    (a, b) =>
      a.t - b.t ||
      b.delta - a.delta ||
      a.stepId.localeCompare(b.stepId),
  );
  return deltas;
}

export function runningCountAfter(
  deltas: RunningDelta[],
  atMs: number,
): number {
  let n = 0;
  for (const delta of deltas) {
    if (delta.t > atMs) break;
    n += delta.delta;
  }
  return Math.max(0, n);
}

function projectedEndMs(
  step: RuntimeStepSummary,
  nowMs: number,
  executionType: ExecutionDetail["type"],
): number | null {
  if (isClosed(step, executionType)) {
    if (step.actualEndedAt) {
      const ended = new Date(step.actualEndedAt).getTime();
      return Number.isFinite(ended) ? ended : null;
    }
    return null;
  }
  const dur = durationMin(step) * 60_000;
  if (step.actualStartedAt) {
    const started = new Date(step.actualStartedAt).getTime();
    if (Number.isFinite(started)) return Math.max(started + dur, nowMs);
  }
  if (step.plannedStartAt) {
    const planned = new Date(step.plannedStartAt).getTime();
    if (Number.isFinite(planned)) return Math.max(planned + dur, nowMs);
  }
  return nowMs + dur;
}

function classifyFinal(
  step: RuntimeStepSummary,
): "ok" | "restart" | "failed" | null {
  if (step.status === "FALLIDO" || step.status === "RECHAZADO") {
    return "failed";
  }
  if (
    step.status === "EXITOSO" ||
    step.status === "APROBADO" ||
    step.status === "OMITIDO" ||
    step.status === "SIMULADO"
  ) {
    return step.iterations.length > 1 ? "restart" : "ok";
  }
  return null;
}

function pickAnchor(detail: ExecutionDetail): ThresholdMonitorModel["anchor"] {
  const gates = [...detail.gates]
    .filter((g) => g.plannedOpenAt)
    .sort((a, b) => a.order - b.order);
  if (gates[0]?.plannedOpenAt) {
    const atMs = new Date(gates[0].plannedOpenAt).getTime();
    if (Number.isFinite(atMs)) {
      return { kind: "gate", label: gates[0].name, atMs };
    }
  }

  let maxEnd: number | null = null;
  for (const step of detail.steps) {
    const end = plannedEndMs(step);
    if (end == null) continue;
    if (maxEnd == null || end > maxEnd) maxEnd = end;
  }
  if (maxEnd == null) return null;
  return { kind: "plan_end", label: "Fin de plan", atMs: maxEnd };
}

function buildWorkstreamRows(
  detail: ExecutionDetail,
  nowMs: number,
): WorkstreamMonitorRow[] {
  const byWs = new Map<string, RuntimeStepSummary[]>();
  for (const step of detail.steps) {
    const list = byWs.get(step.workstreamId) ?? [];
    list.push(step);
    byWs.set(step.workstreamId, list);
  }

  const rows: WorkstreamMonitorRow[] = [];
  for (const [, steps] of byWs) {
    const name = steps[0]!.workstreamName;
    const id = steps[0]!.workstreamId;
    let plannedDone = 0;
    let done = 0;
    let failed = 0;
    let running = 0;

    for (const step of steps) {
      const planEnd = plannedEndMs(step);
      if (planEnd != null && planEnd <= nowMs) plannedDone += 1;

      if (countsAsRealProgress(step, detail.type)) done += 1;
      else if (step.status === "FALLIDO" || step.status === "RECHAZADO") {
        failed += 1;
      } else if (isActivelyRunning(step)) {
        running += 1;
      }
    }

    rows.push({
      workstreamId: id,
      workstreamName: name,
      plannedDone,
      done,
      running,
      failed,
    });
  }

  // Peor primero: más fallos, luego más atraso vs plan.
  rows.sort((a, b) => {
    if (b.failed !== a.failed) return b.failed - a.failed;
    const lagA = a.plannedDone - a.done;
    const lagB = b.plannedDone - b.done;
    return lagB - lagA;
  });
  return rows;
}

/**
 * Modelo del Monitor de Umbral a partir del detalle de ejecución.
 * Burndown por conteo de pasos: escalón en cada fin planificado / real.
 */
export function buildThresholdMonitorModel(
  detail: ExecutionDetail,
  nowMs: number = Date.now(),
): ThresholdMonitorModel {
  const steps = detail.steps;
  const totalSteps = steps.length;
  const startedAtMs = detail.anchorStartAt
    ? new Date(detail.anchorStartAt).getTime()
    : null;

  const planEvents: StairEvent[] = [];
  for (const step of steps) {
    const t = plannedEndMs(step);
    if (t == null) continue;
    planEvents.push({ t, stepId: step.id, label: step.name });
  }
  planEvents.sort((a, b) => a.t - b.t || a.stepId.localeCompare(b.stepId));

  const realEvents: StairEvent[] = [];
  for (const step of steps) {
    if (!countsAsRealProgress(step, detail.type)) continue;
    let t: number | null = null;
    if (step.actualEndedAt) {
      const ended = new Date(step.actualEndedAt).getTime();
      if (Number.isFinite(ended)) t = ended;
    }
    if (t == null && step.updatedAt) {
      const updated = new Date(step.updatedAt).getTime();
      if (Number.isFinite(updated)) t = updated;
    }
    if (t == null || t > nowMs) continue;
    realEvents.push({ t, stepId: step.id, label: step.name });
  }
  realEvents.sort((a, b) => a.t - b.t || a.stepId.localeCompare(b.stepId));

  const failMarkers: StairEvent[] = [];
  for (const step of steps) {
    const t = failEndedAtMs(step);
    if (t == null || t > nowMs) continue;
    failMarkers.push({ t, stepId: step.id, label: step.name });
  }
  failMarkers.sort((a, b) => a.t - b.t || a.stepId.localeCompare(b.stepId));

  const runningDeltas = buildRunningDeltas(steps, nowMs);
  const runningNow = runningCountAfter(runningDeltas, nowMs);

  // Restantes = aún no hay cierre OK (incluye fallidos: siguen en el backlog).
  const remainingNow = steps.filter(
    (step) => !countsAsRealProgress(step, detail.type),
  ).length;

  const anchor = pickAnchor(detail);

  let etaMs: number | null = null;
  for (const step of steps) {
    if (isClosed(step, detail.type)) continue;
    const proj = projectedEndMs(step, nowMs, detail.type);
    if (proj == null) continue;
    if (etaMs == null || proj > etaMs) etaMs = proj;
  }

  const holguraMin =
    anchor != null && etaMs != null
      ? Math.round((anchor.atMs - etaMs) / 60_000)
      : anchor != null
        ? Math.round((anchor.atMs - nowMs) / 60_000)
        : null;

  let ok = 0;
  let withRestart = 0;
  let fallidas = 0;
  let pendientes = 0;
  let enCurso = 0;
  for (const step of steps) {
    const kind = classifyFinal(step);
    if (kind === "ok") ok += 1;
    else if (kind === "restart") withRestart += 1;
    else if (kind === "failed") fallidas += 1;
    else if (isRunning(step)) enCurso += 1;
    else pendientes += 1;
  }
  const finalizadas = ok + withRestart + fallidas;

  const tiempoUsadoMin =
    startedAtMs != null && Number.isFinite(startedAtMs)
      ? Math.max(0, Math.round((nowMs - startedAtMs) / 60_000))
      : null;

  // Eje X fijo al plan: [inicioPlan, inicioPlan + duraciónPlan × 1.2].
  // El escalón teórico llega a cero al fin del plan (~83% del eje).
  let planStartMs: number | null = Number.isFinite(startedAtMs)
    ? startedAtMs!
    : null;
  let planEndMs: number | null = null;
  for (const step of steps) {
    if (step.plannedStartAt) {
      const start = new Date(step.plannedStartAt).getTime();
      if (Number.isFinite(start)) {
        if (planStartMs == null || start < planStartMs) planStartMs = start;
      }
    }
    const end = plannedEndMs(step);
    if (end != null && (planEndMs == null || end > planEndMs)) {
      planEndMs = end;
    }
  }
  if (planEndMs == null && planEvents.length) {
    planEndMs = planEvents[planEvents.length - 1]!.t;
  }

  let domainStartMs: number;
  let domainEndMs: number;
  let plannedEndMsValue: number | null = planEndMs;
  let plannedSpanMs: number | null = null;

  if (planStartMs != null && planEndMs != null && planEndMs > planStartMs) {
    plannedSpanMs = planEndMs - planStartMs;
    domainStartMs = planStartMs;
    domainEndMs = planStartMs + plannedSpanMs * DOMAIN_PLAN_PAD;
  } else if (planStartMs != null) {
    plannedSpanMs = 2 * 60 * 60_000;
    domainStartMs = planStartMs;
    domainEndMs = planStartMs + plannedSpanMs * DOMAIN_PLAN_PAD;
    plannedEndMsValue = planStartMs + plannedSpanMs;
  } else {
    plannedSpanMs = 2 * 60 * 60_000;
    domainStartMs = nowMs - plannedSpanMs / 2;
    domainEndMs = domainStartMs + plannedSpanMs * DOMAIN_PLAN_PAD;
    plannedEndMsValue = domainStartMs + plannedSpanMs;
  }

  const nowBeyondDomain = nowMs > domainEndMs;

  return {
    nowMs,
    timezone: detail.timezone,
    executionName: detail.name,
    totalSteps,
    domainStartMs,
    domainEndMs,
    plannedEndMs: plannedEndMsValue,
    plannedSpanMs,
    nowBeyondDomain,
    planEvents,
    realEvents,
    runningDeltas,
    failMarkers,
    runningNow,
    remainingNow,
    anchor,
    holguraMin,
    etaMs,
    startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : null,
    stats: {
      finalizadas,
      exitosas: ok,
      withRestart,
      fallidas,
      pendientes,
      enCurso,
      tiempoUsadoMin,
    },
    workstreams: buildWorkstreamRows(detail, nowMs),
  };
}

/** Restantes justo después de `atMs` siguiendo la serie de eventos. */
export function remainingAfter(
  total: number,
  events: StairEvent[],
  atMs: number,
): number {
  let rem = total;
  for (const event of events) {
    if (event.t > atMs) break;
    rem -= 1;
  }
  return Math.max(0, rem);
}
