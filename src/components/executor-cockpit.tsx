"use client";

import { ExecutionTimesPanel } from "@/components/execution-times-panel";
import type { ExecutionDetail } from "@/lib/execution-types";

/** @deprecated Prefer ExecutionTimesPanel. Se mantiene por compatibilidad. */
export function ExecutorCockpit({
  initial,
  actorId,
  actorName,
}: {
  initial: ExecutionDetail;
  actorId: string;
  actorName: string;
}) {
  return (
    <ExecutionTimesPanel
      initial={initial}
      actorId={actorId}
      actorName={actorName}
      title="Mi turno"
    />
  );
}
