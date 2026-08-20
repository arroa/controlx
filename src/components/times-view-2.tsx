"use client";

import { BadgeInfo, ChevronDown, ChevronRight, Paperclip } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type UIEvent } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  StepActionFlower,
  type FlowerAction,
} from "@/components/step-action-flower";
import type { GateSummary } from "@/lib/admin-data";
import { stepMatchesGateTarget } from "@/lib/gate-targets";
import { cn } from "@/lib/utils";

export const DEFAULT_DURATION_MINUTES = 30;

export const TIMES_VIEW_ZOOM_OPTIONS = [
  { id: "1h" as const, label: "1 h", minutes: 60 },
  { id: "4h" as const, label: "4 h", minutes: 240 },
  { id: "12h" as const, label: "12 h", minutes: 720 },
  { id: "1d" as const, label: "1 día", minutes: 1440 },
  { id: "all" as const, label: "Todo", minutes: null },
];
export type TimesViewZoomId = (typeof TIMES_VIEW_ZOOM_OPTIONS)[number]["id"];
export type TimesViewVariant = "run" | "plan";

export function TimesViewWindowControls({
  zoom,
  onZoomChange,
  onFold,
}: {
  zoom: TimesViewZoomId;
  onZoomChange: (id: TimesViewZoomId) => void;
  onFold: (action: "open" | "collapse") => void;
}) {
  return (
    <>
      <div className="flex overflow-hidden rounded-md border">
        {TIMES_VIEW_ZOOM_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onZoomChange(option.id)}
            className={cn(
              "px-2.5 py-1.5 text-xs font-medium transition",
              zoom === option.id
                ? "bg-cyan-500/20 text-cyan-100"
                : "bg-muted/20 text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex overflow-hidden rounded-md border">
        <button
          type="button"
          onClick={() => onFold("collapse")}
          className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          Colapsar
        </button>
        <button
          type="button"
          onClick={() => onFold("open")}
          className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          Abrir
        </button>
      </div>
    </>
  );
}

/**
 * Ancho mínimo de barra: pasos cortos (p.ej. 5 min) seguirían siendo un punto
 * a la densidad del eje. Se dibujan más anchos para poder leer/tocar; la
 * duración real sigue en el title y en la modal de info.
 */
/** Aire a la derecha del eje para que la última barra no se meta en el scroll. */
const CHART_RIGHT_GUTTER_PX = 20;
const MIN_BAR_WIDTH_PX = 56;
/** Con flor abierta hace falta sitio para el trigger "?" + un poco de etiqueta. */
const MIN_BAR_WIDTH_WITH_FLOWER_PX = 84;
const GATE_COLORS = [
  "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300",
];

function gateColorClass(index: number) {
  return GATE_COLORS[index % GATE_COLORS.length]!;
}

/**
 * Fila mínima que necesita TimesView para calendarizar y renderizar.
 * Cubre tanto pasos del planificador (DesignStepSummary) como pasos de
 * ejecución (RuntimeStepSummary): el consumidor mapea su tipo a este.
 */
export type TimesViewRow = {
  id: string;
  name: string;
  workstreamId: string;
  blockId: string;
  workstreamName: string;
  blockName: string;
  activityName: string;
  description?: string;
  plannedStartAt: string | null;
  estimatedDurationMinutes: number | null;
  dependencyStepIds: string[];
  approvalRoles?: string[];
  producesGateId?: string | null;
  requiresGateIds?: string[];
  order: number;
  /** Campos opcionales de runtime (ejecución). Ausentes en el planificador. */
  status?: string;
  mine?: boolean;
  /** Si el paso exige adjunto al marcar éxito. */
  evidenceRequired?: boolean;
  /** false = el paso no se puede seleccionar/operar (p. ej. no es mío ni admin). */
  operable?: boolean;
  actualStartedAt?: string | null;
  actualEndedAt?: string | null;
};

export type ScheduleItem = {
  id: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  usedDefaultDuration: boolean;
};

type GateMarker = {
  id: string;
  name: string;
  openMin: number;
  colorIndex: number;
};

function stepsForTargets(
  rows: TimesViewRow[],
  targets: Array<{
    workstreamId: string;
    blockId: string | null;
    stepId?: string | null;
  }>,
) {
  return rows.filter((row) =>
    targets.some((target) => stepMatchesGateTarget(row, target)),
  );
}

export function computeSchedule(
  rows: TimesViewRow[],
  gates: GateSummary[],
  dayDStartAt: string | null,
): {
  items: Map<string, ScheduleItem>;
  totalMin: number;
  gateMarkers: GateMarker[];
  t0Ms: number | null;
} {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const producerByGate = new Map<string, string>();
  for (const row of rows) {
    if (row.producesGateId) producerByGate.set(row.producesGateId, row.id);
  }

  const inbound = new Map(rows.map((row) => [row.id, 0]));
  const outgoing = new Map<string, string[]>(rows.map((row) => [row.id, []]));

  function addEdge(fromId: string, toId: string) {
    if (!byId.has(fromId) || !byId.has(toId) || fromId === toId) return;
    inbound.set(toId, (inbound.get(toId) ?? 0) + 1);
    outgoing.get(fromId)?.push(toId);
  }

  for (const row of rows) {
    for (const depId of row.dependencyStepIds) {
      addEdge(depId, row.id);
    }
    for (const gateId of row.requiresGateIds ?? []) {
      const producerId = producerByGate.get(gateId);
      if (producerId) addEdge(producerId, row.id);
      const gate = gates.find((item) => item.id === gateId);
      if (!gate) continue;
      for (const closer of stepsForTargets(
        rows,
        gate.closesAfterTargets ?? [],
      )) {
        addEdge(closer.id, row.id);
      }
    }
  }

  // Megadeps del catálogo: cierre → apertura del gate.
  for (const gate of gates) {
    const closers = stepsForTargets(rows, gate.closesAfterTargets ?? []);
    const opened = stepsForTargets(rows, gate.opensTargets ?? []);
    const producerId = producerByGate.get(gate.id);
    for (const openStep of opened) {
      for (const closer of closers) {
        addEdge(closer.id, openStep.id);
      }
      if (producerId) addEdge(producerId, openStep.id);
    }
  }

  const queue = rows
    .filter((row) => (inbound.get(row.id) ?? 0) === 0)
    .map((row) => row.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const remaining = (inbound.get(next) ?? 0) - 1;
      inbound.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  for (const row of rows) {
    if (!order.includes(row.id)) order.push(row.id);
  }

  const fallbackPoints = [
    ...rows
      .filter((row) => row.plannedStartAt)
      .map((row) => new Date(row.plannedStartAt!).getTime()),
    ...gates
      .filter((gate) => gate.plannedOpenAt)
      .map((gate) => new Date(gate.plannedOpenAt!).getTime()),
  ];
  const t0Ms = dayDStartAt
    ? new Date(dayDStartAt).getTime()
    : fallbackPoints.length
      ? Math.min(...fallbackPoints)
      : null;

  const toOffsetMin = (iso: string) =>
    t0Ms == null
      ? 0
      : Math.max(0, Math.round((new Date(iso).getTime() - t0Ms) / 60_000));

  const anchorMin = new Map(
    rows
      .filter((row) => row.plannedStartAt && t0Ms != null)
      .map((row) => [row.id, toOffsetMin(row.plannedStartAt!)]),
  );
  const gateTimeMin = new Map(
    gates
      .filter((gate) => gate.plannedOpenAt && t0Ms != null)
      .map((gate) => [gate.id, toOffsetMin(gate.plannedOpenAt!)]),
  );

  const items = new Map<string, ScheduleItem>();
  for (const id of order) {
    const row = byId.get(id)!;
    const usedDefaultDuration = row.estimatedDurationMinutes == null;
    const durationMin = row.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES;

    // Ejecución: ventana real fija → los dependientes se redibujan desde ese fin.
    if (row.actualEndedAt && t0Ms != null) {
      const endMin = toOffsetMin(row.actualEndedAt);
      const startMin = row.actualStartedAt
        ? toOffsetMin(row.actualStartedAt)
        : Math.max(0, endMin - durationMin);
      const safeStart = Math.min(startMin, endMin);
      const safeEnd = Math.max(startMin, endMin);
      items.set(id, {
        id,
        startMin: safeStart,
        endMin: safeEnd,
        durationMin: Math.max(1, safeEnd - safeStart),
        usedDefaultDuration: false,
      });
      continue;
    }

    if (row.actualStartedAt && t0Ms != null) {
      const startMin = toOffsetMin(row.actualStartedAt);
      items.set(id, {
        id,
        startMin,
        endMin: startMin + durationMin,
        durationMin,
        usedDefaultDuration,
      });
      continue;
    }

    const depEnds = row.dependencyStepIds
      .map((depId) => items.get(depId)?.endMin)
      .filter((value): value is number => value != null);

    const gateConstraintMins: number[] = [];
    for (const gateId of row.requiresGateIds ?? []) {
      const producerId = producerByGate.get(gateId);
      if (producerId) {
        const end = items.get(producerId)?.endMin;
        if (end != null) gateConstraintMins.push(end);
      }
      const gate = gates.find((item) => item.id === gateId);
      if (!gate) continue;
      const timed = gateTimeMin.get(gateId);
      if (timed != null) gateConstraintMins.push(timed);
      for (const closer of stepsForTargets(
        rows,
        gate.closesAfterTargets ?? [],
      )) {
        const end = items.get(closer.id)?.endMin;
        if (end != null) gateConstraintMins.push(end);
      }
    }

    for (const gate of gates) {
      if (
        !(gate.opensTargets ?? []).some((target) =>
          stepMatchesGateTarget(row, target),
        )
      ) {
        continue;
      }
      const timed = gateTimeMin.get(gate.id);
      if (timed != null) gateConstraintMins.push(timed);
      const producerId = producerByGate.get(gate.id);
      if (producerId) {
        const end = items.get(producerId)?.endMin;
        if (end != null) gateConstraintMins.push(end);
      }
      for (const closer of stepsForTargets(
        rows,
        gate.closesAfterTargets ?? [],
      )) {
        const end = items.get(closer.id)?.endMin;
        if (end != null) gateConstraintMins.push(end);
      }
    }

    const fromDeps = depEnds.length ? Math.max(...depEnds) : 0;
    const fromGates = gateConstraintMins.length
      ? Math.max(...gateConstraintMins)
      : 0;
    const anchored = anchorMin.get(id);
    const startMin =
      anchored !== undefined
        ? Math.max(anchored, fromDeps, fromGates)
        : Math.max(fromDeps, fromGates);
    items.set(id, {
      id,
      startMin,
      endMin: startMin + durationMin,
      durationMin,
      usedDefaultDuration,
    });
  }

  const gateMarkers: GateMarker[] = gates
    .map((gate, index) => {
      const parts: number[] = [];
      const timed = gateTimeMin.get(gate.id);
      if (timed != null) parts.push(timed);
      const producerId = producerByGate.get(gate.id);
      if (producerId) {
        const end = items.get(producerId)?.endMin;
        if (end != null) parts.push(end);
      }
      for (const closer of stepsForTargets(
        rows,
        gate.closesAfterTargets ?? [],
      )) {
        const end = items.get(closer.id)?.endMin;
        if (end != null) parts.push(end);
      }

      const hasActivation =
        timed != null ||
        Boolean(producerId) ||
        (gate.closesAfterTargets ?? []).length > 0 ||
        (gate.approvalRoles ?? []).length > 0;

      if (!hasActivation && !(gate.opensTargets ?? []).length) return null;

      return {
        id: gate.id,
        name: gate.name,
        openMin: parts.length ? Math.max(...parts) : 0,
        colorIndex: index,
      };
    })
    .filter((marker): marker is GateMarker => marker != null);

  const totalMin = Math.max(
    60,
    ...[...items.values()].map((item) => item.endMin),
    ...gateMarkers.map((marker) => marker.openMin + 15),
  );
  return { items, totalMin, gateMarkers, t0Ms };
}

type LaneStats = {
  stepCount: number;
  durationMin: number;
  startMin: number | null;
  endMin: number | null;
};

function computeLaneStats(
  laneRows: TimesViewRow[],
  items: Map<string, ScheduleItem>,
): LaneStats {
  let durationMin = 0;
  let startMin: number | null = null;
  let endMin: number | null = null;
  for (const row of laneRows) {
    const item = items.get(row.id);
    if (!item) continue;
    durationMin += item.durationMin;
    startMin =
      startMin == null ? item.startMin : Math.min(startMin, item.startMin);
    endMin = endMin == null ? item.endMin : Math.max(endMin, item.endMin);
  }
  return { stepCount: laneRows.length, durationMin, startMin, endMin };
}

function formatDurationCompact(totalMin: number) {
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function isLaneStepDone(status: string | undefined) {
  return (
    status === "EXITOSO" ||
    status === "APROBADO" ||
    status === "SIMULADO" ||
    status === "OMITIDO"
  );
}

function computeLaneProgress(
  laneRows: TimesViewRow[],
  items: Map<string, ScheduleItem>,
  nowMin: number | null,
): { theoretical: number; real: number; dueCount: number; doneCount: number } {
  const total = laneRows.length;
  if (total === 0) {
    return { theoretical: 0, real: 0, dueCount: 0, doneCount: 0 };
  }
  let dueCount = 0;
  let doneCount = 0;
  for (const row of laneRows) {
    if (isLaneStepDone(row.status)) doneCount += 1;
    const item = items.get(row.id);
    if (nowMin != null && item && item.endMin <= nowMin) dueCount += 1;
  }
  return {
    theoretical: dueCount / total,
    real: doneCount / total,
    dueCount,
    doneCount,
  };
}

type LaneStatsDisplay = {
  /** Conteo de grupo (bloques o actividades); null en el nivel actividad. */
  blocksLabel: string | null;
  stepsLabel: string;
  durationLabel: string;
  rangeLabel: string;
  theoretical: number;
  real: number;
  dueCount: number;
  doneCount: number;
  stepCount: number;
};

function LaneProgressBar({
  theoretical,
  real,
  dueCount,
  doneCount,
  stepCount,
}: {
  theoretical: number;
  real: number;
  dueCount: number;
  doneCount: number;
  stepCount: number;
}) {
  const theoPct = Math.round(theoretical * 100);
  const realPct = Math.round(real * 100);
  return (
    <div
      className="relative h-5 w-full rounded-sm bg-white"
      title={`Teórico ${theoPct}% (${dueCount}/${stepCount} ya debían cerrar) · Real ${realPct}% (${doneCount}/${stepCount} cerrados)`}
    >
      <div
        className="absolute top-1/2 left-0 h-[90%] -translate-y-1/2 rounded-sm bg-[#22d3ee]"
        style={{ width: `${Math.min(100, theoretical * 100)}%` }}
      />
      <div
        className="absolute top-1/2 left-0 h-[50%] -translate-y-1/2 rounded-sm bg-blue-500"
        style={{ width: `${Math.min(100, real * 100)}%` }}
      />
      {[25, 50, 75].map((mark) => (
        <span
          key={mark}
          aria-hidden
          className="pointer-events-none absolute bottom-[5%] z-[1] h-0 w-0 -translate-x-1/2 border-x-[4px] border-b-[9px] border-x-transparent border-b-red-500"
          style={{ left: `${mark}%` }}
        />
      ))}
    </div>
  );
}

export function TimesLaneHeader({
  title,
  expanded,
  onToggle,
  stats,
  tone,
  showProgress = true,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  stats: LaneStatsDisplay;
  tone: "workstream" | "block" | "activity";
  showProgress?: boolean;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "sticky left-0 right-0 grid w-full items-center gap-3 py-1.5 pr-3 pl-3 text-left backdrop-blur transition-colors",
        showProgress
          ? "grid-cols-[14rem_minmax(6.5rem,1fr)_auto]"
          : "grid-cols-[minmax(14rem,1fr)_auto]",
        tone === "workstream" &&
          "z-[5] border-l-2 border-l-cyan-500/80 bg-slate-700/55 text-slate-100 hover:bg-slate-700/70",
        tone === "block" &&
          "z-[4] border-l-2 border-l-slate-500/70 bg-slate-800/40 text-slate-200 hover:bg-slate-800/55",
        tone === "activity" &&
          "z-[3] border-l-2 border-l-teal-500/50 bg-slate-900/35 text-slate-300 hover:bg-slate-900/50",
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-center gap-2",
          tone === "block" && "pl-3",
          tone === "activity" && "pl-6",
        )}
      >
        <Chevron className="size-4 shrink-0 opacity-70" />
        <span
          className={cn(
            "min-w-0 truncate text-left font-semibold tracking-wide",
            tone === "workstream" && "text-sm",
            tone === "block" && "text-[13px]",
            tone === "activity" && "text-xs font-medium",
          )}
        >
          {title}
        </span>
      </span>
      {showProgress ? (
        <LaneProgressBar
          theoretical={stats.theoretical}
          real={stats.real}
          dueCount={stats.dueCount}
          doneCount={stats.doneCount}
          stepCount={stats.stepCount}
        />
      ) : null}
      <span
        className="flex shrink-0 items-baseline gap-x-2 font-mono text-[10px] leading-none text-slate-300/85 tabular-nums"
        title={[
          stats.blocksLabel,
          stats.stepsLabel,
          stats.durationLabel,
          stats.rangeLabel,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        <span className="inline-block w-[5.5rem] text-right whitespace-nowrap">
          {stats.blocksLabel ?? "\u00A0"}
        </span>
        <span className="inline-block w-[4.25rem] text-right whitespace-nowrap">
          {stats.stepsLabel}
        </span>
        <span className="inline-block w-[3.75rem] text-right whitespace-nowrap">
          {stats.durationLabel}
        </span>
        <span className="inline-block w-[6.75rem] text-right whitespace-nowrap">
          {stats.rangeLabel}
        </span>
      </span>
    </button>
  );
}

const WINDOW_COLUMNS = 24;

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function clampWindowStart(start: number, span: number, totalMin: number) {
  if (span >= totalMin) return 0;
  return Math.max(0, Math.min(start, totalMin - span));
}

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function civilDayKey(
  offsetMin: number,
  t0Ms: number | null,
  timezone: string,
  useClock: boolean,
) {
  if (!useClock || t0Ms == null) {
    return `d${Math.floor(Math.max(0, offsetMin) / 1440)}`;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t0Ms + offsetMin * 60_000));
}

function formatDayChip(
  offsetMin: number,
  t0Ms: number | null,
  timezone: string,
  useClock: boolean,
) {
  if (!useClock || t0Ms == null) {
    const day = Math.floor(Math.max(0, offsetMin) / 1440) + 1;
    return `Día ${day}`;
  }
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(new Date(t0Ms + offsetMin * 60_000))
    .replaceAll(".", "");
}

function minutesIntoCivilDay(
  offsetMin: number,
  t0Ms: number | null,
  timezone: string,
  useClock: boolean,
) {
  if (!useClock || t0Ms == null) {
    return ((Math.floor(offsetMin) % 1440) + 1440) % 1440;
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(t0Ms + offsetMin * 60_000));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  return hour * 60 + minute;
}

function visibleDayBands(
  windowStart: number,
  windowEnd: number,
  t0Ms: number | null,
  timezone: string,
  useClock: boolean,
) {
  const bands: { startMin: number; endMin: number }[] = [];
  let cursor = windowStart;
  let guard = 0;
  while (cursor < windowEnd - 0.001 && guard < 8) {
    const intoDay = minutesIntoCivilDay(cursor, t0Ms, timezone, useClock);
    const remaining = intoDay === 0 ? 1440 : 1440 - intoDay;
    const end = Math.min(windowEnd, cursor + Math.max(remaining, 1));
    bands.push({ startMin: cursor, endMin: end });
    cursor = end;
    guard += 1;
  }
  return bands;
}

/** Etiqueta del eje: hora civil desde Día D, o offset relativo. */
function formatAxisLabel(
  offsetMin: number,
  t0Ms: number | null,
  timezone: string,
  useClock: boolean,
) {
  if (!useClock || t0Ms == null) return formatMinutes(offsetMin);
  const instant = new Date(t0Ms + offsetMin * 60_000);
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

export function TimesView2({
  rows,
  allRows,
  gates,
  eventTimezone,
  dayDStartAt,
  selectedId,
  onSelect,
  getFlowerActions,
  getBarClass,
  onOpenInfo,
  showBuiltInInfoDialog = true,
  zoom,
  foldAll = null,
  variant = "run",
}: {
  /** Filas visibles (tras filtro de búsqueda / WS / focus). */
  rows: TimesViewRow[];
  /** Todas las filas del plan/ejecución, usadas para calcular el schedule. */
  allRows: TimesViewRow[];
  gates: GateSummary[];
  eventTimezone: string;
  /** Inicio del Día D (planificador) o ancla de la ejecución. */
  dayDStartAt: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Acciones adicionales de la flor (además del "info" que gestiona TimesView). */
  getFlowerActions: (row: TimesViewRow) => FlowerAction[];
  /** Clase CSS completa de la barra (borde/fondo/texto) para el paso. */
  getBarClass: (row: TimesViewRow, active: boolean, flowerOpen: boolean) => string;
  /** Se llama cuando showBuiltInInfoDialog es false y se pulsa "Más información". */
  onOpenInfo?: (row: TimesViewRow) => void;
  /** Si es false, no se muestra el diálogo interno de información. */
  showBuiltInInfoDialog?: boolean;
  zoom: TimesViewZoomId;
  foldAll?: { action: "open" | "collapse"; nonce: number } | null;
  /** plan = preparación (sin playhead ni teórico/real). run = Panel / Mi turno. */
  variant?: TimesViewVariant;
}) {
  const { items, totalMin, gateMarkers, t0Ms } = useMemo(
    () => computeSchedule(allRows, gates, dayDStartAt),
    [allRows, gates, dayDStartAt],
  );
  const isClient = useIsClient();
  const [flowerOpenId, setFlowerOpenId] = useState<string | null>(null);
  const [infoRowId, setInfoRowId] = useState<string | null>(null);
  const infoRow =
    infoRowId == null
      ? null
      : (allRows.find((row) => row.id === infoRowId) ?? null);

  // Cierra la flor abierta cuando cambia la selección (ver "Adjusting state
  // when a prop changes" en la doc de React: evita un efecto para esto).
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setFlowerOpenId(null);
  }

  const lanes = useMemo(() => {
    const visibleIds = new Set(rows.map((row) => row.id));
    // workstream → block → activity → steps
    const byWs = new Map<
      string,
      Map<string, Map<string, TimesViewRow[]>>
    >();
    for (const row of allRows) {
      if (!visibleIds.has(row.id)) continue;
      let byBlock = byWs.get(row.workstreamName);
      if (!byBlock) {
        byBlock = new Map();
        byWs.set(row.workstreamName, byBlock);
      }
      let byActivity = byBlock.get(row.blockName);
      if (!byActivity) {
        byActivity = new Map();
        byBlock.set(row.blockName, byActivity);
      }
      const activityName = row.activityName?.trim() || "Sin actividad";
      const list = byActivity.get(activityName) ?? [];
      list.push(row);
      byActivity.set(activityName, list);
    }

    function earliestStart(laneRows: TimesViewRow[]) {
      let min = Number.POSITIVE_INFINITY;
      for (const row of laneRows) {
        const start = items.get(row.id)?.startMin;
        if (start != null && start < min) min = start;
      }
      return min;
    }

    function sortSteps(stepRows: TimesViewRow[]) {
      return [...stepRows].sort((a, b) => {
        const aStart = items.get(a.id)?.startMin ?? Number.POSITIVE_INFINITY;
        const bStart = items.get(b.id)?.startMin ?? Number.POSITIVE_INFINITY;
        return aStart - bStart || a.order - b.order;
      });
    }

    return [...byWs.entries()]
      .map(([workstreamName, byBlock]) => {
        const blocks = [...byBlock.entries()]
          .map(([blockName, byActivity]) => {
            const activities = [...byActivity.entries()]
              .map(([activityName, activityRows]) => ({
                activityName,
                rows: sortSteps(activityRows),
              }))
              .sort(
                (a, b) =>
                  earliestStart(a.rows) - earliestStart(b.rows) ||
                  a.activityName.localeCompare(b.activityName, "es"),
              );
            return {
              blockName,
              activities,
              rows: activities.flatMap((activity) => activity.rows),
            };
          })
          .sort(
            (a, b) =>
              earliestStart(a.rows) - earliestStart(b.rows) ||
              a.blockName.localeCompare(b.blockName, "es"),
          );
        return { workstreamName, blocks };
      })
      .sort((a, b) => {
        const aRows = a.blocks.flatMap((block) => block.rows);
        const bRows = b.blocks.flatMap((block) => block.rows);
        return (
          earliestStart(aRows) - earliestStart(bRows) ||
          a.workstreamName.localeCompare(b.workstreamName, "es")
        );
      });
  }, [allRows, rows, items]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [nowMs, setNowMs] = useState<number | null>(null);
  const isPlan = variant === "plan";

  const allGroupKeys = useMemo(() => {
    const keys: string[] = [];
    for (const { workstreamName, blocks } of lanes) {
      keys.push(`ws:${workstreamName}`);
      for (const { blockName, activities } of blocks) {
        const laneKey = `${workstreamName}::${blockName}`;
        keys.push(`block:${laneKey}`);
        for (const { activityName } of activities) {
          keys.push(`activity:${laneKey}::${activityName}`);
        }
      }
    }
    return keys;
  }, [lanes]);

  useEffect(() => {
    if (!foldAll) return;
    setCollapsed(
      foldAll.action === "collapse" ? new Set(allGroupKeys) : new Set(),
    );
    // Solo al pulsar Colapsar/Abrir; no reaplicar si el plan se actualiza.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce
  }, [foldAll]);
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const ignoreHScroll = useRef(false);
  const didSnapNow = useRef(false);
  const prevSpanRef = useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [windowStart, setWindowStart] = useState(0);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => setViewportWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = hScrollRef.current;
    if (!node) return;
    const update = () => setTrackWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isPlan) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [isPlan]);

  const zoomOption = TIMES_VIEW_ZOOM_OPTIONS.find((option) => option.id === zoom)!;
  const windowSpan =
    zoomOption.minutes == null
      ? totalMin
      : Math.min(zoomOption.minutes, totalMin);
  const nowMin =
    t0Ms != null && nowMs != null ? (nowMs - t0Ms) / 60_000 : null;

  useEffect(() => {
    if (isPlan || didSnapNow.current || nowMin == null) return;
    didSnapNow.current = true;
    setWindowStart(
      clampWindowStart(nowMin - windowSpan / 2, windowSpan, totalMin),
    );
  }, [isPlan, nowMin, windowSpan, totalMin]);

  useEffect(() => {
    if (prevSpanRef.current == null) {
      prevSpanRef.current = windowSpan;
      return;
    }
    if (prevSpanRef.current === windowSpan) return;
    const oldSpan = prevSpanRef.current;
    prevSpanRef.current = windowSpan;
    setWindowStart((start) =>
      clampWindowStart(start + oldSpan / 2 - windowSpan / 2, windowSpan, totalMin),
    );
  }, [windowSpan, totalMin]);

  const panRange = Math.max(0, totalMin - windowSpan);
  const canPan = panRange > 0;
  const clampedStart = clampWindowStart(windowStart, windowSpan, totalMin);
  const windowEnd = clampedStart + windowSpan;
  const chartWidth = Math.max(
    1,
    (viewportWidth || 960) - CHART_RIGHT_GUTTER_PX,
  );
  const pxPerMin = chartWidth / Math.max(windowSpan, 1);
  const planWidth = canPan
    ? (totalMin / windowSpan) * Math.max(trackWidth, 1)
    : undefined;
  const useClockLabels = isClient && Boolean(dayDStartAt && t0Ms != null);
  const columns = Array.from({ length: WINDOW_COLUMNS }, (_, index) => {
    const startMin = clampedStart + (index / WINDOW_COLUMNS) * windowSpan;
    const dayKey = civilDayKey(
      startMin,
      t0Ms,
      eventTimezone,
      useClockLabels,
    );
    const prevDayKey =
      index === 0
        ? dayKey
        : civilDayKey(
            clampedStart + ((index - 1) / WINDOW_COLUMNS) * windowSpan,
            t0Ms,
            eventTimezone,
            useClockLabels,
          );
    return {
      index,
      startMin,
      x: (index / WINDOW_COLUMNS) * chartWidth,
      width: chartWidth / WINDOW_COLUMNS,
      isMidnight: index > 0 && dayKey !== prevDayKey,
    };
  });
  const dayBandsRaw = visibleDayBands(
    clampedStart,
    windowEnd,
    t0Ms,
    eventTimezone,
    useClockLabels,
  );
  const dayBands =
    dayBandsRaw.length > 0
      ? dayBandsRaw
      : [{ startMin: clampedStart, endMin: windowEnd }];

  useEffect(() => {
    const node = hScrollRef.current;
    if (!node) return;
    if (!canPan) {
      if (node.scrollLeft !== 0) node.scrollLeft = 0;
      return;
    }
    const maxScroll = node.scrollWidth - node.clientWidth;
    if (maxScroll <= 0) return;
    const expected = (clampedStart / panRange) * maxScroll;
    if (Math.abs(node.scrollLeft - expected) < 1) return;
    ignoreHScroll.current = true;
    node.scrollLeft = expected;
    requestAnimationFrame(() => {
      ignoreHScroll.current = false;
    });
  }, [canPan, clampedStart, panRange, planWidth]);

  function onPlanScroll(event: UIEvent<HTMLDivElement>) {
    if (ignoreHScroll.current) return;
    const node = event.currentTarget;
    const maxScroll = node.scrollWidth - node.clientWidth;
    if (maxScroll <= 0 || panRange <= 0) return;
    setWindowStart(
      clampWindowStart((node.scrollLeft / maxScroll) * panRange, windowSpan, totalMin),
    );
  }

  function xOf(offsetMin: number) {
    return (offsetMin - clampedStart) * pxPerMin;
  }

  function toggleCollapsed(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function laneStatsFor(
    laneRows: TimesViewRow[],
    meta?: { blocks?: number; activities?: number },
  ): LaneStatsDisplay {
    const stats = computeLaneStats(laneRows, items);
    let groupLabel: string | null = null;
    if (meta?.blocks != null) {
      groupLabel = `${meta.blocks} bloque${meta.blocks === 1 ? "" : "s"}`;
    } else if (meta?.activities != null) {
      groupLabel = `${meta.activities} actividad${meta.activities === 1 ? "" : "es"}`;
    }
    const progress = computeLaneProgress(laneRows, items, nowMin);
    return {
      blocksLabel: groupLabel,
      stepsLabel: `${stats.stepCount} paso${stats.stepCount === 1 ? "" : "s"}`,
      durationLabel: formatDurationCompact(stats.durationMin),
      rangeLabel:
        stats.startMin != null && stats.endMin != null
          ? `${formatAxisLabel(stats.startMin, t0Ms, eventTimezone, useClockLabels)}–${formatAxisLabel(stats.endMin, t0Ms, eventTimezone, useClockLabels)}`
          : "—",
      theoretical: isPlan ? 0 : progress.theoretical,
      real: isPlan ? 0 : progress.real,
      dueCount: isPlan ? 0 : progress.dueCount,
      doneCount: isPlan ? 0 : progress.doneCount,
      stepCount: stats.stepCount,
    };
  }

  function renderStepBars(stepRows: TimesViewRow[], laneKey: string) {
    return (
      <div
        className="relative overflow-hidden py-1.5"
        style={{
          width: chartWidth,
          minHeight: stepRows.length * 32,
        }}
      >
        {columns.map((column) => (
          <div
            key={`${laneKey}-col-${column.index}`}
            className={cn(
              "absolute inset-y-0 border-l border-border/40",
              column.index % 2 === 0 && "bg-foreground/[0.035]",
              column.isMidnight && "border-l-2 border-l-cyan-400/80",
            )}
            style={{ left: column.x, width: column.width }}
          />
        ))}
        {gateMarkers.map((marker) => (
          <div
            key={`${laneKey}-${marker.id}`}
            className={cn(
              "pointer-events-none absolute inset-y-0 z-[1] border-l-2 border-dashed opacity-70",
              gateColorClass(marker.colorIndex).split(" ")[0],
            )}
            style={{
              left: xOf(marker.openMin),
            }}
          />
        ))}
        {nowMin != null && !isPlan ? (
          <div
            className="pointer-events-none absolute inset-y-0 z-[3] border-l border-dashed border-rose-500"
            style={{ left: xOf(nowMin) }}
          />
        ) : null}
        {stepRows.map((row, index) => {
          const item = items.get(row.id);
          if (!item) return null;
          if (item.endMin < clampedStart || item.startMin > windowEnd) {
            return null;
          }
          const top = 2 + index * 30;
          const active = selectedId === row.id;
          const flowerOpen = flowerOpenId === row.id;
          const operable = row.operable !== false;
          const naturalWidth = item.durationMin * pxPerMin;
          const minWidth =
            active && operable
              ? MIN_BAR_WIDTH_WITH_FLOWER_PX
              : MIN_BAR_WIDTH_PX;
          // El track recorta con overflow-hidden; si la barra se pasa del
          // borde derecho, el "?" de la flor queda inaccesible. Preferimos
          // correr la barra a la izquierda (sobre todo al seleccionar).
          let width = Math.max(minWidth, naturalWidth);
          const maxRight = Math.max(0, chartWidth - 2);
          if (width > maxRight) width = maxRight;
          let left = xOf(item.startMin);
          if (left + width > maxRight) {
            left = Math.max(0, maxRight - width);
          }
          const openFlowerToRight = left < 220;
          return (
            <div
              key={row.id}
              className={cn(
                "absolute flex h-6 items-center overflow-visible rounded-md border shadow-sm",
                flowerOpen ? "z-50" : active ? "z-20" : "z-[2]",
                item.usedDefaultDuration && "opacity-70",
                getBarClass(row, active, flowerOpen),
              )}
              style={{ top, left, width }}
              title={`${row.name} · ${item.durationMin} min · ${formatAxisLabel(item.startMin, t0Ms, eventTimezone, useClockLabels)}`}
            >
              <button
                type="button"
                disabled={!operable}
                onClick={() => {
                  if (!operable) return;
                  onSelect(active ? null : row.id);
                }}
                className="flex min-w-0 flex-1 items-center gap-1 py-0 pr-1.5 pl-2 text-left text-[11px] font-medium disabled:cursor-not-allowed"
              >
                {row.evidenceRequired ? (
                  <Paperclip
                    className="size-3 shrink-0 opacity-90"
                    aria-label="Evidencia obligatoria al marcar éxito"
                  />
                ) : null}
                <span className="min-w-0 truncate">
                  {row.mine ? "★ " : ""}
                  {row.name}
                </span>
              </button>
              {active && operable ? (
                <div className="relative mr-0.5 shrink-0">
                  <StepActionFlower
                    open={flowerOpen}
                    layout="horizontal"
                    openToRight={openFlowerToRight}
                    onToggle={() =>
                      setFlowerOpenId((current) =>
                        current === row.id ? null : row.id,
                      )
                    }
                    onClose={() => setFlowerOpenId(null)}
                    actions={[
                      {
                        key: "info",
                        label: "Más información",
                        icon: BadgeInfo,
                        tone: "info",
                        onClick: () => {
                          setFlowerOpenId(null);
                          if (showBuiltInInfoDialog) {
                            setInfoRowId(row.id);
                          } else {
                            onOpenInfo?.(row);
                          }
                        },
                      },
                      ...getFlowerActions(row),
                    ]}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={frameRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border"
      >
      <div className="flex shrink-0 items-center gap-2 border-b bg-zinc-900/80 px-2 py-1.5">
        <span className="shrink-0 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
          Plan
        </span>
        <div
          ref={hScrollRef}
          className={cn(
            "h-4 min-w-0 flex-1 rounded-sm bg-zinc-800 [scrollbar-color:#22d3ee_#3f3f46] [scrollbar-width:auto]",
            canPan
              ? "overflow-x-scroll overflow-y-hidden"
              : "overflow-hidden",
          )}
          aria-label="Desplazar el plan en el tiempo"
          aria-disabled={!canPan}
          onScroll={onPlanScroll}
        >
          <div
            style={{ width: canPan ? planWidth : "100%", height: 1 }}
            aria-hidden
          />
        </div>
        <span className="shrink-0 font-mono text-[10px] text-zinc-400 tabular-nums">
          {formatAxisLabel(clampedStart, t0Ms, eventTimezone, useClockLabels)}
          {" – "}
          {formatAxisLabel(windowEnd, t0Ms, eventTimezone, useClockLabels)}
        </span>
      </div>
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
      >
      <div style={{ width: chartWidth }} className="min-w-0">
        {!dayDStartAt ? (
          <div className="border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
            Sin Inicio del Día D el eje es relativo. Configúralo en{" "}
            <span className="font-medium text-foreground">Setup</span>.
          </div>
        ) : null}
        <div className="sticky top-0 z-10 overflow-hidden border-b bg-background/95 backdrop-blur">
          <div
            className="relative h-7 overflow-hidden border-b border-cyan-500/30 bg-cyan-950/35"
            style={{ width: chartWidth }}
          >
            {dayBands.map((band) => (
              <div
                key={`day-${band.startMin}`}
                className="absolute inset-y-0 flex items-center border-r border-cyan-400/40 px-2"
                style={{
                  left: xOf(band.startMin),
                  width: Math.max(1, (band.endMin - band.startMin) * pxPerMin),
                }}
              >
                <span className="truncate text-[11px] font-semibold tracking-wide text-cyan-100">
                  {formatDayChip(
                    band.startMin,
                    t0Ms,
                    eventTimezone,
                    useClockLabels,
                  )}
                </span>
              </div>
            ))}
          </div>
          {gateMarkers.length ? (
            <div
              className="relative h-7 overflow-hidden border-b border-border/60"
              style={{ width: chartWidth }}
            >
              {columns.map((column) => (
                <div
                  key={`gate-col-${column.index}`}
                  className={cn(
                    "absolute inset-y-0 border-l border-border/30",
                    column.index % 2 === 0 && "bg-foreground/[0.035]",
                    column.isMidnight && "z-[1] border-l-2 border-l-cyan-400/80",
                  )}
                  style={{ left: column.x, width: column.width }}
                />
              ))}
              {gateMarkers.map((marker) => (
                <div
                  key={`head-${marker.id}`}
                  className="absolute top-1 bottom-1 z-[1]"
                  style={{ left: xOf(marker.openMin) }}
                  title={`${marker.name} · ${formatAxisLabel(marker.openMin, t0Ms, eventTimezone, useClockLabels)}`}
                >
                  <div
                    className={cn(
                      "h-full border-l-2 border-dashed",
                      gateColorClass(marker.colorIndex).split(" ")[0],
                    )}
                  />
                  <span
                    className={cn(
                      "absolute top-0.5 left-1.5 max-w-32 truncate rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                      gateColorClass(marker.colorIndex),
                    )}
                  >
                    {marker.name}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div
            className="relative h-7 overflow-hidden"
            style={{ width: chartWidth }}
          >
            {columns.map((column) => (
              <div
                key={`axis-${column.index}`}
                className={cn(
                  "absolute top-0 bottom-0 overflow-hidden border-l border-border/60",
                  column.index % 2 === 0 && "bg-foreground/[0.035]",
                  column.isMidnight && "border-l-2 border-l-cyan-400/80",
                )}
                style={{ left: column.x, width: column.width }}
              >
                <span className="ml-0.5 text-[9px] text-muted-foreground tabular-nums">
                  {formatAxisLabel(
                    column.startMin,
                    t0Ms,
                    eventTimezone,
                    useClockLabels,
                  )}
                </span>
              </div>
            ))}
            {nowMin != null && !isPlan ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-[2] border-l border-dashed border-rose-500"
                style={{ left: xOf(nowMin) }}
              >
                <span className="ml-1 text-[10px] font-semibold text-rose-500">
                  ahora
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {!lanes.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No hay filas que coincidan con la búsqueda.
          </p>
        ) : (
          lanes.map(({ workstreamName, blocks }) => {
            const wsKey = `ws:${workstreamName}`;
            const wsExpanded = !collapsed.has(wsKey);
            const wsRows = blocks.flatMap((block) => block.rows);
            return (
              <div key={workstreamName} className="border-b last:border-b-0">
                <TimesLaneHeader
                  title={workstreamName}
                  expanded={wsExpanded}
                  onToggle={() => toggleCollapsed(wsKey)}
                  tone="workstream"
                  showProgress={!isPlan}
                  stats={laneStatsFor(wsRows, { blocks: blocks.length })}
                />
                {wsExpanded
                  ? blocks.map(({ blockName, activities, rows: blockRows }) => {
                      const laneKey = `${workstreamName}::${blockName}`;
                      const blockKey = `block:${laneKey}`;
                      const blockExpanded = !collapsed.has(blockKey);
                      return (
                        <div key={laneKey}>
                          <TimesLaneHeader
                            title={blockName}
                            expanded={blockExpanded}
                            onToggle={() => toggleCollapsed(blockKey)}
                            tone="block"
                            showProgress={!isPlan}
                            stats={laneStatsFor(blockRows, {
                              activities: activities.length,
                            })}
                          />
                          {blockExpanded
                            ? activities.map(
                                ({ activityName, rows: activityRows }) => {
                                  const activityKey = `activity:${laneKey}::${activityName}`;
                                  const activityExpanded =
                                    !collapsed.has(activityKey);
                                  return (
                                    <div key={activityKey}>
                                      <TimesLaneHeader
                                        title={activityName}
                                        expanded={activityExpanded}
                                        onToggle={() =>
                                          toggleCollapsed(activityKey)
                                        }
                                        tone="activity"
                                        showProgress={!isPlan}
                                        stats={laneStatsFor(activityRows)}
                                      />
                                      {activityExpanded
                                        ? renderStepBars(
                                            activityRows,
                                            activityKey,
                                          )
                                        : null}
                                    </div>
                                  );
                                },
                              )
                            : null}
                        </div>
                      );
                    })
                  : null}
              </div>
            );
          })
        )}
      </div>
      </div>
      </div>

      {showBuiltInInfoDialog ? (
        <Dialog
          open={Boolean(infoRow)}
          onOpenChange={(open) => {
            if (!open) setInfoRowId(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            {infoRow ? (
              <>
                <DialogHeader>
                  <DialogTitle>{infoRow.name}</DialogTitle>
                  <DialogDescription>
                    Detalle del paso en el plan.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{infoRow.workstreamName}</Badge>
                    <Badge variant="secondary">{infoRow.blockName}</Badge>
                    <Badge variant="outline">{infoRow.activityName}</Badge>
                  </div>
                  {infoRow.status ? (
                    <p>
                      <span className="text-muted-foreground">Estado: </span>
                      {infoRow.status}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-muted-foreground">Duración: </span>
                    {infoRow.estimatedDurationMinutes != null
                      ? `${infoRow.estimatedDurationMinutes} min`
                      : `default ${DEFAULT_DURATION_MINUTES} min`}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Deps: </span>
                    {infoRow.dependencyStepIds.length || "ninguna"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      Aprobaciones:{" "}
                    </span>
                    {(infoRow.approvalRoles ?? []).length
                      ? (infoRow.approvalRoles ?? []).join(", ")
                      : "ninguna"}
                  </p>
                  <div>
                    <p className="text-muted-foreground">Descripción</p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {infoRow.description?.trim() || "Sin descripción."}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
