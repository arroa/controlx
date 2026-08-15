export type GateTargetRef = {
  workstreamId: string;
  blockId: string | null;
  /** null/undefined = todo el WS o todo el bloque. */
  stepId?: string | null;
};

export function stepMatchesGateTarget(
  step: {
    id: string;
    workstreamId: string;
    blockId: string;
    designStepId?: string | null;
  },
  target: GateTargetRef,
) {
  if (step.workstreamId !== target.workstreamId) return false;
  if (target.blockId == null) return true;
  if (step.blockId !== target.blockId) return false;
  if (target.stepId == null) return true;
  const stepId = step.designStepId ?? step.id;
  return stepId === target.stepId;
}

/** Mismo territorio: un WS/bloque entero cubre sus pasos. */
export function gateTargetsOverlap(a: GateTargetRef, b: GateTargetRef) {
  if (a.workstreamId !== b.workstreamId) return false;
  if (a.blockId == null || b.blockId == null) return true;
  if (a.blockId !== b.blockId) return false;
  if (a.stepId == null || b.stepId == null) return true;
  return a.stepId === b.stepId;
}

export function catalogGateIdsForStep(
  step: {
    id: string;
    workstreamId: string;
    blockId: string;
    designStepId?: string | null;
  },
  gates: Array<{ id: string; opensTargets?: GateTargetRef[] | null }>,
) {
  return gates
    .filter((gate) =>
      (gate.opensTargets ?? []).some((target) =>
        stepMatchesGateTarget(step, target),
      ),
    )
    .map((gate) => gate.id);
}
