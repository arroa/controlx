"use client";

import { CheckCircle2, CircleDashed, LoaderCircle } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApprovalRole } from "@/domain/controlx";
import { stepMatchesGateTarget } from "@/lib/gate-targets";
import { roleLabel } from "@/lib/gate-runtime";
import type {
  ExecutionDetail,
  ExecutionGateSummary,
  RuntimeStepSummary,
} from "@/lib/execution-types";
import { RUNTIME_STEP_STATUS_LABELS } from "@/lib/execution-types";
import { cn } from "@/lib/utils";

function formatGateTime(iso: string | null, timezone: string) {
  if (!iso) return "Sin hora mínima";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function producerForGate(gateId: string, steps: RuntimeStepSummary[]) {
  return steps.find((step) => step.producesGateId === gateId) ?? null;
}

function compareDesignPath(a: RuntimeStepSummary, b: RuntimeStepSummary) {
  return (
    a.workstreamName.localeCompare(b.workstreamName, "es") ||
    a.blockName.localeCompare(b.blockName, "es") ||
    a.activityName.localeCompare(b.activityName, "es") ||
    a.order - b.order ||
    a.name.localeCompare(b.name, "es")
  );
}

function closersForGate(gate: ExecutionGateSummary, steps: RuntimeStepSummary[]) {
  return steps
    .filter((step) =>
      (gate.closesAfterTargets ?? []).some((target) =>
        stepMatchesGateTarget(step, target),
      ),
    )
    .sort(compareDesignPath);
}

function stepPathLabel(step: RuntimeStepSummary) {
  return `${step.workstreamName} · ${step.blockName} · ${step.activityName}`;
}

function stepConditionLabel(kind: "Productor" | "Cierre", step: RuntimeStepSummary) {
  return (
    <>
      {kind}: <strong>{step.name}</strong>{" "}
      <span className="text-muted-foreground">({stepPathLabel(step)})</span> ·{" "}
      {RUNTIME_STEP_STATUS_LABELS[step.status]}
    </>
  );
}

type PendingGateApproval = {
  gateId: string;
  gateName: string;
  role: ApprovalRole;
};

export function ExecutionGatesPanel({
  detail,
  actorRoles,
  canApproveAny,
  allowApprove,
  busyGateId,
  onApprove,
}: {
  detail: ExecutionDetail;
  actorRoles: string[];
  canApproveAny: boolean;
  allowApprove: boolean;
  busyGateId: string | null;
  onApprove: (gateId: string, role: ApprovalRole) => void;
}) {
  const [pending, setPending] = useState<PendingGateApproval | null>(null);

  if (!detail.gates.length) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Este diseño no tiene gates.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
      {detail.gates.map((gate) => {
        const producer = producerForGate(gate.id, detail.steps);
        const closers = closersForGate(gate, detail.steps);
        const approved = new Set(gate.approvals.map((item) => item.role));

        return (
          <article
            key={gate.id}
            className={cn(
              "rounded-xl border p-4",
              gate.open ? "border-emerald-500/40 bg-emerald-500/5" : "bg-card",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{gate.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {gate.open
                    ? "Listo — desbloquea pasos que lo requieren"
                    : "Pendiente — aún no desbloquea pasos"}
                </p>
              </div>
              <Badge variant={gate.open ? "default" : "outline"}>
                {gate.open ? "Listo" : "Pendiente"}
              </Badge>
            </div>

            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-start gap-2">
                {producer ? (
                  <>
                    <ConditionIcon ok={["EXITOSO", "APROBADO"].includes(producer.status)} />
                    <span>{stepConditionLabel("Productor", producer)}</span>
                  </>
                ) : (
                  <>
                    <ConditionIcon ok />
                    <span className="text-muted-foreground">Sin paso productor</span>
                  </>
                )}
              </li>

              <li className="flex items-start gap-2">
                <ConditionIcon
                  ok={
                    !gate.plannedOpenAt ||
                    !gate.blockers.some((item) => item.reason === "time")
                  }
                />
                <span>
                  Hora mínima: {formatGateTime(gate.plannedOpenAt, detail.timezone)}
                </span>
              </li>

              {closers.length ? (
                closers.map((closer) => (
                  <li key={closer.id} className="flex items-start gap-2">
                    <ConditionIcon
                      ok={["EXITOSO", "APROBADO"].includes(closer.status)}
                    />
                    <span>{stepConditionLabel("Cierre", closer)}</span>
                  </li>
                ))
              ) : (
                <li className="flex items-start gap-2">
                  <ConditionIcon ok />
                  <span className="text-muted-foreground">Sin cierres requeridos</span>
                </li>
              )}

              {(gate.approvalRoles ?? []).length ? (
                gate.approvalRoles.map((role) => {
                  const done = approved.has(role);
                  const approval = gate.approvals.find((item) => item.role === role);
                  const canRole =
                    allowApprove &&
                    (canApproveAny || actorRoles.includes(role));
                  return (
                    <li
                      key={role}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="flex items-start gap-2">
                        <ConditionIcon ok={done} />
                        <span>
                          Aprobación {roleLabel(role)}
                          {approval
                            ? ` · Aprobado por ${approval.actorLabel}`
                            : " · pendiente"}
                        </span>
                      </span>
                      {!done && canRole ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyGateId === gate.id}
                          onClick={() =>
                            setPending({
                              gateId: gate.id,
                              gateName: gate.name,
                              role,
                            })
                          }
                        >
                          {busyGateId === gate.id ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : null}
                          Aprobar
                        </Button>
                      ) : null}
                    </li>
                  );
                })
              ) : (
                <li className="flex items-start gap-2">
                  <ConditionIcon ok />
                  <span className="text-muted-foreground">
                    Sin aprobaciones de gate
                  </span>
                </li>
              )}
            </ul>
          </article>
        );
      })}

      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aprobar gate?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `Vas a registrar la aprobación de “${pending.gateName}” como ${roleLabel(pending.role)}. Esta acción no se puede deshacer.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyGateId)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!pending || Boolean(busyGateId)}
              onClick={(event) => {
                event.preventDefault();
                if (!pending) return;
                const next = pending;
                setPending(null);
                onApprove(next.gateId, next.role);
              }}
            >
              {busyGateId ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Aprobar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConditionIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
  ) : (
    <CircleDashed className="mt-0.5 size-4 shrink-0 text-amber-300" />
  );
}
