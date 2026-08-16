"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkstreamDeepDive } from "@/components/workstream-deep-dive";
import { formatDayTimeLabel } from "@/lib/execution-schedule";
import type { ExecutionDetail } from "@/lib/execution-types";
import {
  AXIS_MAJOR_PCTS,
  AXIS_MINOR_PCTS,
  buildThresholdMonitorModel,
  planPercentToMs,
  remainingAfter,
  runningCountAfter,
  type RunningDelta,
  type StairEvent,
  type ThresholdMonitorModel,
} from "@/lib/threshold-monitor";
import { cn } from "@/lib/utils";

const SERIES = {
  plan: { color: "#324A7A", label: "Plan" },
  real: { color: "#DBC379", label: "Real" },
  running: { color: "#35E2E5", label: "En curso" },
  fail: { color: "#e11d48", label: "Fallo" },
} as const;

function holguraLabel(min: number | null) {
  if (min == null) return "—";
  if (min === 0) return "en hora";
  if (min > 0) return `+${min} min`;
  return `${min} min`;
}

function holguraClass(min: number | null) {
  if (min == null) return "text-muted-foreground";
  if (min < 0) return "text-rose-300";
  if (min < 10) return "text-amber-200";
  return "text-emerald-300";
}

function executionSyncKey(detail: ExecutionDetail): string {
  return [
    detail.status,
    detail.anchorStartAt ?? "",
    ...detail.steps.map(
      (s) =>
        `${s.id}:${s.status}:${s.actualStartedAt ?? ""}:${s.actualEndedAt ?? ""}:${s.iterations.length}`,
    ),
  ].join("|");
}

/** Reloj estable SSR/hidratación (sin Date.now) para evitar mismatch. */
function stableNowMs(detail: ExecutionDetail): number {
  let max = 0;
  if (detail.anchorStartAt) {
    const t = new Date(detail.anchorStartAt).getTime();
    if (Number.isFinite(t)) max = t;
  }
  for (const step of detail.steps) {
    for (const raw of [
      step.actualStartedAt,
      step.actualEndedAt,
      step.updatedAt,
      step.plannedStartAt,
    ]) {
      if (!raw) continue;
      const t = new Date(raw).getTime();
      if (Number.isFinite(t) && t > max) max = t;
    }
  }
  return max;
}

function stepPath(
  events: StairEvent[],
  total: number,
  fromMs: number,
  toMs: number,
  x: (t: number) => number,
  y: (v: number) => number,
  /** Si se define, la serie termina ahí (sin prolongar al futuro). */
  clipMs?: number,
): string {
  const endMs = clipMs != null ? Math.min(toMs, clipMs) : toMs;
  if (endMs < fromMs) return "";
  let rem = remainingAfter(total, events, fromMs);
  const parts = [`M ${x(fromMs).toFixed(1)} ${y(rem).toFixed(1)}`];
  for (const event of events) {
    if (event.t <= fromMs) continue;
    if (event.t > endMs) break;
    parts.push(`H ${x(event.t).toFixed(1)}`);
    rem = Math.max(0, rem - 1);
    parts.push(`V ${y(rem).toFixed(1)}`);
  }
  parts.push(`H ${x(endMs).toFixed(1)}`);
  return parts.join(" ");
}

/** Escalón de concurrencia (+1/−1), no acumulativo. Termina en clipMs (ahora). */
function runningStepPath(
  deltas: RunningDelta[],
  fromMs: number,
  toMs: number,
  x: (t: number) => number,
  y: (v: number) => number,
  clipMs?: number,
): string {
  const endMs = clipMs != null ? Math.min(toMs, clipMs) : toMs;
  if (endMs < fromMs) return "";
  let count = runningCountAfter(deltas, fromMs);
  const parts = [`M ${x(fromMs).toFixed(1)} ${y(count).toFixed(1)}`];
  for (const delta of deltas) {
    if (delta.t <= fromMs) continue;
    if (delta.t > endMs) break;
    parts.push(`H ${x(delta.t).toFixed(1)}`);
    count = Math.max(0, count + delta.delta);
    parts.push(`V ${y(count).toFixed(1)}`);
  }
  parts.push(`H ${x(endMs).toFixed(1)}`);
  return parts.join(" ");
}

function formatPctLabel(pct: number): string {
  return Number.isInteger(pct) ? `${pct}%` : `${pct}%`;
}

function chartYMax(totalSteps: number): number {
  const n = Math.max(totalSteps, 0);
  if (n === 0) return 1;
  return n < 11 ? n + 1 : n + 3;
}

/** 0, intermedias y N. Paso chico para que se lea la escala. */
function yAxisTicks(totalSteps: number): number[] {
  const top = Math.max(totalSteps, 0);
  if (top <= 0) return [0];
  const step = top <= 12 ? 1 : top <= 24 ? 2 : top <= 50 ? 5 : 10;
  const ticks = new Set<number>([0, top]);
  for (let v = step; v < top; v += step) ticks.add(v);
  return [...ticks].sort((a, b) => a - b);
}

function situationRows(model: ThresholdMonitorModel) {
  const plannedDone =
    model.totalSteps -
    remainingAfter(model.totalSteps, model.planEvents, model.nowMs);
  const successful =
    model.totalSteps -
    remainingAfter(model.totalSteps, model.realEvents, model.nowMs);
  return [
    {
      key: "plan",
      label: "Planificadas",
      value: plannedDone,
      color: SERIES.plan.color,
    },
    {
      key: "real",
      label: "Terminadas",
      value: successful,
      color: SERIES.real.color,
    },
    {
      key: "running",
      label: "En Curso",
      value: model.runningNow,
      color: SERIES.running.color,
    },
    {
      key: "fail",
      label: "Fallos",
      value: model.stats.fallidas,
      color: SERIES.fail.color,
    },
  ] as const;
}

function SituationPanel({ model }: { model: ThresholdMonitorModel }) {
  const rows = situationRows(model);

  return (
    <div className="max-w-xl rounded-lg border border-border/60 bg-zinc-950/80 px-3 py-2.5">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5">
        {rows.map((row) => (
          <li
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm text-white"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span>{row.label}</span>
            </span>
            <span className="min-w-[1.5rem] text-right font-semibold leading-none tabular-nums">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** text-sm del panel de stats ≈ 14px en pantalla. */
const CHART_LABEL_PX = 14;
/** Ejes un poco más chicos. */
const CHART_AXIS_X_PX = 11;
const CHART_AXIS_Y_PX = 11;
/** Grosor de series en pantalla (px). */
const CHART_STROKE_PX = 3.5;
const CHART_STROKE_MOBILE_PX = 4.5;
const CHART_MOBILE_MAX_WIDTH = 640;

function StairBurndownChart({ model }: { model: ThresholdMonitorModel }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [labelFontSize, setLabelFontSize] = useState(CHART_LABEL_PX);
  const [axisXFontSize, setAxisXFontSize] = useState(CHART_AXIS_X_PX);
  const [axisYFontSize, setAxisYFontSize] = useState(CHART_AXIS_Y_PX);
  const [seriesStroke, setSeriesStroke] = useState(CHART_STROKE_PX);

  const viewStartMs = model.domainStartMs;
  const viewEndMs = model.domainEndMs;
  const w = 720;
  const h = 280;
  const pad = { t: 28, r: 36, b: 52, l: 56 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const span = Math.max(1, viewEndMs - viewStartMs);
  const maxY = chartYMax(model.totalSteps);

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    function sync() {
      const el = svgRef.current;
      if (!el) return;
      const width = el.getBoundingClientRect().width;
      if (width <= 0) return;
      // CSS px en SVG se escalan con el viewBox → compensar.
      const scale = w / width;
      setLabelFontSize(CHART_LABEL_PX * scale);
      setAxisXFontSize(CHART_AXIS_X_PX * scale);
      setAxisYFontSize(CHART_AXIS_Y_PX * scale);
      const strokePx =
        width < CHART_MOBILE_MAX_WIDTH
          ? CHART_STROKE_MOBILE_PX
          : CHART_STROKE_PX;
      setSeriesStroke(strokePx * scale);
    }
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [w]);

  const x = (t: number) =>
    pad.l + ((t - viewStartMs) / span) * innerW;
  const y = (v: number) => pad.t + (1 - v / maxY) * innerH;

  const planD = stepPath(
    model.planEvents,
    model.totalSteps,
    viewStartMs,
    viewEndMs,
    x,
    y,
  );
  const realD = stepPath(
    model.realEvents,
    model.totalSteps,
    viewStartMs,
    viewEndMs,
    x,
    y,
    model.nowMs,
  );
  const runningD = runningStepPath(
    model.runningDeltas,
    viewStartMs,
    viewEndMs,
    x,
    y,
    model.nowMs,
  );

  const failTicks = model.failMarkers.filter(
    (m) => m.t >= viewStartMs && m.t <= Math.min(viewEndMs, model.nowMs),
  );

  const plannedSpanMs =
    model.plannedSpanMs ??
    Math.max(1, (model.domainEndMs - model.domainStartMs) / 1.2);
  const planStartMs = model.domainStartMs;

  const xMajorMarks = AXIS_MAJOR_PCTS.map((pct) => ({
    pct,
    t: planPercentToMs(planStartMs, plannedSpanMs, pct),
  })).filter((m) => m.t >= viewStartMs && m.t <= viewEndMs);

  const xMajorTimes = new Set(xMajorMarks.map((m) => m.t));
  const xMinorMarks = AXIS_MINOR_PCTS.map((pct) => ({
    pct,
    t: planPercentToMs(planStartMs, plannedSpanMs, pct),
  })).filter(
    (m) =>
      m.t >= viewStartMs &&
      m.t <= viewEndMs &&
      !xMajorTimes.has(m.t),
  );

  const nowLineMs = Math.min(
    viewEndMs,
    Math.max(viewStartMs, model.nowMs),
  );
  const plannedEndInView =
    model.plannedEndMs != null &&
    model.plannedEndMs >= viewStartMs &&
    model.plannedEndMs <= viewEndMs;
  const anchorInView =
    model.anchor != null &&
    model.anchor.atMs >= viewStartMs &&
    model.anchor.atMs <= viewEndMs;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label="Burndown en escalón: plan vs real"
    >
      <rect
        x={pad.l}
        y={pad.t}
        width={innerW}
        height={innerH}
        fill="#737070"
      />

      {xMinorMarks.map((m) => (
        <line
          key={`minor-${m.pct}`}
          x1={x(m.t)}
          x2={x(m.t)}
          y1={pad.t}
          y2={h - pad.b}
          stroke="#52525b"
          strokeOpacity={0.55}
          strokeWidth={1}
        />
      ))}
      {xMajorMarks.map((m) => (
        <line
          key={`major-${m.pct}`}
          x1={x(m.t)}
          x2={x(m.t)}
          y1={pad.t}
          y2={h - pad.b}
          stroke="#3f3f46"
          strokeWidth={1.25}
        />
      ))}

      {plannedEndInView && model.plannedEndMs != null ? (
        <rect
          x={x(model.plannedEndMs)}
          y={pad.t}
          width={Math.max(
            0,
            x(Math.min(viewEndMs, model.domainEndMs)) - x(model.plannedEndMs),
          )}
          height={innerH}
          fill="#f59e0b"
          fillOpacity={0.14}
        />
      ) : null}

      {plannedEndInView && model.plannedEndMs != null ? (
        <line
          x1={x(model.plannedEndMs)}
          x2={x(model.plannedEndMs)}
          y1={pad.t}
          y2={h - pad.b}
          stroke="#e4e4e7"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      ) : null}

      {anchorInView && model.anchor ? (
        <line
          x1={x(model.anchor.atMs)}
          x2={x(model.anchor.atMs)}
          y1={pad.t}
          y2={h - pad.b}
          stroke="#fcd34d"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ) : null}

      <path
        d={planD}
        fill="none"
        stroke={SERIES.plan.color}
        strokeWidth={seriesStroke}
        strokeLinejoin="miter"
      />
      <path
        d={realD}
        fill="none"
        stroke={SERIES.real.color}
        strokeWidth={seriesStroke}
        strokeLinejoin="miter"
      />
      <path
        d={runningD}
        fill="none"
        stroke={SERIES.running.color}
        strokeWidth={seriesStroke}
        strokeLinejoin="miter"
      />

      <line
        x1={x(nowLineMs)}
        x2={x(nowLineMs)}
        y1={pad.t}
        y2={h - pad.b}
        stroke="#e11d48"
        strokeWidth={1.75}
        strokeDasharray="5 4"
      />
      <text
        x={Math.min(x(nowLineMs) + 5, w - pad.r - 4)}
        y={pad.t - 8}
        fill="#e11d48"
        fontSize={labelFontSize}
        fontWeight={600}
      >
        ahora
      </text>

      {failTicks.map((m) => {
        const count = runningCountAfter(model.runningDeltas, m.t);
        const cx = x(m.t);
        const cy = y(count);
        return (
          <g key={`fail-${m.stepId}-${m.t}`}>
            <title>{`Fallo · ${m.label}`}</title>
            <line
              x1={cx}
              x2={cx}
              y1={cy - 8}
              y2={cy + 8}
              stroke={SERIES.fail.color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={3.5} fill={SERIES.fail.color} />
          </g>
        );
      })}

      {xMajorMarks.map((m) => {
        const isLast = m.pct === 120;
        return (
          <text
            key={`label-${m.pct}`}
            x={x(m.t)}
            y={h - 16}
            textAnchor={isLast ? "end" : "middle"}
            className="fill-muted-foreground"
            fontSize={axisXFontSize}
          >
            {formatPctLabel(m.pct)}
          </text>
        );
      })}
      {yAxisTicks(model.totalSteps).map((value) => (
        <g key={`y-${value}`}>
          <line
            x1={pad.l}
            x2={w - pad.r}
            y1={y(value)}
            y2={y(value)}
            stroke="#3f3f46"
            strokeOpacity={value === 0 || value === model.totalSteps ? 0 : 0.7}
            strokeWidth={1}
          />
          <text
            x={pad.l - 10}
            y={y(value) + 3.5}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={axisYFontSize}
          >
            {value}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function ThresholdMonitor({
  initial,
}: {
  initial: ExecutionDetail;
}) {
  const [detail, setDetail] = useState(initial);
  // Mismo valor en servidor y 1ª pintura del cliente → sin hydration mismatch.
  const [nowMs, setNowMs] = useState(() => stableNowMs(initial));

  useEffect(() => {
    setDetail(initial);
  }, [initial]);

  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const executionId = detail.id;
    let cancelled = false;

    async function pull() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/executions/${executionId}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          execution?: ExecutionDetail;
        };
        const next = payload.execution;
        if (!next || cancelled) return;
        setDetail((current) =>
          executionSyncKey(current) === executionSyncKey(next)
            ? current
            : next,
        );
        setNowMs(Date.now());
      } catch {
        // silencioso
      }
    }

    const intervalId = window.setInterval(() => void pull(), 4_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    void pull();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [detail.id]);

  const model = useMemo(
    () => buildThresholdMonitorModel(detail, nowMs),
    [detail, nowMs],
  );

  const empty = model.totalSteps === 0;

  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Monitor de Umbral
        </h1>
        <p className="text-sm text-muted-foreground">
          {model.executionName} · {model.totalSteps} pasos · {model.timezone}
        </p>
      </div>

      {empty ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Esta ejecución no tiene pasos todavía.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Burndown de actividades · Situación a las{" "}
                <span suppressHydrationWarning>
                  {new Intl.DateTimeFormat("es-PE", {
                    timeZone: model.timezone,
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                  }).format(new Date(model.nowMs))}
                </span>
              </CardTitle>
              <CardDescription>
                Holgura ≈ Fin planificado vs ETA (máx. fin proyectado de pasos
                abiertos)
                {model.holguraMin != null || model.etaMs ? (
                  <>
                    {" · "}
                    <span
                      className={cn(
                        "font-medium",
                        holguraClass(model.holguraMin),
                      )}
                    >
                      {holguraLabel(model.holguraMin)}
                    </span>
                    {model.etaMs ? (
                      <>
                        {" · ETA "}
                        {formatDayTimeLabel(
                          new Date(model.etaMs),
                          model.timezone,
                        )}
                      </>
                    ) : null}
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {model.nowBeyondDomain ? (
                <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  Ahora está más allá del dominio (plan + 20%). Si aún restan{" "}
                  {model.remainingNow} tareas, la ejecución se fue de ventana.
                </p>
              ) : null}
              <SituationPanel model={model} />
              <StairBurndownChart model={model} />
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-1 text-sm font-medium">Por workstream</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Mismos 4 datos del burndown · peor primero
            </p>
            <Card>
              <CardContent className="overflow-hidden px-0 pt-0">
                <Table className="w-full table-fixed text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-auto min-w-0">
                        Workstream
                      </TableHead>
                      <TableHead className="w-12 px-1 text-right sm:w-14">
                        Planif
                      </TableHead>
                      <TableHead className="w-12 px-1 text-right sm:w-14">
                        Termi
                      </TableHead>
                      <TableHead className="w-12 px-1 text-right sm:w-14">
                        Curso
                      </TableHead>
                      <TableHead className="w-12 px-1 text-right sm:w-14">
                        Fallos
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {model.workstreams.map((row) => (
                      <TableRow
                        key={row.workstreamId}
                        className={cn(
                          row.failed > 0 &&
                            "bg-rose-500/20 hover:bg-rose-500/25",
                        )}
                      >
                        <TableCell
                          className={cn(
                            "min-w-0 truncate font-medium",
                            row.failed > 0 && "text-rose-200",
                          )}
                        >
                          {row.workstreamName}
                        </TableCell>
                        <TableCell className="px-1 text-right tabular-nums">
                          {row.plannedDone}
                        </TableCell>
                        <TableCell className="px-1 text-right tabular-nums">
                          {row.done}
                        </TableCell>
                        <TableCell className="px-1 text-right tabular-nums">
                          {row.running}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "px-1 text-right tabular-nums",
                            row.failed > 0 && "font-semibold text-rose-400",
                          )}
                        >
                          {row.failed}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <WorkstreamDeepDive
            detail={detail}
            workstreams={model.workstreams}
          />
        </>
      )}
    </div>
  );
}
