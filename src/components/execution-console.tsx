"use client";

import {
  CheckCircle2,
  FileText,
  ImageIcon,
  LoaderCircle,
  MessageSquarePlus,
  Play,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RUNTIME_STEP_STATUS_LABELS,
  type ExecutionDetail,
  type RuntimeStepAction,
  type RuntimeStepStatus,
  type RuntimeStepSummary,
} from "@/lib/execution-types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<RuntimeStepStatus, string> = {
  PLANIFICADO: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  INICIADO: "border-sky-500/40 bg-sky-500/15 text-sky-200",
  EXITOSO: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  FALLIDO: "border-rose-500/40 bg-rose-500/15 text-rose-200",
  OMITIDO: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  SIMULADO: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  PENDIENTE_APROBACION: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  APROBADO: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  RECHAZADO: "border-orange-500/40 bg-orange-500/15 text-orange-200",
};

export function ExecutionConsole({
  initial,
}: {
  initial: ExecutionDetail;
}) {
  const [detail, setDetail] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.steps[0]?.id ?? null,
  );
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const selected = useMemo(
    () => detail.steps.find((step) => step.id === selectedId) ?? null,
    [detail.steps, selectedId],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const step of detail.steps) {
      map.set(step.status, (map.get(step.status) ?? 0) + 1);
    }
    return map;
  }, [detail.steps]);

  async function runAction(action: RuntimeStepAction) {
    if (!selected) return;
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/executions/${detail.id}/steps/${selected.id}/transition`,
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
      return;
    }
    setDetail((current) => ({
      ...current,
      status:
        current.status === "PREPARADO" || current.status === "BORRADOR"
          ? "EN_EJECUCION"
          : current.status,
      steps: current.steps.map((step) =>
        step.id === payload.step!.id ? payload.step! : step,
      ),
    }));
    setComment("");
    setToast("Paso actualizado");
    window.setTimeout(() => setToast(""), 2000);
  }

  async function startExecution() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/executions/${detail.id}/start`, {
      method: "POST",
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          execution?: ExecutionDetail;
          error?: string;
        })
      : null;
    setBusy(false);
    if (!response?.ok || !payload?.execution) {
      setError(payload?.error ?? "No fue posible iniciar.");
      return;
    }
    setDetail(payload.execution);
  }

  async function addComment() {
    if (!selected || !comment.trim()) return;
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/executions/${detail.id}/steps/${selected.id}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comment }),
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
      setError(payload?.error ?? "No fue posible comentar.");
      return;
    }
    setDetail((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === payload.step!.id ? payload.step! : step,
      ),
    }));
    setComment("");
  }

  async function uploadEvidence(file: File | null) {
    if (!selected || !file) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("file", file);
    if (comment.trim()) body.set("caption", comment.trim());
    const response = await fetch(
      `/api/executions/${detail.id}/steps/${selected.id}/evidence`,
      { method: "POST", body },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          step?: RuntimeStepSummary;
          error?: string;
        })
      : null;
    setBusy(false);
    if (!response?.ok || !payload?.step) {
      setError(payload?.error ?? "No fue posible subir evidencia.");
      return;
    }
    setDetail((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === payload.step!.id ? payload.step! : step,
      ),
    }));
    setComment("");
    setToast("Evidencia cargada");
    window.setTimeout(() => setToast(""), 2000);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-4">
      {toast ? (
        <div className="pointer-events-none absolute top-0 right-0 z-10 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-3 py-2 text-sm text-emerald-200">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={detail.type === "REAL" ? "default" : "secondary"}>
          {detail.type}
        </Badge>
        <Badge variant="outline">{detail.status}</Badge>
        {detail.anchorStartAt ? (
          <Badge variant="outline">
            T0{" "}
            {new Date(detail.anchorStartAt).toLocaleString("es", {
              dateStyle: "short",
              timeStyle: "short",
            })}
            {detail.iteration > 1 ? ` · #${detail.iteration}` : ""}
          </Badge>
        ) : null}
        {!detail.blobConfigured ? (
          <Badge variant="outline" className="text-amber-300">
            Blob no configurado
          </Badge>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {detail.status !== "EN_EJECUCION" &&
          detail.status !== "FINALIZADO" ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void startExecution()}
            >
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Iniciar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {[...counts.entries()].map(([status, count]) => (
          <span key={status} className="rounded-md border px-2 py-1">
            {RUNTIME_STEP_STATUS_LABELS[status as RuntimeStepStatus]} · {count}
          </span>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(18rem,26rem)_1fr]">
        <section className="min-h-0 overflow-auto rounded-xl border bg-card">
          <ul className="divide-y">
            {detail.steps.map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(step.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-muted/40",
                    selectedId === step.id && "bg-cyan-500/10",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {step.name}
                    </span>
                    {step.overdue ? (
                      <Badge variant="outline" className="text-[10px] text-amber-300">
                        Atrasado
                      </Badge>
                    ) : null}
                    {step.forced ? (
                      <Badge variant="outline" className="text-[10px]">
                        Forzado
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {step.workstreamName} · {step.activityName}
                  </p>
                  <span
                    className={cn(
                      "mt-1 w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                      STATUS_TONE[step.status],
                    )}
                  >
                    {RUNTIME_STEP_STATUS_LABELS[step.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-h-0 overflow-auto rounded-xl border bg-card p-4">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.description || "Sin descripción corta"}
                </p>
                {selected.longDescription ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {selected.longDescription}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  Ejecutor: {selected.executorName ?? "—"}
                  {selected.approverActorIds.length
                    ? ` · ${selected.approverActorIds.length} aprobador(es)`
                    : " · sin aprobadores"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="step-comment">Comentario</Label>
                <Textarea
                  id="step-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Más comentarios: contexto, observaciones, motivos…"
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {(selected.status === "PLANIFICADO" ||
                  selected.status === "RECHAZADO") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void runAction("start")}
                  >
                    Iniciar
                  </Button>
                )}
                {selected.status === "INICIADO" && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void runAction("complete_success")}
                    >
                      <CheckCircle2 className="size-3.5" />
                      Exitoso
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void runAction("complete_fail")}
                    >
                      <XCircle className="size-3.5" />
                      Fallido
                    </Button>
                  </>
                )}
                {selected.status === "PENDIENTE_APROBACION" && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void runAction("approve")}
                    >
                      <ShieldCheck className="size-3.5" />
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void runAction("reject")}
                    >
                      Rechazar
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void runAction("force_success")}
                >
                  Forzar OK
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || !comment.trim()}
                  onClick={() => void addComment()}
                >
                  <MessageSquarePlus className="size-3.5" />
                  Solo comentar
                </Button>
              </div>

              <div className="space-y-2">
                <Label>
                  Evidencia (imagen / PDF)
                  {detail.type === "REAL" ? (
                    <span className="text-amber-300"> · obligatoria al cerrar</span>
                  ) : (
                    <span className="text-muted-foreground"> · opcional</span>
                  )}
                </Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={busy || !detail.blobConfigured}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void uploadEvidence(file);
                    event.target.value = "";
                  }}
                />
                {!detail.blobConfigured ? (
                  <p className="text-xs text-amber-300">
                    Configura `BLOB_READ_WRITE_TOKEN` para habilitar subidas.
                  </p>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              ) : null}

              <div>
                <h3 className="text-sm font-medium">Evidencias</h3>
                {selected.evidence.length ? (
                  <ul className="mt-2 space-y-2">
                    {selected.evidence.map((item) => (
                      <li key={item.url}>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40"
                        >
                          {item.contentType.startsWith("image/") ? (
                            <ImageIcon className="size-4 text-primary" />
                          ) : (
                            <FileText className="size-4 text-primary" />
                          )}
                          <span className="truncate">
                            {item.caption || item.pathname.split("/").pop()}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sin evidencias aún.
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium">Comentarios</h3>
                {selected.comments.length ? (
                  <ul className="mt-2 space-y-2">
                    {[...selected.comments].reverse().map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                      >
                        <p className="text-xs text-muted-foreground">
                          {item.authorLabel} ·{" "}
                          {new Date(item.createdAt).toLocaleString("es")}
                          {item.kind !== "note" ? ` · ${item.kind}` : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{item.text}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sin comentarios.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecciona un paso para operar.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
