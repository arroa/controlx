"use client";

import {
  CircleCheck,
  CirclePlay,
  CircleX,
  Layers,
  Paperclip,
  ShieldAlert,
  X,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";

import type { OutcomeAction } from "@/components/executor-times-map";
import { ExecutorTimesMap } from "@/components/executor-times-map";
import type { FlowerAction } from "@/components/step-action-flower";
import { TimesView, type TimesViewRow } from "@/components/times-view";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { GateSummary } from "@/lib/admin-data";
import {
  EXECUTION_FOCUS_OPTIONS,
  filterStepsByFocus,
  isMineStep,
  nextMineStepId,
  runtimeBarTone,
  type ExecutionFocusMode,
} from "@/lib/execution-focus";
import {
  RUNTIME_STEP_STATUS_LABELS,
  unmetStepDependencies,
  type ExecutionDetail,
  type RuntimeStepAction,
  type RuntimeStepStatus,
  type RuntimeStepSummary,
} from "@/lib/execution-types";
import { cn } from "@/lib/utils";

function toTimesViewRow(
  step: RuntimeStepSummary,
  actorId: string | null,
  nextId: string | null,
): TimesViewRow {
  const mine = isMineStep(step, actorId);
  return {
    id: step.id,
    name: step.name,
    workstreamId: step.workstreamId,
    blockId: step.blockId,
    workstreamName: step.workstreamName,
    blockName: step.blockName,
    activityName: step.activityName,
    description: step.description,
    plannedStartAt: step.plannedStartAt,
    estimatedDurationMinutes: step.estimatedDurationMinutes,
    dependencyStepIds: step.dependencyStepIds,
    producesGateId: step.producesGateId,
    requiresGateIds: step.requiresGateIds,
    order: step.order,
    status: step.status,
    mine,
    isNext: step.id === nextId,
    // Siempre se puede abrir la flor; las acciones de guardar se deshabilitan aparte.
    operable: true,
  };
}

function startBlockedLabel(step: RuntimeStepSummary, all: RuntimeStepSummary[]) {
  const blockers = unmetStepDependencies(step, all);
  if (!blockers.length) return null;
  const failed = blockers.filter((item) => item.reason === "failed");
  if (failed.length) {
    return `Deps fallidas — Event Admin debe Forzar: ${failed.map((item) => item.name).join(", ")}`;
  }
  return `Esperando deps: ${blockers.map((item) => item.name).join(", ")}`;
}

type WorkstreamOption = {
  id: string;
  name: string;
  stepCount: number;
  mineCount: number;
};

const OUTCOME_LABELS: Record<OutcomeAction, string> = {
  complete_success: "Exitoso",
  complete_fail: "Fallido",
  force_success: "Forzado OK",
};

const MOBILE_MQ = "(max-width: 767px)";

function subscribeMobile(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_MQ).matches;
}

function getServerMobileSnapshot() {
  return false;
}

function patchStep(
  detail: ExecutionDetail,
  step: RuntimeStepSummary,
): ExecutionDetail {
  return {
    ...detail,
    status:
      detail.status === "PREPARADO" || detail.status === "BORRADOR"
        ? "EN_EJECUCION"
        : detail.status,
    steps: detail.steps.map((item) => {
      if (item.id !== step.id) return item;
      // Las transiciones no reenvían metadatos de gates; se conservan.
      return {
        ...step,
        producesGateId: item.producesGateId,
        requiresGateIds: item.requiresGateIds,
      };
    }),
  };
}

export function ExecutionTimesPanel({
  initial,
  actorId,
  actorName,
  canOperateAny = false,
  canForceSuccess = false,
  title = "Panel de tiempos",
}: {
  initial: ExecutionDetail;
  actorId: string | null;
  actorName?: string | null;
  /** Admin sin impersonar: puede operar cualquier paso. */
  canOperateAny?: boolean;
  /** Event Admin (o SuperAdmin): puede Forzar un paso Fallido. */
  canForceSuccess?: boolean;
  title?: string;
}) {
  const hasActor = Boolean(actorId);
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getServerMobileSnapshot,
  );
  const [detail, setDetail] = useState(initial);
  const [focusMode, setFocusMode] = useState<ExecutionFocusMode>(
    hasActor ? "highlight-mine" : "all",
  );
  const [workstreamIds, setWorkstreamIds] = useState<string[] | null>(null);
  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [pendingWsIds, setPendingWsIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{
    stepId: string;
    action: OutcomeAction;
  } | null>(null);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const mineCount = useMemo(
    () =>
      detail.steps.filter((step) => isMineStep(step, actorId)).length,
    [detail.steps, actorId],
  );

  const workstreams = useMemo(() => {
    const map = new Map<string, WorkstreamOption>();
    for (const step of detail.steps) {
      const current = map.get(step.workstreamId);
      const mine = isMineStep(step, actorId);
      if (current) {
        current.stepCount += 1;
        if (mine) current.mineCount += 1;
      } else {
        map.set(step.workstreamId, {
          id: step.workstreamId,
          name: step.workstreamName,
          stepCount: 1,
          mineCount: mine ? 1 : 0,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [detail.steps, actorId]);

  const allWsIds = useMemo(
    () => workstreams.map((item) => item.id),
    [workstreams],
  );

  const wsLabel = useMemo(() => {
    if (workstreamIds == null || workstreamIds.length === allWsIds.length) {
      return "Todos los WS";
    }
    if (workstreamIds.length === 1) {
      return (
        workstreams.find((item) => item.id === workstreamIds[0])?.name ??
        "1 WS"
      );
    }
    return `${workstreamIds.length} WS`;
  }, [workstreamIds, allWsIds.length, workstreams]);

  const infoStep = detail.steps.find((step) => step.id === infoId) ?? null;
  const outcomeStep = outcome
    ? (detail.steps.find((step) => step.id === outcome.stepId) ?? null)
    : null;

  const effectiveFocus: ExecutionFocusMode = hasActor ? focusMode : "all";
  const dimOthers = effectiveFocus === "highlight-mine";
  const [mountMs] = useState(() => Date.now());
  const t0Ms = detail.anchorStartAt
    ? new Date(detail.anchorStartAt).getTime()
    : mountMs;

  const nextId = useMemo(
    () => nextMineStepId(detail.steps, actorId, t0Ms),
    [detail.steps, actorId, t0Ms],
  );

  const stepsById = useMemo(
    () => new Map(detail.steps.map((step) => [step.id, step])),
    [detail.steps],
  );

  const allTimesRows = useMemo(
    () => detail.steps.map((step) => toTimesViewRow(step, actorId, nextId)),
    [detail.steps, actorId, nextId],
  );

  const timesGates = useMemo<GateSummary[]>(
    () =>
      detail.gates.map((gate) => ({
        id: gate.id,
        eventId: detail.eventId,
        name: gate.name,
        description: "",
        order: gate.order,
        opensTargets: gate.opensTargets,
        plannedOpenAt: gate.plannedOpenAt,
        approvalRoles: gate.approvalRoles,
        closesAfterTargets: gate.closesAfterTargets,
        createdAt: detail.createdAt,
      })),
    [detail.gates, detail.eventId, detail.createdAt],
  );

  const visibleTimesRows = useMemo(() => {
    const wsSet = workstreamIds == null ? null : new Set(workstreamIds);
    const focusedIds = new Set(
      filterStepsByFocus(detail.steps, actorId, effectiveFocus).map(
        (step) => step.id,
      ),
    );
    return allTimesRows.filter((row) => {
      if (!focusedIds.has(row.id)) return false;
      if (wsSet && !wsSet.has(row.workstreamId)) return false;
      return true;
    });
  }, [allTimesRows, detail.steps, actorId, effectiveFocus, workstreamIds]);

  function getBarClass(row: TimesViewRow, active: boolean): string {
    const mine = Boolean(row.mine);
    return cn(
      runtimeBarTone({
        status: (row.status ?? "PLANIFICADO") as RuntimeStepStatus,
        mine,
        isNext: Boolean(row.isNext),
        dimOthers,
      }),
      active && "ring-2 ring-white/70",
      dimOthers && !mine && "opacity-70",
    );
  }

  function getFlowerActions(row: TimesViewRow): FlowerAction[] {
    const step = stepsById.get(row.id);
    if (!step) return [];
    const canAct = Boolean(row.mine) || canOperateAny;
    const actions: FlowerAction[] = [];
    if (step.status === "PLANIFICADO" || step.status === "RECHAZADO") {
      const blocked = startBlockedLabel(step, detail.steps);
      actions.push({
        key: "start",
        label: blocked
          ? canAct
            ? "Iniciar (deps)"
            : "Iniciar (solo lectura)"
          : canAct
            ? "Iniciar"
            : "Iniciar (solo lectura)",
        icon: CirclePlay,
        tone: "go",
        disabled: busy || !canAct || Boolean(blocked),
        title: blocked ?? undefined,
        onClick: () => {
          if (!canAct || blocked) return;
          setSelectedId(null);
          void runAction(step.id, "start");
        },
      });
    }
    if (step.status === "INICIADO") {
      actions.push(
        {
          key: "success",
          label: canAct ? "Exitoso" : "Exitoso (solo lectura)",
          icon: CircleCheck,
          tone: "success",
          disabled: busy || !canAct,
          onClick: () => {
            if (!canAct) return;
            setSelectedId(null);
            setError("");
            setComment("");
            setFiles([]);
            setOutcome({ stepId: step.id, action: "complete_success" });
          },
        },
        {
          key: "fail",
          label: canAct ? "Fallido" : "Fallido (solo lectura)",
          icon: CircleX,
          tone: "danger",
          disabled: busy || !canAct,
          onClick: () => {
            if (!canAct) return;
            setSelectedId(null);
            setError("");
            setComment("");
            setFiles([]);
            setOutcome({ stepId: step.id, action: "complete_fail" });
          },
        },
      );
    }
    if (step.status === "FALLIDO" && canForceSuccess) {
      actions.push({
        key: "force",
        label: "Forzar OK",
        icon: ShieldAlert,
        tone: "neutral",
        disabled: busy,
        title: "Requiere comentario. Desbloquea dependientes.",
        onClick: () => {
          setSelectedId(null);
          setError("");
          setComment("");
          setFiles([]);
          setOutcome({ stepId: step.id, action: "force_success" });
        },
      });
    }
    return actions;
  }

  function openWsModal() {
    setPendingWsIds(
      workstreamIds == null ? [...allWsIds] : [...workstreamIds],
    );
    setWsModalOpen(true);
  }

  function togglePending(id: string) {
    setPendingWsIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function applyWsSelection() {
    if (
      pendingWsIds.length === 0 ||
      pendingWsIds.length === allWsIds.length
    ) {
      setWorkstreamIds(null);
    } else {
      setWorkstreamIds(pendingWsIds);
    }
    setWsModalOpen(false);
  }

  function closeOutcome() {
    setOutcome(null);
    setComment("");
    setFiles([]);
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1600);
  }

  async function runAction(stepId: string, action: RuntimeStepAction) {
    const step = detail.steps.find((item) => item.id === stepId);
    if (!step) return;
    if (action === "force_success") {
      if (!canForceSuccess) return;
    } else {
      const canAct = isMineStep(step, actorId) || canOperateAny;
      if (!canAct) return;
    }
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/executions/${detail.id}/steps/${step.id}/transition`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment: comment || undefined }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          step?: RuntimeStepSummary;
          error?: string;
        })
      : null;
    setBusy(false);
    if (!response?.ok || !payload?.step) {
      setError(payload?.error ?? "No fue posible actualizar el paso.");
      setInfoId(stepId);
      return;
    }
    setDetail((current) => patchStep(current, payload.step!));
    setComment("");
    flash("Listo");
  }

  async function confirmOutcome() {
    if (!outcome || !outcomeStep) return;
    const isForce = outcome.action === "force_success";
    if (isForce) {
      if (!canForceSuccess) return;
      if (!comment.trim()) {
        setError("Forzar requiere un comentario con el motivo.");
        return;
      }
    } else {
      const canAct = isMineStep(outcomeStep, actorId) || canOperateAny;
      if (!canAct) return;
    }
    setBusy(true);
    setError("");

    let latest = outcomeStep;
    for (const file of files) {
      const body = new FormData();
      body.set("file", file);
      if (comment.trim()) body.set("caption", comment.trim());
      const upload = await fetch(
        `/api/executions/${detail.id}/steps/${outcome.stepId}/evidence`,
        { method: "POST", body },
      ).catch(() => null);
      const uploadPayload = upload
        ? ((await upload.json()) as {
            step?: RuntimeStepSummary;
            error?: string;
          })
        : null;
      if (!upload?.ok || !uploadPayload?.step) {
        setBusy(false);
        setError(
          uploadPayload?.error ??
            "No fue posible adjuntar el archivo. Revisá Blob o probá sin adjunto.",
        );
        return;
      }
      latest = uploadPayload.step;
      setDetail((current) => patchStep(current, latest));
    }

    const response = await fetch(
      `/api/executions/${detail.id}/steps/${outcome.stepId}/transition`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: outcome.action,
          comment: comment.trim() || undefined,
        }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          step?: RuntimeStepSummary;
          error?: string;
        })
      : null;
    setBusy(false);
    if (!response?.ok || !payload?.step) {
      setError(payload?.error ?? "No fue posible cerrar el paso.");
      return;
    }
    setDetail((current) => patchStep(current, payload.step!));
    closeOutcome();
    flash(OUTCOME_LABELS[outcome.action]);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {toast ? (
        <div className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-3 py-2 text-sm text-emerald-200">
          {toast}
        </div>
      ) : null}

      <div className="shrink-0 space-y-2 border-b py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              {actorName ? `${title} · ${actorName}` : title}
            </p>
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {detail.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              Móvil: tiempo hacia abajo · PC: Times panorámico
            </p>
          </div>
          {hasActor ? (
            <Badge variant="outline">{mineCount} míos</Badge>
          ) : (
            <Badge variant="outline">{detail.steps.length} pasos</Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-w-0 justify-start"
            onClick={openWsModal}
          >
            <Layers className="size-3.5 shrink-0" />
            <span className="truncate">{wsLabel}</span>
          </Button>

          {hasActor ? (
            <div className="flex min-w-0 flex-1 overflow-hidden rounded-md border">
              {EXECUTION_FOCUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFocusMode(option.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-xs font-medium transition",
                    focusMode === option.value
                      ? "bg-cyan-500/20 text-cyan-100"
                      : "bg-muted/20 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        ) : null}
      </div>

      {/* Una sola vista montada: el mapa móvil oculto con CSS robaba clics al ?. */}
      {isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <ExecutorTimesMap
            steps={detail.steps}
            actorId={actorId}
            timezone={detail.timezone}
            anchorStartAt={detail.anchorStartAt}
            workstreamIds={workstreamIds}
            focusMode={effectiveFocus}
            canOperateAny={canOperateAny}
            canForceSuccess={canForceSuccess}
            selectedId={selectedId}
            busy={busy}
            onSelect={setSelectedId}
            onAction={(stepId, action) => void runAction(stepId, action)}
            onOutcome={(stepId, action) => {
              setError("");
              setComment("");
              setFiles([]);
              setOutcome({ stepId, action });
            }}
            onOpenInfo={setInfoId}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col pt-2 md:pt-3">
          <TimesView
            rows={visibleTimesRows}
            allRows={allTimesRows}
            gates={timesGates}
            eventTimezone={detail.timezone}
            dayDStartAt={detail.anchorStartAt}
            selectedId={selectedId}
            onSelect={setSelectedId}
            getBarClass={getBarClass}
            getFlowerActions={getFlowerActions}
            onOpenInfo={(row) => setInfoId(row.id)}
            showBuiltInInfoDialog={false}
          />
        </div>
      )}

      <Dialog open={wsModalOpen} onOpenChange={setWsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workstreams visibles</DialogTitle>
            <DialogDescription>
              Elige uno, varios o todos.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPendingWsIds([...allWsIds])}
            >
              Todos
            </Button>
            {hasActor ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setPendingWsIds(
                    workstreams
                      .filter((item) => item.mineCount > 0)
                      .map((item) => item.id),
                  )
                }
              >
                Donde tengo pasos
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPendingWsIds([])}
            >
              Ninguno
            </Button>
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-1">
            {workstreams.map((ws) => {
              const checked = pendingWsIds.includes(ws.id);
              return (
                <label
                  key={ws.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60",
                    checked && "bg-muted/40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePending(ws.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {ws.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {ws.stepCount} paso{ws.stepCount === 1 ? "" : "s"}
                      {ws.mineCount
                        ? ` · ${ws.mineCount} tuyo${ws.mineCount === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setWsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pendingWsIds.length === 0}
              onClick={applyWsSelection}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={Boolean(infoStep)}
        onOpenChange={(open) => {
          if (!open) setInfoId(null);
        }}
      >
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto">
          {infoStep ? (
            <>
              <SheetHeader>
                <SheetTitle>{infoStep.name}</SheetTitle>
                <SheetDescription>
                  {infoStep.workstreamName} · {infoStep.activityName}
                  {" · "}
                  {RUNTIME_STEP_STATUS_LABELS[infoStep.status]}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <section className="space-y-1">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    Descripción corta
                  </p>
                  <p className="text-sm">
                    {infoStep.description || "Sin descripción corta."}
                  </p>
                </section>
                <section className="space-y-1">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    Descripción larga
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {infoStep.longDescription || "Sin descripción larga."}
                  </p>
                </section>
                {actorId && infoStep.executorActorId !== actorId ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    Lo ejecuta {infoStep.executorName ?? "otro actor"}.
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(outcome)}
        onOpenChange={(open) => {
          if (!open && !busy) closeOutcome();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Marcar como {outcome ? OUTCOME_LABELS[outcome.action] : ""}
            </DialogTitle>
            <DialogDescription>
              {outcome?.action === "force_success"
                ? `${outcomeStep?.name ?? "Paso"} · el Forzado requiere motivo y desbloquea dependientes.`
                : `${outcomeStep?.name ?? "Paso"} · adjuntos opcionales.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={
                outcome?.action === "force_success"
                  ? "Motivo del forzado (obligatorio)…"
                  : "Nota opcional…"
              }
              rows={2}
            />

            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted/40">
                <Paperclip className="size-4 shrink-0" />
                <span>
                  {detail.blobConfigured
                    ? "Adjuntar archivo(s)"
                    : "Adjuntos no disponibles (Blob sin configurar)"}
                </span>
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  disabled={!detail.blobConfigured || busy}
                  accept="image/*,application/pdf"
                  onChange={(event) => {
                    const next = [...(event.target.files ?? [])];
                    if (!next.length) return;
                    setFiles((current) => [...current, ...next]);
                    event.target.value = "";
                  }}
                />
              </label>
              {files.length ? (
                <ul className="space-y-1">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {file.name}
                      </span>
                      <button
                        type="button"
                        aria-label="Quitar archivo"
                        disabled={busy}
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={closeOutcome}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                busy ||
                (outcome?.action === "force_success" && !comment.trim())
              }
              variant={
                outcome?.action === "complete_fail" ? "destructive" : "default"
              }
              onClick={() => void confirmOutcome()}
            >
              {busy
                ? "Guardando…"
                : `Confirmar ${outcome ? OUTCOME_LABELS[outcome.action] : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
