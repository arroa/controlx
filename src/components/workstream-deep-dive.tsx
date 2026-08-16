"use client";

import { useMemo, useState } from "react";
import { BadgeInfo } from "lucide-react";

import { ExecutionStepInfoDialog } from "@/components/execution-step-info-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  stepHeaderStatusLabel,
  type ExecutionDetail,
  type RuntimeStepSummary,
} from "@/lib/execution-types";
import type { WorkstreamMonitorRow } from "@/lib/threshold-monitor";
import { cn } from "@/lib/utils";

function formatClock(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(t));
}

function lastCommentText(step: RuntimeStepSummary): string {
  if (!step.comments.length) return "—";
  let latest = step.comments[0]!;
  for (const comment of step.comments) {
    if (comment.createdAt > latest.createdAt) latest = comment;
  }
  const text = latest.text.trim();
  if (!text) return "—";
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

type ActivityGroup = {
  activityId: string;
  activityName: string;
  order: number;
  steps: RuntimeStepSummary[];
};

type BlockGroup = {
  blockId: string;
  blockName: string;
  order: number;
  activities: ActivityGroup[];
};

function groupSteps(steps: RuntimeStepSummary[]): BlockGroup[] {
  const byBlock = new Map<string, RuntimeStepSummary[]>();
  for (const step of steps) {
    const list = byBlock.get(step.blockId) ?? [];
    list.push(step);
    byBlock.set(step.blockId, list);
  }

  const blocks: BlockGroup[] = [];
  for (const [blockId, blockSteps] of byBlock) {
    const byActivity = new Map<string, RuntimeStepSummary[]>();
    for (const step of blockSteps) {
      const list = byActivity.get(step.activityId) ?? [];
      list.push(step);
      byActivity.set(step.activityId, list);
    }

    const activities: ActivityGroup[] = [];
    for (const [activityId, activitySteps] of byActivity) {
      const sorted = [...activitySteps].sort((a, b) => a.order - b.order);
      activities.push({
        activityId,
        activityName: sorted[0]!.activityName,
        order: Math.min(...sorted.map((s) => s.order)),
        steps: sorted,
      });
    }
    activities.sort((a, b) => a.order - b.order);

    blocks.push({
      blockId,
      blockName: blockSteps[0]!.blockName,
      order: Math.min(...blockSteps.map((s) => s.order)),
      activities,
    });
  }

  blocks.sort((a, b) => a.order - b.order);
  return blocks;
}

function statusTone(step: RuntimeStepSummary): string {
  const label = stepHeaderStatusLabel(step);
  if (label === "Fallida") return "text-rose-300";
  if (label === "Exitosa" || label === "Forzada OK") return "text-emerald-300";
  if (label === "En curso") return "text-sky-300";
  if (label === "Omitida") return "text-zinc-400";
  return "text-muted-foreground";
}

export function WorkstreamDeepDive({
  detail,
  workstreams,
}: {
  detail: ExecutionDetail;
  workstreams: WorkstreamMonitorRow[];
}) {
  const options = workstreams;
  const [workstreamId, setWorkstreamId] = useState(
    () => options[0]?.workstreamId ?? "",
  );
  const [infoId, setInfoId] = useState<string | null>(null);

  const selectedId =
    options.some((w) => w.workstreamId === workstreamId) && workstreamId
      ? workstreamId
      : (options[0]?.workstreamId ?? "");

  const blocks = useMemo(() => {
    if (!selectedId) return [];
    const steps = detail.steps.filter(
      (step) => step.workstreamId === selectedId,
    );
    return groupSteps(steps);
  }, [detail.steps, selectedId]);

  const infoStep =
    detail.steps.find((step) => step.id === infoId) ?? null;

  if (!options.length) return null;

  return (
    <div>
      <h2 className="mb-1 text-sm font-medium">Deep dive por workstream</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Lista de pasos · Info abre el detalle
      </p>

      <div className="mb-3 max-w-md">
        <Select
          value={selectedId}
          onValueChange={setWorkstreamId}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Elegí workstream" />
          </SelectTrigger>
          <SelectContent>
            {options.map((ws) => (
              <SelectItem key={ws.workstreamId} value={ws.workstreamId}>
                {ws.workstreamName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="space-y-4 px-3 py-3 sm:px-4">
          {!blocks.length ? (
            <p className="text-sm text-muted-foreground">
              Sin pasos en este workstream.
            </p>
          ) : (
            blocks.map((block) => (
              <section key={block.blockId} className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {block.blockName}
                </h3>
                {block.activities.map((activity) => (
                  <div key={activity.activityId} className="space-y-1.5 pl-1">
                    <p className="text-sm font-medium">{activity.activityName}</p>
                    <ul className="space-y-1.5">
                      {activity.steps.map((step) => (
                        <li
                          key={step.id}
                          className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2"
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="truncate text-sm font-medium">
                                  {step.name}
                                </span>
                                <span
                                  className={cn(
                                    "text-xs font-medium",
                                    statusTone(step),
                                  )}
                                >
                                  {stepHeaderStatusLabel(step)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                Arranque {formatClock(
                                  step.actualStartedAt,
                                  detail.timezone,
                                )}
                                {" · "}
                                Fin{" "}
                                {formatClock(
                                  step.actualEndedAt,
                                  detail.timezone,
                                )}
                              </p>
                              <p className="hidden text-xs text-muted-foreground sm:line-clamp-2 sm:block">
                                {lastCommentText(step)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="shrink-0"
                              aria-label={`Info ${step.name}`}
                              onClick={() => setInfoId(step.id)}
                            >
                              <BadgeInfo className="size-4" />
                              <span className="sr-only sm:not-sr-only sm:ml-1">
                                Info
                              </span>
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))
          )}
        </CardContent>
      </Card>

      <ExecutionStepInfoDialog
        open={Boolean(infoStep)}
        step={infoStep}
        steps={detail.steps}
        gates={detail.gates}
        timezone={detail.timezone}
        executionId={detail.id}
        onClose={() => setInfoId(null)}
      />
    </div>
  );
}
