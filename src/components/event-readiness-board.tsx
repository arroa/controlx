"use client";

import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  LoaderCircle,
  Radar,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  EventReadiness,
  ReadinessCheck,
  ReadinessTone,
} from "@/lib/event-readiness-types";

const TONE_STYLES: Record<
  ReadinessTone,
  { stamp: string; bar: string; label: string; Icon: LucideIcon }
> = {
  ready: {
    stamp: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
    bar: "from-emerald-500/80 to-teal-400/60",
    label: "LISTO",
    Icon: CheckCircle2,
  },
  warn: {
    stamp: "border-amber-500/50 bg-amber-500/15 text-amber-200",
    bar: "from-amber-500/80 to-orange-400/50",
    label: "REVISAR",
    Icon: CircleAlert,
  },
  blocked: {
    stamp: "border-rose-500/50 bg-rose-500/15 text-rose-200",
    bar: "from-rose-500/80 to-red-400/50",
    label: "FALTA",
    Icon: CircleAlert,
  },
  empty: {
    stamp: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    bar: "from-slate-500/50 to-slate-400/30",
    label: "VACÍO",
    Icon: CircleDashed,
  },
};

const RECOMPUTE_STEPS = [
  {
    id: "setup",
    title: "Setup",
    detail: "Día D, actores, workstreams y bloques",
    key: "setup" as const,
  },
  {
    id: "design",
    title: "Diseño",
    detail: "Actividades y pasos definidos",
    key: "design" as const,
  },
  {
    id: "roles",
    title: "Roles",
    detail: "Ejecutores y aprobadores por paso",
    key: "roles" as const,
  },
  {
    id: "plan",
    title: "Plan",
    detail: "Condición de arranque por paso",
    key: "plan" as const,
  },
] as const;

type StepPhase = "pending" | "active" | "done" | "error";

type StationStats = {
  ready: number;
  warn: number;
  blocked: number;
  empty: number;
  total: number;
  tone: ReadinessTone;
  headline: string;
};

function summarizeChecks(
  checks: ReadinessCheck[],
  tone: ReadinessTone,
): StationStats {
  const ready = checks.filter((check) => check.tone === "ready").length;
  const warn = checks.filter((check) => check.tone === "warn").length;
  const blocked = checks.filter((check) => check.tone === "blocked").length;
  const empty = checks.filter((check) => check.tone === "empty").length;
  const total = checks.length;
  const headline =
    blocked > 0
      ? (checks.find((check) => check.tone === "blocked")?.detail ??
        "Hay bloqueos")
      : warn > 0
        ? (checks.find((check) => check.tone === "warn")?.detail ??
          "Hay avisos (no bloquean)")
        : total > 0
          ? "Estación en verde"
          : "Sin datos";
  return { ready, warn, blocked, empty, total, tone, headline };
}

function buildStationStats(data: EventReadiness) {
  return {
    setup: summarizeChecks(data.setup, data.summary.setup),
    design: summarizeChecks(data.design, data.summary.design),
    roles: summarizeChecks(data.roles, data.summary.roles),
    plan: summarizeChecks(data.plan, data.summary.plan),
  };
}

function globalStats(data: EventReadiness) {
  const stations = [
    data.summary.setup,
    data.summary.design,
    data.summary.roles,
    data.summary.plan,
  ];
  const stationsReady = stations.filter((tone) => tone === "ready").length;
  const stationsBlocked = stations.filter(
    (tone) => tone === "blocked",
  ).length;
  const stationsWarn = stations.filter((tone) => tone === "warn").length;
  const checks = [
    ...data.setup,
    ...data.design,
    ...data.roles,
    ...data.plan,
  ];
  const checksReady = checks.filter((check) => check.tone === "ready").length;
  const checksWarn = checks.filter((check) => check.tone === "warn").length;
  const checksBlocked = checks.filter(
    (check) => check.tone === "blocked",
  ).length;
  // Avisos no penalizan: el % mide qué tan “ejecutable” está (no la perfección).
  const scoreBasis = checksReady + checksWarn + checksBlocked;
  const scorePass = checksReady + checksWarn;
  return {
    stationsReady,
    stationsBlocked,
    stationsWarn,
    stationsTotal: 4,
    checksReady,
    checksWarn,
    checksBlocked,
    checksTotal: checks.length,
    score:
      scoreBasis === 0 ? 0 : Math.round((scorePass / scoreBasis) * 100),
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function StationTicket({
  step,
  title,
  tone,
  checks,
  href,
}: {
  step: string;
  title: string;
  tone: ReadinessTone;
  checks: ReadinessCheck[];
  href: string;
}) {
  const style = TONE_STYLES[tone];
  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-2xl border bg-card/80 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className={cn("h-1.5 bg-gradient-to-r", style.bar)} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Paso {step}
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">
              {title}
            </h3>
          </div>
          <span
            className={cn(
              "rotate-[-8deg] rounded-md border-2 border-dashed px-2 py-1 font-mono text-[10px] font-bold tracking-wider",
              style.stamp,
            )}
          >
            {style.label}
          </span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {checks.map((check) => {
            const Icon = TONE_STYLES[check.tone].Icon;
            return (
              <li
                key={check.id}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    check.tone === "ready" && "text-emerald-400",
                    check.tone === "warn" && "text-amber-400",
                    check.tone === "blocked" && "text-rose-400",
                  )}
                />
                <span>
                  <span className="font-medium text-foreground/90">
                    {check.label}:
                  </span>{" "}
                  {check.detail}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Link>
  );
}

export type EventReadinessBoardHandle = {
  recompute: () => void;
};

export const EventReadinessBoard = forwardRef<
  EventReadinessBoardHandle,
  {
    readiness: EventReadiness;
    onReadinessChange?: (next: EventReadiness) => void;
  }
>(function EventReadinessBoard(
  { readiness: initial, onReadinessChange },
  ref,
) {
  const [readiness, setReadiness] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [phases, setPhases] = useState<StepPhase[]>(() =>
    RECOMPUTE_STEPS.map(() => "pending"),
  );
  const [result, setResult] = useState<EventReadiness | null>(null);
  const [revealedStats, setRevealedStats] = useState<
    Partial<Record<"setup" | "design" | "roles" | "plan", StationStats>>
  >({});
  const runIdRef = useRef(0);

  useEffect(() => {
    setReadiness(initial);
  }, [initial]);

  function phaseFor(index: number): StepPhase {
    return phases[index] ?? "pending";
  }

  async function recompute() {
    const runId = ++runIdRef.current;
    setOpen(true);
    setBusy(true);
    setError("");
    setResult(null);
    setRevealedStats({});
    setActiveIndex(0);
    setPhases(
      RECOMPUTE_STEPS.map((_, index) => (index === 0 ? "active" : "pending")),
    );

    // Pequeña pausa inicial de “armado”
    await sleep(700);
    if (runIdRef.current !== runId) return;

    const settled = await fetch(
      `/api/events/${readiness.eventId}/readiness/recompute`,
      { method: "POST" },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          readiness?: EventReadiness;
          error?: string;
        } | null;
        return { response, payload };
      })
      .catch(() => null);

    if (runIdRef.current !== runId) return;

    if (!settled?.response.ok || !settled.payload?.readiness) {
      setPhases(RECOMPUTE_STEPS.map(() => "error"));
      setError(settled?.payload?.error ?? "No fue posible recalcular.");
      setBusy(false);
      return;
    }

    const next = settled.payload.readiness;
    const stats = buildStationStats(next);

    // Revela estación por estación con stats reales (más lento = más control).
    for (let index = 0; index < RECOMPUTE_STEPS.length; index += 1) {
      if (runIdRef.current !== runId) return;
      const step = RECOMPUTE_STEPS[index];
      setActiveIndex(index);
      setPhases((current) =>
        current.map((phase, i) => {
          if (i < index) return "done";
          if (i === index) return "active";
          return "pending";
        }),
      );

      setRevealedStats((current) => ({
        ...current,
        [step.key]: stats[step.key],
      }));

      await sleep(980 + index * 160);
    }

    if (runIdRef.current !== runId) return;
    setPhases(RECOMPUTE_STEPS.map(() => "done"));
    setResult(next);
    setReadiness(next);
    onReadinessChange?.(next);
    setBusy(false);
  }

  useImperativeHandle(ref, () => ({
    recompute: () => {
      void recompute();
    },
  }));

  function closeModal(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setError("");
      setResult(null);
      setRevealedStats({});
    }
  }

  const totals = result ? globalStats(result) : null;
  const boardTotals = globalStats(readiness);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Snapshot cacheado. Cualquier cambio de preparación lo marca como
            desactualizado hasta recalcular.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "mr-1 font-mono text-2xl font-semibold tabular-nums",
              readiness.stale
                ? "text-amber-200"
                : readiness.canStart
                  ? "text-emerald-300"
                  : "text-rose-300",
            )}
          >
            {boardTotals.score}
            <span className="text-sm font-medium text-muted-foreground">%</span>
          </p>
          <Badge
            variant={
              readiness.canStart && !readiness.stale ? "default" : "outline"
            }
          >
            {readiness.stale
              ? "Desactualizado"
              : readiness.canStart
                ? "Listo para ejecutar"
                : "No listo"}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void recompute()}
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Recalcular
          </Button>
        </div>
      </div>

      {readiness.stale ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
          Hay cambios de preparación. Recalcula el readiness antes de crear
          simulacro o ejecución real.
        </div>
      ) : !readiness.canStart ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
          {readiness.blockers.join(" · ")}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StationTicket
          step="1/4"
          title="Setup"
          tone={readiness.summary.setup}
          checks={readiness.setup}
          href={`/events/${readiness.eventId}/setup`}
        />
        <StationTicket
          step="2/4"
          title="Diseño"
          tone={readiness.summary.design}
          checks={readiness.design}
          href={`/events/${readiness.eventId}/design`}
        />
        <StationTicket
          step="3/4"
          title="Roles"
          tone={readiness.summary.roles}
          checks={readiness.roles}
          href={`/events/${readiness.eventId}/roles`}
        />
        <StationTicket
          step="4/4"
          title="Plan"
          tone={readiness.summary.plan}
          checks={readiness.plan}
          href={`/events/${readiness.eventId}/plan`}
        />
      </div>

      <Dialog open={open} onOpenChange={closeModal}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
          showCloseButton={!busy}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Radar className={cn("size-4", busy && "animate-pulse")} />
              </span>
              Control de readiness
            </DialogTitle>
            <DialogDescription>
              {busy
                ? "Auditando estaciones y consolidando estadísticas…"
                : error
                  ? "El cálculo se detuvo."
                  : "Auditoría completada."}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-hidden rounded-xl border">
            <div className="hidden grid-cols-[minmax(11rem,1.3fr)_minmax(8rem,0.9fr)_minmax(12rem,1.4fr)_5.5rem] gap-3 border-b bg-muted/40 px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase sm:grid">
              <span>Evaluación</span>
              <span>Resultado</span>
              <span>Comentario</span>
              <span className="text-right">Semáforo</span>
            </div>
            <ul className="divide-y">
              {RECOMPUTE_STEPS.map((step, index) => {
                const phase = phaseFor(index);
                const stats = revealedStats[step.key];
                const resultText = stats
                      ? `${stats.ready}/${stats.total} OK${stats.warn ? ` · ${stats.warn} aviso` : ""}${stats.blocked ? ` · ${stats.blocked} bloqueo` : ""}`
                      : phase === "active"
                        ? "Evaluando…"
                        : phase === "pending"
                          ? "—"
                          : phase === "error"
                            ? "Error"
                            : "—";
                const commentText = stats
                      ? stats.headline
                      : phase === "active"
                        ? step.detail
                        : phase === "pending"
                          ? "En cola"
                          : step.detail;
                const tone: ReadinessTone | null = stats ? stats.tone : null;

                return (
                  <li
                    key={step.id}
                    className={cn(
                      "grid grid-cols-1 gap-2 px-3 py-3 transition-colors sm:grid-cols-[minmax(11rem,1.3fr)_minmax(8rem,0.9fr)_minmax(12rem,1.4fr)_5.5rem] sm:items-center sm:gap-3",
                      phase === "active" && "bg-cyan-500/10",
                      phase === "done" && "bg-emerald-500/[0.04]",
                      phase === "error" && "bg-rose-500/10",
                      phase === "pending" && "opacity-60",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex size-5 shrink-0 items-center justify-center">
                          {phase === "active" ? (
                            <LoaderCircle className="size-4 animate-spin text-cyan-300" />
                          ) : phase === "done" ? (
                            <CheckCircle2 className="size-4 text-emerald-400" />
                          ) : phase === "error" ? (
                            <CircleAlert className="size-4 text-rose-400" />
                          ) : (
                            <span className="size-2 rounded-full bg-muted-foreground/40" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {index + 1}. {step.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {step.detail}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 sm:pl-0">
                      <p className="text-[10px] tracking-wide text-muted-foreground uppercase sm:hidden">
                        Resultado
                      </p>
                      <p className="font-mono text-xs text-foreground/90">
                        {resultText}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] tracking-wide text-muted-foreground uppercase sm:hidden">
                        Comentario
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {commentText}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <p className="text-[10px] tracking-wide text-muted-foreground uppercase sm:hidden">
                        Semáforo
                      </p>
                      {tone ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-bold tracking-wider",
                            TONE_STYLES[tone].stamp,
                          )}
                        >
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              tone === "ready" && "bg-emerald-400",
                              tone === "warn" && "bg-amber-400",
                              tone === "blocked" && "bg-rose-400",
                              tone === "empty" && "bg-slate-400",
                            )}
                          />
                          {TONE_STYLES[tone].label}
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          —
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          {totals && result && !busy && !error ? (
            <div
              className={cn(
                "space-y-2 rounded-lg border px-3 py-3",
                result.canStart
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-amber-500/30 bg-amber-500/10",
              )}
            >
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                    Resultado global
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {result.canStart
                      ? "Listo para ejecutar"
                      : "No listo para ejecutar"}
                  </p>
                </div>
                <p className="font-mono text-2xl font-semibold tabular-nums">
                  {totals.score}
                  <span className="text-sm text-muted-foreground">%</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="rounded-md border bg-background/40 px-2 py-1.5">
                  <p className="font-mono text-sm tabular-nums">
                    {totals.stationsReady}/{totals.stationsTotal}
                  </p>
                  <p className="text-muted-foreground">estaciones OK</p>
                </div>
                <div className="rounded-md border bg-background/40 px-2 py-1.5">
                  <p className="font-mono text-sm tabular-nums">
                    {totals.checksReady + totals.checksWarn}/
                    {totals.checksTotal}
                  </p>
                  <p className="text-muted-foreground">checks OK</p>
                </div>
                <div className="rounded-md border bg-background/40 px-2 py-1.5">
                  <p className="font-mono text-sm tabular-nums">
                    {totals.checksBlocked}
                    {totals.checksWarn ? `+${totals.checksWarn}` : ""}
                  </p>
                  <p className="text-muted-foreground">bloqueo/aviso</p>
                </div>
              </div>
              {!result.canStart && result.blockers.length ? (
                <p className="text-xs text-amber-100">
                  {result.blockers.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            {busy ? (
              <p className="w-full text-center font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Estación {Math.min(activeIndex + 1, RECOMPUTE_STEPS.length)}/
                {RECOMPUTE_STEPS.length}
              </p>
            ) : (
              <Button
                type="button"
                className="w-full"
                onClick={() => closeModal(false)}
              >
                {error ? "Cerrar" : "Entendido"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
});
