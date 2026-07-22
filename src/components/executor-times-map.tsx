"use client";

import {
  BadgeInfo,
  ChevronRight,
  CircleCheck,
  CirclePlay,
  CircleX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  StepActionFlower,
  type FlowerAction,
} from "@/components/step-action-flower";
import {
  RUNTIME_STEP_STATUS_LABELS,
  type RuntimeStepAction,
  type RuntimeStepStatus,
  type RuntimeStepSummary,
} from "@/lib/execution-types";
import { cn } from "@/lib/utils";

/** Acciones de cierre que abren el diálogo con adjuntos opcionales. */
export type OutcomeAction = "complete_success" | "complete_fail";

const DEFAULT_DURATION_MINUTES = 30;
const SLOT_MINUTES = 15;
const ROW_PX = 36;
const TIME_COL_PX = 52;
/** Ancho cómodo (texto legible + flor). */
const STEP_COL_MAX_PX = 96;
/**
 * Mínimo usable: se lee el nombre en 1–2 líneas y cabe la “i”.
 * Por debajo de esto el scroll horizontal es mejor que aplastar más.
 */
const STEP_COL_MIN_PX = 64;
const MAX_COLUMNS = 10;

function computeStepColPx(containerWidth: number, columnCount: number) {
  if (columnCount <= 0) return STEP_COL_MAX_PX;
  const available = Math.max(0, containerWidth - TIME_COL_PX);
  const ideal = available / columnCount;
  return Math.round(
    Math.min(STEP_COL_MAX_PX, Math.max(STEP_COL_MIN_PX, ideal)),
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
  /** Siguiente en tu secuencia (en curso o próximo a ejecutar). */
  isNext: boolean;
  column: number;
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
  // Mediodía UTC aproximado para etiquetar el día civil sin pelear DST extremo.
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

/**
 * Colores del mapa:
 * - Pendiente (mío): azul
 * - Siguiente en secuencia (mío): azul más claro
 * - No es mío: gris claro
 * - Exitoso: verde
 * - Fallido: rojo
 */
function barTone(
  status: RuntimeStepStatus,
  mine: boolean,
  isNext: boolean,
) {
  if (
    status === "EXITOSO" ||
    status === "APROBADO" ||
    status === "SIMULADO" ||
    status === "OMITIDO"
  ) {
    return mine
      ? "border-emerald-300 bg-emerald-500 text-emerald-950"
      : "border-emerald-500/30 bg-emerald-500/25 text-emerald-100";
  }
  if (status === "FALLIDO") {
    return mine
      ? "border-rose-300 bg-rose-500 text-rose-50"
      : "border-rose-500/30 bg-rose-500/25 text-rose-100";
  }
  if (!mine) {
    return "border-zinc-400/50 bg-zinc-300 text-zinc-800";
  }
  if (status === "PENDIENTE_APROBACION") {
    return "border-amber-300 bg-amber-400 text-amber-950";
  }
  // Mío pendiente / en curso / rechazado (se puede reiniciar)
  if (isNext || status === "INICIADO") {
    return "border-sky-200 bg-sky-300 text-sky-950"; // azul claro = siguiente
  }
  return "border-blue-300 bg-blue-600 text-white"; // azul = pendiente
}

function flowerActionsFor(input: {
  step: RuntimeStepSummary;
  busy: boolean;
  onAction: (action: RuntimeStepAction) => void;
  onOutcome: (action: OutcomeAction) => void;
  onInfo: () => void;
}): FlowerAction[] {
  const { step, busy, onAction, onOutcome, onInfo } = input;
  const actions: FlowerAction[] = [
    {
      key: "info",
      label: "Información",
      icon: BadgeInfo,
      tone: "info",
      onClick: onInfo,
    },
  ];

  if (step.status === "PLANIFICADO" || step.status === "RECHAZADO") {
    actions.push({
      key: "start",
      label: "Iniciar",
      icon: CirclePlay,
      tone: "go",
      disabled: busy,
      onClick: () => onAction("start"),
    });
  }

  if (step.status === "INICIADO") {
    actions.push(
      {
        key: "success",
        label: "Exitoso",
        icon: CircleCheck,
        tone: "success",
        disabled: busy,
        onClick: () => onOutcome("complete_success"),
      },
      {
        key: "fail",
        label: "Fallido",
        icon: CircleX,
        tone: "danger",
        disabled: busy,
        onClick: () => onOutcome("complete_fail"),
      },
    );
  }

  return actions;
}

/** Empaqueta pasos en columnas sin solape (máx. MAX_COLUMNS). */
function assignColumns(items: Omit<TimedStep, "column">[]): TimedStep[] {
  const sorted = [...items].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );
  const colEnds: number[] = [];
  const result: TimedStep[] = [];

  for (const item of sorted) {
    let col = colEnds.findIndex((end) => end <= item.startMs);
    if (col === -1) {
      if (colEnds.length >= MAX_COLUMNS) continue;
      col = colEnds.length;
      colEnds.push(item.endMs);
    } else {
      colEnds[col] = item.endMs;
    }
    result.push({ ...item, column: col });
  }
  return result;
}

export function ExecutorTimesMap({
  steps,
  actorId,
  timezone,
  anchorStartAt,
  /** null = todos los workstreams; array = solo esos ids */
  workstreamIds,
  mineOnly,
  selectedId,
  busy,
  onSelect,
  onAction,
  onOutcome,
  onOpenInfo,
}: {
  steps: RuntimeStepSummary[];
  actorId: string;
  timezone: string;
  anchorStartAt: string | null;
  workstreamIds: string[] | null;
  mineOnly: boolean;
  selectedId: string | null;
  busy: boolean;
  onSelect: (stepId: string | null) => void;
  onAction: (stepId: string, action: RuntimeStepAction) => void;
  onOutcome: (stepId: string, action: OutcomeAction) => void;
  onOpenInfo: (stepId: string) => void;
}) {
  const t0Ms = anchorStartAt ? new Date(anchorStartAt).getTime() : Date.now();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [flowerOpenId, setFlowerOpenId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(360);
  const [moreToRight, setMoreToRight] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const update = () => {
      setContainerWidth(node.clientWidth);
      const remaining =
        node.scrollWidth - node.clientWidth - node.scrollLeft;
      setMoreToRight(remaining > 2);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", update);
    };
  }, []);

  /** Click fuera del paso seleccionado: apaga el ? y cierra la flor. */
  useEffect(() => {
    if (!selectedId) {
      setFlowerOpenId(null);
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`[data-step-card="${selectedId}"]`)) return;
      setFlowerOpenId(null);
      onSelect(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedId, onSelect]);

  const mineIds = useMemo(
    () =>
      new Set(
        steps
          .filter((step) => step.executorActorId === actorId)
          .map((step) => step.id),
      ),
    [steps, actorId],
  );

  /** Tu próximo paso: el iniciado, o el pendiente más temprano. */
  const nextMineId = useMemo(() => {
    const mineSteps = steps.filter((step) => mineIds.has(step.id));
    const started = mineSteps.find((step) => step.status === "INICIADO");
    if (started) return started.id;
    const pending = mineSteps
      .filter(
        (step) =>
          step.status === "PLANIFICADO" || step.status === "RECHAZADO",
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
  }, [steps, mineIds, t0Ms]);

  const candidateSteps = useMemo(() => {
    const wsSet =
      workstreamIds == null ? null : new Set(workstreamIds);

    const list = steps.filter((step) => {
      if (wsSet && !wsSet.has(step.workstreamId)) return false;
      if (mineOnly) return mineIds.has(step.id);
      return true;
    });

    return [...list].sort((a, b) => {
      const score = (step: RuntimeStepSummary) =>
        mineIds.has(step.id) ? 0 : 1;
      const diff = score(a) - score(b);
      if (diff !== 0) return diff;
      const aStart = a.plannedStartAt
        ? new Date(a.plannedStartAt).getTime()
        : t0Ms;
      const bStart = b.plannedStartAt
        ? new Date(b.plannedStartAt).getTime()
        : t0Ms;
      return aStart - bStart;
    });
  }, [steps, workstreamIds, mineOnly, mineIds, t0Ms]);

  const timed = useMemo(() => {
    const raw: Omit<TimedStep, "column">[] = candidateSteps.map((step) => {
      const durationMin =
        step.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES;
      const startMs = step.plannedStartAt
        ? new Date(step.plannedStartAt).getTime()
        : t0Ms;
      const endMs = startMs + durationMin * 60_000;
      return {
        step,
        startMs,
        endMs,
        startMin: Math.max(0, Math.round((startMs - t0Ms) / 60_000)),
        durationMin,
        dayKey: dayKeyFromMs(startMs, timezone),
        mine: mineIds.has(step.id),
        isNext: step.id === nextMineId,
      };
    });
    return assignColumns(raw);
  }, [candidateSteps, t0Ms, timezone, mineIds, nextMineId]);

  const columnCount = useMemo(
    () => Math.max(1, ...timed.map((item) => item.column + 1), 0),
    [timed],
  );

  const daySections = useMemo(() => {
    if (!timed.length) return [];

    const minStart = Math.min(...timed.map((item) => item.startMs));
    const maxEnd = Math.max(
      ...timed.map((item) => item.endMs),
      nowMs,
      t0Ms + 60 * 60_000,
    );

    const rangeStart = floorToSlot(minStart);
    const rangeEnd = ceilToSlot(maxEnd);

    type Slot = { ms: number; label: string; dayKey: string };
    const slots: Slot[] = [];
    for (let ms = rangeStart; ms < rangeEnd; ms += SLOT_MINUTES * 60_000) {
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
      const daySteps = timed.filter(
        (item) => item.startMs < dayEnd && item.endMs > dayStart,
      );
      return {
        dayKey,
        label: dayLabelFromKey(dayKey, timezone),
        slots: daySlots,
        dayStart,
        dayEnd,
        steps: daySteps,
      };
    });
  }, [timed, timezone, nowMs, t0Ms]);

  const stepColPx = computeStepColPx(containerWidth, columnCount);
  const gridWidth = TIME_COL_PX + columnCount * stepColPx;

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const remaining =
      node.scrollWidth - node.clientWidth - node.scrollLeft;
    setMoreToRight(remaining > 2);
  }, [gridWidth, columnCount, stepColPx, timed.length]);

  if (!steps.length) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Sin pasos en esta ejecución.
      </p>
    );
  }

  if (!timed.length) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No hay pasos con este filtro.
      </p>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto">
      <div style={{ minWidth: gridWidth }} className="pb-10">
        {daySections.map((section) => {
          const bodyHeight = section.slots.length * ROW_PX;
          return (
            <section key={section.dayKey} className="relative">
              <div
                className="sticky top-0 left-0 z-30 border-b border-cyan-500/30 bg-background/95 px-3 py-2 backdrop-blur"
                style={{ width: containerWidth }}
              >
                <p className="text-sm font-semibold capitalize">
                  {section.label}
                </p>
              </div>

              <div
                className="relative"
                style={{
                  display: "grid",
                  gridTemplateColumns: `${TIME_COL_PX}px repeat(${columnCount}, ${stepColPx}px)`,
                  minHeight: bodyHeight,
                }}
              >
                {/* Columna de horas (fija al desplazar horizontal) */}
                <div className="sticky left-0 z-[25] border-r border-border/60 bg-background/95 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.45)] backdrop-blur">
                  {section.slots.map((slot) => (
                    <div
                      key={slot.ms}
                      className="flex items-start justify-end border-b border-border/40 bg-muted/30 pr-1.5 pt-0.5 font-mono text-[10px] text-muted-foreground"
                      style={{ height: ROW_PX }}
                    >
                      {slot.label}
                    </div>
                  ))}
                </div>

                {/* Columnas de pasos (fondo) */}
                {Array.from({ length: columnCount }, (_, col) => (
                  <div
                    key={`col-${col}`}
                    className="relative border-r border-border/30"
                    style={{ height: bodyHeight }}
                  >
                    {section.slots.map((slot) => (
                      <div
                        key={`${col}-${slot.ms}`}
                        className="border-b border-border/25"
                        style={{ height: ROW_PX }}
                      />
                    ))}
                  </div>
                ))}

                {/* Línea ahora */}
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

                {/* Barras de pasos */}
                {section.steps.map((item) => {
                  const topMs = Math.max(item.startMs, section.dayStart);
                  const bottomMs = Math.min(item.endMs, section.dayEnd);
                  const top =
                    ((topMs - section.dayStart) / (SLOT_MINUTES * 60_000)) *
                    ROW_PX;
                  const height = Math.max(
                    28,
                    ((bottomMs - topMs) / (SLOT_MINUTES * 60_000)) * ROW_PX - 2,
                  );
                  const left = TIME_COL_PX + item.column * stepColPx + 3;
                  const width = stepColPx - 6;
                  const selected = selectedId === item.step.id;
                  const flowerOpen = flowerOpenId === item.step.id;

                  return (
                    <div
                      key={`${section.dayKey}-${item.step.id}`}
                      data-step-card={item.step.id}
                      className={cn(
                        "absolute flex flex-col overflow-visible rounded-md border px-1.5 py-1 shadow-sm",
                        barTone(item.step.status, item.mine, item.isNext),
                        flowerOpen
                          ? "z-40"
                          : selected
                            ? "z-30 ring-2 ring-white/70"
                            : "z-[2]",
                        !item.mine && "opacity-80",
                      )}
                      style={{ top: top + 1, left, width, height }}
                    >
                      <button
                        type="button"
                        className="flex min-h-0 flex-1 flex-col items-stretch gap-0.5 text-left"
                        disabled={!item.mine}
                        onClick={() => {
                          if (!item.mine) return;
                          const next =
                            selectedId === item.step.id ? null : item.step.id;
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
                      {item.mine && selected ? (
                        <div className="mt-auto flex justify-end pt-0.5">
                          <StepActionFlower
                            open={flowerOpen}
                            layout="vertical"
                            onToggle={() =>
                              setFlowerOpenId((current) =>
                                current === item.step.id ? null : item.step.id,
                              )
                            }
                            onClose={() => setFlowerOpenId(null)}
                            actions={flowerActionsFor({
                              step: item.step,
                              busy,
                              onAction: (action) => {
                                setFlowerOpenId(null);
                                onSelect(null);
                                onAction(item.step.id, action);
                              },
                              onOutcome: (action) => {
                                setFlowerOpenId(null);
                                onSelect(null);
                                onOutcome(item.step.id, action);
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
