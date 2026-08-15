"use client";

import {
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DateTimePicker,
  toZonedInput,
} from "@/components/datetime-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  ActivityTreeNode,
  BlockSummary,
  DesignPair,
  GateSummary,
  WorkstreamSummary,
} from "@/lib/admin-data";
import { APPROVAL_ROLE_OPTIONS, type ApprovalRole } from "@/domain/controlx";
import {
  gateTargetsOverlap,
  stepMatchesGateTarget,
  type GateTargetRef,
} from "@/lib/gate-targets";
import { validateGateGraph } from "@/lib/gate-validation";
import { cn } from "@/lib/utils";

type DesignedStep = {
  id: string;
  name: string;
  activityId: string;
  activityName: string;
  order: number;
};

type DesignedActivity = {
  id: string;
  name: string;
  order: number;
  steps: DesignedStep[];
};

type DesignedBlock = BlockSummary & { activities: DesignedActivity[] };

type DesignedWorkstream = {
  workstream: WorkstreamSummary;
  blocks: DesignedBlock[];
};

function activitiesFromPair(activities: ActivityTreeNode[]): DesignedActivity[] {
  return activities
    .slice()
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"))
    .map((activity) => ({
      id: activity.id,
      name: activity.name,
      order: activity.order,
      steps: activity.steps
        .slice()
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"))
        .map((step) => ({
          id: step.id,
          name: step.name,
          activityId: activity.id,
          activityName: activity.name,
          order: step.order,
        })),
    }));
}

function allBlockSteps(block: DesignedBlock) {
  return block.activities.flatMap((activity) => activity.steps);
}

/** Solo WS/bloques con actividades en el diseño (no el catálogo vacío). */
function designedFromPairs(pairs: DesignPair[]): DesignedWorkstream[] {
  const byWs = new Map<string, DesignedWorkstream>();
  for (const pair of pairs) {
    if (!pair.activities.length) continue;
    let entry = byWs.get(pair.workstream.id);
    if (!entry) {
      entry = { workstream: pair.workstream, blocks: [] };
      byWs.set(pair.workstream.id, entry);
    }
    if (!entry.blocks.some((block) => block.id === pair.block.id)) {
      entry.blocks.push({
        ...pair.block,
        activities: activitiesFromPair(pair.activities),
      });
    }
  }
  return [...byWs.values()].map((entry) => ({
    ...entry,
    blocks: [...entry.blocks].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"),
    ),
  }));
}

function catalogsFromPairs(pairs: DesignPair[]): {
  workstreams: WorkstreamSummary[];
  blocks: BlockSummary[];
  steps: DesignedStep[];
} {
  const workstreams = new Map<string, WorkstreamSummary>();
  const blocks = new Map<string, BlockSummary>();
  const steps: DesignedStep[] = [];
  for (const pair of pairs) {
    workstreams.set(pair.workstream.id, pair.workstream);
    blocks.set(pair.block.id, pair.block);
    for (const activity of activitiesFromPair(pair.activities)) {
      steps.push(...activity.steps);
    }
  }
  return {
    workstreams: [...workstreams.values()],
    blocks: [...blocks.values()],
    steps,
  };
}

type GateTargetDraft = GateTargetRef;

type EditorState = {
  id: string | null;
  name: string;
  description: string;
  opensTargets: GateTargetDraft[];
  plannedOpenAt: string | null;
  approvalRoles: ApprovalRole[];
  closesAfterTargets: GateTargetDraft[];
};

function emptyEditor(): EditorState {
  return {
    id: null,
    name: "",
    description: "",
    opensTargets: [],
    plannedOpenAt: null,
    approvalRoles: [],
    closesAfterTargets: [],
  };
}

function summarizeTargets(
  targets: GateTargetDraft[],
  workstreams: WorkstreamSummary[],
  blocks: BlockSummary[],
  steps: DesignedStep[],
  emptyLabel: string,
) {
  if (!targets.length) return emptyLabel;

  const wsName = new Map(workstreams.map((item) => [item.id, item.name]));
  const blockName = new Map(blocks.map((item) => [item.id, item.name]));
  const stepName = new Map(steps.map((item) => [item.id, item.name]));

  return targets
    .map((target) => {
      const workstream = wsName.get(target.workstreamId) ?? "WS";
      if (!target.blockId) return `${workstream} (todo)`;
      const block = blockName.get(target.blockId) ?? "Bloque";
      if (!target.stepId) return `${workstream} · ${block}`;
      const step = steps.find((item) => item.id === target.stepId);
      const stepLabel = step?.name ?? stepName.get(target.stepId) ?? "Paso";
      return step?.activityName
        ? `${workstream} · ${block} · ${step.activityName} · ${stepLabel}`
        : `${workstream} · ${block} · ${stepLabel}`;
    })
    .join(", ");
}

function summarizeActivation(
  gate: GateSummary,
  workstreams: WorkstreamSummary[],
  blocks: BlockSummary[],
  steps: DesignedStep[],
  eventTimezone: string,
) {
  const parts: string[] = [];
  if (gate.plannedOpenAt) {
    parts.push(
      `hora ${toZonedInput(gate.plannedOpenAt, eventTimezone).replace("T", " ")}`,
    );
  }
  if (gate.approvalRoles?.length) {
    parts.push(
      APPROVAL_ROLE_OPTIONS.filter((option) =>
        gate.approvalRoles.includes(option.value),
      )
        .map((option) => option.label)
        .join("+"),
    );
  }
  if (gate.closesAfterTargets?.length) {
    parts.push(
      `cierre: ${summarizeTargets(gate.closesAfterTargets, workstreams, blocks, steps, "")}`,
    );
  }
  return parts.length ? parts.join(" · ") : "sin condición (manual / productor)";
}

function stepsOf(
  tree: DesignedWorkstream[],
  workstreamId: string,
  blockId?: string,
  activityId?: string,
) {
  const ws = tree.find((entry) => entry.workstream.id === workstreamId);
  if (!ws) return [];
  const blocks = blockId
    ? ws.blocks.filter((block) => block.id === blockId)
    : ws.blocks;
  return blocks.flatMap((block) =>
    (activityId
      ? block.activities.filter((activity) => activity.id === activityId)
      : block.activities
    ).flatMap((activity) =>
      activity.steps.map((step) => ({
        id: step.id,
        workstreamId,
        blockId: block.id,
      })),
    ),
  );
}

function coveredStepIds(
  targets: GateTargetDraft[],
  tree: DesignedWorkstream[],
  workstreamId: string,
) {
  return new Set(
    stepsOf(tree, workstreamId)
      .filter((step) =>
        targets.some((target) => stepMatchesGateTarget(step, target)),
      )
      .map((step) => step.id),
  );
}

function compactWsTargets(
  workstreamId: string,
  covered: Set<string>,
  tree: DesignedWorkstream[],
  previous: GateTargetDraft[],
): GateTargetDraft[] {
  const ws = tree.find((entry) => entry.workstream.id === workstreamId);
  if (!ws) return [];
  const allSteps = stepsOf(tree, workstreamId);
  if (allSteps.length && allSteps.every((step) => covered.has(step.id))) {
    return [{ workstreamId, blockId: null, stepId: null }];
  }

  const out: GateTargetDraft[] = [];
  for (const block of ws.blocks) {
    if (!allBlockSteps(block).length) {
      const keepEmpty = previous.some(
        (target) =>
          target.workstreamId === workstreamId &&
          (target.blockId == null ||
            (target.blockId === block.id && !target.stepId)),
      );
      if (keepEmpty) {
        out.push({ workstreamId, blockId: block.id, stepId: null });
      }
      continue;
    }
    const blockSteps = allBlockSteps(block);
    if (blockSteps.every((step) => covered.has(step.id))) {
      out.push({ workstreamId, blockId: block.id, stepId: null });
      continue;
    }
    for (const step of blockSteps) {
      if (covered.has(step.id)) {
        out.push({ workstreamId, blockId: block.id, stepId: step.id });
      }
    }
  }
  return out;
}

function replaceWsTargets(
  targets: GateTargetDraft[],
  workstreamId: string,
  next: GateTargetDraft[],
) {
  return [
    ...targets.filter((target) => target.workstreamId !== workstreamId),
    ...next,
  ];
}

function toggleWhole(
  targets: GateTargetDraft[],
  tree: DesignedWorkstream[],
  workstreamId: string,
): GateTargetDraft[] {
  const all = stepsOf(tree, workstreamId);
  const covered = coveredStepIds(targets, tree, workstreamId);
  const allSelected =
    all.length > 0 && all.every((step) => covered.has(step.id));
  if (allSelected || (!all.length && targets.some((t) => t.workstreamId === workstreamId && t.blockId == null))) {
    return replaceWsTargets(targets, workstreamId, []);
  }
  return replaceWsTargets(targets, workstreamId, [
    { workstreamId, blockId: null, stepId: null },
  ]);
}

function toggleBlockTarget(
  targets: GateTargetDraft[],
  tree: DesignedWorkstream[],
  workstreamId: string,
  blockId: string,
): GateTargetDraft[] {
  const blockSteps = stepsOf(tree, workstreamId, blockId);
  const covered = coveredStepIds(targets, tree, workstreamId);
  const next = new Set(covered);
  if (!blockSteps.length) {
    const selected = targets.some(
      (target) =>
        (target.workstreamId === workstreamId && target.blockId == null) ||
        (target.workstreamId === workstreamId &&
          target.blockId === blockId &&
          !target.stepId),
    );
    const remaining = targets.filter(
      (target) =>
        !(
          target.workstreamId === workstreamId &&
          (target.blockId == null || target.blockId === blockId)
        ),
    );
    if (selected) {
      const ws = tree.find((entry) => entry.workstream.id === workstreamId);
      const otherBlocks = (ws?.blocks ?? [])
        .filter((block) => block.id !== blockId)
        .map((block) => ({
          workstreamId,
          blockId: block.id,
          stepId: null as string | null,
        }));
      return [...remaining, ...otherBlocks];
    }
    return [
      ...remaining,
      { workstreamId, blockId, stepId: null },
    ];
  }
  const allBlock = blockSteps.every((step) => covered.has(step.id));
  if (allBlock) blockSteps.forEach((step) => next.delete(step.id));
  else blockSteps.forEach((step) => next.add(step.id));
  return replaceWsTargets(
    targets,
    workstreamId,
    compactWsTargets(workstreamId, next, tree, targets),
  );
}

function toggleActivityTarget(
  targets: GateTargetDraft[],
  tree: DesignedWorkstream[],
  workstreamId: string,
  blockId: string,
  activityId: string,
): GateTargetDraft[] {
  const activitySteps = stepsOf(tree, workstreamId, blockId, activityId);
  const covered = coveredStepIds(targets, tree, workstreamId);
  const next = new Set(covered);
  if (!activitySteps.length) return targets;
  const allActivity = activitySteps.every((step) => covered.has(step.id));
  if (allActivity) activitySteps.forEach((step) => next.delete(step.id));
  else activitySteps.forEach((step) => next.add(step.id));
  return replaceWsTargets(
    targets,
    workstreamId,
    compactWsTargets(workstreamId, next, tree, targets),
  );
}

function toggleStepTarget(
  targets: GateTargetDraft[],
  tree: DesignedWorkstream[],
  workstreamId: string,
  blockId: string,
  stepId: string,
): GateTargetDraft[] {
  const covered = coveredStepIds(targets, tree, workstreamId);
  const next = new Set(covered);
  if (next.has(stepId)) next.delete(stepId);
  else next.add(stepId);
  return replaceWsTargets(
    targets,
    workstreamId,
    compactWsTargets(workstreamId, next, tree, targets),
  );
}

function isTargetBlocked(
  candidate: GateTargetDraft,
  blocked: GateTargetDraft[],
) {
  return blocked.some((item) => gateTargetsOverlap(candidate, item));
}

function withoutBlockedTargets(
  targets: GateTargetDraft[],
  blocked: GateTargetDraft[],
) {
  return targets.filter((target) => !isTargetBlocked(target, blocked));
}

function TargetChecklist({
  designed,
  targets,
  blockedTargets = [],
  onChange,
}: {
  designed: DesignedWorkstream[];
  targets: GateTargetDraft[];
  /** Selección del otro lado (origen↔destino): no se puede repetir. */
  blockedTargets?: GateTargetDraft[];
  onChange: (targets: GateTargetDraft[]) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!designed.length) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Aún no hay workstreams/bloques diseñados. Crea actividades en Diseño
        primero.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border">
      {designed.map(({ workstream, blocks }) => {
        const wsSteps = stepsOf(designed, workstream.id);
        const covered = coveredStepIds(targets, designed, workstream.id);
        const wholeBlocked = isTargetBlocked(
          { workstreamId: workstream.id, blockId: null, stepId: null },
          blockedTargets,
        );
        const whole =
          (wsSteps.length > 0 &&
            wsSteps.every((step) => covered.has(step.id))) ||
          targets.some(
            (target) =>
              target.workstreamId === workstream.id && target.blockId == null,
          );
        const selectedCount = covered.size;
        const expanded = expandedIds.has(workstream.id);
        const summary = whole
          ? "Todo el WS"
          : selectedCount
            ? `${selectedCount} paso${selectedCount === 1 ? "" : "s"}`
            : wholeBlocked
              ? "En el otro lado"
              : "Ninguno";

        return (
          <div key={workstream.id} className="border-b last:border-b-0">
            <div
              className={cn(
                "flex items-center gap-2 px-2 py-2 hover:bg-muted/50",
                (whole || selectedCount > 0) && "bg-muted/30",
                wholeBlocked && !whole && "opacity-60",
              )}
            >
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-expanded={expanded}
                aria-label={
                  expanded
                    ? `Colapsar ${workstream.name}`
                    : `Expandir ${workstream.name}`
                }
                onClick={() => toggleExpanded(workstream.id)}
              >
                {expanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
              <label
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 py-0.5",
                  wholeBlocked ? "cursor-not-allowed" : "cursor-pointer",
                )}
                title={
                  wholeBlocked
                    ? "Ya está en el otro lado del gate"
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={whole}
                  disabled={wholeBlocked}
                  onChange={() =>
                    onChange(toggleWhole(targets, designed, workstream.id))
                  }
                />
                <span className="truncate text-sm font-medium">
                  {workstream.name}
                </span>
              </label>
              <Badge variant="outline" className="shrink-0">
                {summary}
              </Badge>
            </div>

            {expanded ? (
              <div className="space-y-0.5 border-t bg-muted/10 px-3 py-2 pl-9">
                <p className="px-2 pb-1 text-[11px] text-muted-foreground">
                  Bloques → actividades → pasos (o marca “todo el WS” arriba)
                </p>
                {blocks.map((block) => {
                  const blockKey = `${workstream.id}:${block.id}`;
                  const blockExpanded = expandedIds.has(blockKey);
                  const blockSteps = stepsOf(
                    designed,
                    workstream.id,
                    block.id,
                  );
                  const blockAll =
                    blockSteps.length > 0 &&
                    blockSteps.every((step) => covered.has(step.id));
                  const blockSome = blockSteps.some((step) =>
                    covered.has(step.id),
                  );
                  const blockBlocked = isTargetBlocked(
                    {
                      workstreamId: workstream.id,
                      blockId: block.id,
                      stepId: null,
                    },
                    blockedTargets,
                  );
                  return (
                    <div key={blockKey}>
                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-md px-1 py-1",
                          blockAll && !whole && "bg-muted/30",
                          (whole || blockBlocked) && "opacity-60",
                        )}
                      >
                        <button
                          type="button"
                          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-expanded={blockExpanded}
                          aria-label={
                            blockExpanded
                              ? `Colapsar ${block.name}`
                              : `Expandir ${block.name}`
                          }
                          onClick={() => toggleExpanded(blockKey)}
                        >
                          {blockExpanded ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronRight className="size-3.5" />
                          )}
                        </button>
                        <label
                          title={
                            blockBlocked
                              ? "Ya está en el otro lado del gate"
                              : undefined
                          }
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-3 py-0.5",
                            blockBlocked
                              ? "cursor-not-allowed"
                              : "cursor-pointer hover:bg-muted/40",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={whole || blockAll}
                            disabled={blockBlocked}
                            onChange={() =>
                              onChange(
                                toggleBlockTarget(
                                  targets,
                                  designed,
                                  workstream.id,
                                  block.id,
                                ),
                              )
                            }
                          />
                          <span className="truncate text-sm">{block.name}</span>
                        </label>
                        {blockSome && !blockAll && !whole ? (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            parcial
                          </Badge>
                        ) : null}
                      </div>
                      {blockExpanded ? (
                        <div className="space-y-0.5 py-1 pl-8">
                          {block.activities.map((activity) => {
                            const activityKey = `${blockKey}:${activity.id}`;
                            const activityExpanded = expandedIds.has(activityKey);
                            const activitySteps = activity.steps;
                            const activityAll =
                              activitySteps.length > 0 &&
                              activitySteps.every((step) => covered.has(step.id));
                            const activitySome = activitySteps.some((step) =>
                              covered.has(step.id),
                            );
                            return (
                              <div key={activity.id}>
                                <div
                                  className={cn(
                                    "flex items-center gap-2 rounded-md px-1 py-1",
                                    activityAll && !whole && !blockAll && "bg-muted/30",
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                    aria-expanded={activityExpanded}
                                    aria-label={
                                      activityExpanded
                                        ? `Colapsar ${activity.name}`
                                        : `Expandir ${activity.name}`
                                    }
                                    onClick={() => toggleExpanded(activityKey)}
                                  >
                                    {activityExpanded ? (
                                      <ChevronDown className="size-3.5" />
                                    ) : (
                                      <ChevronRight className="size-3.5" />
                                    )}
                                  </button>
                                  <label
                                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-0.5 hover:bg-muted/40"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={whole || blockAll || activityAll}
                                      onChange={() =>
                                        onChange(
                                          toggleActivityTarget(
                                            targets,
                                            designed,
                                            workstream.id,
                                            block.id,
                                            activity.id,
                                          ),
                                        )
                                      }
                                    />
                                    <span className="truncate text-sm">
                                      {activity.name}
                                    </span>
                                  </label>
                                  {activitySome && !activityAll && !whole && !blockAll ? (
                                    <Badge
                                      variant="outline"
                                      className="shrink-0 text-[10px]"
                                    >
                                      parcial
                                    </Badge>
                                  ) : null}
                                </div>
                                {activityExpanded ? (
                                  <div className="space-y-0.5 py-1 pl-10">
                                    {activity.steps.map((step) => {
                                      const stepBlocked = isTargetBlocked(
                                        {
                                          workstreamId: workstream.id,
                                          blockId: block.id,
                                          stepId: step.id,
                                        },
                                        blockedTargets,
                                      );
                                      const checked =
                                        whole ||
                                        blockAll ||
                                        activityAll ||
                                        covered.has(step.id);
                                      return (
                                        <label
                                          key={step.id}
                                          title={
                                            stepBlocked
                                              ? "Ya está en el otro lado del gate"
                                              : undefined
                                          }
                                          className={cn(
                                            "flex items-center gap-3 rounded-md px-2 py-1",
                                            stepBlocked
                                              ? "cursor-not-allowed opacity-60"
                                              : "cursor-pointer hover:bg-muted/40",
                                            checked &&
                                              !whole &&
                                              !blockAll &&
                                              !activityAll &&
                                              "bg-muted/30",
                                          )}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={stepBlocked}
                                            onChange={() =>
                                              onChange(
                                                toggleStepTarget(
                                                  targets,
                                                  designed,
                                                  workstream.id,
                                                  block.id,
                                                  step.id,
                                                ),
                                              )
                                            }
                                          />
                                          <span className="truncate text-sm">
                                            {step.name}
                                          </span>
                                        </label>
                                      );
                                    })}
                                    {!activity.steps.length ? (
                                      <p className="px-2 py-1 text-xs text-muted-foreground">
                                        Sin pasos en esta actividad.
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                          {!block.activities.length ? (
                            <p className="px-2 py-1 text-xs text-muted-foreground">
                              Sin actividades en este bloque.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!blocks.length ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    Sin bloques diseñados en este workstream.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function GatesManager({
  open,
  onOpenChange,
  eventId,
  eventTimezone,
  gates,
  pairs,
  onGatesChange,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTimezone: string;
  gates: GateSummary[];
  pairs: DesignPair[];
  onGatesChange: (gates: GateSummary[]) => void;
  onError: (message: string) => void;
}) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const designed = useMemo(() => designedFromPairs(pairs), [pairs]);
  const { workstreams, blocks, steps } = useMemo(
    () => catalogsFromPairs(pairs),
    [pairs],
  );

  function startCreate() {
    setFormError("");
    setEditor(emptyEditor());
  }

  function startEdit(gate: GateSummary) {
    setFormError("");
    setEditor({
      id: gate.id,
      name: gate.name,
      description: gate.description,
      opensTargets: (gate.opensTargets ?? []).map((target) => ({
        workstreamId: target.workstreamId,
        blockId: target.blockId,
        stepId: target.stepId ?? null,
      })),
      plannedOpenAt: gate.plannedOpenAt ?? null,
      approvalRoles: [...(gate.approvalRoles ?? [])],
      closesAfterTargets: (gate.closesAfterTargets ?? []).map((target) => ({
        workstreamId: target.workstreamId,
        blockId: target.blockId,
        stepId: target.stepId ?? null,
      })),
    });
  }

  function toggleApproval(role: ApprovalRole) {
    setEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        approvalRoles: current.approvalRoles.includes(role)
          ? current.approvalRoles.filter((item) => item !== role)
          : [...current.approvalRoles, role],
      };
    });
  }

  async function saveEditor() {
    if (!editor) return;
    const name = editor.name.trim();
    if (name.length < 2) {
      setFormError("Escribe un nombre (mín. 2 caracteres), ej. Arranque.");
      onError("El nombre del gate debe tener al menos 2 caracteres.");
      return;
    }

    const opensTargets = withoutBlockedTargets(
      editor.opensTargets,
      editor.closesAfterTargets,
    );
    const closesAfterTargets = withoutBlockedTargets(
      editor.closesAfterTargets,
      opensTargets,
    );
    if (
      opensTargets.length !== editor.opensTargets.length ||
      closesAfterTargets.length !== editor.closesAfterTargets.length
    ) {
      setFormError(
        "Hay solape entre origen y destino. Revisa WS, bloques y pasos.",
      );
      onError("Un gate no puede requerir y abrir el mismo workstream, bloque o paso.");
      setEditor({ ...editor, opensTargets, closesAfterTargets });
      return;
    }

    const designedPairs = designed.flatMap((entry) =>
      entry.blocks.flatMap((block) => {
        const steps = allBlockSteps(block);
        return steps.length
          ? steps.map((step) => ({
              workstreamId: entry.workstream.id,
              blockId: block.id,
              stepId: step.id,
              workstreamName: entry.workstream.name,
              blockName: block.name,
              stepName: step.name,
            }))
          : [
              {
                workstreamId: entry.workstream.id,
                blockId: block.id,
                workstreamName: entry.workstream.name,
                blockName: block.name,
              },
            ];
      }),
    );
    const graphCheck = validateGateGraph({
      gates: gates.map((gate) => ({
        id: gate.id,
        name: gate.name,
        opensTargets: gate.opensTargets ?? [],
        closesAfterTargets: gate.closesAfterTargets ?? [],
      })),
      draft: {
        id: editor.id,
        name,
        opensTargets,
        closesAfterTargets,
      },
      designedPairs,
    });
    if (!graphCheck.ok) {
      setFormError(graphCheck.message);
      onError(graphCheck.message);
      return;
    }

    setSaving(true);
    setFormError("");
    onError("");
    const body = {
      name,
      description: editor.description.trim(),
      opensTargets,
      plannedOpenAt: editor.plannedOpenAt,
      approvalRoles: editor.approvalRoles,
      closesAfterTargets,
    };

    const response = await fetch(
      editor.id
        ? `/api/events/${eventId}/gates/${editor.id}`
        : `/api/events/${eventId}/gates`,
      {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ).catch(() => null);

    const payload = response
      ? ((await response.json()) as { gate?: GateSummary; error?: string })
      : null;
    setSaving(false);

    if (!response?.ok || !payload?.gate) {
      const message = payload?.error ?? "No fue posible guardar el gate.";
      setFormError(message);
      onError(message);
      return;
    }

    onGatesChange(
      editor.id
        ? gates.map((gate) => (gate.id === editor.id ? payload.gate! : gate))
        : [...gates, payload.gate],
    );
    setEditor(null);
  }

  async function removeGate(gateId: string) {
    setDeletingId(gateId);
    onError("");
    const response = await fetch(`/api/events/${eventId}/gates/${gateId}`, {
      method: "DELETE",
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as { error?: string })
      : null;
    setDeletingId(null);

    if (!response?.ok) {
      onError(payload?.error ?? "No fue posible eliminar el gate.");
      return;
    }
    onGatesChange(gates.filter((gate) => gate.id !== gateId));
    if (editor?.id === gateId) setEditor(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,900px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,88rem)]">
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>Gates</DialogTitle>
          <DialogDescription>
            Dependencia no granular: un hito con condiciones de activación que
            abre workstreams, bloques, actividades o pasos.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {editor ? (
            <form
              id="gate-editor-form"
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void saveEditor();
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {editor.id ? "Editar gate" : "Crear gate"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditor(null)}
                >
                  Volver al listado
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="gate-name">
                  Nombre
                </label>
                <Input
                  id="gate-name"
                  name="name"
                  autoFocus
                  value={editor.name}
                  onChange={(event) => {
                    setFormError("");
                    setEditor({ ...editor, name: event.target.value });
                  }}
                  placeholder="Ej. Arranque, GoNoGo mañana, GoNoGo tarde…"
                />
                {formError ? (
                  <p role="alert" className="text-sm text-red-300">
                    {formError}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_15rem_minmax(0,1.15fr)] lg:items-start">
                <section className="flex min-h-0 flex-col space-y-2 rounded-xl border bg-muted/10 p-3">
                  <div>
                    <p className="text-sm font-medium">Qué lo activa</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cierre OK de estos WS, bloques, actividades o pasos.
                    </p>
                  </div>
                  <TargetChecklist
                    designed={designed}
                    targets={editor.closesAfterTargets}
                    blockedTargets={editor.opensTargets}
                    onChange={(closesAfterTargets) =>
                      setEditor({
                        ...editor,
                        closesAfterTargets,
                        opensTargets: withoutBlockedTargets(
                          editor.opensTargets,
                          closesAfterTargets,
                        ),
                      })
                    }
                  />
                </section>

                <section className="flex flex-col gap-3">
                  <div className="space-y-2 rounded-xl border bg-muted/10 p-3">
                    <p className="text-sm font-medium">Horario</p>
                    <p className="text-xs text-muted-foreground">
                      No antes de (opcional).
                    </p>
                    <DateTimePicker
                      value={editor.plannedOpenAt}
                      timezone={eventTimezone}
                      onChange={(plannedOpenAt) =>
                        setEditor({ ...editor, plannedOpenAt })
                      }
                      placeholder="Sin hora mínima"
                    />
                  </div>

                  <div className="space-y-2 rounded-xl border bg-muted/10 p-3">
                    <p className="text-sm font-medium">Aprobaciones</p>
                    <p className="text-xs text-muted-foreground">
                      Roles que deben dar OK (opcional, AND).
                    </p>
                    <div className="space-y-1">
                      {APPROVAL_ROLE_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50",
                            editor.approvalRoles.includes(option.value) &&
                              "bg-muted/30",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={editor.approvalRoles.includes(
                              option.value,
                            )}
                            onChange={() => toggleApproval(option.value)}
                          />
                          <span className="text-sm">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="flex min-h-0 flex-col space-y-2 rounded-xl border bg-muted/10 p-3">
                  <div>
                    <p className="text-sm font-medium">Qué abre</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      WS, bloques, actividades o pasos que libera (no pueden repetir el origen).
                    </p>
                  </div>
                  <TargetChecklist
                    designed={designed}
                    targets={editor.opensTargets}
                    blockedTargets={editor.closesAfterTargets}
                    onChange={(opensTargets) =>
                      setEditor({
                        ...editor,
                        opensTargets,
                        closesAfterTargets: withoutBlockedTargets(
                          editor.closesAfterTargets,
                          opensTargets,
                        ),
                      })
                    }
                  />
                </section>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {gates.length
                    ? `${gates.length} gate${gates.length === 1 ? "" : "s"}`
                    : "Todavía no hay gates"}
                </p>
                <Button type="button" onClick={startCreate}>
                  <Plus className="size-4" />
                  Crear gate
                </Button>
              </div>

              {!gates.length ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <p className="font-medium">Crea el primer gate</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Define cuándo se activa (hora, aprobación, cierre) y qué
                    workstreams/bloques abre.
                  </p>
                  <Button
                    type="button"
                    className="mt-4"
                    onClick={startCreate}
                  >
                    <Plus className="size-4" />
                    Crear gate
                  </Button>
                </div>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {gates.map((gate) => (
                    <li
                      key={gate.id}
                      className="flex items-start gap-3 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{gate.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Activa:{" "}
                          {summarizeActivation(
                            gate,
                            workstreams,
                            blocks,
                            steps,
                            eventTimezone,
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Abre:{" "}
                          {summarizeTargets(
                            gate.opensTargets,
                            workstreams,
                            blocks,
                            steps,
                            "Sin anclas aún",
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => startEdit(gate)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={deletingId === gate.id}
                          onClick={() => void removeGate(gate.id)}
                        >
                          {deletingId === gate.id ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {editor ? (
          <DialogFooter className="shrink-0 border-t p-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditor(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="gate-editor-form"
              disabled={saving}
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {editor.id ? "Guardar cambios" : "Crear gate"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
