"use client";

import { CalendarClock, LoaderCircle, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DesignPair, DesignStepSummary } from "@/lib/admin-data";

type PlannerRow = DesignStepSummary & {
  workstreamName: string;
  blockName: string;
  activityName: string;
};

export function EventPlanner({
  eventId,
  eventTimezone,
  pairs,
}: {
  eventId: string;
  eventTimezone: string;
  pairs: DesignPair[];
}) {
  const rows = useMemo(
    () =>
      pairs.flatMap((pair) =>
        pair.activities.flatMap((activity) =>
          activity.steps.map((step) => ({
            ...step,
            workstreamName: pair.workstream.name,
            blockName: pair.block.name,
            activityName: activity.name,
          })),
        ),
      ),
    [pairs],
  );

  if (!rows.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <CalendarClock className="mb-4 size-6 text-muted-foreground" />
          <p className="font-medium">No hay pasos para planificar</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Completa primero el diseño del evento creando actividades y pasos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <StepPlanCard
          key={row.id}
          eventId={eventId}
          eventTimezone={eventTimezone}
          row={row}
          rows={rows}
        />
      ))}
    </div>
  );
}

function StepPlanCard({
  eventId,
  eventTimezone,
  row,
  rows,
}: {
  eventId: string;
  eventTimezone: string;
  row: PlannerRow;
  rows: PlannerRow[];
}) {
  const [plannedStart, setPlannedStart] = useState(
    row.plannedStartAt
      ? toZonedInput(row.plannedStartAt, eventTimezone)
      : "",
  );
  const [dependencies, setDependencies] = useState(
    () => new Set(row.dependencyStepIds),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function toggleDependency(stepId: string) {
    setDependencies((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch(
      `/api/events/${eventId}/design-steps/${row.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedStartAt: plannedStart
            ? zonedInputToIso(plannedStart, eventTimezone)
            : null,
          dependencyStepIds: [...dependencies],
        }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as { error?: string })
      : null;
    setSaving(false);
    setMessage(
      response?.ok
        ? "Planificación guardada."
        : (payload?.error ?? "No fue posible guardar."),
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant="outline">{row.workstreamName}</Badge>
              <Badge variant="secondary">{row.blockName}</Badge>
            </div>
            <CardTitle className="text-base">{row.name}</CardTitle>
            <CardDescription className="mt-1">
              {row.activityName}
            </CardDescription>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <Label htmlFor={`start-${row.id}`}>Inicio planificado</Label>
          <Input
            id={`start-${row.id}`}
            type="datetime-local"
            value={plannedStart}
            onChange={(event) => setPlannedStart(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Zona horaria del evento: {eventTimezone}
          </p>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Depende de</legend>
          <p className="mt-1 text-xs text-muted-foreground">
            El paso quedará habilitado cuando finalicen todos los seleccionados.
          </p>
          <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto rounded-lg border p-3 md:grid-cols-2">
            {rows
              .filter((candidate) => candidate.id !== row.id)
              .map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={dependencies.has(candidate.id)}
                    onChange={() => toggleDependency(candidate.id)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {candidate.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {candidate.workstreamName} · {candidate.blockName}
                    </span>
                  </span>
                </label>
              ))}
          </div>
        </fieldset>
        {message ? (
          <p
            className="text-xs text-muted-foreground lg:col-span-2"
            role="status"
          >
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function toZonedInput(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function zonedInputToIso(value: string, timezone: string) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = desiredUtc;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const zoned = Object.fromEntries(
      parts.map((part) => [part.type, Number(part.value)]),
    );
    const renderedUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
    );
    instant += desiredUtc - renderedUtc;
  }

  return new Date(instant).toISOString();
}
