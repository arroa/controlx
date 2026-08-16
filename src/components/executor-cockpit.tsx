"use client";

import { ExecutionTimesPanel2 } from "@/components/execution-times-panel-2";
import type { ExecutionDetail } from "@/lib/execution-types";

/** @deprecated Prefer ExecutionTimesPanel2. Se mantiene por compatibilidad. */
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
    <ExecutionTimesPanel2
      initial={initial}
      actorId={actorId}
      actorName={actorName}
      title="Mi turno"
    />
  );
}
