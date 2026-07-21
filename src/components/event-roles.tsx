"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  Info,
  LoaderCircle,
  Search,
  Square,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type SortKey = "workstream" | "activity" | "step";
type SortDir = "asc" | "desc";
type StepFilter = "unassigned" | "mine" | "all";
type AssignAs = "executor" | "approver";
type ActorPoolFilter = "executors" | "approvers";

function compareRows(
  a: RoleStepRow,
  b: RoleStepRow,
  key: SortKey,
  dir: SortDir,
): number {
  const factor = dir === "asc" ? 1 : -1;
  const primary =
    key === "workstream"
      ? a.workstreamName.localeCompare(b.workstreamName, "es")
      : key === "activity"
        ? a.activityName.localeCompare(b.activityName, "es")
        : a.step.name.localeCompare(b.step.name, "es") ||
          a.step.order - b.step.order;

  if (primary) return primary * factor;

  const byWs = a.workstreamName.localeCompare(b.workstreamName, "es");
  if (byWs) return byWs;
  const byAct = a.activityName.localeCompare(b.activityName, "es");
  if (byAct) return byAct;
  return (
    a.step.order - b.step.order ||
    a.step.name.localeCompare(b.step.name, "es")
  );
}

function stepHasApprover(step: DesignStepSummary, actorId: string) {
  return (step.approverActorIds ?? []).includes(actorId);
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
  const [steps, setSteps] = useState(initialSteps);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [actorPoolFilter, setActorPoolFilter] =
    useState<ActorPoolFilter>("executors");
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StepFilter>("unassigned");
  const [sortKey, setSortKey] = useState<SortKey>("workstream");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    kind: "ok" | "error" | "saving";
    message: string;
  } | null>(null);

  const pool = useMemo(
    () =>
      initialActors
        .filter((actor) =>
          actorPoolFilter === "executors"
            ? actorCanExecute(actor)
            : actorCanApprove(actor),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [initialActors, actorPoolFilter],
  );

  const actorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const actor of initialActors) map.set(actor.id, actor.name);
    return map;
  }, [initialActors]);

  const countsByActor = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of steps) {
      if (actorPoolFilter === "executors") {
        const id = row.step.executorActorId;
        if (id) map.set(id, (map.get(id) ?? 0) + 1);
      } else {
        for (const id of row.step.approverActorIds ?? []) {
          map.set(id, (map.get(id) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [steps, actorPoolFilter]);

  const selectedActor = pool.find((actor) => actor.id === selectedActorId);
  const activeAssignAs: AssignAs =
    actorPoolFilter === "executors" ? "executor" : "approver";

  const withExecutor = steps.filter((row) => row.step.executorActorId).length;
  const withApprover = steps.filter(
    (row) => (row.step.approverActorIds ?? []).length > 0,
  ).length;
  const incomplete = steps.filter(
    (row) =>
      !row.step.executorActorId ||
      !(row.step.approverActorIds ?? []).length,
  ).length;

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return steps
      .filter((row) => {
        if (filter === "unassigned") {
          if (selectedActorId) {
            if (activeAssignAs === "executor") {
              if (row.step.executorActorId) return false;
            } else if (stepHasApprover(row.step, selectedActorId)) {
              return false;
            }
          } else if (
            row.step.executorActorId &&
            (row.step.approverActorIds ?? []).length > 0
          ) {
            return false;
          }
        }
        if (filter === "mine") {
          if (!selectedActorId) return false;
          if (activeAssignAs === "executor") {
            if (row.step.executorActorId !== selectedActorId) return false;
          } else if (!stepHasApprover(row.step, selectedActorId)) {
            return false;
          }
        }
        if (!needle) return true;
        return row.searchText.includes(needle);
      })
      .sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [
    steps,
    query,
    filter,
    selectedActorId,
    activeAssignAs,
    sortKey,
    sortDir,
  ]);

  const selectedAssignableIds = useMemo(
    () =>
      [...selectedStepIds].filter((id) => {
        const row = steps.find((item) => item.step.id === id);
        if (!row || !selectedActorId) return false;
        if (activeAssignAs === "executor") return !row.step.executorActorId;
        return !stepHasApprover(row.step, selectedActorId);
      }),
    [selectedStepIds, steps, selectedActorId, activeAssignAs],
  );

  const selectedRemovableIds = useMemo(
    () =>
      [...selectedStepIds].filter((id) => {
        const row = steps.find((item) => item.step.id === id);
        if (!row || !selectedActorId) return false;
        if (activeAssignAs === "executor") {
          return row.step.executorActorId === selectedActorId;
        }
        return stepHasApprover(row.step, selectedActorId);
      }),
    [selectedStepIds, steps, selectedActorId, activeAssignAs],
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

  function selectActor(actorId: string) {
    const actor = pool.find((item) => item.id === actorId);
    if (!actor) return;
    setSelectedActorId(actorId);
    setSelectedStepIds(new Set());
    const assignedCount = countsByActor.get(actorId) ?? 0;
    setFilter(assignedCount > 0 ? "mine" : "unassigned");
  }

  function changeActorPoolFilter(next: ActorPoolFilter) {
    setActorPoolFilter(next);
    setSelectedActorId(null);
    setSelectedStepIds(new Set());
    setFilter("unassigned");
  }

  function changeFilter(next: StepFilter) {
    setFilter(next);
    setSelectedStepIds(new Set());
  }

  async function assignSelected() {
    if (!selectedActorId || selectedAssignableIds.length === 0) return;
    setSaving(true);
    showToast("saving", "Asignando pasos…");
    const asExecutor = activeAssignAs === "executor";
    const endpoint = asExecutor
      ? `/api/events/${eventId}/step-executors`
      : `/api/events/${eventId}/step-approvers`;
    const body = asExecutor
      ? {
          executorActorId: selectedActorId,
          stepIds: selectedAssignableIds,
        }
      : {
          approverActorId: selectedActorId,
          stepIds: selectedAssignableIds,
        };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          steps?: DesignStepSummary[];
          error?: string;
        })
      : null;
    setSaving(false);
    if (!response?.ok || !payload?.steps) {
      showToast("error", payload?.error ?? "No fue posible asignar.");
      return;
    }
    applyStepUpdates(payload.steps);
    setSelectedStepIds(new Set());
    setFilter("mine");
    showToast(
      "ok",
      `${selectedAssignableIds.length} paso(s) → ${selectedActor?.name ?? "actor"} (${asExecutor ? "ejecutor" : "aprobador"}).`,
    );
  }

  async function unassignSelected() {
    if (!selectedActorId || selectedRemovableIds.length === 0) return;
    setSaving(true);
    showToast("saving", "Quitando asignación…");
    const asExecutor = activeAssignAs === "executor";
    const endpoint = asExecutor
      ? `/api/events/${eventId}/step-executors`
      : `/api/events/${eventId}/step-approvers`;
    const body = asExecutor
      ? { stepIds: selectedRemovableIds }
      : {
          approverActorId: selectedActorId,
          stepIds: selectedRemovableIds,
        };
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          steps?: DesignStepSummary[];
          error?: string;
        })
      : null;
    setSaving(false);
    if (!response?.ok || !payload?.steps) {
      showToast("error", payload?.error ?? "No fue posible quitar.");
      return;
    }
    applyStepUpdates(payload.steps);
    setSelectedStepIds(new Set());
    showToast("ok", `${selectedRemovableIds.length} paso(s) actualizados.`);
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

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
            <div className="space-y-3 border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Actores</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {actorPoolFilter === "executors"
                    ? "Asignar como ejecutor (1 por paso)"
                    : "Asignar como aprobador (varios por paso)"}
                </p>
              </div>
              <div className="inline-flex w-full rounded-lg border p-0.5">
                {(
                  [
                    ["executors", "Ejecutores"],
                    ["approvers", "Aprobadores"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeActorPoolFilter(value)}
                    className={cn(
                      "flex-1 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                      actorPoolFilter === value
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="min-h-0 flex-1 overflow-auto p-2">
              {pool.length ? (
                pool.map((actor) => {
                  const count = countsByActor.get(actor.id) ?? 0;
                  const active = selectedActorId === actor.id;
                  return (
                    <li key={actor.id}>
                      <button
                        type="button"
                        onClick={() => selectActor(actor.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                          active
                            ? "bg-cyan-500/15 ring-1 ring-cyan-400/50"
                            : "hover:bg-muted/50",
                        )}
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <UserRound className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {actor.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {actor.area || "Sin área"}
                            {actorPoolFilter === "approvers" &&
                            actor.roles.includes("STEERCO")
                              ? " · SteerCo"
                              : ""}
                          </p>
                        </div>
                        <Badge variant={count ? "secondary" : "outline"}>
                          {count}
                        </Badge>
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {actorPoolFilter === "executors"
                    ? "No hay ejecutores en Setup."
                    : "No hay aprobadores ni SteerCo en Setup."}
                </li>
              )}
            </ul>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
            <div className="space-y-3 border-b px-4 py-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">
                    Pasos
                    {selectedActor ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {selectedActor.name}
                      </span>
                    ) : null}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {visibleRows.length} visibles
                    {query.trim() ? " (búsqueda)" : ""}
                    {selectedActor
                      ? ` · asignar como ${activeAssignAs === "executor" ? "ejecutor" : "aprobador"}`
                      : ""}
                  </p>
                </div>
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar paso…"
                    className="h-8 pl-8"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border p-0.5">
                  {(
                    [
                      ["unassigned", "Pendientes"],
                      ["mine", "De este"],
                      ["all", "Todos"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={value === "mine" && !selectedActorId}
                      onClick={() => changeFilter(value)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        filter === value
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      saving ||
                      !selectedActorId ||
                      selectedRemovableIds.length === 0
                    }
                    onClick={() => void unassignSelected()}
                  >
                    {saving ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : null}
                    Quitar ({selectedRemovableIds.length})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !selectedActorId ||
                      saving ||
                      selectedAssignableIds.length === 0
                    }
                    onClick={() => void assignSelected()}
                  >
                    {saving ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : null}
                    Asignar ({selectedAssignableIds.length})
                  </Button>
                </div>
              </div>
            </div>

            {!selectedActorId && filter === "mine" ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                Selecciona alguien a la izquierda.
              </div>
            ) : (
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
                        <TableHead className="sticky top-0 z-[1] bg-card/95 backdrop-blur">
                          Ejecutor
                        </TableHead>
                        <TableHead className="sticky top-0 z-[1] bg-card/95 backdrop-blur">
                          Aprobadores
                        </TableHead>
                        <TableHead className="sticky top-0 z-[1] w-10 bg-card/95 backdrop-blur" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row) => {
                        const checked = selectedStepIds.has(row.step.id);
                        const description =
                          row.step.description.trim() || "Sin descripción";
                        const exec = executorLabel(row);
                        const approvers = approversLabel(row);
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
                            <TableCell className="max-w-[9rem]">
                              <span
                                className="block truncate"
                                title={row.workstreamName}
                              >
                                {row.workstreamName}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[10rem]">
                              <span
                                className="block truncate"
                                title={row.activityName}
                              >
                                {row.activityName}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[12rem] font-medium">
                              <span
                                className="block truncate"
                                title={row.step.name}
                              >
                                {row.step.name}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[9rem] text-muted-foreground">
                              <span className="block truncate" title={exec}>
                                {exec}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[11rem] text-muted-foreground">
                              <span
                                className="block truncate"
                                title={approvers}
                              >
                                {approvers}
                              </span>
                            </TableCell>
                            <TableCell className="w-10 text-right">
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
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                    {filter === "mine"
                      ? "Sin pasos asignados a esta persona."
                      : filter === "unassigned"
                        ? selectedActorId
                          ? activeAssignAs === "executor"
                            ? "No hay pasos libres para este ejecutor."
                            : "Esta persona ya aprueba todos los pasos visibles."
                          : "Todos los pasos tienen ejecutor y al menos un aprobador."
                        : "Ningún paso coincide con la búsqueda."}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
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
