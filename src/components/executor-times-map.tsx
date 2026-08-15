"use client";

import {
  ArrowLeft,
  BadgeInfo,
  ChevronRight,
  CircleCheck,
  CirclePlay,
  CircleX,
  Clock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  StepActionFlower,
  type FlowerAction,
} from "@/components/step-action-flower";
import {
  computeSchedule,
  type TimesViewRow,
} from "@/components/times-view";
import {
  filterStepsByFocus,
  isMineStep,
  isMyExecutorStep,
  runtimeBarTone,
  type ExecutionFocusMode,
} from "@/lib/execution-focus";
import type { GateSummary } from "@/lib/admin-data";
import {
  unmetStepDependencies,
  type ExecutionGateSummary,
  type RuntimeStepSummary,
} from "@/lib/execution-types";
import { requiredGateIdsForStep } from "@/lib/gate-runtime";
import { cn } from "@/lib/utils";

/** Acciones que abren el diálogo con hora (y adjuntos opcionales al cerrar). */
export type OutcomeAction =
  | "start"
  | "restart"
  | "complete_success"
  | "complete_fail"
  | "force_success";

const DEFAULT_DURATION_MINUTES = 30;
const SLOT_MINUTES = 15;
/** Alto por slot de 15 min (baja densidad = más aire). */
const ROW_PX = 52;
/**
 * Alto mínimo visible de tarjeta de paso, aunque dure 1–5 min.
 * Debe caber título + actividad sin verse como una raya.
 */
const MIN_CARD_PX = 52;
const TIME_COL_PX = 52;
/** Ancho fijo de columna de jerarquía (WS / bloque / actividad). */
const LANE_COL_PX = 88;
const DAY_STICKY_H = 40;
const LANE_STICKY_H = 72;
const STICKY_STACK_H = DAY_STICKY_H + LANE_STICKY_H;

type DaySection = {
  dayKey: string;
  label: string;
  slots: Array<{ ms: number; label: string; dayKey: string }>;
  dayStart: number;
  dayEnd: number;
};

/** Hora absoluta bajo el stack sticky (inicio del viewport útil). */
function viewportTimeMs(
  scrollTop: number,
  sections: DaySection[],
): number | null {
  if (!sections.length) return null;
  const y0 = scrollTop + STICKY_STACK_H;
  let offset = 0;
  for (const section of sections) {
    const bodyHeight = section.slots.length * ROW_PX;
    if (y0 >= offset && y0 < offset + bodyHeight) {
      const ratio = (y0 - offset) / bodyHeight;
      return (
        section.dayStart + ratio * (section.dayEnd - section.dayStart)
      );
    }
    offset += bodyHeight + STICKY_STACK_H;
  }
  const last = sections[sections.length - 1]!;
  return last.dayEnd;
}

/** Scroll para que `targetMs` quede justo bajo el sticky. */
function scrollTopForTimeMs(
  targetMs: number,
  sections: DaySection[],
): number | null {
  if (!sections.length) return null;
  let offset = 0;
  for (const section of sections) {
    const bodyHeight = section.slots.length * ROW_PX;
    if (targetMs >= section.dayStart && targetMs < section.dayEnd) {
      const ratio =
        (targetMs - section.dayStart) / (section.dayEnd - section.dayStart);
      return Math.max(0, offset + ratio * bodyHeight - STICKY_STACK_H);
    }
    offset += bodyHeight + STICKY_STACK_H;
  }
  if (targetMs < sections[0]!.dayStart) return 0;
  return Math.max(0, offset - STICKY_STACK_H - ROW_PX * 4);
}

type DrillPath =
  | { kind: "root" }
  | {
      kind: "workstream";
      workstreamId: string;
      workstreamName: string;
    }
  | {
      kind: "block";
      workstreamId: string;
      workstreamName: string;
      blockId: string;
      blockName: string;
    }
  | {
      kind: "activity";
      workstreamId: string;
      workstreamName: string;
      blockId: string;
      blockName: string;
      activityId: string;
      activityName: string;
    };

type LaneStats = {
  total: number;
  ok: number;
  fail: number;
  running: number;
  waiting: number;
};

type Lane = {
  key: string;
  label: string;
  stats: LaneStats;
  /** Drill target al tocar el chip / envelope. */
  drill: DrillPath;
};

function emptyStats(): LaneStats {
  return { total: 0, ok: 0, fail: 0, running: 0, waiting: 0 };
}

function addStepToStats(stats: LaneStats, step: RuntimeStepSummary) {
  stats.total += 1;
  if (
    step.status === "EXITOSO" ||
    step.status === "APROBADO" ||
    step.status === "OMITIDO" ||
    step.status === "SIMULADO"
  ) {
    stats.ok += 1;
  } else if (step.status === "FALLIDO") {
    stats.fail += 1;
  } else if (step.status === "INICIADO") {
    stats.running += 1;
  } else {
    // Pendiente de inicio o espera de aprobación
    stats.waiting += 1;
  }
}

function formatLaneStatsTitle(stats: LaneStats): string {
  return `${stats.ok} ok · ${stats.fail} fallidos · ${stats.running} en curso · ${stats.waiting} en espera`;
}

/** Contadores reales del carril (ok / fallidos / en curso / en espera). */
function LaneStatsBlock({ stats }: { stats: LaneStats }) {
  const cell = "inline-flex items-center gap-0.5";
  const num = "inline-block min-w-[3ch] text-right text-white tabular-nums";
  return (
    <span className="mt-auto flex w-full min-w-0 flex-col items-center gap-0.5 font-mono text-[11px] leading-none">
      <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
        <span className={cell}>
          <CircleCheck className="size-3 shrink-0 text-emerald-400" aria-hidden />
          <span className={num}>{stats.ok}</span>
        </span>
        <span className={cell}>
          <CircleX className="size-3 shrink-0 text-rose-400" aria-hidden />
          <span className={num}>{stats.fail}</span>
        </span>
      </span>
      <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
        <span className={cell}>
          <CirclePlay className="size-3 shrink-0 text-sky-400" aria-hidden />
          <span className={num}>{stats.running}</span>
        </span>
        <span className={cell}>
          <Clock className="size-3 shrink-0 text-amber-400" aria-hidden />
          <span className={num}>{stats.waiting}</span>
        </span>
      </span>
    </span>
  );
}

type TimedStep = {
  step: RuntimeStepSummary;
  startMs: number;
  endMs: number;
  startMin: number;
  durationMin: number;
  dayKey: string;
  mine: boolean;
  column: number;
};

type TimedItem = TimedStep & {
  /** Presente en envelopes de WS/bloque (no en pasos). */
  laneKey?: string;
};

function dayKeyFromMs(ms: number, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function dayLabelFromKey(dayKey: string, timezone: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 16, 0, 0));
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    weekday: "long",
    day: "2-digit",
    month: "short",
  }).format(probe);
}

function clockLabel(ms: number, timezone: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function floorToSlot(ms: number) {
  return Math.floor(ms / (SLOT_MINUTES * 60_000)) * (SLOT_MINUTES * 60_000);
}

function ceilToSlot(ms: number) {
  return Math.ceil(ms / (SLOT_MINUTES * 60_000)) * (SLOT_MINUTES * 60_000);
}

function barTone(
  status: RuntimeStepSummary["status"],
  mine: boolean,
  dimOthers: boolean,
) {
  return runtimeBarTone({ status, mine, dimOthers });
}

function startBlockedLabel(
  step: RuntimeStepSummary,
  allSteps: RuntimeStepSummary[],
  executionGates: ExecutionGateSummary[] = [],
) {
  const parts: string[] = [];
  const blockers = unmetStepDependencies(step, allSteps);
  if (blockers.length) {
    const failed = blockers.filter((item) => item.reason === "failed");
    if (failed.length) {
      parts.push(
        `Deps fallidas — rearrancar el fallido o Event Admin puede Forzar: ${failed.map((item) => item.name).join(", ")}`,
      );
    } else {
      parts.push(
        `Esperando deps: ${blockers.map((item) => item.name).join(", ")}`,
      );
    }
  }
  for (const gateId of requiredGateIdsForStep(step, executionGates)) {
    const gate = executionGates.find((item) => item.id === gateId);
    if (!gate) {
      parts.push("Gate requerido faltante");
      continue;
    }
    if (!gate.open) {
      const details = gate.blockers.map((item) => item.detail).join(", ");
      parts.push(`Esperando gate ${gate.name}${details ? `: ${details}` : ""}`);
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

function flowerActionsFor(input: {
  step: RuntimeStepSummary;
  allSteps: RuntimeStepSummary[];
  executionGates?: ExecutionGateSummary[];
  busy: boolean;
  canAct: boolean;
  canForceSuccess: boolean;
  canApprove: boolean;
  allowStepOperations?: boolean;
  onOutcome: (action: OutcomeAction) => void;
  onApproval: (action: "approve" | "reject") => void;
  onInfo: () => void;
}): FlowerAction[] {
  const {
    step,
    allSteps,
    executionGates = [],
    busy,
    canAct,
    canForceSuccess,
    canApprove,
    allowStepOperations = true,
    onOutcome,
    onApproval,
    onInfo,
  } = input;
  const actions: FlowerAction[] = [
    {
      key: "info",
      label: "Información",
      icon: BadgeInfo,
      tone: "info",
      onClick: onInfo,
    },
  ];

  if (step.status === "PENDIENTE_APROBACION" && canApprove) {
    actions.push(
      {
        key: "approve",
        label: "Aprobar",
        icon: ShieldCheck,
        tone: "success",
        disabled: busy,
        onClick: () => onApproval("approve"),
      },
      {
        key: "reject",
        label: "Rechazar",
        icon: CircleX,
        tone: "danger",
        disabled: busy,
        onClick: () => onApproval("reject"),
      },
    );
  }

  if (!allowStepOperations) {
    if (step.status === "FALLIDO" && canForceSuccess) {
      actions.push({
        key: "force",
        label: "Forzar OK",
        icon: ShieldAlert,
        tone: "neutral",
        disabled: busy,
        title: "Requiere comentario. Desbloquea dependientes.",
        onClick: () => onOutcome("force_success"),
      });
    }
    return actions;
  }

  if (step.status === "PLANIFICADO" || step.status === "RECHAZADO") {
    const blocked = startBlockedLabel(step, allSteps, executionGates);
    actions.push({
      key: "start",
      label: blocked
        ? canAct
          ? "Iniciar (bloqueado)"
          : "Iniciar (solo lectura)"
        : canAct
          ? "Iniciar"
          : "Iniciar (solo lectura)",
      icon: CirclePlay,
      tone: "go",
      disabled: busy || !canAct || Boolean(blocked),
      title: blocked ?? undefined,
      onClick: () => {
        if (!canAct || blocked) return;
        onOutcome("start");
      },
    });
  }

  if (step.status === "INICIADO") {
    actions.push(
      {
        key: "success",
        label: canAct ? "Exitoso" : "Exitoso (solo lectura)",
        icon: CircleCheck,
        tone: "success",
        disabled: busy || !canAct,
        onClick: () => {
          if (!canAct) return;
          onOutcome("complete_success");
        },
      },
      {
        key: "fail",
        label: canAct ? "Fallido" : "Fallido (solo lectura)",
        icon: CircleX,
        tone: "danger",
        disabled: busy || !canAct,
        onClick: () => {
          if (!canAct) return;
          onOutcome("complete_fail");
        },
      },
    );
  }

  if (step.status === "FALLIDO") {
    if (canAct) {
      actions.push({
        key: "restart",
        label: "Rearrancar",
        icon: RotateCcw,
        tone: "go",
        disabled: busy,
        title: "Vuelve a Iniciado para intentarlo de nuevo.",
        onClick: () => onOutcome("restart"),
      });
    }
    if (canForceSuccess) {
      actions.push({
        key: "force",
        label: "Forzar OK",
        icon: ShieldAlert,
        tone: "neutral",
        disabled: busy,
        title: "Requiere comentario. Desbloquea dependientes.",
        onClick: () => onOutcome("force_success"),
      });
    }
  }

  return actions;
}

function stepTimeBounds(
  step: RuntimeStepSummary,
  t0Ms: number,
  schedule?: Map<string, { startMin: number; endMin: number }>,
): { startMs: number; endMs: number } {
  const scheduled = schedule?.get(step.id);
  if (scheduled) {
    return {
      startMs: t0Ms + scheduled.startMin * 60_000,
      endMs: t0Ms + scheduled.endMin * 60_000,
    };
  }
  const durationMin = step.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES;
  const startMs = step.actualStartedAt
    ? new Date(step.actualStartedAt).getTime()
    : step.plannedStartAt
      ? new Date(step.plannedStartAt).getTime()
      : t0Ms;
  const endMs = step.actualEndedAt
    ? new Date(step.actualEndedAt).getTime()
    : startMs + durationMin * 60_000;
  return {
    startMs: Math.min(startMs, endMs),
    endMs: Math.max(startMs, endMs),
  };
}

function toScheduleRow(step: RuntimeStepSummary): TimesViewRow {
  return {
    id: step.id,
    name: step.name,
    workstreamId: step.workstreamId,
    blockId: step.blockId,
    workstreamName: step.workstreamName,
    blockName: step.blockName,
    activityName: step.activityName,
    plannedStartAt: step.plannedStartAt,
    estimatedDurationMinutes: step.estimatedDurationMinutes,
    dependencyStepIds: step.dependencyStepIds,
    producesGateId: step.producesGateId,
    requiresGateIds: step.requiresGateIds,
    order: step.order,
    actualStartedAt: step.actualStartedAt,
    actualEndedAt: step.actualEndedAt,
  };
}

function overlaps(
  startMs: number,
  endMs: number,
  rangeStart: number,
  rangeEnd: number,
) {
  return startMs < rangeEnd && endMs > rangeStart;
}

/** Empaqueta ítems que se solapan en columnas distintas (como el mapa original). */
function assignColumns<T extends { startMs: number; endMs: number }>(
  items: T[],
): Array<T & { column: number }> {
  const sorted = [...items].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );
  const colEnds: number[] = [];
  const result: Array<T & { column: number }> = [];
  for (const item of sorted) {
    let col = colEnds.findIndex((end) => end <= item.startMs);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(item.endMs);
    } else {
      colEnds[col] = item.endMs;
    }
    result.push({ ...item, column: col });
  }
  return result;
}

function filterByDrill(
  steps: RuntimeStepSummary[],
  drill: DrillPath,
): RuntimeStepSummary[] {
  if (drill.kind === "root") return steps;
  if (drill.kind === "workstream") {
    return steps.filter((s) => s.workstreamId === drill.workstreamId);
  }
  if (drill.kind === "block") {
    return steps.filter(
      (s) =>
        s.workstreamId === drill.workstreamId && s.blockId === drill.blockId,
    );
  }
  return steps.filter(
    (s) =>
      s.workstreamId === drill.workstreamId &&
      s.blockId === drill.blockId &&
      s.activityId === drill.activityId,
  );
}

function buildLanes(
  scoped: RuntimeStepSummary[],
  drill: DrillPath,
  t0Ms: number,
  rangeStart: number,
  rangeEnd: number,
  schedule: Map<string, { startMin: number; endMin: number }>,
): Lane[] {
  const alive = scoped.filter((step) => {
    const { startMs, endMs } = stepTimeBounds(step, t0Ms, schedule);
    return overlaps(startMs, endMs, rangeStart, rangeEnd);
  });
  const source = alive.length ? alive : scoped;

  function statsFor(predicate: (step: RuntimeStepSummary) => boolean): LaneStats {
    const stats = emptyStats();
    for (const step of scoped) {
      if (predicate(step)) addStepToStats(stats, step);
    }
    return stats;
  }

  if (drill.kind === "activity") {
    return [
      {
        key: `activity:${drill.activityId}`,
        label: drill.activityName,
        stats: statsFor(() => true),
        drill,
      },
    ];
  }

  if (drill.kind === "block") {
    const map = new Map<string, Lane>();
    for (const step of source) {
      if (map.has(step.activityId)) continue;
      map.set(step.activityId, {
        key: `activity:${step.activityId}`,
        label: step.activityName,
        stats: statsFor((s) => s.activityId === step.activityId),
        drill: {
          kind: "activity",
          workstreamId: drill.workstreamId,
          workstreamName: drill.workstreamName,
          blockId: drill.blockId,
          blockName: drill.blockName,
          activityId: step.activityId,
          activityName: step.activityName,
        },
      });
    }
    return [...map.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "es"),
    );
  }

  if (drill.kind === "workstream") {
    const map = new Map<string, Lane>();
    for (const step of source) {
      if (map.has(step.blockId)) continue;
      map.set(step.blockId, {
        key: `block:${step.blockId}`,
        label: step.blockName,
        stats: statsFor((s) => s.blockId === step.blockId),
        drill: {
          kind: "block",
          workstreamId: drill.workstreamId,
          workstreamName: drill.workstreamName,
          blockId: step.blockId,
          blockName: step.blockName,
        },
      });
    }
    return [...map.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "es"),
    );
  }

  const map = new Map<string, Lane>();
  for (const step of source) {
    if (map.has(step.workstreamId)) continue;
    map.set(step.workstreamId, {
      key: `ws:${step.workstreamId}`,
      label: step.workstreamName,
      stats: statsFor((s) => s.workstreamId === step.workstreamId),
      drill: {
        kind: "workstream",
        workstreamId: step.workstreamId,
        workstreamName: step.workstreamName,
      },
    });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function laneKeyForStep(step: RuntimeStepSummary, drill: DrillPath): string {
  if (drill.kind === "activity") return `activity:${drill.activityId}`;
  if (drill.kind === "block") return `activity:${step.activityId}`;
  if (drill.kind === "workstream") return `block:${step.blockId}`;
  return `ws:${step.workstreamId}`;
}

function parentDrill(drill: DrillPath): DrillPath | null {
  if (drill.kind === "root") return null;
  if (drill.kind === "workstream") return { kind: "root" };
  if (drill.kind === "block") {
    return {
      kind: "workstream",
      workstreamId: drill.workstreamId,
      workstreamName: drill.workstreamName,
    };
  }
  return {
    kind: "block",
    workstreamId: drill.workstreamId,
    workstreamName: drill.workstreamName,
    blockId: drill.blockId,
    blockName: drill.blockName,
  };
}

function drillTitle(drill: DrillPath): string {
  if (drill.kind === "root") return "Workstreams";
  if (drill.kind === "workstream") return drill.workstreamName;
  if (drill.kind === "block") return drill.blockName;
  return drill.activityName;
}

export function ExecutorTimesMap({
  steps,
  actorId,
  timezone,
  anchorStartAt,
  gates = [],
  executionGates = [],
  workstreamIds,
  focusMode = "all",
  canOperateAny = false,
  canForceSuccess = false,
  canApproveAny = false,
  allowStepOperations = true,
  selectedId,
  busy,
  onSelect,
  onOutcome,
  onApproval,
  onOpenInfo,
}: {
  steps: RuntimeStepSummary[];
  actorId: string | null;
  timezone: string;
  anchorStartAt: string | null;
  /** Mismos gates que Times: calendariza deps/aperturas. */
  gates?: GateSummary[];
  /** Estado runtime de gates (candado de arranque). */
  executionGates?: ExecutionGateSummary[];
  workstreamIds: string[] | null;
  focusMode?: ExecutionFocusMode;
  canOperateAny?: boolean;
  canForceSuccess?: boolean;
  canApproveAny?: boolean;
  allowStepOperations?: boolean;
  selectedId: string | null;
  busy: boolean;
  onSelect: (stepId: string | null) => void;
  onOutcome: (stepId: string, action: OutcomeAction) => void;
  onApproval?: (stepId: string, action: "approve" | "reject") => void;
  onOpenInfo: (stepId: string) => void;
}) {
  const t0Ms = anchorStartAt ? new Date(anchorStartAt).getTime() : Date.now();
  const dimOthers = focusMode === "highlight-mine";
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [flowerOpenId, setFlowerOpenId] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillPath>({ kind: "root" });
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** Tras drill in/out: mantener la misma hora bajo el sticky. */
  const pendingScrollTimeRef = useRef<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(360);
  const [moreToRight, setMoreToRight] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{
    startMs: number;
    endMs: number;
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  /** Misma calendarización que el Panel (deps + gates), sobre todos los pasos. */
  const schedule = useMemo(() => {
    const rows = steps.map(toScheduleRow);
    return computeSchedule(rows, gates, anchorStartAt).items;
  }, [steps, gates, anchorStartAt]);

  const candidateSteps = useMemo(() => {
    const wsSet = workstreamIds == null ? null : new Set(workstreamIds);
    const focused = filterStepsByFocus(steps, actorId, focusMode);
    return focused.filter((step) => {
      if (wsSet && !wsSet.has(step.workstreamId)) return false;
      return true;
    });
  }, [steps, workstreamIds, focusMode, actorId]);

  const scopedSteps = useMemo(
    () => filterByDrill(candidateSteps, drill),
    [candidateSteps, drill],
  );

  const fullRange = useMemo(() => {
    if (!scopedSteps.length) {
      return { startMs: t0Ms, endMs: t0Ms + 60 * 60_000 };
    }
    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = Number.NEGATIVE_INFINITY;
    for (const step of scopedSteps) {
      const { startMs, endMs } = stepTimeBounds(step, t0Ms, schedule);
      minStart = Math.min(minStart, startMs);
      maxEnd = Math.max(maxEnd, endMs);
    }
    return {
      startMs: floorToSlot(minStart),
      endMs: ceilToSlot(Math.max(maxEnd, nowMs, t0Ms + 60 * 60_000)),
    };
  }, [scopedSteps, t0Ms, nowMs, schedule]);

  const viewStart = visibleRange?.startMs ?? fullRange.startMs;
  const viewEnd = visibleRange?.endMs ?? fullRange.endMs;

  const lanes = useMemo(
    () =>
      buildLanes(scopedSteps, drill, t0Ms, viewStart, viewEnd, schedule),
    [scopedSteps, drill, t0Ms, viewStart, viewEnd, schedule],
  );

  const showSteps = drill.kind === "activity";

  const timed = useMemo((): TimedItem[] => {
    const laneIndex = new Map(lanes.map((lane, index) => [lane.key, index]));
    if (showSteps) {
      // Pasos concurrentes (mismo inicio) no pueden ir todos en col 0: se tapaban.
      const raw = scopedSteps.map((step) => {
        const { startMs, endMs } = stepTimeBounds(step, t0Ms, schedule);
        return {
          step,
          startMs,
          endMs,
          startMin: Math.max(0, Math.round((startMs - t0Ms) / 60_000)),
          durationMin: Math.max(1, Math.round((endMs - startMs) / 60_000)),
          dayKey: dayKeyFromMs(startMs, timezone),
          mine: isMineStep(step, actorId),
        };
      });
      return assignColumns(raw);
    }

    const byLane = new Map<
      string,
      {
        startMs: number;
        endMs: number;
        mine: boolean;
        step: RuntimeStepSummary;
      }
    >();
    for (const step of scopedSteps) {
      const key = laneKeyForStep(step, drill);
      if (!laneIndex.has(key)) continue;
      const { startMs, endMs } = stepTimeBounds(step, t0Ms, schedule);
      const mine = isMineStep(step, actorId);
      const current = byLane.get(key);
      if (!current) {
        byLane.set(key, {
          startMs,
          endMs,
          mine,
          step,
        });
      } else {
        current.startMs = Math.min(current.startMs, startMs);
        current.endMs = Math.max(current.endMs, endMs);
        current.mine = current.mine || mine;
      }
    }

    return [...byLane.entries()].map(([key, envelope]) => ({
      step: envelope.step,
      startMs: envelope.startMs,
      endMs: envelope.endMs,
      startMin: Math.max(0, Math.round((envelope.startMs - t0Ms) / 60_000)),
      durationMin: Math.max(
        1,
        Math.round((envelope.endMs - envelope.startMs) / 60_000),
      ),
      dayKey: dayKeyFromMs(envelope.startMs, timezone),
      mine: envelope.mine,
      column: laneIndex.get(key) ?? 0,
      laneKey: key,
    }));
  }, [
    scopedSteps,
    lanes,
    showSteps,
    drill,
    t0Ms,
    timezone,
    actorId,
    schedule,
  ]);

  const columnCount = useMemo(() => {
    if (showSteps) {
      return Math.max(1, ...timed.map((item) => item.column + 1), 0);
    }
    return Math.max(1, lanes.length);
  }, [showSteps, timed, lanes.length]);
  const stepColPx = LANE_COL_PX;
  const gridWidth = TIME_COL_PX + columnCount * stepColPx;

  const daySections = useMemo((): DaySection[] => {
    type Slot = { ms: number; label: string; dayKey: string };
    const slots: Slot[] = [];
    for (
      let ms = fullRange.startMs;
      ms < fullRange.endMs;
      ms += SLOT_MINUTES * 60_000
    ) {
      slots.push({
        ms,
        label: clockLabel(ms, timezone),
        dayKey: dayKeyFromMs(ms, timezone),
      });
    }
    const byDay = new Map<string, Slot[]>();
    for (const slot of slots) {
      const list = byDay.get(slot.dayKey) ?? [];
      list.push(slot);
      byDay.set(slot.dayKey, list);
    }
    return [...byDay.entries()].map(([dayKey, daySlots]) => {
      const dayStart = daySlots[0]!.ms;
      const dayEnd = daySlots[daySlots.length - 1]!.ms + SLOT_MINUTES * 60_000;
      return {
        dayKey,
        label: dayLabelFromKey(dayKey, timezone),
        slots: daySlots,
        dayStart,
        dayEnd,
      };
    });
  }, [fullRange, timezone]);

  function rememberViewportTime() {
    const node = scrollerRef.current;
    if (!node) return;
    pendingScrollTimeRef.current = viewportTimeMs(
      node.scrollTop,
      daySections,
    );
  }

  function updateVisibleRange() {
    const node = scrollerRef.current;
    if (!node || !daySections.length) return;
    const y0 = node.scrollTop + STICKY_STACK_H;
    const y1 = node.scrollTop + node.clientHeight;
    // Una sola franja continua por ahora (primer día / acumulado).
    let offset = 0;
    let startMs = fullRange.startMs;
    let endMs = fullRange.endMs;
    for (const section of daySections) {
      const bodyHeight = section.slots.length * ROW_PX;
      const sectionTop = offset;
      const sectionBottom = offset + bodyHeight;
      const visTop = Math.max(y0, sectionTop);
      const visBottom = Math.min(y1, sectionBottom);
      if (visBottom > visTop) {
        const topRatio = (visTop - sectionTop) / bodyHeight;
        const bottomRatio = (visBottom - sectionTop) / bodyHeight;
        startMs =
          section.dayStart +
          topRatio * (section.dayEnd - section.dayStart);
        endMs =
          section.dayStart +
          bottomRatio * (section.dayEnd - section.dayStart);
        break;
      }
      offset += bodyHeight + STICKY_STACK_H;
    }
    setVisibleRange({ startMs, endMs });
    setContainerWidth(node.clientWidth);
    const remaining = node.scrollWidth - node.clientWidth - node.scrollLeft;
    setMoreToRight(remaining > 2);
  }

  useLayoutEffect(() => {
    const targetMs = pendingScrollTimeRef.current;
    if (targetMs == null) return;
    const node = scrollerRef.current;
    if (!node || !daySections.length) return;
    pendingScrollTimeRef.current = null;
    const nextTop = scrollTopForTimeMs(targetMs, daySections);
    if (nextTop != null) {
      node.scrollTop = nextTop;
    }
    updateVisibleRange();
  }, [drill, daySections]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    updateVisibleRange();
    const observer = new ResizeObserver(() => updateVisibleRange());
    observer.observe(node);
    node.addEventListener("scroll", updateVisibleRange, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", updateVisibleRange);
    };
  }, [daySections, gridWidth, drill.kind, lanes.length, fullRange.startMs, fullRange.endMs]);

  useEffect(() => {
    if (!selectedId) {
      setFlowerOpenId(null);
      return;
    }
    const root = scrollerRef.current;
    if (!root) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target || !root) return;
      if (!root.contains(target)) return;
      if (target.closest(`[data-step-card="${selectedId}"]`)) return;
      if (target.closest("[data-lane-chip]")) return;
      setFlowerOpenId(null);
      onSelect(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedId, onSelect]);

  function goBack() {
    const parent = parentDrill(drill);
    if (!parent) return;
    rememberViewportTime();
    setDrill(parent);
    onSelect(null);
    setFlowerOpenId(null);
  }

  function enterLane(lane: Lane) {
    if (lane.drill.kind === "activity" && drill.kind === "block") {
      rememberViewportTime();
      setDrill(lane.drill);
      onSelect(null);
      setFlowerOpenId(null);
      return;
    }
    if (lane.drill.kind === drill.kind) return;
    rememberViewportTime();
    setDrill(lane.drill);
    onSelect(null);
    setFlowerOpenId(null);
  }

  if (!steps.length) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Sin pasos en esta ejecución.
      </p>
    );
  }

  if (!scopedSteps.length) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No hay pasos con este filtro.
      </p>
    );
  }

  const back = parentDrill(drill);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ minWidth: gridWidth }} className="pb-10">
          {daySections.map((section) => {
            const bodyHeight = section.slots.length * ROW_PX;
            const sectionItems = timed.filter(
              (item) =>
                item.startMs < section.dayEnd && item.endMs > section.dayStart,
            );
            return (
              <section key={section.dayKey} className="relative">
                {/* Día */}
                <div
                  className="sticky top-0 z-30 border-b border-cyan-500/30 bg-background/95 px-3 backdrop-blur"
                  style={{ width: containerWidth, height: DAY_STICKY_H }}
                >
                  <p className="flex h-full items-center text-sm font-semibold capitalize">
                    {section.label}
                  </p>
                </div>

                {/* Fila de lanes (sombra bajo el día) */}
                <div
                  className="sticky z-30 border-b-2 border-white/35 bg-background/95 shadow-[0_6px_12px_-6px_rgba(0,0,0,0.55)] backdrop-blur"
                  style={{
                    top: DAY_STICKY_H,
                    width: Math.max(containerWidth, gridWidth),
                    height: LANE_STICKY_H,
                  }}
                >
                  <div
                    className="grid h-full"
                    style={{
                      gridTemplateColumns: `${TIME_COL_PX}px repeat(${columnCount}, ${stepColPx}px)`,
                      width: gridWidth,
                    }}
                  >
                    <button
                      type="button"
                      disabled={!back}
                      onClick={goBack}
                      className={cn(
                        "sticky left-0 z-[26] flex items-center justify-center border-r-2 border-white/30 bg-background/95",
                        back
                          ? "text-amber-200 hover:bg-amber-500/20"
                          : "text-muted-foreground/50",
                      )}
                      title={back ? `Volver a ${drillTitle(back)}` : undefined}
                      aria-label={
                        back ? `Volver a ${drillTitle(back)}` : "Nivel raíz"
                      }
                    >
                      {back ? (
                        <ArrowLeft className="size-6 stroke-[2.5]" aria-hidden />
                      ) : null}
                    </button>
                    {showSteps && lanes[0] ? (
                      <button
                        type="button"
                        data-lane-chip
                        onClick={() => enterLane(lanes[0]!)}
                        className="flex min-w-0 flex-col items-stretch justify-start gap-0.5 border-r-2 border-white/25 px-1 py-0.5 text-left hover:bg-amber-500/10"
                        style={{ gridColumn: `span ${columnCount}` }}
                        title={`${lanes[0].label} · ${formatLaneStatsTitle(lanes[0].stats)}`}
                      >
                        <span className="line-clamp-2 text-center text-xs font-semibold leading-tight break-words text-amber-50">
                          {lanes[0].label}
                        </span>
                        <LaneStatsBlock stats={lanes[0].stats} />
                      </button>
                    ) : (
                      lanes.map((lane) => (
                        <button
                          key={lane.key}
                          type="button"
                          data-lane-chip
                          onClick={() => enterLane(lane)}
                          className="flex min-w-0 flex-col items-stretch justify-start gap-0.5 border-r-2 border-white/25 px-1 py-0.5 text-left hover:bg-amber-500/10"
                          title={`${lane.label} · ${formatLaneStatsTitle(lane.stats)}`}
                        >
                          <span className="line-clamp-2 text-center text-xs font-semibold leading-tight break-words text-amber-50">
                            {lane.label}
                          </span>
                          <LaneStatsBlock stats={lane.stats} />
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div
                  className="relative"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `${TIME_COL_PX}px repeat(${columnCount}, ${stepColPx}px)`,
                    minHeight: bodyHeight,
                  }}
                >
                  <div className="sticky left-0 z-[25] border-r-2 border-white/30 bg-background/95 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.45)] backdrop-blur">
                    {section.slots.map((slot) => {
                      const isHour = slot.label.endsWith(":00");
                      return (
                        <div
                          key={slot.ms}
                          className={cn(
                            "flex items-start justify-end bg-muted/30 pr-1.5 pt-0.5 font-mono text-[10px]",
                            isHour
                              ? "border-b-2 border-white/40 font-medium text-foreground/80"
                              : "border-b border-white/20 text-muted-foreground",
                          )}
                          style={{ height: ROW_PX }}
                        >
                          {slot.label}
                        </div>
                      );
                    })}
                  </div>

                  {Array.from({ length: columnCount }, (_, col) => (
                    <div
                      key={`col-${col}`}
                      className="relative border-r-2 border-white/25"
                      style={{ height: bodyHeight }}
                    >
                      {section.slots.map((slot) => {
                        const isHour = slot.label.endsWith(":00");
                        return (
                          <div
                            key={`${col}-${slot.ms}`}
                            className={cn(
                              isHour
                                ? "border-b-2 border-white/35"
                                : "border-b border-white/18",
                            )}
                            style={{ height: ROW_PX }}
                          />
                        );
                      })}
                    </div>
                  ))}

                  {nowMs >= section.dayStart && nowMs < section.dayEnd ? (
                    <div
                      className="pointer-events-none absolute right-0 left-0 z-20 border-t-2 border-rose-400"
                      style={{
                        top:
                          ((nowMs - section.dayStart) /
                            (SLOT_MINUTES * 60_000)) *
                          ROW_PX,
                      }}
                    >
                      <span className="absolute top-0 left-[52px] -translate-y-1/2 rounded bg-rose-500 px-1 text-[9px] font-bold text-white">
                        AHORA
                      </span>
                    </div>
                  ) : null}

                  {sectionItems.map((item) => {
                    const topMs = Math.max(item.startMs, section.dayStart);
                    const bottomMs = Math.min(item.endMs, section.dayEnd);
                    const top =
                      ((topMs - section.dayStart) / (SLOT_MINUTES * 60_000)) *
                      ROW_PX;
                    const height = Math.max(
                      MIN_CARD_PX,
                      ((bottomMs - topMs) / (SLOT_MINUTES * 60_000)) * ROW_PX -
                        2,
                    );
                    const left = TIME_COL_PX + item.column * stepColPx + 3;
                    const width = stepColPx - 6;
                    const selected = showSteps && selectedId === item.step.id;
                    const flowerOpen = flowerOpenId === item.step.id;
                    const lane = !showSteps
                      ? lanes.find((l) => l.key === item.laneKey)
                      : null;

                    if (!showSteps) {
                      return (
                        <button
                          key={`${section.dayKey}-env-${item.laneKey ?? item.column}`}
                          type="button"
                          data-lane-chip
                          onClick={() => {
                            if (lane) enterLane(lane);
                          }}
                          className={cn(
                            "absolute flex flex-col overflow-hidden rounded-md border px-1.5 py-1 text-left shadow-sm",
                            "border-neutral-400 bg-neutral-300 text-black",
                            "z-[2] hover:bg-neutral-200",
                          )}
                          style={{ top: top + 1, left, width, height }}
                          title={
                            lane
                              ? `${lane.label} · ${formatLaneStatsTitle(lane.stats)}`
                              : "Abrir"
                          }
                        >
                          <span className="line-clamp-2 text-center text-xs font-semibold leading-tight break-words">
                            {lane?.label ?? "…"}
                          </span>
                        </button>
                      );
                    }

                    return (
                      <div
                        key={`${section.dayKey}-${item.step.id}`}
                        data-step-card={item.step.id}
                        className={cn(
                          "absolute flex flex-col overflow-visible rounded-md border px-1.5 py-1 shadow-sm",
                          barTone(
                            item.step.status,
                            item.mine,
                            dimOthers,
                          ),
                          flowerOpen
                            ? "z-40"
                            : selected
                              ? "z-30 ring-2 ring-white/70"
                              : "z-[2]",
                        )}
                        style={{ top: top + 1, left, width, height }}
                      >
                        <button
                          type="button"
                          className="flex min-h-0 flex-1 flex-col items-stretch gap-0.5 text-left"
                          onClick={() => {
                            const next =
                              selectedId === item.step.id
                                ? null
                                : item.step.id;
                            onSelect(next);
                            setFlowerOpenId(null);
                          }}
                        >
                          <span className="line-clamp-2 text-[10px] font-semibold leading-tight">
                            {item.mine ? "★ " : ""}
                            {item.step.name}
                          </span>
                          <span className="truncate text-[9px] opacity-80">
                            {item.step.activityName}
                          </span>
                        </button>
                        {selected ? (
                          <div className="mt-auto flex justify-end pt-0.5">
                            <StepActionFlower
                              open={flowerOpen}
                              layout="vertical"
                              onToggle={() =>
                                setFlowerOpenId((current) =>
                                  current === item.step.id
                                    ? null
                                    : item.step.id,
                                )
                              }
                              onClose={() => setFlowerOpenId(null)}
                              actions={flowerActionsFor({
                                step: item.step,
                                allSteps: steps,
                                executionGates,
                                busy,
                                canAct:
                                  isMyExecutorStep(item.step, actorId) ||
                                  canOperateAny,
                                canForceSuccess,
                                canApprove:
                                  canApproveAny ||
                                  Boolean(
                                    actorId &&
                                      item.step.approverActorIds.includes(
                                        actorId,
                                      ),
                                  ),
                                allowStepOperations,
                                onOutcome: (action) => {
                                  setFlowerOpenId(null);
                                  onSelect(null);
                                  onOutcome(item.step.id, action);
                                },
                                onApproval: (action) => {
                                  setFlowerOpenId(null);
                                  onSelect(null);
                                  onApproval?.(item.step.id, action);
                                },
                                onInfo: () => {
                                  setFlowerOpenId(null);
                                  onOpenInfo(item.step.id);
                                },
                              })}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {moreToRight ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-40 flex w-10 items-center justify-end bg-gradient-to-l from-background via-background/80 to-transparent pr-1"
          aria-hidden
        >
          <span
            title="Hay más a la derecha"
            className="flex size-8 items-center justify-center rounded-full border border-sky-300/60 bg-sky-500/90 text-white shadow-lg"
          >
            <ChevronRight className="size-5" strokeWidth={2.75} />
          </span>
        </div>
      ) : null}
    </div>
  );
}
