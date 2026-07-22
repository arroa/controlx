"use client";

import {
  Boxes,
  CalendarClock,
  LoaderCircle,
  PencilRuler,
  Play,
  RefreshCw,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { AdminManager } from "@/components/admin-manager";
import {
  EventReadinessBoard,
  type EventReadinessBoardHandle,
} from "@/components/event-readiness-board";
import { DateTimePicker } from "@/components/datetime-picker";
import { TimezoneCombobox } from "@/components/timezone-combobox";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AdminSummary,
  EventSummary,
  ExecutionSummary,
} from "@/lib/admin-data";
import type { EventReadiness } from "@/lib/event-readiness-types";
import { formatDayLabel } from "@/lib/execution-schedule";

export function EventWorkspace({
  event,
  initialAdmins,
  initialExecutions,
  readiness: initialReadiness,
  canManageAdmins,
}: {
  event: EventSummary;
  initialAdmins: AdminSummary[];
  initialExecutions: ExecutionSummary[];
  readiness: EventReadiness;
  canManageAdmins: boolean;
}) {
  const [executions, setExecutions] = useState(initialExecutions);
  const [readiness, setReadiness] = useState(initialReadiness);
  const readinessBoardRef = useRef<EventReadinessBoardHandle>(null);
  const router = useRouter();

  return (
    <div className="space-y-10">
      {canManageAdmins ? (
        <AdminManager
          title="EventAdmins"
          description="Responsables de configurar y administrar este evento."
          roleLabel="EventAdmin"
          endpoint={`/api/events/${event.id}/admins`}
          initialAdmins={initialAdmins}
        />
      ) : null}

      <EventReadinessBoard
        ref={readinessBoardRef}
        readiness={readiness}
        onReadinessChange={setReadiness}
      />

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Preparación del evento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Setup, diseño, roles y planificador.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PreparationCard
            number="1"
            title="Setup"
            description="Actores, Día D, workstreams y bloques."
            href={`/events/${event.id}/setup`}
            icon={Boxes}
          />
          <PreparationCard
            number="2"
            title="Diseño"
            description="Actividades y pasos por workstream y bloque."
            href={`/events/${event.id}/design`}
            icon={PencilRuler}
          />
          <PreparationCard
            number="3"
            title="Roles"
            description="Asigna ejecutores y aprobadores a los pasos."
            href={`/events/${event.id}/roles`}
            icon={UsersRound}
          />
          <PreparationCard
            number="4"
            title="Planificador"
            description="Horarios y dependencias entre pasos."
            href={`/events/${event.id}/plan`}
            icon={CalendarClock}
          />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Ejecuciones</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Instancias del evento: simulacros o ejecución real.
            </p>
          </div>
          <ExecutionDialog
            event={event}
            readiness={readiness}
            onRequestRecompute={() => readinessBoardRef.current?.recompute()}
            onCreated={(execution) => {
              setExecutions((current) => [execution, ...current]);
              router.push(`/events/${event.id}/executions/${execution.id}`);
            }}
          />
        </div>
        {executions.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {executions.map((execution) => (
              <Card
                key={execution.id}
                className="transition hover:border-primary/40"
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant={
                        execution.type === "REAL" ? "default" : "secondary"
                      }
                    >
                      {execution.type}
                    </Badge>
                    <Badge variant="outline">{execution.status}</Badge>
                  </div>
                  <CardTitle className="pt-3">{execution.name}</CardTitle>
                  <CardDescription>
                    {execution.timezone}
                    {execution.anchorStartAt
                      ? ` · T0 ${new Date(execution.anchorStartAt).toLocaleString("es")}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full" asChild>
                    <Link
                      href={`/events/${event.id}/executions/${execution.id}`}
                    >
                      Abrir consola
                    </Link>
                  </Button>
                  <Button variant="secondary" className="w-full" asChild>
                    <Link href={`/run/${execution.id}`}>Mi turno (PWA)</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyCopy text="Todavía no se ha ejecutado este evento." />
        )}
      </section>
    </div>
  );
}

function PreparationCard({
  number,
  title,
  description,
  href,
  icon: Icon,
}: {
  number: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {number}/4
          </span>
        </div>
        <CardTitle className="pt-2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="w-full" asChild>
          <Link href={href}>Abrir {title.toLowerCase()}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ExecutionDialog({
  event,
  readiness,
  onCreated,
  onRequestRecompute,
}: {
  event: EventSummary;
  readiness: EventReadiness;
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
                recalculan todos los pasos (deps, duraciones y anclas) como si
                ese fuera el origen del timeline.
              </>
            ) : (
              <>
                Vas a abrir la corrida real de <strong>{event.name}</strong>.
                El T0 es el <strong>Día D</strong> definido en Setup; el plan se
                materializa tal como está preparado.
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
              <Label>¿Qué quieres abrir?</Label>
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
                    Ejecución real — Día D oficial
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === "SIMULACRO" ? (
              <div className="space-y-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3">
                <div className="space-y-1">
                  <p className="font-mono text-[10px] tracking-[0.16em] text-cyan-200/80 uppercase">
                    Paso 1 · Origen del ensayo
                  </p>
                  <Label className="text-base">
                    ¿En qué día y hora arranca este simulacro?
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Esa marca es el T0 de esta instancia. Si ya corriste otro
                    simulacro el mismo día, se abre una iteración nueva (#2,
                    #3…).
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
                <p className="font-mono text-[10px] tracking-[0.16em] text-emerald-200/80 uppercase">
                  Origen · Día D oficial
                </p>
                <p className="text-sm font-medium">
                  {event.dayDStartAt
                    ? formatDayLabel(event.dayDStartAt, timezone)
                    : "Falta definir el Día D en Setup"}
                </p>
                <p className="text-xs text-muted-foreground">
                  No se inventa otra fecha: la real usa el ancla del evento.
                </p>
              </div>
            )}

            <div className="space-y-2 rounded-xl border bg-muted/20 px-3 py-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Qué va a pasar al crear
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>
                  · Se materializan todos los pasos en{" "}
                  <span className="text-foreground/90">Planificado</span>.
                </li>
                <li>
                  · Los horarios se calculan desde{" "}
                  <span className="text-foreground/90">
                    {dayPreview ?? "el T0 elegido"}
                  </span>
                  .
                </li>
                <li>
                  · El nombre queda automático
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
                {type === "SIMULACRO" ? (
                  <li>
                    · Puedes usar Simulado/Omitido; la evidencia es opcional.
                  </li>
                ) : (
                  <li>
                    · Sin Simulado/Omitido; evidencia obligatoria al cerrar.
                  </li>
                )}
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Zona horaria de la instancia</Label>
              <TimezoneCombobox value={timezone} onValueChange={setTimezone} />
            </div>
            <FormError message={error} />
            <Button className="w-full" disabled={cannotSubmit}>
              {loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {loading
                ? "Materializando…"
                : type === "SIMULACRO"
                  ? "Abrir simulacro en consola"
                  : "Abrir ejecución real en consola"}
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
                      ? "Hubo cambios en la preparación. Debes recalcular el readiness antes de crear un simulacro o una ejecución real."
                      : readiness.blockers.join(" · ") ||
                        "Completa la preparación y vuelve a intentar."}
                  </p>
                </div>
                {stale ? (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      onRequestRecompute();
                    }}
                  >
                    <RefreshCw className="size-4" />
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

function EmptyCopy({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="text-sm text-red-300">
      {message}
    </p>
  ) : null;
}
