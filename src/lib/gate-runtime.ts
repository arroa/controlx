import type { ApprovalRole } from "@/domain/controlx";
import {
  catalogGateIdsForStep,
  stepMatchesGateTarget,
  type GateTargetRef,
} from "@/lib/gate-targets";
import {
  stepUnlocksDependents,
  type ExecutionGateSummary,
  type GateApprovalSummary,
  type GateConditionBlocker,
  type RuntimeStepStatus,
} from "@/lib/execution-types";

type GateStepLike = {
  id: string;
  name: string;
  status: RuntimeStepStatus;
  workstreamId: string;
  blockId: string;
  designStepId?: string | null;
  producesGateId: string | null;
};

type GateLike = Pick<
  ExecutionGateSummary,
  | "id"
  | "name"
  | "plannedOpenAt"
  | "closesAfterTargets"
  | "opensTargets"
  | "approvalRoles"
>;

function stepsForTargets(steps: GateStepLike[], targets: GateTargetRef[]) {
  return steps.filter((step) =>
    targets.some((target) => stepMatchesGateTarget(step, target)),
  );
}

/** Condiciones pendientes para que un gate se considere activo. */
export function unmetGateConditions(input: {
  gate: GateLike;
  steps: GateStepLike[];
  approvals: Array<Pick<GateApprovalSummary, "gateId" | "role">>;
  /** Reloj de evaluación (hora del acto al hacer Start; wall clock en UI). */
  now: Date;
}): GateConditionBlocker[] {
  const { gate, steps, approvals, now } = input;
  const blockers: GateConditionBlocker[] = [];

  const producer = steps.find((step) => step.producesGateId === gate.id);
  if (producer && !stepUnlocksDependents(producer.status)) {
    blockers.push({
      reason: producer.status === "FALLIDO" ? "producer_failed" : "producer_pending",
      detail:
        producer.status === "FALLIDO"
          ? `Productor fallido: ${producer.name}`
          : `Esperando productor: ${producer.name}`,
    });
  }

  if (gate.plannedOpenAt) {
    const openAt = new Date(gate.plannedOpenAt).getTime();
    if (!Number.isNaN(openAt) && now.getTime() < openAt) {
      blockers.push({
        reason: "time",
        detail: "Aún no llega la hora mínima del gate",
      });
    }
  }

  for (const closer of stepsForTargets(
    steps,
    gate.closesAfterTargets ?? [],
  )) {
    if (stepUnlocksDependents(closer.status)) continue;
    blockers.push({
      reason: closer.status === "FALLIDO" ? "closer_failed" : "closer_pending",
      detail:
        closer.status === "FALLIDO"
          ? `Cierre fallido: ${closer.name}`
          : `Esperando cierre: ${closer.name}`,
    });
  }

  const approvedRoles = new Set(
    approvals
      .filter((item) => item.gateId === gate.id)
      .map((item) => item.role),
  );
  for (const role of gate.approvalRoles ?? []) {
    if (approvedRoles.has(role)) continue;
    blockers.push({
      reason: "approval",
      detail: `Falta aprobación: ${role}`,
      role,
    });
  }

  return blockers;
}

export function isGateOpen(input: {
  gate: GateLike;
  steps: GateStepLike[];
  approvals: Array<Pick<GateApprovalSummary, "gateId" | "role">>;
  now: Date;
}): boolean {
  return unmetGateConditions(input).length === 0;
}

export function requiredGateIdsForStep(
  step: {
    id: string;
    workstreamId: string;
    blockId: string;
    designStepId?: string | null;
    requiresGateIds?: string[];
  },
  gates: Array<{ id: string; opensTargets?: GateTargetRef[] | null }>,
) {
  return [
    ...new Set([
      ...catalogGateIdsForStep(step, gates),
      ...(step.requiresGateIds ?? []),
    ]),
  ];
}

/** Gates que el paso requiere y aún no están activos. */
export function unmetRequiredGates(input: {
  requiresGateIds: string[];
  gates: GateLike[];
  steps: GateStepLike[];
  approvals: Array<Pick<GateApprovalSummary, "gateId" | "role">>;
  now: Date;
}): Array<{
  gateId: string;
  gateName: string;
  blockers: GateConditionBlocker[];
}> {
  const byId = new Map(input.gates.map((gate) => [gate.id, gate]));
  const unmet: Array<{
    gateId: string;
    gateName: string;
    blockers: GateConditionBlocker[];
  }> = [];

  for (const gateId of input.requiresGateIds) {
    const gate = byId.get(gateId);
    if (!gate) {
      unmet.push({
        gateId,
        gateName: "Gate faltante",
        blockers: [
          {
            reason: "missing_gate",
            detail: "El gate requerido no está en el diseño",
          },
        ],
      });
      continue;
    }
    const blockers = unmetGateConditions({
      gate,
      steps: input.steps,
      approvals: input.approvals,
      now: input.now,
    });
    if (blockers.length) {
      unmet.push({ gateId: gate.id, gateName: gate.name, blockers });
    }
  }

  return unmet;
}

export function roleLabel(role: ApprovalRole): string {
  switch (role) {
    case "EVENT_ADMIN":
      return "Event Admin";
    case "WORKSTREAM_ADMIN":
      return "Workstream Admin";
    case "APPROVER":
      return "Approver";
    case "STEERCO":
      return "SteerCo";
    default:
      return role;
  }
}
