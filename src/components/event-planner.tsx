"use client";

import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  FileText,
  Info,
  ListChecks,
  LoaderCircle,
  Pencil,
  Save,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Label } from "@/components/ui/label";

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
import type {
  BlockSummary,
  DesignPair,
  DesignStepSummary,
  GateSummary,
  WorkstreamSummary,
} from "@/lib/admin-data";
import { APPROVAL_ROLE_OPTIONS, type ApprovalRole } from "@/domain/controlx";
import { GatesManager } from "@/components/gates-manager";
import {
  DateTimePicker,
  toZonedInput,
} from "@/components/datetime-picker";
import { cn } from "@/lib/utils";

const DEFAULT_DURATION_MINUTES = 30;
const PIXELS_PER_MINUTE = 2.4;
const GATE_COLORS = [
  "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300",
];

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
  producesGateId: string | null;
  requiresGateIds: string[];
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
    producesGateId: row.producesGateId ?? null,
    requiresGateIds: [...(row.requiresGateIds ?? [])],
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
  const sameProduce =
    (draft.producesGateId ?? null) === (row.producesGateId ?? null);
  const sameRequire =
    draft.requiresGateIds.length === (row.requiresGateIds?.length ?? 0) &&
    draft.requiresGateIds.every((id) => row.requiresGateIds?.includes(id));
  return !(
    sameDuration &&
    sameDeps &&
    sameApprovals &&
    sameAnchor &&
    sameProduce &&
    sameRequire
  );
}

function gateColorClass(index: number) {
  return GATE_COLORS[index % GATE_COLORS.length]!;
}

export function EventPlanner({
  eventId,
  eventTimezone,
  dayDStartAt,
  pairs,
  workstreams,
  blocks,
  initialGates,
}: {
  eventId: string;
  eventTimezone: string;
  dayDStartAt: string | null;
  pairs: DesignPair[];
  workstreams: WorkstreamSummary[];
  blocks: BlockSummary[];
  initialGates: GateSummary[];
}) {
  const [rows, setRows] = useState(() => pairsToRows(pairs));
  const [gates, setGates] = useState(initialGates);
  const [gatesOpen, setGatesOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(pairsToRows(pairs).map((row) => [row.id, draftFromRow(row)])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingRow = editingId
    ? (rows.find((row) => row.id === editingId) ?? null)
    : null;

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
    setRows((current) => {
      const updated = current.map((row) => {
        if (row.id === step.id) return { ...row, ...step };
        if (
          step.producesGateId &&
          row.producesGateId === step.producesGateId
        ) {
          return { ...row, producesGateId: null };
        }
        return row;
      });
      setDrafts(
        Object.fromEntries(updated.map((row) => [row.id, draftFromRow(row)])),
      );
      return updated;
    });
  }

  async function saveRow(row: PlannerRow): Promise<boolean> {
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
      return false;
    }

    if (
      draft.producesGateId &&
      draft.requiresGateIds.includes(draft.producesGateId)
    ) {
      setError("Un paso no puede producir y requerir el mismo gate.");
      return false;
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
          producesGateId: draft.producesGateId,
          requiresGateIds: draft.requiresGateIds,
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
      return false;
    }
    patchRow(payload.step);
    return true;
  }

  function handleGatesChange(nextGates: GateSummary[]) {
    const ids = new Set(nextGates.map((gate) => gate.id));
    setGates(nextGates);
    setRows((current) => {
      const updated = current.map((row) => ({
        ...row,
        producesGateId:
          row.producesGateId && ids.has(row.producesGateId)
            ? row.producesGateId
            : null,
        requiresGateIds: (row.requiresGateIds ?? []).filter((id) =>
          ids.has(id),
        ),
      }));
      setDrafts(
        Object.fromEntries(updated.map((row) => [row.id, draftFromRow(row)])),
      );
      return updated;
    });
  }

  if (!rows.length) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
        <CalendarClock className="mb-4 size-6 text-muted-foreground" />
        <p className="font-medium">No hay pasos para planificar</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Completa primero el diseño del evento creando actividades y pasos.
        </p>
        <Button
          type="button"
          className="mt-4"
          variant="outline"
          onClick={() => setGatesOpen(true)}
        >
          <DoorOpen className="size-4" />
          Gates ({gates.length})
        </Button>
        <GatesManager
          open={gatesOpen}
          onOpenChange={setGatesOpen}
          eventId={eventId}
          eventTimezone={eventTimezone}
          gates={gates}
          workstreams={workstreams}
          blocks={blocks}
          onGatesChange={handleGatesChange}
          onError={setError}
        />
      </div>
    );
  }

  return (
    <>
    <Tabs
      defaultValue="grid"
      className="flex h-full min-h-0 flex-col gap-2 overflow-hidden data-horizontal:flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <TabsList className="h-8">
          <TabsTrigger value="grid" className="h-7 px-2.5 text-xs">
            Planilla
          </TabsTrigger>
          <TabsTrigger value="times" className="h-7 px-2.5 text-xs">
            Tiempos
          </TabsTrigger>
        </TabsList>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8"
          onClick={() => setGatesOpen(true)}
        >
          <DoorOpen className="size-3.5" />
          Gates
          {gates.length ? (
            <Badge variant="outline" className="ml-0.5 h-5 px-1.5 text-[10px]">
              {gates.length}
            </Badge>
          ) : null}
        </Button>
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar…"
          />
        </div>
        <p className="hidden text-[11px] text-muted-foreground md:block">
          TZ {eventTimezone}
          {dayDStartAt ? " · Día D definido" : ""}
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
          gates={gates}
          eventTimezone={eventTimezone}
          savingId={savingId}
          onDraftChange={(id, next) =>
            setDrafts((current) => ({ ...current, [id]: next }))
          }
          onSave={(row) => void saveRow(row)}
          onOpenGatesCatalog={() => setGatesOpen(true)}
        />
      </TabsContent>

      <TabsContent
        value="times"
        className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
      >
        <TimesView
          rows={filteredRows}
          allRows={rows}
          gates={gates}
          eventTimezone={eventTimezone}
          dayDStartAt={dayDStartAt}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onEdit={(id) => {
            setError("");
            setSelectedId(id);
            setEditingId(id);
          }}
        />
      </TabsContent>
    </Tabs>

    <StepPlanningEditor
      open={Boolean(editingRow)}
      row={editingRow}
      allRows={rows}
      draft={
        editingRow
          ? (drafts[editingRow.id] ?? draftFromRow(editingRow))
          : null
      }
      gates={gates}
      eventTimezone={eventTimezone}
      saving={savingId === editingRow?.id}
      error={error}
      onOpenChange={(open) => {
        if (!open) setEditingId(null);
      }}
      onDraftChange={(next) => {
        if (!editingRow) return;
        setDrafts((current) => ({ ...current, [editingRow.id]: next }));
      }}
      onSave={() => {
        if (!editingRow) return;
        void saveRow(editingRow).then((ok) => {
          if (ok) setEditingId(null);
        });
      }}
      onOpenGatesCatalog={() => setGatesOpen(true)}
    />

    <GatesManager
      open={gatesOpen}
      onOpenChange={setGatesOpen}
      eventId={eventId}
      eventTimezone={eventTimezone}
      gates={gates}
      workstreams={workstreams}
      blocks={blocks}
      onGatesChange={handleGatesChange}
      onError={setError}
    />
    </>
  );
}

function StepPlanningEditor({
  open,
  row,
  allRows,
  draft,
  gates,
  eventTimezone,
  saving,
  error,
  onOpenChange,
  onDraftChange,
  onSave,
  onOpenGatesCatalog,
}: {
  open: boolean;
  row: PlannerRow | null;
  allRows: PlannerRow[];
  draft: Draft | null;
  gates: GateSummary[];
  eventTimezone: string;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: Draft) => void;
  onSave: () => void;
  onOpenGatesCatalog: () => void;
}) {
  const dirty = row && draft ? isDirty(row, draft) : false;

  return (
    <Dialog open={open && Boolean(row && draft)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        {row && draft ? (
          <>
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <DialogTitle>Planificar “{row.name}”</DialogTitle>
              <DialogDescription>
                Ajusta duración, condiciones y hora del paso.
              </DialogDescription>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline">{row.workstreamName}</Badge>
                <Badge variant="secondary">{row.blockName}</Badge>
                <span className="self-center">{row.activityName}</span>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="space-y-2">
                <Label htmlFor={`step-duration-${row.id}`}>Duración (min)</Label>
                <Input
                  id={`step-duration-${row.id}`}
                  inputMode="numeric"
                  value={draft.estimatedDurationMinutes}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      estimatedDurationMinutes: event.target.value,
                    })
                  }
                  placeholder={`${DEFAULT_DURATION_MINUTES}`}
                />
              </div>

              <div className="space-y-2">
                <Label>Deps (OK exitoso)</Label>
                <DependencyPicker
                  row={row}
                  allRows={allRows}
                  selectedIds={draft.dependencyStepIds}
                  onChange={(dependencyStepIds) =>
                    onDraftChange({ ...draft, dependencyStepIds })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Gates</Label>
                <GatePicker
                  stepName={row.name}
                  gates={gates}
                  producesGateId={draft.producesGateId}
                  requiresGateIds={draft.requiresGateIds}
                  onChange={(producesGateId, requiresGateIds) =>
                    onDraftChange({
                      ...draft,
                      producesGateId,
                      requiresGateIds,
                    })
                  }
                  onOpenGatesCatalog={onOpenGatesCatalog}
                />
              </div>

              <div className="space-y-2">
                <Label>Aprobaciones</Label>
                <ApprovalPicker
                  stepName={row.name}
                  selectedRoles={draft.approvalRoles}
                  onChange={(approvalRoles) =>
                    onDraftChange({ ...draft, approvalRoles })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Hora (no antes de)</Label>
                <DateTimePicker
                  value={draft.plannedStartAt}
                  timezone={eventTimezone}
                  onChange={(plannedStartAt) =>
                    onDraftChange({ ...draft, plannedStartAt })
                  }
                  placeholder="Sin hora"
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 flex-col gap-2 border-t p-4 sm:flex-col">
              {error ? (
                <p role="alert" className="w-full text-sm text-red-300">
                  {error}
                </p>
              ) : null}
              <div className="flex w-full justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={onSave}
                >
                  {saving ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Guardar
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlannerGrid({
  rows,
  allRows,
  drafts,
  gates,
  eventTimezone,
  savingId,
  onDraftChange,
  onSave,
  onOpenGatesCatalog,
}: {
  rows: PlannerRow[];
  allRows: PlannerRow[];
  drafts: Record<string, Draft>;
  gates: GateSummary[];
  eventTimezone: string;
  savingId: string | null;
  onDraftChange: (id: string, draft: Draft) => void;
  onSave: (row: PlannerRow) => void;
  onOpenGatesCatalog: () => void;
}) {
  const colgroup = (
    <colgroup>
      <col className="w-[10%]" />
      <col className="w-[8%]" />
      <col className="w-[11%]" />
      <col className="w-[11%]" />
      <col className="w-[7%]" />
      <col className="w-[12%]" />
      <col className="w-[11%]" />
      <col className="w-[12%]" />
      <col className="w-[10%]" />
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
              <TableHead className="bg-muted/40">Gates</TableHead>
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
                  colSpan={10}
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
                      <GatePicker
                        stepName={row.name}
                        gates={gates}
                        producesGateId={draft.producesGateId}
                        requiresGateIds={draft.requiresGateIds}
                        onChange={(producesGateId, requiresGateIds) =>
                          onDraftChange(row.id, {
                            ...draft,
                            producesGateId,
                            requiresGateIds,
                          })
                        }
                        onOpenGatesCatalog={onOpenGatesCatalog}
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
                      <DateTimePicker
                        value={draft.plannedStartAt}
                        timezone={eventTimezone}
                        onChange={(plannedStartAt) =>
                          onDraftChange(row.id, {
                            ...draft,
                            plannedStartAt,
                          })
                        }
                        placeholder="Sin hora"
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

function GatePicker({
  stepName,
  gates,
  producesGateId,
  requiresGateIds,
  onChange,
  onOpenGatesCatalog,
}: {
  stepName: string;
  gates: GateSummary[];
  producesGateId: string | null;
  requiresGateIds: string[];
  onChange: (producesGateId: string | null, requiresGateIds: string[]) => void;
  onOpenGatesCatalog: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingProduce, setPendingProduce] = useState<string | null>(
    producesGateId,
  );
  const [pendingRequire, setPendingRequire] = useState<string[]>(requiresGateIds);

  function openModal() {
    setPendingProduce(producesGateId);
    setPendingRequire([...requiresGateIds]);
    setOpen(true);
  }

  function toggleRequire(id: string) {
    setPendingRequire((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function apply() {
    const requires = pendingRequire.filter((id) => id !== pendingProduce);
    onChange(pendingProduce, requires);
    setOpen(false);
  }

  const produceName = gates.find((gate) => gate.id === producesGateId)?.name;
  const requireNames = gates
    .filter((gate) => requiresGateIds.includes(gate.id))
    .map((gate) => gate.name);
  const label = [
    produceName ? `→ ${produceName}` : null,
    requireNames.length
      ? `← ${requireNames.length === 1 ? requireNames[0] : `${requireNames.length} gates`}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-full justify-between font-normal"
        onClick={openModal}
      >
        <span className="truncate text-left">{label || "Ninguno"}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gates de “{stepName}”</DialogTitle>
            <DialogDescription>
              Usa gates del catálogo: este paso puede producir uno (al terminar
              OK) o esperar gates que abren otros workstreams.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!gates.length ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm">
                <p className="text-muted-foreground">
                  Aún no hay gates. Créalos en el catálogo (qué WS/bloques
                  abren).
                </p>
                <Button
                  type="button"
                  className="mt-3"
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    onOpenGatesCatalog();
                  }}
                >
                  Abrir Gates
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Produce (enciende)</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setOpen(false);
                        onOpenGatesCatalog();
                      }}
                    >
                      Gestionar…
                    </Button>
                  </div>
                  <Select
                    value={pendingProduce ?? "none"}
                    onValueChange={(value) =>
                      setPendingProduce(value === "none" ? null : value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Ninguno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ninguno</SelectItem>
                      {gates.map((gate) => (
                        <SelectItem key={gate.id} value={gate.id}>
                          {gate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Requiere (espera)</p>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-1">
                    {gates.map((gate) => {
                      const disabled = gate.id === pendingProduce;
                      return (
                        <label
                          key={gate.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60",
                            pendingRequire.includes(gate.id) && "bg-muted/40",
                            disabled && "cursor-not-allowed opacity-50",
                          )}
                        >
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={pendingRequire.includes(gate.id)}
                            onChange={() => toggleRequire(gate.id)}
                          />
                          <span className="min-w-0 flex-1 text-sm font-medium">
                            {gate.name}
                            {gate.opensTargets.length ? (
                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                Abre {gate.opensTargets.length} ancla
                                {gate.opensTargets.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingProduce(null);
                setPendingRequire([]);
              }}
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
            <Button type="button" onClick={apply} disabled={!gates.length}>
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

type GateMarker = {
  id: string;
  name: string;
  openMin: number;
  colorIndex: number;
};

function stepMatchesTarget(
  row: PlannerRow,
  target: { workstreamId: string; blockId: string | null },
) {
  if (row.workstreamId !== target.workstreamId) return false;
  return target.blockId == null || row.blockId === target.blockId;
}

function stepsForTargets(
  rows: PlannerRow[],
  targets: Array<{ workstreamId: string; blockId: string | null }>,
) {
  return rows.filter((row) =>
    targets.some((target) => stepMatchesTarget(row, target)),
  );
}

function computeSchedule(
  rows: PlannerRow[],
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
          stepMatchesTarget(row, target),
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
  laneRows: PlannerRow[],
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

function TimesLaneHeader({
  title,
  expanded,
  onToggle,
  statsLabel,
  tone,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  statsLabel: string;
  tone: "workstream" | "block";
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "sticky left-0 right-0 flex w-full items-center gap-2 px-2 py-1.5 text-left backdrop-blur transition-colors",
        tone === "workstream"
          ? "z-[5] bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:bg-sky-400/15 dark:text-sky-300 dark:hover:bg-sky-400/20"
          : "z-[4] bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:bg-amber-400/15 dark:text-amber-300 dark:hover:bg-amber-400/20",
      )}
    >
      <Chevron className="size-4 shrink-0 opacity-80" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-center font-bold tracking-wide",
          tone === "workstream" ? "text-base" : "text-sm",
        )}
      >
        {title}
      </span>
      <span
        className={cn(
          "shrink-0 text-[11px] font-medium tabular-nums opacity-80",
          tone === "workstream"
            ? "text-sky-800 dark:text-sky-200"
            : "text-amber-900 dark:text-amber-200",
        )}
      >
        {statsLabel}
      </span>
    </button>
  );
}

type StepActionItem = {
  key: string;
  label: string;
  icon: typeof Pencil;
  soon?: boolean;
};

const STEP_ACTION_ITEMS: StepActionItem[] = [
  { key: "edit", label: "Editar planificación", icon: Pencil },
  { key: "details", label: "Más información", icon: FileText },
  {
    key: "results",
    label: "Resultados de ejecución",
    icon: ListChecks,
    soon: true,
  },
  {
    key: "failure",
    label: "Ver fallo",
    icon: TriangleAlert,
    soon: true,
  },
];

function StepActionFlower({
  open,
  onToggle,
  onClose,
  onEdit,
  onDetails,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDetails: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  return (
    <div ref={rootRef} className="relative size-5">
      <button
        type="button"
        aria-label="Acciones del paso"
        aria-expanded={open}
        title="Acciones"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={cn(
          "relative z-20 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold leading-none shadow-md transition-colors",
          open
            ? "border-sky-300 bg-zinc-100 text-zinc-900 ring-2 ring-black/30 dark:bg-zinc-200"
            : "border-white/40 bg-black/35 text-primary-foreground hover:bg-black/50",
        )}
      >
        i
      </button>

      {open ? (
        <div className="absolute right-0 bottom-full z-30 mb-1.5 flex items-center gap-1.5">
          {STEP_ACTION_ITEMS.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                title={
                  action.soon ? `${action.label} (próximamente)` : action.label
                }
                aria-label={action.label}
                disabled={action.soon}
                onClick={(event) => {
                  event.stopPropagation();
                  if (action.key === "edit") onEdit();
                  if (action.key === "details") onDetails();
                }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border-2 shadow-lg ring-2 ring-black/40 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-1 fill-mode-both",
                  action.soon
                    ? "cursor-not-allowed border-zinc-400 bg-zinc-300 text-zinc-600 opacity-80"
                    : "border-sky-300 bg-zinc-100 text-zinc-900 hover:scale-105 hover:border-sky-400 hover:bg-white dark:border-sky-400 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white",
                )}
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function TimesView({
  rows,
  allRows,
  gates,
  eventTimezone,
  dayDStartAt,
  selectedId,
  onSelect,
  onEdit,
}: {
  rows: PlannerRow[];
  allRows: PlannerRow[];
  gates: GateSummary[];
  eventTimezone: string;
  dayDStartAt: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
}) {
  const { items, totalMin, gateMarkers, t0Ms } = useMemo(
    () => computeSchedule(allRows, gates, dayDStartAt),
    [allRows, gates, dayDStartAt],
  );
  const [flowerOpenId, setFlowerOpenId] = useState<string | null>(null);
  const [infoRowId, setInfoRowId] = useState<string | null>(null);
  const infoRow =
    infoRowId == null
      ? null
      : (allRows.find((row) => row.id === infoRowId) ?? null);

  useEffect(() => {
    setFlowerOpenId(null);
  }, [selectedId]);
  const lanes = useMemo(() => {
    const visibleIds = new Set(rows.map((row) => row.id));
    const byWs = new Map<string, Map<string, PlannerRow[]>>();
    for (const row of allRows) {
      if (!visibleIds.has(row.id)) continue;
      let byBlock = byWs.get(row.workstreamName);
      if (!byBlock) {
        byBlock = new Map();
        byWs.set(row.workstreamName, byBlock);
      }
      const list = byBlock.get(row.blockName) ?? [];
      list.push(row);
      byBlock.set(row.blockName, list);
    }
    return [...byWs.entries()].map(([workstreamName, byBlock]) => ({
      workstreamName,
      blocks: [...byBlock.entries()].map(([blockName, blockRows]) => ({
        blockName,
        rows: blockRows,
      })),
    }));
  }, [allRows, rows]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const chartWidth = Math.max(960, totalMin * PIXELS_PER_MINUTE);
  const ticks = buildTicks(totalMin);
  const useClockLabels = Boolean(dayDStartAt && t0Ms != null);

  function toggleCollapsed(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function statsLabelFor(laneRows: PlannerRow[], extra?: string) {
    const stats = computeLaneStats(laneRows, items);
    const parts = [
      ...(extra ? [extra] : []),
      `${stats.stepCount} paso${stats.stepCount === 1 ? "" : "s"}`,
      formatDurationCompact(stats.durationMin),
    ];
    if (stats.startMin != null && stats.endMin != null) {
      parts.push(
        `${formatAxisLabel(stats.startMin, t0Ms, eventTimezone, useClockLabels)}–${formatAxisLabel(stats.endMin, t0Ms, eventTimezone, useClockLabels)}`,
      );
    }
    return parts.join(" · ");
  }

  return (
    <div className="h-full min-h-0 overflow-auto rounded-xl border">
      <div style={{ width: chartWidth }} className="min-w-full">
        {!dayDStartAt ? (
          <div className="border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
            Sin Inicio del Día D el eje es relativo. Configúralo en{" "}
            <span className="font-medium text-foreground">Setup</span>.
          </div>
        ) : null}
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          {gateMarkers.length ? (
            <div
              className="relative h-7 border-b border-border/60"
              style={{ width: chartWidth }}
            >
              {gateMarkers.map((marker) => (
                <div
                  key={`head-${marker.id}`}
                  className="absolute top-1 bottom-1 z-[1]"
                  style={{ left: marker.openMin * PIXELS_PER_MINUTE }}
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

          <div className="relative h-7" style={{ width: chartWidth }}>
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute top-0 bottom-0 border-l border-border/60"
                style={{ left: tick * PIXELS_PER_MINUTE }}
              >
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {formatAxisLabel(
                    tick,
                    t0Ms,
                    eventTimezone,
                    useClockLabels,
                  )}
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
                  statsLabel={statsLabelFor(
                    wsRows,
                    `${blocks.length} bloque${blocks.length === 1 ? "" : "s"}`,
                  )}
                />
                {wsExpanded
                  ? blocks.map(({ blockName, rows: blockRows }) => {
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
                            statsLabel={statsLabelFor(blockRows)}
                          />
                          {blockExpanded ? (
                            <div
                              className="relative py-1.5"
                              style={{
                                width: chartWidth,
                                minHeight: blockRows.length * 32,
                              }}
                            >
                              {ticks.map((tick) => (
                                <div
                                  key={`${laneKey}-${tick}`}
                                  className="absolute inset-y-0 border-l border-border/40"
                                  style={{ left: tick * PIXELS_PER_MINUTE }}
                                />
                              ))}
                              {gateMarkers.map((marker) => (
                                <div
                                  key={`${laneKey}-${marker.id}`}
                                  className={cn(
                                    "pointer-events-none absolute inset-y-0 z-[1] border-l-2 border-dashed opacity-70",
                                    gateColorClass(marker.colorIndex).split(
                                      " ",
                                    )[0],
                                  )}
                                  style={{
                                    left: marker.openMin * PIXELS_PER_MINUTE,
                                  }}
                                />
                              ))}
                              {blockRows.map((row, index) => {
                                const item = items.get(row.id);
                                if (!item) return null;
                                const top = 2 + index * 30;
                                const left =
                                  item.startMin * PIXELS_PER_MINUTE;
                                const width = Math.max(
                                  8,
                                  item.durationMin * PIXELS_PER_MINUTE,
                                );
                                const active = selectedId === row.id;
                                const flowerOpen = flowerOpenId === row.id;
                                return (
                                  <div
                                    key={row.id}
                                    className={cn(
                                      "absolute flex h-6 items-center rounded-md shadow-sm",
                                      flowerOpen
                                        ? "z-50"
                                        : active
                                          ? "z-20"
                                          : "z-[2]",
                                      active
                                        ? "bg-primary ring-2 ring-ring"
                                        : "bg-primary/80 hover:bg-primary",
                                      item.usedDefaultDuration && "opacity-70",
                                    )}
                                    style={{ top, left, width }}
                                    title={`${row.name} · ${item.durationMin} min · ${formatAxisLabel(item.startMin, t0Ms, eventTimezone, useClockLabels)}`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onSelect(active ? null : row.id)
                                      }
                                      className="min-w-0 flex-1 truncate px-2 text-left text-[11px] text-primary-foreground"
                                    >
                                      {row.name}
                                    </button>
                                    {active ? (
                                      <div className="relative mr-0.5 shrink-0">
                                        <StepActionFlower
                                          open={flowerOpen}
                                          onToggle={() =>
                                            setFlowerOpenId((current) =>
                                              current === row.id
                                                ? null
                                                : row.id,
                                            )
                                          }
                                          onClose={() => setFlowerOpenId(null)}
                                          onEdit={() => {
                                            setFlowerOpenId(null);
                                            onEdit(row.id);
                                          }}
                                          onDetails={() => {
                                            setFlowerOpenId(null);
                                            setInfoRowId(row.id);
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  : null}
              </div>
            );
          })
        )}
      </div>

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
                </div>
                <p>
                  <span className="text-muted-foreground">Actividad: </span>
                  {infoRow.activityName}
                </p>
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
                  <span className="text-muted-foreground">Aprobaciones: </span>
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
