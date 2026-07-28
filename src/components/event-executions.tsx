"use client";

import {
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { DateTimePicker } from "@/components/datetime-picker";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventSummary, ExecutionSummary } from "@/lib/admin-data";
import type { EventActorSummary } from "@/lib/event-actors";
import type { EventReadiness } from "@/lib/event-readiness-types";
import { formatDayLabel, formatDayTimeLabel } from "@/lib/execution-schedule";
import { cn } from "@/lib/utils";

type TypeFilter = "all" | "SIMULACRO" | "REAL";

const STATUS_LABELS: Record<ExecutionSummary["status"], string> = {
  BORRADOR: "Borrador",
  PREPARADO: "Preparado",
  EN_EJECUCION: "En ejecución",
  PAUSADO: "Pausado",
  FINALIZADO: "Finalizado",
  CANCELADO: "Cancelado",
};

export function EventExecutions({
  event,
  initialExecutions,
  initialReadiness,
  canImpersonate = false,
  actors = [],
}: {
  event: EventSummary;
  initialExecutions: ExecutionSummary[];
  initialReadiness: EventReadiness;
  /** Dev/MVP: elegir ejecutor al entrar a Mi turno. */
  canImpersonate?: boolean;
  actors?: EventActorSummary[];
}) {
  const router = useRouter();
  const [executions, setExecutions] = useState(initialExecutions);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [recomputing, setRecomputing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [actionError, setActionError] = useState("");

  const simulacroCount = useMemo(
    () => executions.filter((item) => item.type === "SIMULACRO").length,
    [executions],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return executions.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.status.toLowerCase().includes(needle) ||
        item.type.toLowerCase().includes(needle)
      );
    });
  }, [executions, query, typeFilter]);

  async function deleteSimulacro(executionId: string) {
    setActionError("");
    setDeletingId(executionId);
    const response = await fetch(`/api/executions/${executionId}`, {
      method: "DELETE",
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as { error?: string })
      : null;
    setDeletingId(null);
    if (!response?.ok) {
      setActionError(payload?.error ?? "No fue posible eliminar el simulacro.");
      return;
    }
    setExecutions((current) =>
      current.filter((item) => item.id !== executionId),
    );
  }

  async function purgeSimulacros() {
    setActionError("");
    setPurging(true);
    const response = await fetch(
      `/api/events/${event.id}/executions/purge-simulacros`,
      { method: "POST" },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          deletedCount?: number;
          error?: string;
        })
      : null;
    setPurging(false);
    if (!response?.ok) {
      setActionError(payload?.error ?? "No fue posible purgar los simulacros.");
      return;
    }
    setExecutions((current) =>
      current.filter((item) => item.type !== "SIMULACRO"),
    );
  }

  async function recomputeReadiness() {
    setRecomputing(true);
    const response = await fetch(
      `/api/events/${event.id}/readiness/recompute`,
      { method: "POST" },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          readiness?: EventReadiness;
          error?: string;
        })
      : null;
    setRecomputing(false);
    if (response?.ok && payload?.readiness) {
      setReadiness(payload.readiness);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar ejecución…"
          />
        </div>

        <div className="inline-flex rounded-lg border p-0.5">
          {(
            [
              ["all", "Todas"],
              ["SIMULACRO", "Simulacros"],
              ["REAL", "Reales"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(value)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                typeFilter === value
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {simulacroCount > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={purging || deletingId !== null}
                >
                  {purging ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Purgar simulacros ({simulacroCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Purgar todos los simulacros?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminarán {simulacroCount} simulacro
                    {simulacroCount === 1 ? "" : "s"} de este evento (pasos,
                    timeline y evidencias). Las ejecuciones REAL no se tocan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => void purgeSimulacros()}
                  >
                    Purgar simulacros
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <CreateExecutionDialog
            event={event}
            readiness={readiness}
            recomputing={recomputing}
            onRequestRecompute={() => void recomputeReadiness()}
            onCreated={(execution) => {
              setExecutions((current) => [execution, ...current]);
              router.push(`/events/${event.id}/executions/${execution.id}`);
            }}
          />
        </div>
      </div>

      {actionError ? (
        <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      {readiness.stale ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <span className="flex-1">
            Readiness desactualizado: recalcula antes de crear una ejecución.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={recomputing}
            onClick={() => void recomputeReadiness()}
          >
            {recomputing ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Recalcular
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((execution) => (
              <Card
                key={execution.id}
                className="transition hover:border-primary/40"
              >
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        execution.type === "REAL" ? "default" : "secondary"
                      }
                    >
                      {execution.type}
                    </Badge>
                    <Badge variant="outline">
                      {STATUS_LABELS[execution.status]}
                    </Badge>
                    {execution.iteration > 1 ? (
                      <Badge variant="outline">#{execution.iteration}</Badge>
                    ) : null}
                  </div>
                  <CardTitle className="pt-3 text-base leading-snug">
                    {execution.name}
                  </CardTitle>
                  <CardDescription>
                    {execution.timezone}
                    {execution.anchorStartAt
                      ? ` · T0 ${formatDayTimeLabel(execution.anchorStartAt, execution.timezone)}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full" asChild>
                    <Link
                      href={`/events/${event.id}/executions/${execution.id}`}
                    >
                      Abrir panel
                    </Link>
                  </Button>
                  <MiTurnoButton
                    eventId={event.id}
                    executionId={execution.id}
                    canImpersonate={canImpersonate}
                    actors={actors}
                  />
                  {execution.type === "SIMULACRO" ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full text-destructive hover:text-destructive"
                          disabled={
                            purging ||
                            deletingId === execution.id ||
                            deletingId !== null
                          }
                        >
                          {deletingId === execution.id ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          Eliminar simulacro
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            ¿Eliminar este simulacro?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Se borrará “{execution.name}” con sus pasos,
                            timeline y evidencias. No se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => void deleteSimulacro(execution.id)}
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            {executions.length
              ? "Ninguna ejecución coincide con el filtro."
              : "Todavía no hay ejecuciones. Crea un simulacro o una corrida real."}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateExecutionDialog({
  event,
  readiness,
  recomputing,
  onCreated,
  onRequestRecompute,
}: {
  event: EventSummary;
  readiness: EventReadiness;
  recomputing: boolean;
  onCreated: (execution: ExecutionSummary) => void;
  onRequestRecompute: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"SIMULACRO" | "REAL">("SIMULACRO");
  const [timezone, setTimezone] = useState(event.timezone);
  const [simulatedDayDStartAt, setSimulatedDayDStartAt] = useState<
    string | null
  >(event.dayDStartAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const stale = readiness.stale;
  const blocked = !readiness.canStart || stale;
  const missingSimDay = type === "SIMULACRO" && !simulatedDayDStartAt;
  const missingRealDay = type === "REAL" && !event.dayDStartAt;
  const cannotSubmit = blocked || loading || missingSimDay || missingRealDay;

  const anchorPreview =
    type === "SIMULACRO" ? simulatedDayDStartAt : event.dayDStartAt;
  const dayPreview = anchorPreview
    ? formatDayLabel(anchorPreview, timezone)
    : null;
  const namePreview = dayPreview
    ? `${type === "SIMULACRO" ? "Simulacro" : "Real"} · ${dayPreview} · #…`
    : null;

  async function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (cannotSubmit) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        type,
        timezone,
        simulatedDayDStartAt:
          type === "SIMULACRO" ? simulatedDayDStartAt : undefined,
      }),
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          execution?: ExecutionSummary;
          error?: string;
        })
      : null;
    if (!response?.ok || !payload?.execution) {
      setError(payload?.error ?? "No fue posible crear la ejecución.");
      setLoading(false);
      return;
    }
    onCreated(payload.execution);
    setOpen(false);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Play className="size-4" />
          Nueva ejecución
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {type === "SIMULACRO"
              ? "Ensayar el Día D"
              : "Ejecutar el Día D real"}
          </DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            {type === "SIMULACRO" ? (
              <>
                Vas a abrir una instancia de <strong>{event.name}</strong> que
                no toca el Día D oficial. Eliges{" "}
                <strong>cuándo arranca este ensayo</strong>; desde esa hora se
                recalculan todos los pasos.
              </>
            ) : (
              <>
                Vas a abrir la corrida real de <strong>{event.name}</strong>. El
                T0 es el <strong>Día D</strong> definido en Setup.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <form
            className={
              blocked
                ? "pointer-events-none space-y-4 select-none"
                : "space-y-4"
            }
            aria-hidden={blocked}
            onSubmit={handleSubmit}
          >
            <div className="space-y-2">
              <Label>Tipo de ejecución</Label>
              <Select
                value={type}
                onValueChange={(value) =>
                  setType(value as "SIMULACRO" | "REAL")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIMULACRO">
                    Simulacro — ensayo con T0 propio
                  </SelectItem>
                  <SelectItem value="REAL">
                    Real — Día D oficial
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === "SIMULACRO" ? (
              <div className="space-y-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3">
                <div className="space-y-1">
                  <Label className="text-base">
                    ¿En qué día y hora arranca este simulacro?
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Esa marca es el T0 de esta instancia.
                  </p>
                </div>
                <DateTimePicker
                  value={simulatedDayDStartAt}
                  timezone={timezone}
                  onChange={setSimulatedDayDStartAt}
                  placeholder="Elegir día y hora de arranque"
                />
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                <p className="text-sm font-medium">
                  {event.dayDStartAt
                    ? formatDayLabel(event.dayDStartAt, timezone)
                    : "Falta definir el Día D en Setup"}
                </p>
                <p className="text-xs text-muted-foreground">
                  La ejecución real usa el ancla del evento.
                </p>
              </div>
            )}

            <div className="space-y-2 rounded-xl border bg-muted/20 px-3 py-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Al crear
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>· Se materializan los pasos en Planificado.</li>
                <li>
                  · Horarios desde{" "}
                  <span className="text-foreground/90">
                    {dayPreview ?? "el T0 elegido"}
                  </span>
                  .
                </li>
                <li>
                  · Nombre automático
                  {namePreview ? (
                    <>
                      :{" "}
                      <span className="font-medium text-foreground/90">
                        {namePreview}
                      </span>
                    </>
                  ) : (
                    "."
                  )}
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Zona horaria de la instancia</Label>
              <TimezoneCombobox value={timezone} onValueChange={setTimezone} />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            ) : null}
            <Button className="w-full" disabled={cannotSubmit}>
              {loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {loading
                ? "Materializando…"
                : type === "SIMULACRO"
                  ? "Abrir simulacro"
                  : "Abrir ejecución real"}
            </Button>
          </form>

          {blocked ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/55 p-4 backdrop-blur-md">
              <div className="w-full max-w-sm space-y-4 rounded-xl border border-amber-500/40 bg-background/95 p-5 text-center shadow-lg">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-100">
                    {stale
                      ? "Readiness desactualizado"
                      : "No listo para ejecutar"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {stale
                      ? "Hubo cambios en la preparación. Recalcula el readiness antes de crear."
                      : readiness.blockers.join(" · ") ||
                        "Completa la preparación y vuelve a intentar."}
                  </p>
                </div>
                {stale ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={recomputing}
                    onClick={onRequestRecompute}
                  >
                    {recomputing ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    Recalcular ahora
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setOpen(false)}
                  >
                    Entendido
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Entra a Mi turno; en dev/MVP el admin elige ejecutor antes de abrir el cockpit. */
function MiTurnoButton({
  eventId,
  executionId,
  canImpersonate,
  actors,
}: {
  eventId: string;
  executionId: string;
  canImpersonate: boolean;
  actors: EventActorSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const executors = useMemo(
    () =>
      actors.filter(
        (actor) =>
          actor.roles.includes("EXECUTOR") ||
          actor.roles.includes("APPROVER"),
      ),
    [actors],
  );

  async function enterAs(actorId: string | null) {
    setError("");
    if (canImpersonate) {
      const response = await fetch("/api/dev/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, actorId }),
      }).catch(() => null);
      if (!response?.ok) {
        const payload = (await response?.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "No se pudo elegir el actor.");
        return;
      }
    }
    startTransition(() => {
      router.push(`/run/${executionId}`);
    });
  }

  if (!canImpersonate || !executors.length) {
    return (
      <Button variant="secondary" className="w-full" asChild>
        <Link href={`/run/${executionId}`}>Mi turno</Link>
      </Button>
    );
  }

  return (
    <div className="space-y-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <UserRound className="size-4" />
            )}
            Mi turno
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Entrar como…</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {executors.map((actor) => (
            <DropdownMenuItem
              key={actor.id}
              disabled={pending}
              onSelect={() => {
                void enterAs(actor.id);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{actor.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {actor.roles.includes("EXECUTOR") ? "ej" : ""}
                {actor.roles.includes("APPROVER")
                  ? actor.roles.includes("EXECUTOR")
                    ? " · ap"
                    : "ap"
                  : ""}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : (
        <p className="text-center text-[10px] text-muted-foreground">
          Mock · elige ejecutor / aprobador
        </p>
      )}
    </div>
  );
}
