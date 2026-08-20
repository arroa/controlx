"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Flag,
  Info,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ExecutionStepInfoDialog } from "@/components/execution-step-info-dialog";
import { MapaStatusFilterPanel } from "@/components/mapa-status-filter-panel";
import { Badge } from "@/components/ui/badge";
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
import type { EventActorSummary } from "@/lib/event-actors";
import {
  buildMapaGeneralRows,
  compareMapaRows,
  DEFAULT_NOVEDAD_MINUTES,
  LIO_REASON_LABELS,
  NOVEDAD_MINUTES_OPTIONS,
  type MapaSortDir,
  type MapaSortKey,
} from "@/lib/mapa-general";
import type {
  ExecutionDetail,
  RuntimeStepStatus,
} from "@/lib/execution-types";
import { cn } from "@/lib/utils";

const ALL = "all";

/** Chips del filtro (labels cortos; OMITIDO/SIMULADO ya no se ven iguales). */
const STATUS_FILTER_CHIPS: Array<{
  status: RuntimeStepStatus;
  label: string;
  activeClass: string;
}> = [
  {
    status: "PLANIFICADO",
    label: "Planificado",
    activeClass: "border-blue-400/60 bg-blue-600/80 text-white",
  },
  {
    status: "INICIADO",
    label: "Iniciado",
    activeClass: "border-sky-300/70 bg-sky-400/90 text-sky-950",
  },
  {
    status: "PENDIENTE_APROBACION",
    label: "Pend. aprobación",
    activeClass: "border-amber-300/70 bg-amber-400/90 text-amber-950",
  },
  {
    status: "EXITOSO",
    label: "Exitoso",
    activeClass: "border-emerald-300/70 bg-emerald-500/90 text-emerald-950",
  },
  {
    status: "APROBADO",
    label: "Aprobado",
    activeClass: "border-emerald-300/70 bg-emerald-600/90 text-white",
  },
  {
    status: "FALLIDO",
    label: "Fallido",
    activeClass: "border-rose-300/70 bg-rose-500/90 text-white",
  },
  {
    status: "RECHAZADO",
    label: "Rechazado",
    activeClass: "border-rose-300/70 bg-rose-600/90 text-white",
  },
  {
    status: "OMITIDO",
    label: "Omitido",
    activeClass: "border-zinc-300/50 bg-zinc-500/80 text-zinc-50",
  },
  {
    status: "SIMULADO",
    label: "Simulado",
    activeClass: "border-zinc-300/50 bg-zinc-600/80 text-zinc-50",
  },
];

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

function minutesAgo(at: number, nowMs: number) {
  const min = Math.max(0, Math.round((nowMs - at) / 60_000));
  if (min < 1) return "ahora";
  if (min === 1) return "hace 1 min";
  return `hace ${min} min`;
}

export function MapaGeneral({
  initial,
  actors,
}: {
  initial: ExecutionDetail;
  actors: EventActorSummary[];
}) {
  const [detail, setDetail] = useState(initial);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [novedadMinutes, setNovedadMinutes] = useState(DEFAULT_NOVEDAD_MINUTES);
  const [query, setQuery] = useState("");
  const [workstreamFilter, setWorkstreamFilter] = useState(ALL);
  const [blockFilter, setBlockFilter] = useState(ALL);
  const [activityFilter, setActivityFilter] = useState(ALL);
  const [executorFilter, setExecutorFilter] = useState(ALL);
  const [approverFilter, setApproverFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<Set<RuntimeStepStatus>>(
    () => new Set(),
  );
  const [onlyLio, setOnlyLio] = useState(false);
  const [onlyNovedad, setOnlyNovedad] = useState(false);
  const [statusPanelOpen, setStatusPanelOpen] = useState(false);
  const [sortKey, setSortKey] = useState<MapaSortKey>("lio");
  const [sortDir, setSortDir] = useState<MapaSortDir>("desc");
  const [infoStepId, setInfoStepId] = useState<string | null>(null);

  useEffect(() => {
    setDetail(initial);
  }, [initial]);

  useEffect(() => {
    setNowMs(Date.now());
    const tick = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const executionId = detail.id;
    let cancelled = false;

    async function pull() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/executions/${executionId}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          execution?: ExecutionDetail;
        };
        if (!payload.execution || cancelled) return;
        setDetail(payload.execution);
        setNowMs(Date.now());
      } catch {
        // silencioso
      }
    }

    const intervalId = window.setInterval(() => void pull(), 4_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    void pull();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [detail.id]);

  const actorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const actor of actors) map.set(actor.id, actor.name);
    return map;
  }, [actors]);

  const rows = useMemo(
    () => buildMapaGeneralRows(detail, nowMs, novedadMinutes, actorNameById),
    [detail, nowMs, novedadMinutes, actorNameById],
  );

  const workstreamOptions = useMemo(
    () => uniqueSorted(rows.map((row) => row.step.workstreamName)),
    [rows],
  );
  const blockOptions = useMemo(
    () =>
      uniqueSorted(
        rows
          .filter(
            (row) =>
              workstreamFilter === ALL ||
              row.step.workstreamName === workstreamFilter,
          )
          .map((row) => row.step.blockName),
      ),
    [rows, workstreamFilter],
  );
  const activityOptions = useMemo(
    () =>
      uniqueSorted(
        rows
          .filter(
            (row) =>
              (workstreamFilter === ALL ||
                row.step.workstreamName === workstreamFilter) &&
              (blockFilter === ALL || row.step.blockName === blockFilter),
          )
          .map((row) => row.step.activityName),
      ),
    [rows, workstreamFilter, blockFilter],
  );
  const executorOptions = useMemo(
    () => uniqueSorted(rows.map((row) => row.executorName).filter((n) => n !== "—")),
    [rows],
  );
  const approverOptions = useMemo(
    () =>
      uniqueSorted(
        rows.flatMap((row) =>
          row.approverNames === "—" ? [] : row.approverNames.split(", "),
        ),
      ),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (onlyLio && !row.lio) return false;
        if (onlyNovedad && !row.novedadAt) return false;
        if (
          workstreamFilter !== ALL &&
          row.step.workstreamName !== workstreamFilter
        ) {
          return false;
        }
        if (blockFilter !== ALL && row.step.blockName !== blockFilter) {
          return false;
        }
        if (activityFilter !== ALL && row.step.activityName !== activityFilter) {
          return false;
        }
        if (executorFilter !== ALL && row.executorName !== executorFilter) {
          return false;
        }
        if (
          approverFilter !== ALL &&
          !row.approverNames.split(", ").includes(approverFilter)
        ) {
          return false;
        }
        if (statusFilter.size > 0 && !statusFilter.has(row.step.status)) {
          return false;
        }
        if (needle && !row.searchText.includes(needle)) return false;
        return true;
      })
      .sort((a, b) => compareMapaRows(a, b, sortKey, sortDir));
  }, [
    rows,
    query,
    onlyLio,
    onlyNovedad,
    workstreamFilter,
    blockFilter,
    activityFilter,
    executorFilter,
    approverFilter,
    statusFilter,
    sortKey,
    sortDir,
  ]);

  const lioCount = rows.filter((row) => row.lio).length;
  const novedadCount = rows.filter((row) => row.novedadAt).length;
  const infoStep = detail.steps.find((step) => step.id === infoStepId) ?? null;

  function toggleSort(key: MapaSortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "lio" || key === "novedad" || key === "runs" ? "desc" : "asc");
  }

  function toggleStatus(status: RuntimeStepStatus) {
    setStatusFilter((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const statusFilterLabel =
    statusFilter.size === 0
      ? "Estado"
      : statusFilter.size === 1
        ? (STATUS_FILTER_CHIPS.find((chip) => statusFilter.has(chip.status))
            ?.label ?? "Estado")
        : `Estado · ${statusFilter.size}`;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col gap-3 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Mapa General
            </h1>
            <p className="text-sm text-muted-foreground">
              {detail.name} · {visibleRows.length}/{rows.length} pasos ·{" "}
              {lioCount} lío{lioCount === 1 ? "" : "s"} · {novedadCount} novedad
              {novedadCount === 1 ? "" : "es"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              Líos {lioCount}
            </Badge>
            <Badge variant="outline">
              Novedades {novedadCount}
            </Badge>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Novedad
              <Select
                value={String(novedadMinutes)}
                onValueChange={(value) => setNovedadMinutes(Number(value))}
              >
                <SelectTrigger className="h-8 w-[7.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOVEDAD_MINUTES_OPTIONS.map((min) => (
                    <SelectItem key={min} value={String(min)}>
                      últimos {min} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar paso o persona…"
              className="h-8 pl-8"
            />
          </div>
          <Select
            value={workstreamFilter}
            onValueChange={(value) => {
              setWorkstreamFilter(value);
              setBlockFilter(ALL);
              setActivityFilter(ALL);
            }}
          >
            <SelectTrigger className="h-8 w-[11rem]">
              <SelectValue placeholder="Workstream" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Workstream</SelectItem>
              {workstreamOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={blockFilter}
            onValueChange={(value) => {
              setBlockFilter(value);
              setActivityFilter(ALL);
            }}
          >
            <SelectTrigger className="h-8 w-[10rem]">
              <SelectValue placeholder="Bloque" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Bloque</SelectItem>
              {blockOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="h-8 w-[12rem]">
              <SelectValue placeholder="Actividad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Actividad</SelectItem>
              {activityOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={executorFilter} onValueChange={setExecutorFilter}>
            <SelectTrigger className="h-8 w-[10rem]">
              <SelectValue placeholder="Ejecutor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Ejecutor</SelectItem>
              {executorOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={approverFilter} onValueChange={setApproverFilter}>
            <SelectTrigger className="h-8 w-[10rem]">
              <SelectValue placeholder="Aprobador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Aprobador</SelectItem>
              {approverOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setStatusPanelOpen(true)}
            className={cn(
              "h-8 rounded-md border px-2.5 text-xs font-medium transition",
              statusFilter.size > 0 || statusPanelOpen
                ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-100"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {statusFilterLabel}
          </button>
          <button
            type="button"
            onClick={() => setOnlyLio((current) => !current)}
            className={cn(
              "h-8 rounded-md border px-2.5 text-xs",
              onlyLio
                ? "border-red-500/50 bg-red-500/15 text-red-100"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Solo líos
          </button>
          <button
            type="button"
            onClick={() => setOnlyNovedad((current) => !current)}
            className={cn(
              "h-8 rounded-md border px-2.5 text-xs",
              onlyNovedad
                ? "border-amber-500/50 bg-amber-500/15 text-amber-100"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Solo novedades
          </button>
        </div>

        {statusFilter.size > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-2.5 py-2">
            {STATUS_FILTER_CHIPS.filter((chip) =>
              statusFilter.has(chip.status),
            ).map((chip) => (
              <button
                key={chip.status}
                type="button"
                onClick={() => toggleStatus(chip.status)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  chip.activeClass,
                )}
                title="Quitar filtro"
              >
                {chip.label}
                <X className="size-3 opacity-80" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStatusFilter(new Set())}
              className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Limpiar
            </button>
          </div>
        ) : null}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="min-h-0 flex-1 overflow-auto">
            {visibleRows.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortableHead
                      label="Lío"
                      active={sortKey === "lio"}
                      dir={sortDir}
                      onClick={() => toggleSort("lio")}
                    />
                    <SortableHead
                      label="Novedad"
                      active={sortKey === "novedad"}
                      dir={sortDir}
                      onClick={() => toggleSort("novedad")}
                    />
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
                      label="Estado"
                      active={sortKey === "status"}
                      dir={sortDir}
                      onClick={() => toggleSort("status")}
                    />
                    <SortableHead
                      label="Veces"
                      active={sortKey === "runs"}
                      dir={sortDir}
                      onClick={() => toggleSort("runs")}
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
                  {visibleRows.map((row) => (
                    <TableRow
                      key={row.step.id}
                      className={cn(row.lio && "bg-red-500/5")}
                    >
                      <TableCell className="w-14">
                        {row.lio ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex size-3 rounded-full bg-red-500"
                                aria-label={LIO_REASON_LABELS[row.lio]}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              {LIO_REASON_LABELS[row.lio]}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="w-28">
                        {row.novedadAt ? (
                          <span className="inline-flex items-center gap-1 text-amber-200">
                            <Flag className="size-3.5" />
                            {minutesAgo(row.novedadAt, nowMs)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[8rem]">
                        <span className="block truncate" title={row.step.workstreamName}>
                          {row.step.workstreamName}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[8rem]">
                        <span className="block truncate" title={row.step.blockName}>
                          {row.step.blockName}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[9rem]">
                        <span className="block truncate" title={row.step.activityName}>
                          {row.step.activityName}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[11rem] font-medium">
                        <span className="block truncate" title={row.step.name}>
                          {row.step.name}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.statusLabel}
                      </TableCell>
                      <TableCell className="w-16 tabular-nums">
                        {row.runCount || "—"}
                      </TableCell>
                      <TableCell className="max-w-[8rem]">
                        <span className="block truncate" title={row.executorName}>
                          {row.executorName}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[9rem]">
                        <span className="block truncate" title={row.approverNames}>
                          {row.approverNames}
                        </span>
                      </TableCell>
                      <TableCell className="w-10 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={`Info de ${row.step.name}`}
                              onClick={() => setInfoStepId(row.step.id)}
                            >
                              <Info className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">Info</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                Ningún paso coincide con el filtro.
              </div>
            )}
          </div>
        </section>

        <MapaStatusFilterPanel
          open={statusPanelOpen}
          chips={STATUS_FILTER_CHIPS}
          selected={statusFilter}
          onToggle={toggleStatus}
          onClear={() => setStatusFilter(new Set())}
          onClose={() => setStatusPanelOpen(false)}
        />

        <ExecutionStepInfoDialog
          open={Boolean(infoStep)}
          step={infoStep}
          steps={detail.steps}
          gates={detail.gates}
          timezone={detail.timezone}
          executionId={detail.id}
          onClose={() => setInfoStepId(null)}
        />
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
  dir: MapaSortDir;
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
