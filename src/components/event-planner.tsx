"use client";

import {
  CalendarClock,
  Info,
  LoaderCircle,
  Save,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DesignPair, DesignStepSummary } from "@/lib/admin-data";
import { APPROVAL_ROLE_OPTIONS, type ApprovalRole } from "@/domain/controlx";
import { cn } from "@/lib/utils";

const DEFAULT_DURATION_MINUTES = 30;
const PIXELS_PER_MINUTE = 2.4;

type PlannerRow = DesignStepSummary & {
  workstreamName: string;
  blockName: string;
  activityName: string;
};

type Draft = {
  estimatedDurationMinutes: string;
  dependencyStepIds: string[];
  approvalRoles: ApprovalRole[];
  plannedStartAt: string | null;
};

function pairsToRows(pairs: DesignPair[]): PlannerRow[] {
  return pairs.flatMap((pair) =>
    pair.activities.flatMap((activity) =>
      activity.steps.map((step) => ({
        ...step,
        workstreamName: pair.workstream.name,
        blockName: pair.block.name,
        activityName: activity.name,
      })),
    ),
  );
}

function draftFromRow(row: PlannerRow): Draft {
  return {
    estimatedDurationMinutes:
      row.estimatedDurationMinutes != null
        ? String(row.estimatedDurationMinutes)
        : "",
    dependencyStepIds: [...row.dependencyStepIds],
    approvalRoles: [...(row.approvalRoles ?? [])],
    plannedStartAt: row.plannedStartAt,
  };
}

function isDirty(row: PlannerRow, draft: Draft) {
  const raw = draft.estimatedDurationMinutes.trim();
  const duration = raw === "" ? null : Number(raw);
  if (raw !== "" && !Number.isInteger(duration)) return true;

  const sameDuration = duration === row.estimatedDurationMinutes;
  const sameDeps =
    draft.dependencyStepIds.length === row.dependencyStepIds.length &&
    draft.dependencyStepIds.every((id) => row.dependencyStepIds.includes(id));
  const sameApprovals =
    draft.approvalRoles.length === (row.approvalRoles?.length ?? 0) &&
    draft.approvalRoles.every((role) => row.approvalRoles?.includes(role));
  const sameAnchor = draft.plannedStartAt === row.plannedStartAt;
  return !(sameDuration && sameDeps && sameApprovals && sameAnchor);
}

export function EventPlanner({
  eventId,
  eventTimezone,
  pairs,
}: {
  eventId: string;
  eventTimezone: string;
  pairs: DesignPair[];
}) {
  const [rows, setRows] = useState(() => pairsToRows(pairs));
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(pairsToRows(pairs).map((row) => [row.id, draftFromRow(row)])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      `${row.workstreamName} ${row.blockName} ${row.activityName} ${row.name}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query, rows]);

  function patchRow(step: DesignStepSummary) {
    setRows((current) =>
      current.map((row) => (row.id === step.id ? { ...row, ...step } : row)),
    );
    setDrafts((current) => ({
      ...current,
      [step.id]: {
        estimatedDurationMinutes:
          step.estimatedDurationMinutes != null
            ? String(step.estimatedDurationMinutes)
            : "",
        dependencyStepIds: [...step.dependencyStepIds],
        approvalRoles: [...(step.approvalRoles ?? [])],
        plannedStartAt: step.plannedStartAt,
      },
    }));
  }

  async function saveRow(row: PlannerRow) {
    const draft = drafts[row.id] ?? draftFromRow(row);
    const durationRaw = draft.estimatedDurationMinutes.trim();
    const estimatedDurationMinutes =
      durationRaw === "" ? null : Number(durationRaw);

    if (
      estimatedDurationMinutes != null &&
      (!Number.isInteger(estimatedDurationMinutes) ||
        estimatedDurationMinutes < 1)
    ) {
      setError("La duración debe ser un entero de al menos 1 minuto.");
      return;
    }

    setSavingId(row.id);
    setError("");
    const response = await fetch(
      `/api/events/${eventId}/design-steps/${row.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedStartAt: draft.plannedStartAt,
          estimatedDurationMinutes,
          dependencyStepIds: draft.dependencyStepIds,
          approvalRoles: draft.approvalRoles,
        }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          step?: DesignStepSummary;
          error?: string;
        })
      : null;
    setSavingId(null);

    if (!response?.ok || !payload?.step) {
      setError(payload?.error ?? "No fue posible guardar la planificación.");
      return;
    }
    patchRow(payload.step);
  }

  if (!rows.length) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
        <CalendarClock className="mb-4 size-6 text-muted-foreground" />
        <p className="font-medium">No hay pasos para planificar</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Completa primero el diseño del evento creando actividades y pasos.
        </p>
      </div>
    );
  }

  return (
    <Tabs
      defaultValue="grid"
      className="flex h-full min-h-0 flex-col gap-3 overflow-hidden data-horizontal:flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="grid">Planilla</TabsTrigger>
          <TabsTrigger value="times">Tiempos</TabsTrigger>
        </TabsList>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar workstream, bloque, actividad o paso…"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          TZ: {eventTimezone}
        </p>
      </div>

      {error ? (
        <p role="alert" className="shrink-0 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <TabsContent
        value="grid"
        className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
      >
        <PlannerGrid
          rows={filteredRows}
          allRows={rows}
          drafts={drafts}
          eventTimezone={eventTimezone}
          savingId={savingId}
          onDraftChange={(id, next) =>
            setDrafts((current) => ({ ...current, [id]: next }))
          }
          onSave={(row) => void saveRow(row)}
        />
      </TabsContent>

      <TabsContent
        value="times"
        className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
      >
        <TimesView
          rows={filteredRows}
          allRows={rows}
          eventTimezone={eventTimezone}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </TabsContent>
    </Tabs>
  );
}

function PlannerGrid({
  rows,
  allRows,
  drafts,
  eventTimezone,
  savingId,
  onDraftChange,
  onSave,
}: {
  rows: PlannerRow[];
  allRows: PlannerRow[];
  drafts: Record<string, Draft>;
  eventTimezone: string;
  savingId: string | null;
  onDraftChange: (id: string, draft: Draft) => void;
  onSave: (row: PlannerRow) => void;
}) {
  const colgroup = (
    <colgroup>
      <col className="w-[11%]" />
      <col className="w-[9%]" />
      <col className="w-[12%]" />
      <col className="w-[12%]" />
      <col className="w-[8%]" />
      <col className="w-[14%]" />
      <col className="w-[12%]" />
      <col className="w-[14%]" />
      <col className="w-[8%]" />
    </colgroup>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 overflow-hidden rounded-t-xl border border-b-0">
        <table className="w-full table-fixed caption-bottom text-sm">
          {colgroup}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-muted/40">Workstream</TableHead>
              <TableHead className="bg-muted/40">Bloque</TableHead>
              <TableHead className="bg-muted/40">Actividad</TableHead>
              <TableHead className="bg-muted/40">Paso</TableHead>
              <TableHead className="bg-muted/40">Duración</TableHead>
              <TableHead className="bg-muted/40">Deps (OK exitoso)</TableHead>
              <TableHead className="bg-muted/40">Aprobaciones</TableHead>
              <TableHead className="bg-muted/40">Hora (no antes de)</TableHead>
              <TableHead className="bg-muted/40 text-right"> </TableHead>
            </TableRow>
          </TableHeader>
        </table>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-b-xl border">
        <table className="w-full table-fixed caption-bottom text-sm">
          {colgroup}
          <TableBody>
            {!rows.length ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-24 text-center text-muted-foreground"
                >
                  No hay filas que coincidan con la búsqueda.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const draft = drafts[row.id] ?? draftFromRow(row);
                const dirty = isDirty(row, draft);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="align-top font-medium">
                      <span className="line-clamp-2">{row.workstreamName}</span>
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground">
                      <span className="line-clamp-2">{row.blockName}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="line-clamp-2">{row.activityName}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="line-clamp-2 font-medium">{row.name}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-8"
                          inputMode="numeric"
                          value={draft.estimatedDurationMinutes}
                          onChange={(event) =>
                            onDraftChange(row.id, {
                              ...draft,
                              estimatedDurationMinutes: event.target.value,
                            })
                          }
                          placeholder={`${DEFAULT_DURATION_MINUTES}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          min
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <DependencyPicker
                        row={row}
                        allRows={allRows}
                        selectedIds={draft.dependencyStepIds}
                        onChange={(dependencyStepIds) =>
                          onDraftChange(row.id, { ...draft, dependencyStepIds })
                        }
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <ApprovalPicker
                        stepName={row.name}
                        selectedRoles={draft.approvalRoles}
                        onChange={(approvalRoles) =>
                          onDraftChange(row.id, { ...draft, approvalRoles })
                        }
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        className="h-8"
                        type="datetime-local"
                        value={
                          draft.plannedStartAt
                            ? toZonedInput(draft.plannedStartAt, eventTimezone)
                            : ""
                        }
                        onChange={(event) =>
                          onDraftChange(row.id, {
                            ...draft,
                            plannedStartAt: event.target.value
                              ? zonedInputToIso(event.target.value, eventTimezone)
                              : null,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <Button
                        size="sm"
                        variant={dirty ? "default" : "ghost"}
                        disabled={!dirty || savingId === row.id}
                        onClick={() => onSave(row)}
                      >
                        {savingId === row.id ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        Guardar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
}

function DependencyPicker({
  row,
  allRows,
  selectedIds,
  onChange,
}: {
  row: PlannerRow;
  allRows: PlannerRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [workstreamFilter, setWorkstreamFilter] = useState("all");
  const [pendingIds, setPendingIds] = useState<string[]>(selectedIds);

  const workstreams = useMemo(() => {
    const names = new Set(allRows.map((item) => item.workstreamName));
    return [...names].sort((a, b) => a.localeCompare(b, "es"));
  }, [allRows]);

  const candidates = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    return allRows
      .filter((candidate) => {
        if (candidate.id === row.id) return false;
        if (
          workstreamFilter !== "all" &&
          candidate.workstreamName !== workstreamFilter
        ) {
          return false;
        }
        if (!needle) return true;
        return `${candidate.workstreamName} ${candidate.activityName} ${candidate.name} ${candidate.blockName} ${candidate.description}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        const byWs = a.workstreamName.localeCompare(b.workstreamName, "es");
        if (byWs) return byWs;
        const byAct = a.activityName.localeCompare(b.activityName, "es");
        if (byAct) return byAct;
        return a.name.localeCompare(b.name, "es");
      });
  }, [allRows, filter, row.id, workstreamFilter]);

  const pending = new Set(pendingIds);
  const crossCount = selectedIds.filter((id) => {
    const dep = allRows.find((item) => item.id === id);
    return dep && dep.workstreamId !== row.workstreamId;
  }).length;

  function openModal() {
    setPendingIds([...selectedIds]);
    setFilter("");
    setWorkstreamFilter("all");
    setOpen(true);
  }

  function toggle(id: string) {
    setPendingIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function apply() {
    onChange(pendingIds);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-full justify-between font-normal"
        onClick={openModal}
      >
        <span className="truncate text-left">
          {selectedIds.length
            ? `${selectedIds.length} dep.${crossCount ? ` · ${crossCount} cross-WS` : ""}`
            : "Elegir…"}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(85dvh,720px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>Dependencias de “{row.name}”</DialogTitle>
            <DialogDescription>
              Requiere el OK exitoso de todos los pasos seleccionados (o
              ninguno). Pueden ser de cualquier workstream.
            </DialogDescription>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              <Badge variant="outline">{row.workstreamName}</Badge>
              <Badge variant="secondary">{row.blockName}</Badge>
              <span className="self-center">{row.activityName}</span>
            </div>
          </DialogHeader>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Buscar workstream, actividad o paso…"
              />
            </div>
            <Select
              value={workstreamFilter}
              onValueChange={setWorkstreamFilter}
            >
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue placeholder="Workstream" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los workstreams</SelectItem>
                {workstreams.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="h-8 px-2.5">
              {pendingIds.length} seleccionada
              {pendingIds.length === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {!candidates.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No hay pasos que coincidan.
              </p>
            ) : (
              <TooltipProvider delayDuration={200}>
                <table className="w-full caption-bottom text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr className="border-b text-left">
                      <th className="w-10 px-3 py-2 font-medium" />
                      <th className="px-3 py-2 font-medium">Workstream</th>
                      <th className="px-3 py-2 font-medium">Actividad</th>
                      <th className="px-3 py-2 font-medium">Paso</th>
                      <th className="w-10 px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => {
                      const checked = pending.has(candidate.id);
                      return (
                        <tr
                          key={candidate.id}
                          className={cn(
                            "cursor-pointer border-b last:border-b-0 hover:bg-muted/40",
                            checked && "bg-muted/30",
                          )}
                          onClick={() => toggle(candidate.id)}
                        >
                          <td className="px-3 py-2 align-middle">
                            <input
                              type="checkbox"
                              className="align-middle"
                              checked={checked}
                              onChange={() => toggle(candidate.id)}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Dependencia ${candidate.name}`}
                            />
                          </td>
                          <td className="px-3 py-2 align-middle text-muted-foreground">
                            {candidate.workstreamName}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            {candidate.activityName}
                          </td>
                          <td className="px-3 py-2 align-middle font-medium">
                            {candidate.name}
                          </td>
                          <td
                            className="px-3 py-2 align-middle"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                  aria-label="Ver descripción"
                                >
                                  <Info className="size-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                {candidate.description?.trim()
                                  ? candidate.description
                                  : "Sin descripción"}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TooltipProvider>
            )}
          </div>

          <DialogFooter className="shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingIds([])}
            >
              Limpiar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={apply}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApprovalPicker({
  stepName,
  selectedRoles,
  onChange,
}: {
  stepName: string;
  selectedRoles: ApprovalRole[];
  onChange: (roles: ApprovalRole[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ApprovalRole[]>(selectedRoles);

  function openModal() {
    setPending([...selectedRoles]);
    setOpen(true);
  }

  function toggle(role: ApprovalRole) {
    setPending((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  }

  function apply() {
    onChange(pending);
    setOpen(false);
  }

  const labels = APPROVAL_ROLE_OPTIONS.filter((option) =>
    selectedRoles.includes(option.value),
  ).map((option) => option.label);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-full justify-between font-normal"
        onClick={openModal}
      >
        <span className="truncate text-left">
          {labels.length ? labels.join(", ") : "Ninguna"}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aprobaciones de “{stepName}”</DialogTitle>
            <DialogDescription>
              Declara qué roles deben dar OK en ejecución (o ninguno). Se
              exigen todos los seleccionados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 rounded-lg border p-1">
            {APPROVAL_ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60",
                  pending.includes(option.value) && "bg-muted/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={pending.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />
                <span className="text-sm font-medium">{option.label}</span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPending([])}
            >
              Ninguna
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={apply}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ScheduleItem = {
  id: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  usedDefaultDuration: boolean;
};

function computeSchedule(rows: PlannerRow[]): {
  items: Map<string, ScheduleItem>;
  totalMin: number;
} {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const inbound = new Map(rows.map((row) => [row.id, 0]));
  const outgoing = new Map<string, string[]>(rows.map((row) => [row.id, []]));

  for (const row of rows) {
    for (const depId of row.dependencyStepIds) {
      if (!byId.has(depId)) continue;
      inbound.set(row.id, (inbound.get(row.id) ?? 0) + 1);
      outgoing.get(depId)?.push(row.id);
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
  // Cycles already blocked in API; append leftovers for safety.
  for (const row of rows) {
    if (!order.includes(row.id)) order.push(row.id);
  }

  const anchors = rows
    .filter((row) => row.plannedStartAt)
    .map((row) => ({
      id: row.id,
      ms: new Date(row.plannedStartAt!).getTime(),
    }));
  const t0 = anchors.length ? Math.min(...anchors.map((item) => item.ms)) : null;
  const anchorMin = new Map(
    anchors.map((item) => [
      item.id,
      Math.round((item.ms - (t0 as number)) / 60_000),
    ]),
  );

  const items = new Map<string, ScheduleItem>();
  for (const id of order) {
    const row = byId.get(id)!;
    const depEnds = row.dependencyStepIds
      .map((depId) => items.get(depId)?.endMin)
      .filter((value): value is number => value != null);
    const fromDeps = depEnds.length ? Math.max(...depEnds) : 0;
    const anchored = anchorMin.get(id);
    const startMin =
      anchored !== undefined ? Math.max(anchored, fromDeps) : fromDeps;
    const usedDefaultDuration = row.estimatedDurationMinutes == null;
    const durationMin = row.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES;
    items.set(id, {
      id,
      startMin,
      endMin: startMin + durationMin,
      durationMin,
      usedDefaultDuration,
    });
  }

  const totalMin = Math.max(
    60,
    ...[...items.values()].map((item) => item.endMin),
  );
  return { items, totalMin };
}

function TimesView({
  rows,
  allRows,
  eventTimezone,
  selectedId,
  onSelect,
}: {
  rows: PlannerRow[];
  allRows: PlannerRow[];
  eventTimezone: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { items, totalMin } = useMemo(
    () => computeSchedule(allRows),
    [allRows],
  );
  const lanes = useMemo(() => {
    const visibleIds = new Set(rows.map((row) => row.id));
    const map = new Map<string, PlannerRow[]>();
    for (const row of allRows) {
      if (!visibleIds.has(row.id)) continue;
      const list = map.get(row.workstreamName) ?? [];
      list.push(row);
      map.set(row.workstreamName, list);
    }
    return [...map.entries()];
  }, [allRows, rows]);

  const selected = allRows.find((row) => row.id === selectedId) ?? null;
  const selectedSchedule = selected ? items.get(selected.id) : null;
  const chartWidth = Math.max(720, totalMin * PIXELS_PER_MINUTE);
  const ticks = buildTicks(totalMin);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden lg:flex-row">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-xl border">
        <div style={{ width: chartWidth + 180 }} className="min-w-full">
          <div className="sticky top-0 z-10 flex border-b bg-background/95 backdrop-blur">
            <div className="w-[180px] shrink-0 border-r px-3 py-2 text-xs font-medium text-muted-foreground">
              Workstream
            </div>
            <div className="relative h-8 flex-1">
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className="absolute top-0 bottom-0 border-l border-border/60"
                  style={{ left: tick * PIXELS_PER_MINUTE }}
                >
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {formatMinutes(tick)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {!lanes.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No hay filas que coincidan con la búsqueda.
            </p>
          ) : (
            lanes.map(([workstreamName, laneRows]) => (
              <div
                key={workstreamName}
                className="flex min-h-16 border-b last:border-b-0"
              >
                <div className="flex w-[180px] shrink-0 items-start border-r px-3 py-3">
                  <span className="text-sm font-medium">{workstreamName}</span>
                </div>
                <div
                  className="relative flex-1 py-2"
                  style={{ width: chartWidth, minHeight: laneRows.length * 36 }}
                >
                  {ticks.map((tick) => (
                    <div
                      key={`${workstreamName}-${tick}`}
                      className="absolute inset-y-0 border-l border-border/40"
                      style={{ left: tick * PIXELS_PER_MINUTE }}
                    />
                  ))}
                  {laneRows.map((row, index) => {
                    const item = items.get(row.id);
                    if (!item) return null;
                    const top = 4 + index * 34;
                    const left = item.startMin * PIXELS_PER_MINUTE;
                    const width = Math.max(
                      8,
                      item.durationMin * PIXELS_PER_MINUTE,
                    );
                    const active = selectedId === row.id;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        title={`${row.name} · ${item.durationMin} min`}
                        onClick={() => onSelect(row.id)}
                        className={cn(
                          "absolute truncate rounded-md px-2 py-1 text-left text-xs text-primary-foreground shadow-sm transition-colors",
                          active
                            ? "bg-primary ring-2 ring-ring"
                            : "bg-primary/80 hover:bg-primary",
                          item.usedDefaultDuration && "opacity-70",
                        )}
                        style={{
                          top,
                          left,
                          width,
                          height: 28,
                        }}
                      >
                        {row.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <aside className="w-full shrink-0 overflow-y-auto rounded-xl border p-4 lg:w-80">
        {!selected ? (
          <div className="flex h-full min-h-40 flex-col justify-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Visor de tiempos</p>
            <p className="mt-2">
              Solo lectura. Las condiciones (deps, aprobaciones y hora) se
              declaran en Planilla. Aquí ves el cronograma calculado.
            </p>
            <p className="mt-3 text-xs">
              Barras semitransparentes usan duración por defecto (
              {DEFAULT_DURATION_MINUTES} min). TZ: {eventTimezone}
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge variant="outline">{selected.workstreamName}</Badge>
                <Badge variant="secondary">{selected.blockName}</Badge>
              </div>
              <p className="font-medium">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {selected.activityName}
              </p>
            </div>

            {selectedSchedule ? (
              <p className="text-xs text-muted-foreground">
                Ventana calculada: {formatMinutes(selectedSchedule.startMin)} →{" "}
                {formatMinutes(selectedSchedule.endMin)} (
                {selectedSchedule.durationMin} min
                {selectedSchedule.usedDefaultDuration ? ", default" : ""})
              </p>
            ) : null}

            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Deps: </span>
                {selected.dependencyStepIds.length
                  ? `${selected.dependencyStepIds.length} paso(s) (OK exitoso)`
                  : "ninguna"}
              </p>
              <p>
                <span className="font-medium text-foreground">Aprobaciones: </span>
                {selected.approvalRoles?.length
                  ? APPROVAL_ROLE_OPTIONS.filter((option) =>
                      selected.approvalRoles.includes(option.value),
                    )
                      .map((option) => option.label)
                      .join(", ")
                  : "ninguna"}
              </p>
              <p>
                <span className="font-medium text-foreground">Hora: </span>
                {selected.plannedStartAt
                  ? toZonedInput(selected.plannedStartAt, eventTimezone).replace(
                      "T",
                      " ",
                    )
                  : "sin condición horaria"}
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function buildTicks(totalMin: number) {
  const step = totalMin <= 120 ? 15 : totalMin <= 480 ? 30 : 60;
  const ticks: number[] = [];
  for (let value = 0; value <= totalMin; value += step) ticks.push(value);
  return ticks;
}

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
