"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  Info,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DesignStepSummary } from "@/lib/admin-data";
import type { EventActorSummary } from "@/lib/event-actors";
import type { RoleStepRow } from "@/lib/role-steps";

type SortKey =
  | "workstream"
  | "block"
  | "activity"
  | "step"
  | "executor"
  | "approver";
type SortDir = "asc" | "desc";

type RoleDraftRow = {
  stepId: string;
  stepName: string;
  workstreamName: string;
  blockName: string;
  activityName: string;
  executorActorId: string;
  approverActorId: string;
};

const NONE = "__none__";
const ALL = "all";

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "es"));
}

function compareRows(
  a: RoleStepRow,
  b: RoleStepRow,
  key: SortKey,
  dir: SortDir,
  actorNameById: Map<string, string>,
): number {
  const factor = dir === "asc" ? 1 : -1;
  const nameOf = (id: string | null | undefined) =>
    (id ? actorNameById.get(id) : "") ?? "";
  const approversOf = (row: RoleStepRow) =>
    (row.step.approverActorIds ?? [])
      .map((id) => actorNameById.get(id) ?? "")
      .join(", ");

  const primary =
    key === "workstream"
      ? a.workstreamName.localeCompare(b.workstreamName, "es")
      : key === "block"
        ? a.blockName.localeCompare(b.blockName, "es")
        : key === "activity"
          ? a.activityName.localeCompare(b.activityName, "es")
          : key === "executor"
            ? nameOf(a.step.executorActorId).localeCompare(
                nameOf(b.step.executorActorId),
                "es",
              )
            : key === "approver"
              ? approversOf(a).localeCompare(approversOf(b), "es")
              : a.step.name.localeCompare(b.step.name, "es") ||
                a.step.order - b.step.order;

  if (primary) return primary * factor;

  const byWs = a.workstreamName.localeCompare(b.workstreamName, "es");
  if (byWs) return byWs;
  const byBlock = a.blockName.localeCompare(b.blockName, "es");
  if (byBlock) return byBlock;
  const byAct = a.activityName.localeCompare(b.activityName, "es");
  if (byAct) return byAct;
  return (
    a.step.order - b.step.order || a.step.name.localeCompare(b.step.name, "es")
  );
}

function actorCanExecute(actor: EventActorSummary) {
  return actor.roles.includes("EXECUTOR");
}

function actorCanApprove(actor: EventActorSummary) {
  return actor.roles.includes("APPROVER") || actor.roles.includes("STEERCO");
}

export function EventRoles({
  eventId,
  initialActors,
  initialSteps,
}: {
  eventId: string;
  initialActors: EventActorSummary[];
  initialSteps: RoleStepRow[];
}) {
  const [actors, setActors] = useState(initialActors);
  const [actorsLoading, setActorsLoading] = useState(false);
  const [steps, setSteps] = useState(initialSteps);
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [query, setQuery] = useState("");
  const [workstreamFilter, setWorkstreamFilter] = useState(ALL);
  const [blockFilter, setBlockFilter] = useState(ALL);
  const [activityFilter, setActivityFilter] = useState(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("workstream");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    kind: "ok" | "error" | "saving";
    message: string;
  } | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignDrafts, setAssignDrafts] = useState<RoleDraftRow[]>([]);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  const refreshBoard = useEffectEvent(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setActorsLoading(true);
    const response = await fetch(
      `/api/events/${eventId}/roles-board`,
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          actors?: EventActorSummary[];
          steps?: RoleStepRow[];
          error?: string;
        })
      : null;
    if (!opts?.silent) setActorsLoading(false);
    if (!response?.ok) return;
    if (payload?.actors) setActors(payload.actors);
    if (payload?.steps) setSteps(payload.steps);
  });

  useEffect(() => {
    setActors(initialActors);
    setSteps(initialSteps);
    void refreshBoard({ silent: true });
    const onFocus = () => {
      void refreshBoard({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // Solo al cambiar de evento: luego se refresca desde API (evita cache viejo).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [eventId]);

  useEffect(() => {
    if (assignModalOpen) {
      void refreshBoard({ silent: true });
    }
  }, [assignModalOpen]);

  const executors = useMemo(
    () =>
      actors
        .filter(actorCanExecute)
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [actors],
  );

  const approvers = useMemo(
    () =>
      actors
        .filter(actorCanApprove)
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [actors],
  );

  const actorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const actor of actors) map.set(actor.id, actor.name);
    return map;
  }, [actors]);

  const withExecutor = steps.filter((row) => row.step.executorActorId).length;
  const withApprover = steps.filter(
    (row) => (row.step.approverActorIds ?? []).length > 0,
  ).length;
  const incomplete = steps.filter(
    (row) =>
      !row.step.executorActorId || !(row.step.approverActorIds ?? []).length,
  ).length;

  const workstreamOptions = useMemo(
    () => uniqueSorted(steps.map((row) => row.workstreamName)),
    [steps],
  );

  const blockOptions = useMemo(
    () =>
      uniqueSorted(
        steps
          .filter(
            (row) =>
              workstreamFilter === ALL ||
              row.workstreamName === workstreamFilter,
          )
          .map((row) => row.blockName),
      ),
    [steps, workstreamFilter],
  );

  const activityOptions = useMemo(
    () =>
      uniqueSorted(
        steps
          .filter(
            (row) =>
              (workstreamFilter === ALL ||
                row.workstreamName === workstreamFilter) &&
              (blockFilter === ALL || row.blockName === blockFilter),
          )
          .map((row) => row.activityName),
      ),
    [steps, workstreamFilter, blockFilter],
  );

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return steps
      .filter((row) => {
        if (
          workstreamFilter !== ALL &&
          row.workstreamName !== workstreamFilter
        ) {
          return false;
        }
        if (blockFilter !== ALL && row.blockName !== blockFilter) {
          return false;
        }
        if (activityFilter !== ALL && row.activityName !== activityFilter) {
          return false;
        }
        if (!needle) return true;
        const executor = row.step.executorActorId
          ? (actorNameById.get(row.step.executorActorId) ?? "")
          : "";
        const approverNames = (row.step.approverActorIds ?? [])
          .map((id) => actorNameById.get(id) ?? "")
          .join(" ");
        return (
          row.searchText.includes(needle) ||
          executor.toLowerCase().includes(needle) ||
          approverNames.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => compareRows(a, b, sortKey, sortDir, actorNameById));
  }, [
    steps,
    query,
    workstreamFilter,
    blockFilter,
    activityFilter,
    sortKey,
    sortDir,
    actorNameById,
  ]);

  const selectedClearableIds = useMemo(
    () =>
      [...selectedStepIds].filter((id) => {
        const row = steps.find((item) => item.step.id === id);
        if (!row) return false;
        return Boolean(
          row.step.executorActorId ||
            (row.step.approverActorIds ?? []).length,
        );
      }),
    [selectedStepIds, steps],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  function showToast(kind: "ok" | "error" | "saving", message: string) {
    setToast({ kind, message });
    if (kind !== "saving") {
      window.setTimeout(() => {
        setToast((current) =>
          current?.message === message ? null : current,
        );
      }, kind === "ok" ? 2200 : 4000);
    }
  }

  function applyStepUpdates(updated: DesignStepSummary[]) {
    const byId = new Map(updated.map((step) => [step.id, step]));
    setSteps((current) =>
      current.map((row) => {
        const next = byId.get(row.step.id);
        return next ? { ...row, step: next } : row;
      }),
    );
  }

  function toggleStep(stepId: string) {
    setSelectedStepIds((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  function toggleAllVisible() {
    const visibleIds = visibleRows.map((row) => row.step.id);
    const allSelected = visibleIds.every((id) => selectedStepIds.has(id));
    setSelectedStepIds((current) => {
      const next = new Set(current);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function changeWorkstreamFilter(next: string) {
    setWorkstreamFilter(next);
    setBlockFilter(ALL);
    setActivityFilter(ALL);
    setSelectedStepIds(new Set());
  }

  function changeBlockFilter(next: string) {
    setBlockFilter(next);
    setActivityFilter(ALL);
    setSelectedStepIds(new Set());
  }

  function changeActivityFilter(next: string) {
    setActivityFilter(next);
    setSelectedStepIds(new Set());
  }

  function openAssignModal(stepIds: string[]) {
    const drafts: RoleDraftRow[] = [];
    for (const id of stepIds) {
      const row = steps.find((item) => item.step.id === id);
      if (!row) continue;
      drafts.push({
        stepId: row.step.id,
        stepName: row.step.name,
        workstreamName: row.workstreamName,
        blockName: row.blockName,
        activityName: row.activityName,
        executorActorId: row.step.executorActorId ?? "",
        approverActorId: row.step.approverActorIds?.[0] ?? "",
      });
    }
    if (!drafts.length) return;
    setAssignDrafts(drafts);
    setAssignModalOpen(true);
  }

  function patchAssignDraft(
    stepId: string,
    patch: Partial<Pick<RoleDraftRow, "executorActorId" | "approverActorId">>,
  ) {
    setAssignDrafts((current) =>
      current.map((row) =>
        row.stepId === stepId ? { ...row, ...patch } : row,
      ),
    );
  }

  async function saveRoleAssignments(rows: RoleDraftRow[]) {
    if (!rows.length) return false;
    const response = await fetch(`/api/events/${eventId}/step-roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignments: rows.map((row) => ({
          stepId: row.stepId,
          executorActorId: row.executorActorId || null,
          approverActorId: row.approverActorId || null,
        })),
      }),
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          steps?: DesignStepSummary[];
          error?: string;
        })
      : null;
    if (!response?.ok || !payload?.steps) {
      showToast("error", payload?.error ?? "No fue posible guardar.");
      return false;
    }
    applyStepUpdates(payload.steps);
    return true;
  }

  async function saveAssignRow(stepId: string) {
    const row = assignDrafts.find((item) => item.stepId === stepId);
    if (!row) return;
    setRowSavingId(stepId);
    showToast("saving", "Guardando…");
    const ok = await saveRoleAssignments([row]);
    setRowSavingId(null);
    if (!ok) return;
    showToast("ok", `Guardado: ${row.stepName}`);
  }

  async function saveAssignAll() {
    setSaving(true);
    showToast("saving", "Guardando asignaciones…");
    const ok = await saveRoleAssignments(assignDrafts);
    setSaving(false);
    if (!ok) return;
    setSelectedStepIds(new Set());
    setAssignModalOpen(false);
    showToast("ok", `${assignDrafts.length} paso(s) actualizados.`);
  }

  async function clearSelected() {
    const drafts = selectedClearableIds.flatMap((id) => {
      const row = steps.find((item) => item.step.id === id);
      if (!row) return [];
      return [
        {
          stepId: row.step.id,
          stepName: row.step.name,
          workstreamName: row.workstreamName,
          blockName: row.blockName,
          activityName: row.activityName,
          executorActorId: "",
          approverActorId: "",
        } satisfies RoleDraftRow,
      ];
    });
    if (!drafts.length) return;
    setSaving(true);
    showToast("saving", "Quitando asignaciones…");
    const ok = await saveRoleAssignments(drafts);
    setSaving(false);
    if (!ok) return;
    setSelectedStepIds(new Set());
    showToast("ok", `${drafts.length} paso(s) sin ejecutor ni aprobador.`);
  }

  function executorLabel(row: RoleStepRow) {
    return row.step.executorActorId
      ? (actorNameById.get(row.step.executorActorId) ?? "Asignado")
      : "—";
  }

  function approversLabel(row: RoleStepRow) {
    const ids = row.step.approverActorIds ?? [];
    if (!ids.length) return "—";
    return ids.map((id) => actorNameById.get(id) ?? "?").join(", ");
  }

  const hasHierarchyFilter =
    workstreamFilter !== ALL ||
    blockFilter !== ALL ||
    activityFilter !== ALL;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex h-full min-h-0 flex-col gap-3">
        {toast ? (
          <div
            role={toast.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-none absolute right-0 top-0 z-20 max-w-sm rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur",
              toast.kind === "ok" &&
                "border-emerald-500/40 bg-emerald-950/90 text-emerald-200",
              toast.kind === "error" &&
                "border-red-500/40 bg-red-950/90 text-red-200",
              toast.kind === "saving" &&
                "border-slate-500/40 bg-slate-950/90 text-slate-200",
            )}
          >
            <span className="flex items-center gap-2">
              {toast.kind === "saving" ? (
                <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
              ) : null}
              {toast.message}
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Ejecutor {withExecutor}/{steps.length}
          </Badge>
          <Badge variant="outline">
            Aprobador {withApprover}/{steps.length}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {incomplete} paso(s) incompletos · 1 ejecutor / varios aprobadores
          </span>
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="space-y-3 border-b px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Pasos</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {visibleRows.length} visibles
                  {query.trim() ? " · búsqueda" : ""}
                  {hasHierarchyFilter ? " · filtro" : ""}
                </p>
              </div>
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar paso o persona…"
                  className="h-8 pl-8"
                />
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title="Actualizar actores y asignaciones"
                disabled={actorsLoading}
                onClick={() => void refreshBoard()}
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    actorsLoading ? "animate-spin" : undefined,
                  )}
                />
                <span className="sr-only">Actualizar actores</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={workstreamFilter}
                onValueChange={changeWorkstreamFilter}
              >
                <SelectTrigger className="h-8 w-[11rem]">
                  <SelectValue placeholder="Workstream" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos los workstreams</SelectItem>
                  {workstreamOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={blockFilter} onValueChange={changeBlockFilter}>
                <SelectTrigger className="h-8 w-[10rem]">
                  <SelectValue placeholder="Bloque" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos los bloques</SelectItem>
                  {blockOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={activityFilter}
                onValueChange={changeActivityFilter}
              >
                <SelectTrigger className="h-8 w-[12rem]">
                  <SelectValue placeholder="Actividad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas las actividades</SelectItem>
                  {activityOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving || selectedClearableIds.length === 0}
                  onClick={() => void clearSelected()}
                >
                  {saving ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : null}
                  Quitar ({selectedClearableIds.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || selectedStepIds.size === 0}
                  onClick={() => openAssignModal([...selectedStepIds])}
                >
                  {saving ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : null}
                  Asignar ({selectedStepIds.size})
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {visibleRows.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky top-0 z-[1] w-10 bg-card/95 backdrop-blur">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={toggleAllVisible}
                        aria-label="Seleccionar visibles"
                      >
                        {visibleRows.every((row) =>
                          selectedStepIds.has(row.step.id),
                        ) ? (
                          <CheckSquare className="size-4" />
                        ) : (
                          <Square className="size-4" />
                        )}
                      </button>
                    </TableHead>
                    <SortableHead
                      label="Workstream"
                      active={sortKey === "workstream"}
                      dir={sortDir}
                      onClick={() => toggleSort("workstream")}
                    />
                    <SortableHead
                      label="Bloque"
                      active={sortKey === "block"}
                      dir={sortDir}
                      onClick={() => toggleSort("block")}
                    />
                    <SortableHead
                      label="Actividad"
                      active={sortKey === "activity"}
                      dir={sortDir}
                      onClick={() => toggleSort("activity")}
                    />
                    <SortableHead
                      label="Paso"
                      active={sortKey === "step"}
                      dir={sortDir}
                      onClick={() => toggleSort("step")}
                    />
                    <SortableHead
                      label="Ejecutor"
                      active={sortKey === "executor"}
                      dir={sortDir}
                      onClick={() => toggleSort("executor")}
                    />
                    <SortableHead
                      label="Aprobador"
                      active={sortKey === "approver"}
                      dir={sortDir}
                      onClick={() => toggleSort("approver")}
                    />
                    <TableHead className="sticky top-0 z-[1] w-10 bg-card/95 backdrop-blur" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    const checked = selectedStepIds.has(row.step.id);
                    const description =
                      row.step.description.trim() || "Sin descripción";
                    const exec = executorLabel(row);
                    const approverText = approversLabel(row);
                    return (
                      <TableRow
                        key={row.step.id}
                        className={cn(checked && "bg-cyan-500/10")}
                        onClick={() => toggleStep(row.step.id)}
                      >
                        <TableCell className="w-10">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={checked}
                            onChange={() => toggleStep(row.step.id)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Seleccionar ${row.step.name}`}
                          />
                        </TableCell>
                        <TableCell className="max-w-[8rem]">
                          <span
                            className="block truncate"
                            title={row.workstreamName}
                          >
                            {row.workstreamName}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[8rem]">
                          <span
                            className="block truncate"
                            title={row.blockName}
                          >
                            {row.blockName}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[9rem]">
                          <span
                            className="block truncate"
                            title={row.activityName}
                          >
                            {row.activityName}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[11rem] font-medium">
                          <span
                            className="block truncate"
                            title={row.step.name}
                          >
                            {row.step.name}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[8rem] text-muted-foreground">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left underline-offset-2 hover:text-foreground hover:underline"
                            title={`${exec} · editar`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openAssignModal([row.step.id]);
                            }}
                          >
                            {exec}
                          </button>
                        </TableCell>
                        <TableCell className="max-w-[10rem] text-muted-foreground">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left underline-offset-2 hover:text-foreground hover:underline"
                            title={`${approverText} · editar`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openAssignModal([row.step.id]);
                            }}
                          >
                            {approverText}
                          </button>
                        </TableCell>
                        <TableCell className="w-10 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                  aria-label={`Editar roles de ${row.step.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openAssignModal([row.step.id]);
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                Editar ejecutor / aprobador
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                  aria-label={`Info de ${row.step.name}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Info className="size-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="left"
                                className="max-w-xs text-left whitespace-pre-wrap"
                              >
                                {description}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                Ningún paso coincide con el filtro o la búsqueda.
              </div>
            )}
          </div>
        </section>

        <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
          <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-3xl">
            <DialogHeader className="shrink-0 border-b px-1 pb-4">
              <DialogTitle>
                {assignDrafts.length === 1
                  ? "Editar asignación"
                  : `Asignar ${assignDrafts.length} pasos`}
              </DialogTitle>
              <DialogDescription>
                Elige ejecutor y aprobador por fila. Podés guardar una o todas.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4">
              {assignDrafts.map((row) => (
                <div
                  key={row.stepId}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.stepName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.workstreamName} · {row.blockName} · {row.activityName}
                    </p>
                  </div>
                  <div className="grid gap-1">
                    <label className="text-[11px] text-muted-foreground">
                      Ejecutor
                    </label>
                    <Select
                      value={row.executorActorId || NONE}
                      onValueChange={(value) =>
                        patchAssignDraft(row.stepId, {
                          executorActorId: value === NONE ? "" : value,
                        })
                      }
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Sin ejecutor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin ejecutor</SelectItem>
                        {executors.map((actor) => (
                          <SelectItem key={actor.id} value={actor.id}>
                            {actor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <label className="text-[11px] text-muted-foreground">
                      Aprobador
                    </label>
                    <Select
                      value={row.approverActorId || NONE}
                      onValueChange={(value) =>
                        patchAssignDraft(row.stepId, {
                          approverActorId: value === NONE ? "" : value,
                        })
                      }
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Sin aprobador" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin aprobador</SelectItem>
                        {approvers.map((actor) => (
                          <SelectItem key={actor.id} value={actor.id}>
                            {actor.name}
                            {actor.roles.includes("STEERCO") ? " · SteerCo" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-9"
                    disabled={saving || rowSavingId === row.stepId}
                    onClick={() => void saveAssignRow(row.stepId)}
                  >
                    {rowSavingId === row.stepId ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : null}
                    Guardar
                  </Button>
                </div>
              ))}
            </div>

            <DialogFooter className="shrink-0 border-t pt-4 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setAssignModalOpen(false)}
              >
                Cerrar
              </Button>
              <Button
                type="button"
                disabled={saving || assignDrafts.length === 0}
                onClick={() => void saveAssignAll()}
              >
                {saving ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : null}
                Guardar todo ({assignDrafts.length})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className="sticky top-0 z-[1] bg-card/95 backdrop-blur">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 text-left hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" />
      </button>
    </TableHead>
  );
}
