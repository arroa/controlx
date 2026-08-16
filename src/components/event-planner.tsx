"use client";

import {
  BadgeInfo,
  CalendarClock,
  ChartNoAxesGantt,
  DoorOpen,
  Flag,
  List,
  LoaderCircle,
  Paperclip,
  Pencil,
  Save,
  Search,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FlowerAction } from "@/components/step-action-flower";
import type {
  DesignPair,
  DesignStepSummary,
  GateSummary,
} from "@/lib/admin-data";
import { APPROVAL_ROLE_OPTIONS, type ApprovalRole } from "@/domain/controlx";
import { GatesManager } from "@/components/gates-manager";
import {
  DateTimePicker,
  toZonedInput,
  zonedPartsFromIso,
} from "@/components/datetime-picker";
import {
  DEFAULT_DURATION_MINUTES,
  TimesView,
  type TimesViewRow,
} from "@/components/times-view";
import { cn } from "@/lib/utils";

function formatDayDToolbar(iso: string, timezone: string) {
  const p = zonedPartsFromIso(iso, timezone);
  const dd = String(p.day).padStart(2, "0");
  const mm = String(p.month).padStart(2, "0");
  const hh = String(p.hour).padStart(2, "0");
  const mi = String(p.minute).padStart(2, "0");
  return `${dd}-${mm} ${hh}:${mi}`;
}

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
  evidenceRequired: boolean;
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
    evidenceRequired: row.evidenceRequired === true,
  };
}

function resolveDraft(row: PlannerRow, draft?: Draft): Draft {
  const base = draftFromRow(row);
  if (!draft) return base;
  return {
    ...base,
    ...draft,
    evidenceRequired: draft.evidenceRequired === true,
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
  const sameEvidence =
    draft.evidenceRequired === (row.evidenceRequired === true);
  return !(
    sameDuration &&
    sameDeps &&
    sameApprovals &&
    sameAnchor &&
    sameProduce &&
    sameRequire &&
    sameEvidence
  );
}

/** Misma paleta que el cockpit: azul = pendiente, azul claro = activo. */
function plannerStepBarClass(
  _row: TimesViewRow,
  active: boolean,
  _flowerOpen: boolean,
): string {
  return active
    ? "border-sky-200 bg-sky-300 text-sky-950 ring-2 ring-white/70"
    : "border-blue-300 bg-blue-600 text-white hover:bg-blue-500";
}

function plannerFlowerActions(input: { onEdit: () => void }): FlowerAction[] {
  return [
    {
      key: "edit",
      label: "Editar planificación",
      icon: Pencil,
      tone: "go",
      onClick: input.onEdit,
    },
  ];
}

export function EventPlanner({
  eventId,
  eventTimezone,
  dayDStartAt,
  pairs,
  initialGates,
}: {
  eventId: string;
  eventTimezone: string;
  dayDStartAt: string | null;
  pairs: DesignPair[];
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
  const [savingAll, setSavingAll] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const saveNoticeTimer = useRef(0);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "times">("grid");

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

  const dirtyRows = useMemo(
    () =>
      rows.filter((row) =>
        isDirty(row, resolveDraft(row, drafts[row.id])),
      ),
    [drafts, rows],
  );

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
      setDrafts((current) => {
        const next = { ...current };
        const saved = updated.find((row) => row.id === step.id);
        if (saved) next[saved.id] = draftFromRow(saved);
        return next;
      });
      return updated;
    });
  }

  async function saveRow(row: PlannerRow): Promise<boolean> {
    const draft = resolveDraft(row, drafts[row.id]);
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
          evidenceRequired: draft.evidenceRequired,
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

  async function saveDirtyRows() {
    if (!dirtyRows.length || savingAll) return;
    const count = dirtyRows.length;
    const startedAt = Date.now();
    setSavingAll(true);
    setError("");
    setSaveNotice(
      count === 1
        ? "Se está guardando 1 cambio…"
        : `Se están guardando ${count} cambios…`,
    );
    let ok = true;
    for (const row of dirtyRows) {
      ok = await saveRow(row);
      if (!ok) break;
    }
    const waitMs = 1000 - (Date.now() - startedAt);
    if (waitMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, waitMs));
    }
    setSavingAll(false);
    if (!ok) {
      setSaveNotice("");
      return;
    }
    setSaveNotice(
      count === 1 ? "Se guardó 1 cambio." : `Se guardaron ${count} cambios.`,
    );
    window.clearTimeout(saveNoticeTimer.current);
    saveNoticeTimer.current = window.setTimeout(() => setSaveNotice(""), 2800);
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
          pairs={pairs}
          onGatesChange={handleGatesChange}
          onError={setError}
        />
      </div>
    );
  }

  return (
    <>
    <Tabs
      value={view}
      onValueChange={(next) => {
        if (next === "grid" || next === "times") setView(next);
      }}
      className="flex h-full min-h-0 flex-col gap-2 overflow-hidden data-horizontal:flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <p className="shrink-0 text-xs font-medium tabular-nums">
          {dayDStartAt ? (
            <>
              Día D:{" "}
              <span className="text-foreground">
                {formatDayDToolbar(dayDStartAt, eventTimezone)}
              </span>
              <span className="text-muted-foreground">
                {" · "}
                {eventTimezone}
              </span>
            </>
          ) : (
            <span className="text-amber-200">Día D: sin definir · {eventTimezone}</span>
          )}
        </p>

        <div className="relative min-w-[160px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar…"
          />
        </div>

        <Button
          type="button"
          size="sm"
          className="h-8"
          variant={view === "grid" ? "default" : "outline"}
          onClick={() => setView("grid")}
        >
          <List className="size-3.5" />
          Lista de Pasos
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setGatesOpen(true)}
        >
          <DoorOpen className="size-3.5" />
          Gates
          {gates.length ? (
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
              {gates.length}
            </Badge>
          ) : null}
        </Button>

        <div className="min-w-2 flex-1" />

        {saveNotice && !savingAll ? (
          <p
            aria-live="polite"
            className="shrink-0 text-xs text-cyan-200/85"
          >
            {saveNotice}
          </p>
        ) : null}

        {dirtyRows.length ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={savingAll}
            onClick={() => void saveDirtyRows()}
          >
            {savingAll ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Guardar {dirtyRows.length}
          </Button>
        ) : null}

        <Button
          type="button"
          size="sm"
          className="h-8"
          variant={view === "times" ? "default" : "outline"}
          onClick={() => setView("times")}
        >
          <ChartNoAxesGantt className="size-3.5" />
          Vista Panorámica
        </Button>
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
          getBarClass={plannerStepBarClass}
          getFlowerActions={(row) =>
            plannerFlowerActions({
              onEdit: () => {
                setError("");
                setSelectedId(row.id);
                setEditingId(row.id);
              },
            })
          }
          showBuiltInInfoDialog
        />
      </TabsContent>
    </Tabs>

    <StepPlanningEditor
      open={Boolean(editingRow)}
      row={editingRow}
      allRows={rows}
      draft={
        editingRow
          ? resolveDraft(editingRow, drafts[editingRow.id])
          : null
      }
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
    />

    <Dialog
      open={savingAll}
      onOpenChange={(open) => {
        if (!open && savingAll) return;
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-xs"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <LoaderCircle
            className="size-6 animate-spin text-cyan-300"
            aria-hidden
          />
          <DialogHeader className="items-center">
            <DialogTitle>Guardando</DialogTitle>
            <DialogDescription>{saveNotice}</DialogDescription>
          </DialogHeader>
        </div>
      </DialogContent>
    </Dialog>

    <GatesManager
      open={gatesOpen}
      onOpenChange={setGatesOpen}
      eventId={eventId}
      eventTimezone={eventTimezone}
      gates={gates}
      pairs={pairs}
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
  eventTimezone,
  saving,
  error,
  onOpenChange,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  row: PlannerRow | null;
  allRows: PlannerRow[];
  draft: Draft | null;
  eventTimezone: string;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: Draft) => void;
  onSave: () => void;
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

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.evidenceRequired === true}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      evidenceRequired: event.target.checked,
                    })
                  }
                  className="mt-1 size-4 shrink-0 accent-teal-500"
                />
                <span>
                  Evidencia obligatoria al marcar éxito
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Sin adjunto no se puede marcar el paso como Exitoso. Al
                    iniciar o al fallar no se pide.
                  </span>
                </span>
              </label>
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
  eventTimezone,
  savingId,
  onDraftChange,
}: {
  rows: PlannerRow[];
  allRows: PlannerRow[];
  drafts: Record<string, Draft>;
  eventTimezone: string;
  savingId: string | null;
  onDraftChange: (id: string, draft: Draft) => void;
}) {
  const colgroup = (
    <colgroup>
      <col className="w-[12%]" />
      <col className="w-[10%]" />
      <col className="w-[12%]" />
      <col className="w-[12%]" />
      <col className="w-[44px]" />
      <col className="w-[8%]" />
      <col className="w-[13%]" />
      <col className="w-[11%]" />
      <col className="w-[11%]" />
      <col className="w-[6%]" />
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
              <TableHead
                className="bg-muted/40 px-1 text-center"
                title="Evidencia obligatoria al marcar éxito"
              >
                <span className="sr-only">Evidencia al marcar éxito</span>
                <Paperclip className="mx-auto size-3.5" aria-hidden />
              </TableHead>
              <TableHead className="bg-muted/40">Duración</TableHead>
              <TableHead className="bg-muted/40">Deps (OK exitoso)</TableHead>
              <TableHead className="bg-muted/40">Aprobaciones</TableHead>
              <TableHead className="bg-muted/40">Hora (no antes de)</TableHead>
              <TableHead
                className="bg-muted/40 px-1 text-center"
                title="Cambios sin guardar"
              >
                <span className="sr-only">Cambios sin guardar</span>
                <Flag className="mx-auto size-3.5 text-muted-foreground" />
              </TableHead>
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
                const draft = resolveDraft(row, drafts[row.id]);
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
                    <TableCell className="align-top px-1 text-center">
                      <input
                        type="checkbox"
                        checked={draft.evidenceRequired === true}
                        onChange={(event) =>
                          onDraftChange(row.id, {
                            ...draft,
                            evidenceRequired: event.target.checked,
                          })
                        }
                        aria-label="Evidencia obligatoria al marcar éxito"
                        title="Obligatoria al marcar éxito, no al iniciar ni al fallar"
                        className="size-4 accent-teal-500"
                      />
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
                    <TableCell className="align-top px-1 text-center">
                      {savingId === row.id ? (
                        <LoaderCircle
                          className="mx-auto size-4 animate-spin text-cyan-300"
                          aria-label="Guardando esta fila"
                        />
                      ) : dirty ? (
                        <span title="Sin guardar">
                          <Flag
                            className="mx-auto size-4 fill-amber-400 text-amber-400"
                            aria-label="Cambios sin guardar"
                          />
                        </span>
                      ) : (
                        <span className="inline-block size-4" />
                      )}
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
                                  <BadgeInfo className="size-3.5" />
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

