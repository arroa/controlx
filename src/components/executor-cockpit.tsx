"use client";

import { Layers, Paperclip, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ExecutorTimesMap,
  type OutcomeAction,
} from "@/components/executor-times-map";
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
import {
  RUNTIME_STEP_STATUS_LABELS,
  type ExecutionDetail,
  type RuntimeStepAction,
  type RuntimeStepSummary,
} from "@/lib/execution-types";
import { cn } from "@/lib/utils";

type WorkstreamOption = {
  id: string;
  name: string;
  stepCount: number;
  mineCount: number;
};

const OUTCOME_LABELS: Record<OutcomeAction, string> = {
  complete_success: "Exitoso",
  complete_fail: "Fallido",
};

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
    steps: detail.steps.map((item) => (item.id === step.id ? step : item)),
  };
}

export function ExecutorCockpit({
  initial,
  actorId,
  actorName,
}: {
  initial: ExecutionDetail;
  actorId: string;
  actorName: string;
}) {
  const [detail, setDetail] = useState(initial);
  const [mineOnly, setMineOnly] = useState(false);
  /** null = todos */
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
      detail.steps.filter((step) => step.executorActorId === actorId).length,
    [detail.steps, actorId],
  );

  const workstreams = useMemo(() => {
    const map = new Map<string, WorkstreamOption>();
    for (const step of detail.steps) {
      const current = map.get(step.workstreamId);
      if (current) {
        current.stepCount += 1;
        if (step.executorActorId === actorId) current.mineCount += 1;
      } else {
        map.set(step.workstreamId, {
          id: step.workstreamId,
          name: step.workstreamName,
          stepCount: 1,
          mineCount: step.executorActorId === actorId ? 1 : 0,
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

  if (!mineCount) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-semibold">Nada asignado a ti</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Hola {actorName}. En esta ejecución no tienes pasos como ejecutor.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {toast ? (
        <div className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-3 py-2 text-sm text-emerald-200">
          {toast}
        </div>
      ) : null}

      <div className="shrink-0 space-y-2 border-b px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Mi turno · {actorName}
            </p>
            <h1 className="truncate text-lg font-semibold tracking-tight">
              Dónde estoy en el Día D
            </h1>
            <p className="text-xs text-muted-foreground">
              Azul = pendiente · azul claro = siguiente · gris = ajeno · verde =
              ok · rojo = fallido · ? = acciones
            </p>
          </div>
          <Badge variant="outline">{mineCount} míos</Badge>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-w-0 flex-1 justify-start"
            onClick={openWsModal}
          >
            <Layers className="size-3.5 shrink-0" />
            <span className="truncate">{wsLabel}</span>
          </Button>
          <button
            type="button"
            onClick={() => setMineOnly((current) => !current)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition",
              mineOnly
                ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-100"
                : "bg-muted/30 text-muted-foreground hover:text-foreground",
            )}
          >
            Solo míos
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        ) : null}
      </div>

      <ExecutorTimesMap
        steps={detail.steps}
        actorId={actorId}
        timezone={detail.timezone}
        anchorStartAt={detail.anchorStartAt}
        workstreamIds={workstreamIds}
        mineOnly={mineOnly}
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

      <Dialog open={wsModalOpen} onOpenChange={setWsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workstreams visibles</DialogTitle>
            <DialogDescription>
              Elige uno, varios o todos. Puedes tener pasos en varios carriles.
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
                {infoStep.executorActorId !== actorId ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    Dependencia · lo ejecuta{" "}
                    {infoStep.executorName ?? "otro actor"}.
                  </div>
                ) : null}
                {infoStep.evidence.length ? (
                  <section className="space-y-1">
                    <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      Adjuntos ({infoStep.evidence.length})
                    </p>
                    <ul className="space-y-1 text-sm">
                      {infoStep.evidence.map((item) => (
                        <li key={item.pathname}>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-200 underline-offset-2 hover:underline"
                          >
                            {item.caption || item.pathname.split("/").pop()}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
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
              {outcomeStep?.name ?? "Paso"} · podés adjuntar documentos
              (opcional por ahora).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Nota opcional…"
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
              {!detail.blobConfigured ? (
                <p className="text-[11px] text-amber-200/90">
                  Podés cerrar el paso igual; la obligatoriedad de evidencias
                  queda pendiente.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Adjuntos opcionales. La obligatoriedad la definimos después.
                </p>
              )}
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
              disabled={busy}
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
