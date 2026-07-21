"use client";

import {
  Boxes,
  CalendarClock,
  LoaderCircle,
  PencilRuler,
  Play,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminManager } from "@/components/admin-manager";
import { EventReadinessBoard } from "@/components/event-readiness-board";
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
import { Input } from "@/components/ui/input";
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
                  <CardDescription>{execution.timezone}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full" asChild>
                    <Link
                      href={`/events/${event.id}/executions/${execution.id}`}
                    >
                      Abrir consola
                    </Link>
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
}: {
  event: EventSummary;
  readiness: EventReadiness;
  onCreated: (execution: ExecutionSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"SIMULACRO" | "REAL">("SIMULACRO");
  const [timezone, setTimezone] = useState(event.timezone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const blocked = !readiness.canStart || readiness.stale;

  async function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(formEvent.currentTarget);
    const response = await fetch("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        name: form.get("name") || undefined,
        type,
        timezone,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva ejecución</DialogTitle>
          <DialogDescription>
            Instancia {event.name} en estado Preparado con todos los pasos
            Planificados.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>Tipo</Label>
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
                <SelectItem value="SIMULACRO">Simulacro</SelectItem>
                <SelectItem value="REAL">Ejecución real</SelectItem>
              </SelectContent>
            </Select>
            {blocked ? (
              <p className="text-xs text-amber-300">
                {readiness.stale
                  ? "Recalcula el readiness en el hub antes de crear la ejecución."
                  : readiness.blockers.join(" · ") ||
                    "Completa el readiness para crear simulacro o real."}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {type === "SIMULACRO"
                  ? "Simulacro: permite Simulado/Omitido y evidencia opcional."
                  : "Real: sin Simulado/Omitido; evidencia obligatoria al cerrar el paso."}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="execution-name">Nombre (opcional)</Label>
            <Input id="execution-name" name="name" />
          </div>
          <div className="space-y-2">
            <Label>Zona horaria</Label>
            <TimezoneCombobox value={timezone} onValueChange={setTimezone} />
          </div>
          <FormError message={error} />
          <Button className="w-full" disabled={loading || blocked}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {loading ? "Creando…" : "Crear e ir a consola"}
          </Button>
        </form>
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
