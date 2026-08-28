"use client";

import {
  CircleCheck,
  CirclePlay,
  CircleX,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  EXECUTION_ACT_LABELS,
  ExecutionActDialog,
  type ExecutionActAction,
} from "@/components/execution-act-dialog";
import { ExecutionGatesPanel } from "@/components/execution-gates-panel";
import { ExecutionStepInfoDialog } from "@/components/execution-step-info-dialog";
import { ExecutorTimesMap } from "@/components/executor-times-map";
import type { FlowerAction } from "@/components/step-action-flower";
import { type TimesViewRow } from "@/components/times-view";
import {
  TimesView2,
  TimesViewWindowControls,
  type TimesViewZoomId,
} from "@/components/times-view-2";
import type { ApprovalRole } from "@/domain/controlx";
import type { GateSummary } from "@/lib/admin-data";
import { requiredGateIdsForStep } from "@/lib/gate-runtime";
import {
  EXECUTION_FOCUS_OPTIONS,
  filterStepsByFocus,
  isMineStep,
  isMyExecutorStep,
  runtimeBarTone,
  type ExecutionFocusMode,
} from "@/lib/execution-focus";
import {
  actionNeedsStartTime,
  actTimeFloorForStep,
  defaultActOccurredAt,
  maxDependencyEndedAt,
  unmetStepDependencies,
  type ExecutionDetail,
  type RuntimeStepAction,
  type RuntimeStepStatus,
  type RuntimeStepSummary,
} from "@/lib/execution-types";
import {
  getCompactUiServerSnapshot,
  getCompactUiSnapshot,
  subscribeCompactUi,
} from "@/lib/pwa-display";
import { cn } from "@/lib/utils";

type TimedAction = ExecutionActAction;
type ExecutionViewMode = "timeline" | "gates";

const TIMED_ACTION_LABELS = EXECUTION_ACT_LABELS;

function toTimesViewRow(
  step: RuntimeStepSummary,
  actorId: string | null,
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
    evidenceRequired: step.evidenceRequired === true,
    actualStartedAt: step.actualStartedAt,
    actualEndedAt: step.actualEndedAt,
    // Siempre se puede abrir la flor; las acciones de guardar se deshabilitan aparte.
    operable: true,
  };
}

function startBlockedLabel(step: RuntimeStepSummary, detail: ExecutionDetail) {
  const blockers = unmetStepDependencies(step, detail.steps);
  const parts: string[] = [];
  if (blockers.length) {
    const failed = blockers.filter((item) => item.reason === "failed");
    if (failed.length) {
      parts.push(
        `Deps fallidas — rearrancar el fallido o Event Admin puede Forzar: ${failed.map((item) => item.name).join(", ")}`,
      );
    } else {
      parts.push(
        `Esperando deps: ${blockers.map((item) => item.name).join(", ")}`,
      );
    }
  }
  for (const gateId of requiredGateIdsForStep(step, detail.gates)) {
    const gate = detail.gates.find((item) => item.id === gateId);
    if (!gate) {
      parts.push("Gate requerido faltante");
      continue;
    }
    if (!gate.open) {
      const details = gate.blockers.map((item) => item.detail).join(", ");
      parts.push(`Esperando gate ${gate.name}${details ? `: ${details}` : ""}`);
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Firma liviana para detectar cambios remotos (sync en vivo). */
function executionSyncKey(detail: ExecutionDetail) {
  return [
    detail.status,
    ...detail.steps.map(
      (step) =>
        `${step.id}:${step.status}:${step.actualStartedAt ?? ""}:${step.actualEndedAt ?? ""}:${step.iterations?.length ?? 0}`,
    ),
    ...detail.gateApprovals.map(
      (item) => `${item.gateId}:${item.role}:${item.approvedAt}`,
    ),
  ].join("|");
}

function patchStep(
  detail: ExecutionDetail,
  step: RuntimeStepSummary,
): ExecutionDetail {
  return patchSteps(detail, [step]);
}

function patchSteps(
  detail: ExecutionDetail,
  steps: RuntimeStepSummary[],
): ExecutionDetail {
  const byId = new Map(steps.map((step) => [step.id, step]));
  return {
    ...detail,
    status:
      detail.status === "PREPARADO" || detail.status === "BORRADOR"
        ? "EN_EJECUCION"
        : detail.status,
    steps: detail.steps.map((item) => {
      const next = byId.get(item.id);
      if (!next) return item;
      return {
        ...next,
        producesGateId: item.producesGateId,
        requiresGateIds: item.requiresGateIds,
      };
    }),
  };
}

export function ExecutionTimesPanel2({
  initial,
  actorId,
  actorRoles = [],
  canOperateAny = false,
  canForceSuccess = false,
  canApproveAny = false,
  /** Si false (Panel), la flor no ofrece Iniciar/cerrar/rearrancar: solo info (+ Forzar OK / aprobar admin). */
  allowStepOperations = true,
}: {
  initial: ExecutionDetail;
  actorId: string | null;
  actorName?: string | null;
  /** Roles del actor efectivo (mapa); sirven para aprobar gates. */
  actorRoles?: string[];
  /** Admin sin impersonar: puede operar cualquier paso. */
  canOperateAny?: boolean;
  /** Event Admin (o SuperAdmin): puede Forzar un paso Fallido. */
  canForceSuccess?: boolean;
  /** Event Admin / SteerCo / Super: aprueban cualquier paso en espera. */
  canApproveAny?: boolean;
  allowStepOperations?: boolean;
  title?: string;
}) {
  const hasActor = Boolean(actorId);
  const isMobile = useSyncExternalStore(
    subscribeCompactUi,
    getCompactUiSnapshot,
    getCompactUiServerSnapshot,
  );
  const [detail, setDetail] = useState(initial);
  const [viewMode, setViewMode] = useState<ExecutionViewMode>("timeline");
  const [zoom, setZoom] = useState<TimesViewZoomId>("4h");
  const [foldAll, setFoldAll] = useState<{
    action: "open" | "collapse";
    nonce: number;
  } | null>(null);
  const [busyGateId, setBusyGateId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<ExecutionFocusMode>(
    hasActor ? "highlight-mine" : "all",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{
    stepId: string;
    action: TimedAction;
  } | null>(null);
  const [comment, setComment] = useState("");
  const [occurredAt, setOccurredAt] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Sync en vivo: polling ligero mientras la pestaña está visible.
  useEffect(() => {
    const executionId = detail.id;
    let cancelled = false;

    async function pull() {
      if (cancelled || busy || outcome || document.visibilityState !== "visible") {
        return;
      }
      try {
        const response = await fetch(`/api/executions/${executionId}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          execution?: ExecutionDetail;
        };
        const next = payload.execution;
        if (!next || cancelled) return;
        setDetail((current) => {
          if (executionSyncKey(current) === executionSyncKey(next)) {
            return current;
          }
          return next;
        });
      } catch {
        // Silencioso: la red puede fallar un ciclo sin alertar.
      }
    }

    const intervalId = window.setInterval(() => {
      void pull();
    }, 4_000);
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
  }, [detail.id, busy, outcome]);

  const mineCount = useMemo(
    () => detail.steps.filter((step) => isMineStep(step, actorId)).length,
    [detail.steps, actorId],
  );
  const rejectedCount = useMemo(
    () => detail.steps.filter((step) => step.status === "RECHAZADO").length,
    [detail.steps],
  );

  const infoStep = detail.steps.find((step) => step.id === infoId) ?? null;
  const outcomeStep = outcome
    ? (detail.steps.find((step) => step.id === outcome.stepId) ?? null)
    : null;

  const effectiveFocus: ExecutionFocusMode =
    !hasActor &&
    (focusMode === "highlight-mine" || focusMode === "mine-only")
      ? "all"
      : focusMode;
  const dimOthers = effectiveFocus === "highlight-mine";

  const stepsById = useMemo(
    () => new Map(detail.steps.map((step) => [step.id, step])),
    [detail.steps],
  );

  function timeFloor(
    action: RuntimeStepAction,
    step: RuntimeStepSummary | null | undefined,
  ) {
    if (!step) return detail.anchorStartAt;
    return actTimeFloorForStep({
      action,
      step,
      stepsById,
      anchorStartAt: detail.anchorStartAt,
    });
  }

  const allTimesRows = useMemo(
    () => detail.steps.map((step) => toTimesViewRow(step, actorId)),
    [detail.steps, actorId],
  );

  const timesGates = useMemo<GateSummary[]>(
    () =>
      detail.gates.map((gate) => ({
        id: gate.id,
        eventId: detail.eventId,
        name: gate.name,
        description: "",
        order: gate.order,
        opensTargets: gate.opensTargets.map((target) => ({
          workstreamId: target.workstreamId,
          blockId: target.blockId,
          stepId: target.stepId ?? null,
        })),
        plannedOpenAt: gate.plannedOpenAt,
        approvalRoles: gate.approvalRoles,
        closesAfterTargets: gate.closesAfterTargets.map((target) => ({
          workstreamId: target.workstreamId,
          blockId: target.blockId,
          stepId: target.stepId ?? null,
        })),
        createdAt: detail.createdAt,
      })),
    [detail.gates, detail.eventId, detail.createdAt],
  );

  const visibleTimesRows = useMemo(() => {
    const focusedIds = new Set(
      filterStepsByFocus(detail.steps, actorId, effectiveFocus).map(
        (step) => step.id,
      ),
    );
    return allTimesRows.filter((row) => focusedIds.has(row.id));
  }, [allTimesRows, detail.steps, actorId, effectiveFocus]);

  function getBarClass(row: TimesViewRow, active: boolean): string {
    const mine = Boolean(row.mine);
    return cn(
      runtimeBarTone({
        status: (row.status ?? "PLANIFICADO") as RuntimeStepStatus,
        mine,
        dimOthers,
      }),
      active && "ring-2 ring-white/70",
    );
  }

  function canApproveStep(step: RuntimeStepSummary): boolean {
    if (canApproveAny) return true;
    if (!actorId) return false;
    return step.approverActorIds.includes(actorId);
  }

  async function runApproval(
    stepId: string,
    action: "approve" | "reject",
  ) {
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/executions/${detail.id}/steps/${stepId}/transition`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          step?: RuntimeStepSummary;
          steps?: RuntimeStepSummary[];
          error?: string;
        })
      : null;
    setBusy(false);
    if (!response?.ok || !payload?.step) {
      setError(payload?.error ?? "No fue posible actualizar la aprobación.");
      return;
    }
    setDetail((current) =>
      payload.steps?.length
        ? patchSteps(current, payload.steps)
        : patchStep(current, payload.step!),
    );
    setSelectedId(null);
    flash(action === "approve" ? "Aprobado" : "Rechazado");
  }

  async function runGateApprove(gateId: string, role: ApprovalRole) {
    setBusyGateId(gateId);
    setError("");
    const response = await fetch(
      `/api/executions/${detail.id}/gates/${gateId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          execution?: ExecutionDetail;
          error?: string;
        })
      : null;
    setBusyGateId(null);
    if (!response?.ok || !payload?.execution) {
      setError(payload?.error ?? "No fue posible aprobar el gate.");
      return;
    }
    setDetail(payload.execution);
    flash(`Gate aprobado (${role})`);
  }

  function getFlowerActions(row: TimesViewRow): FlowerAction[] {
    const step = stepsById.get(row.id);
    if (!step) return [];

    const approvalActions = (): FlowerAction[] => {
      if (step.status !== "PENDIENTE_APROBACION") return [];
      if (!canApproveStep(step)) return [];
      const onBehalf =
        canApproveAny &&
        actorId &&
        !step.approverActorIds.includes(actorId);
      return [
        {
          key: "approve",
          label: "Aprobar",
          icon: ShieldCheck,
          tone: "success",
          disabled: busy,
          title: onBehalf
            ? `Contingencia: aprobar en nombre de ${step.executorName ?? "el asignado"} (no lo reemplaza).`
            : "Contingencia Event/Org Admin / SteerCo o aprobador asignado.",
          onClick: () => {
            void runApproval(step.id, "approve");
          },
        },
        {
          key: "reject",
          label: "Rechazar",
          icon: CircleX,
          tone: "danger",
          disabled: busy,
          title: onBehalf
            ? "Contingencia: rechazar en nombre del aprobador (no lo reemplaza)."
            : undefined,
          onClick: () => {
            setSelectedId(null);
            setError("");
            setComment("");
            setFiles([]);
            setOccurredAt(
              defaultActOccurredAt(
                actTimeFloorForStep({
                  action: "reject",
                  step,
                  stepsById,
                  anchorStartAt: detail.anchorStartAt,
                }),
              ),
            );
            setOutcome({ stepId: step.id, action: "reject" });
          },
        },
      ];
    };

    // Panel = observación: sin acciones de ejecución en la flor.
    if (!allowStepOperations) {
      const actions: FlowerAction[] = [...approvalActions()];
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
            setOccurredAt(
              defaultActOccurredAt(
                actTimeFloorForStep({
                  action: "force_success",
                  step,
                  stepsById,
                  anchorStartAt: detail.anchorStartAt,
                }),
              ),
            );
            setOutcome({ stepId: step.id, action: "force_success" });
          },
        });
      }
      return actions;
    }

    const canAct = isMyExecutorStep(step, actorId) || canOperateAny;
    const onBehalf =
      canOperateAny && !isMyExecutorStep(step, actorId)
        ? (step.executorName ?? "el ejecutor asignado")
        : null;
    const actions: FlowerAction[] = [...approvalActions()];
    if (step.status === "PLANIFICADO" || step.status === "RECHAZADO") {
      const blocked = startBlockedLabel(step, detail);
      actions.push({
        key: "start",
        label: blocked
          ? canAct
            ? "Iniciar (bloqueado)"
            : "Iniciar (solo lectura)"
          : canAct
            ? onBehalf
              ? "Iniciar (contingencia)"
              : "Iniciar"
            : "Iniciar (solo lectura)",
        icon: CirclePlay,
        tone: "go",
        disabled: busy || !canAct || Boolean(blocked),
        title:
          blocked ??
          (onBehalf
            ? `Contingencia: iniciar en nombre de ${onBehalf}.`
            : undefined),
        onClick: () => {
          if (!canAct || blocked) return;
          setSelectedId(null);
          setError("");
          setComment("");
          setFiles([]);
          setOccurredAt(
            defaultActOccurredAt(
              actTimeFloorForStep({
                action: "start",
                step,
                stepsById,
                anchorStartAt: detail.anchorStartAt,
              }),
            ),
          );
          setOutcome({ stepId: step.id, action: "start" });
        },
      });
    }
    if (step.status === "INICIADO") {
      actions.push(
        {
          key: "success",
          label: canAct
            ? onBehalf
              ? "Exitoso (contingencia)"
              : "Exitoso"
            : "Exitoso (solo lectura)",
          icon: CircleCheck,
          tone: "success",
          disabled: busy || !canAct,
          title: onBehalf
            ? `Contingencia: cerrar en nombre de ${onBehalf}.`
            : step.evidenceRequired
              ? "Este paso exige evidencia para marcarlo como Exitoso."
              : undefined,
          onClick: () => {
            if (!canAct) return;
            setSelectedId(null);
            setError("");
            setComment("");
            setFiles([]);
            setOccurredAt(
              defaultActOccurredAt(
                actTimeFloorForStep({
                  action: "complete_success",
                  step,
                  stepsById,
                  anchorStartAt: detail.anchorStartAt,
                }),
              ),
            );
            setOutcome({ stepId: step.id, action: "complete_success" });
          },
        },
        {
          key: "fail",
          label: canAct
            ? onBehalf
              ? "Fallido (contingencia)"
              : "Fallido"
            : "Fallido (solo lectura)",
          icon: CircleX,
          tone: "danger",
          disabled: busy || !canAct,
          title: onBehalf
            ? `Contingencia: cerrar en nombre de ${onBehalf}.`
            : undefined,
          onClick: () => {
            if (!canAct) return;
            setSelectedId(null);
            setError("");
            setComment("");
            setFiles([]);
            setOccurredAt(
              defaultActOccurredAt(
                actTimeFloorForStep({
                  action: "complete_fail",
                  step,
                  stepsById,
                  anchorStartAt: detail.anchorStartAt,
                }),
              ),
            );
            setOutcome({ stepId: step.id, action: "complete_fail" });
          },
        },
      );
    }
    if (step.status === "FALLIDO") {
      if (canAct) {
        actions.push({
          key: "restart",
          label: onBehalf ? "Rearrancar (contingencia)" : "Rearrancar",
          icon: RotateCcw,
          tone: "go",
          disabled: busy,
          title: onBehalf
            ? `Contingencia: rearrancar en nombre de ${onBehalf}.`
            : "Vuelve a Iniciado para intentarlo de nuevo.",
          onClick: () => {
            setSelectedId(null);
            setError("");
            setComment("");
            setFiles([]);
            setOccurredAt(
              defaultActOccurredAt(
                actTimeFloorForStep({
                  action: "restart",
                  step,
                  stepsById,
                  anchorStartAt: detail.anchorStartAt,
                }),
              ),
            );
            setOutcome({ stepId: step.id, action: "restart" });
          },
        });
      }
      if (canForceSuccess) {
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
            setOccurredAt(
              defaultActOccurredAt(
                actTimeFloorForStep({
                  action: "force_success",
                  step,
                  stepsById,
                  anchorStartAt: detail.anchorStartAt,
                }),
              ),
            );
            setOutcome({ stepId: step.id, action: "force_success" });
          },
        });
      }
    }
    return actions;
  }

  function closeOutcome() {
    setOutcome(null);
    setComment("");
    setOccurredAt(null);
    setFiles([]);
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1600);
  }

  async function confirmOutcome() {
    if (!outcome || !outcomeStep) return;
    const isStart = actionNeedsStartTime(outcome.action);
    const isForce = outcome.action === "force_success";
    const isReject = outcome.action === "reject";
    if (isForce) {
      if (!canForceSuccess) return;
      if (!comment.trim()) {
        setError("Forzar requiere un comentario con el motivo.");
        return;
      }
    } else if (isReject) {
      if (!canApproveStep(outcomeStep)) return;
      if (!comment.trim()) {
        setError("Rechazar requiere un comentario con el motivo.");
        return;
      }
    } else {
      const canAct = isMyExecutorStep(outcomeStep, actorId) || canOperateAny;
      if (!canAct) return;
    }
    if (!occurredAt) {
      setError(
        isStart
          ? "Indica la hora en que arrancó la actividad."
          : isReject
            ? "Indica la hora del rechazo."
            : "Indica la hora en que terminó la actividad.",
      );
      return;
    }

    setBusy(true);
    setError("");

    let latest = outcomeStep;
    const beforePathnames = new Set(
      outcomeStep.evidence.map((item) => item.pathname),
    );
    const evidencePathnames: string[] = [];
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
      for (const item of latest.evidence) {
        if (!beforePathnames.has(item.pathname)) {
          evidencePathnames.push(item.pathname);
          beforePathnames.add(item.pathname);
        }
      }
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
          occurredAt,
          evidencePathnames: evidencePathnames.length
            ? evidencePathnames
            : undefined,
        }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          step?: RuntimeStepSummary;
          steps?: RuntimeStepSummary[];
          error?: string;
        })
      : null;
    setBusy(false);
    if (!response?.ok || !payload?.step) {
      setError(payload?.error ?? "No fue posible actualizar el paso.");
      return;
    }
    setDetail((current) =>
      payload.steps?.length
        ? patchSteps(current, payload.steps)
        : patchStep(current, payload.step!),
    );
    closeOutcome();
    flash(TIMED_ACTION_LABELS[outcome.action]);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {toast ? (
        <div className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-3 py-2 text-sm text-emerald-200">
          {toast}
        </div>
      ) : null}

      <div className="shrink-0 space-y-2 border-b py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition",
                viewMode === "timeline"
                  ? "bg-cyan-500/20 text-cyan-100"
                  : "bg-muted/20 text-muted-foreground hover:text-foreground",
              )}
            >
              Cronograma
            </button>
            <button
              type="button"
              onClick={() => setViewMode("gates")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition",
                viewMode === "gates"
                  ? "bg-cyan-500/20 text-cyan-100"
                  : "bg-muted/20 text-muted-foreground hover:text-foreground",
              )}
            >
              Gates ({detail.gates.length})
            </button>
          </div>
          {viewMode === "timeline" && !isMobile ? (
            <TimesViewWindowControls
              zoom={zoom}
              onZoomChange={setZoom}
              onFold={(action) =>
                setFoldAll({ action, nonce: Date.now() })
              }
            />
          ) : null}
          {viewMode === "timeline" ? (
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
                  {option.value === "mine-only"
                    ? `${option.label} (${mineCount})`
                    : option.value === "rejected-only"
                      ? `${option.label} (${rejectedCount})`
                      : option.label}
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

      {viewMode === "gates" ? (
        <ExecutionGatesPanel
          detail={detail}
          actorRoles={actorRoles}
          canApproveAny={canApproveAny || canOperateAny}
          allowApprove={allowStepOperations || canApproveAny}
          busyGateId={busyGateId}
          onApprove={(gateId, role) => {
            void runGateApprove(gateId, role);
          }}
        />
      ) : isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <ExecutorTimesMap
            steps={detail.steps}
            actorId={actorId}
            timezone={detail.timezone}
            anchorStartAt={detail.anchorStartAt}
            gates={timesGates}
            executionGates={detail.gates}
            workstreamIds={null}
            focusMode={effectiveFocus}
            canOperateAny={canOperateAny}
            canForceSuccess={canForceSuccess}
            canApproveAny={canApproveAny}
            allowStepOperations={allowStepOperations}
            selectedId={selectedId}
            busy={busy}
            onSelect={setSelectedId}
            onOutcome={(stepId, action) => {
              const step = stepsById.get(stepId);
              const floor = timeFloor(action, step);
              setError("");
              setComment("");
              setFiles([]);
              setOccurredAt(defaultActOccurredAt(floor));
              setOutcome({ stepId, action });
            }}
            onApproval={(stepId, action) => {
              if (action === "reject") {
                const step = stepsById.get(stepId);
                setError("");
                setComment("");
                setFiles([]);
                setOccurredAt(
                  defaultActOccurredAt(timeFloor("reject", step)),
                );
                setOutcome({ stepId, action: "reject" });
                return;
              }
              void runApproval(stepId, action);
            }}
            onOpenInfo={setInfoId}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col pt-2 md:pt-3">
          <TimesView2
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
            zoom={zoom}
            foldAll={foldAll}
          />
        </div>
      )}

      <ExecutionStepInfoDialog
        open={Boolean(infoStep)}
        step={infoStep}
        steps={detail.steps}
        gates={detail.gates}
        timezone={detail.timezone}
        executionId={detail.id}
        viewerActorId={actorId}
        onClose={() => setInfoId(null)}
      />

      <ExecutionActDialog
        open={Boolean(outcome)}
        action={outcome?.action ?? null}
        stepName={outcomeStep?.name ?? "Paso"}
        stepMeta={
          outcomeStep
            ? `${outcomeStep.workstreamName} · ${outcomeStep.activityName}`
            : undefined
        }
        onBehalfOf={
          outcomeStep && outcome?.action === "reject"
            ? canApproveAny &&
              actorId &&
              !outcomeStep.approverActorIds.includes(actorId)
              ? "el aprobador asignado"
              : null
            : outcomeStep &&
                canOperateAny &&
                !isMyExecutorStep(outcomeStep, actorId) &&
                outcome?.action !== "force_success"
              ? (outcomeStep.executorName ?? "el ejecutor asignado")
              : null
        }
        timezone={detail.timezone}
        anchorStartAt={detail.anchorStartAt}
        plannedStartAt={outcomeStep?.plannedStartAt ?? null}
        minOccurredAt={outcome ? timeFloor(outcome.action, outcomeStep) : null}
        minOccurredLabel={
          outcome?.action === "restart"
            ? "No puede ser anterior al fin de la iteración anterior."
            : outcome?.action === "reject"
              ? "No puede ser anterior al inicio del paso."
              : outcome && actionNeedsStartTime(outcome.action)
                ? outcomeStep &&
                  maxDependencyEndedAt(
                    outcomeStep.dependencyStepIds,
                    stepsById,
                  )
                  ? "No puede ser anterior al fin real de una predecesora."
                  : "No puede ser anterior al T0 de la ejecución."
                : outcomeStep?.actualStartedAt
                  ? "No puede ser anterior al inicio del paso."
                  : "No puede ser anterior al T0 de la ejecución."
        }
        occurredAt={occurredAt}
        onOccurredAtChange={setOccurredAt}
        comment={comment}
        onCommentChange={setComment}
        files={files}
        onFilesChange={setFiles}
        blobConfigured={detail.blobConfigured}
        evidenceRequired={outcomeStep?.evidenceRequired === true}
        existingEvidenceCount={outcomeStep?.evidence.length ?? 0}
        busy={busy}
        error={error}
        onCancel={closeOutcome}
        onConfirm={() => void confirmOutcome()}
      />
    </div>
  );
}
