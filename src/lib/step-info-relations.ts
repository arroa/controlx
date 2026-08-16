import { requiredGateIdsForStep } from "@/lib/gate-runtime";
import { stepMatchesGateTarget } from "@/lib/gate-targets";
import {
  stepHeaderStatusLabel,
  type ExecutionGateSummary,
  type RuntimeStepSummary,
} from "@/lib/execution-types";

export type StepInfoRelation = {
  id: string;
  kind: "step" | "gate";
  /** Mismo formato que el breadcrumb de Info: WS · bloque · actividad · paso */
  path: string;
  statusLabel: string;
};

function stepPath(step: RuntimeStepSummary) {
  return `${step.workstreamName} · ${step.blockName} · ${step.activityName} · ${step.name}`;
}

function toStepRelation(step: RuntimeStepSummary): StepInfoRelation {
  return {
    id: step.id,
    kind: "step",
    path: stepPath(step),
    statusLabel: stepHeaderStatusLabel(step),
  };
}

function toGateRelation(gate: ExecutionGateSummary): StepInfoRelation {
  return {
    id: gate.id,
    kind: "gate",
    path: `Gate · ${gate.name}`,
    statusLabel: gate.open ? "Abierto" : "Pendiente",
  };
}

/** De qué depende este paso: deps explícitas + gates que lo habilitan. */
export function stepPredecessors(
  step: RuntimeStepSummary,
  allSteps: RuntimeStepSummary[],
  gates: ExecutionGateSummary[],
): StepInfoRelation[] {
  const byId = new Map(allSteps.map((item) => [item.id, item]));
  const rows: StepInfoRelation[] = [];

  for (const depId of step.dependencyStepIds) {
    const dep = byId.get(depId);
    if (dep) {
      rows.push(toStepRelation(dep));
    } else {
      rows.push({
        id: depId,
        kind: "step",
        path: "Dependencia faltante",
        statusLabel: "—",
      });
    }
  }

  const gateIds = requiredGateIdsForStep(
    {
      id: step.id,
      workstreamId: step.workstreamId,
      blockId: step.blockId,
      designStepId: step.designStepId,
      requiresGateIds: step.requiresGateIds,
    },
    gates,
  );
  const seen = new Set<string>();
  for (const gateId of gateIds) {
    if (seen.has(gateId)) continue;
    seen.add(gateId);
    const gate = gates.find((item) => item.id === gateId);
    if (gate) rows.push(toGateRelation(gate));
    else {
      rows.push({
        id: gateId,
        kind: "gate",
        path: "Gate · faltante",
        statusLabel: "—",
      });
    }
  }

  return rows;
}

/** A qué abre este paso: pasos que lo esperan + gates que ayuda a abrir. */
export function stepDependents(
  step: RuntimeStepSummary,
  allSteps: RuntimeStepSummary[],
  gates: ExecutionGateSummary[],
): StepInfoRelation[] {
  const rows = allSteps
    .filter((item) => item.dependencyStepIds.includes(step.id))
    .map(toStepRelation);

  const seen = new Set<string>();
  for (const gate of gates) {
    const produces = step.producesGateId === gate.id;
    const closesAfter = (gate.closesAfterTargets ?? []).some((target) =>
      stepMatchesGateTarget(
        {
          id: step.id,
          workstreamId: step.workstreamId,
          blockId: step.blockId,
          designStepId: step.designStepId,
        },
        target,
      ),
    );
    if (!produces && !closesAfter) continue;
    if (seen.has(gate.id)) continue;
    seen.add(gate.id);
    rows.push(toGateRelation(gate));
  }

  return rows;
}
