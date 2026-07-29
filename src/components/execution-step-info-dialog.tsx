"use client";

import { FileText, ImageIcon, Paperclip } from "lucide-react";

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
import { evidenceFileHref } from "@/lib/evidence-url";
import { formatDayTimeLabel } from "@/lib/execution-schedule";
import {
  STEP_ITERATION_STATUS_LABELS,
  stepHeaderStatusLabel,
  type EvidenceMeta,
  type RuntimeStepSummary,
  type StepAct,
  type StepIteration,
} from "@/lib/execution-types";
import { cn } from "@/lib/utils";

function ActColumn({
  title,
  act,
  timezone,
  executionId,
  empty,
}: {
  title: "Inicio" | "Fin";
  act: StepAct | null | undefined;
  timezone: string;
  executionId: string;
  empty?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-muted/15 p-3">
      <p className="text-center text-xs font-semibold tracking-wide uppercase">
        {title}
      </p>
      {empty || !act ? (
        <p className="mt-3 text-center text-sm text-muted-foreground">—</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-center font-mono text-sm">
            {formatDayTimeLabel(act.at, timezone)}
          </p>
          <div className="space-y-1">
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Comentario
            </p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {act.comment?.trim() || "—"}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Adjuntos ({act.evidence.length})
            </p>
            {act.evidence.length ? (
              <EvidenceList
                items={act.evidence}
                executionId={executionId}
                timezone={timezone}
              />
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceList({
  items,
  executionId,
  timezone,
}: {
  items: EvidenceMeta[];
  executionId: string;
  timezone: string;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.pathname}>
          <a
            href={evidenceFileHref(executionId, item.pathname)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md border bg-background/40 px-2 py-1.5 text-xs hover:bg-muted/40"
          >
            {item.contentType.startsWith("image/") ? (
              <ImageIcon className="size-3.5 shrink-0" />
            ) : item.contentType.includes("pdf") ? (
              <FileText className="size-3.5 shrink-0" />
            ) : (
              <Paperclip className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {item.caption || item.pathname.split("/").pop()}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {formatDayTimeLabel(item.uploadedAt, timezone)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function IterationCard({
  iteration,
  timezone,
  executionId,
}: {
  iteration: StepIteration;
  timezone: string;
  executionId: string;
}) {
  return (
    <section className="space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Iteración {iteration.n}</p>
        <Badge
          variant="outline"
          className={cn(
            iteration.status === "EN_CURSO" &&
              "border-sky-500/40 bg-sky-500/10 text-sky-100",
            iteration.status === "EXITOSA" &&
              "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
            iteration.status === "FALLIDA" &&
              "border-red-500/40 bg-red-500/10 text-red-100",
            iteration.status === "FORZADA_OK" &&
              "border-amber-500/40 bg-amber-500/10 text-amber-100",
          )}
        >
          {STEP_ITERATION_STATUS_LABELS[iteration.status]}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ActColumn
          title="Inicio"
          act={iteration.start}
          timezone={timezone}
          executionId={executionId}
        />
        <ActColumn
          title="Fin"
          act={iteration.end}
          timezone={timezone}
          executionId={executionId}
          empty={!iteration.end}
        />
      </div>
    </section>
  );
}

type ExecutionStepInfoDialogProps = {
  open: boolean;
  step: RuntimeStepSummary | null;
  timezone: string;
  executionId: string;
  viewerActorId?: string | null;
  onClose: () => void;
};

export function ExecutionStepInfoDialog({
  open,
  step,
  timezone,
  executionId,
  viewerActorId = null,
  onClose,
}: ExecutionStepInfoDialogProps) {
  const headerStatus = step ? stepHeaderStatusLabel(step) : "";
  const description =
    step?.description?.trim() ||
    step?.longDescription?.trim() ||
    "Sin descripción.";
  const iterationsNewestFirst = step
    ? [...step.iterations].sort((a, b) => b.n - a.n)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="space-y-2 border-b px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="text-left text-base leading-snug">
              {step?.name ?? "Paso"}
            </DialogTitle>
            {step ? (
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0",
                  headerStatus === "En curso" &&
                    "border-sky-500/40 bg-sky-500/10 text-sky-100",
                  headerStatus === "Exitosa" &&
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
                  headerStatus === "Fallida" &&
                    "border-red-500/40 bg-red-500/10 text-red-100",
                  headerStatus === "Forzada OK" &&
                    "border-amber-500/40 bg-amber-500/10 text-amber-100",
                  headerStatus === "No iniciada" &&
                    "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                {headerStatus}
              </Badge>
            ) : null}
          </div>
          <DialogDescription className="text-left text-xs leading-relaxed">
            {step ? (
              <>
                {step.workstreamName} · {step.blockName} · {step.activityName} ·{" "}
                {step.name}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {step ? (
          <div className="max-h-[min(70vh,560px)] space-y-4 overflow-y-auto px-5 py-4">
            <section className="space-y-1">
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Descripción
              </p>
              <p className="whitespace-pre-wrap text-sm">{description}</p>
              {step.description?.trim() &&
              step.longDescription?.trim() &&
              step.description.trim() !== step.longDescription.trim() ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {step.longDescription}
                </p>
              ) : null}
            </section>

            {iterationsNewestFirst.length ? (
              <div className="space-y-3">
                {iterationsNewestFirst.map((iteration) => (
                  <IterationCard
                    key={iteration.n}
                    iteration={iteration}
                    timezone={timezone}
                    executionId={executionId}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Todavía no hay iteraciones. Al iniciar el paso se crea la #1.
              </p>
            )}

            {viewerActorId && step.executorActorId !== viewerActorId ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Lo ejecuta {step.executorName ?? "otro actor"}.
              </div>
            ) : step.executorName ? (
              <p className="text-xs text-muted-foreground">
                Ejecutor: {step.executorName}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="mx-0 mb-0 border-t bg-transparent px-5 py-5 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
