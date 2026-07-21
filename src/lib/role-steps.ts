import type { DesignPair, DesignStepSummary } from "@/lib/admin-data";

export type RoleStepRow = {
  step: DesignStepSummary;
  workstreamName: string;
  blockName: string;
  activityName: string;
  pathLabel: string;
  searchText: string;
};

export function pairsToRoleSteps(pairs: DesignPair[]): RoleStepRow[] {
  const rows: RoleStepRow[] = [];
  for (const pair of pairs) {
    for (const activity of pair.activities) {
      for (const step of activity.steps) {
        const pathLabel = `${pair.workstream.name} · ${pair.block.name} · ${activity.name}`;
        rows.push({
          step,
          workstreamName: pair.workstream.name,
          blockName: pair.block.name,
          activityName: activity.name,
          pathLabel,
          searchText:
            `${pair.workstream.name} ${pair.block.name} ${activity.name} ${step.name} ${step.description}`.toLowerCase(),
        });
      }
    }
  }
  return rows.sort((a, b) => {
    const byWs = a.workstreamName.localeCompare(b.workstreamName, "es");
    if (byWs) return byWs;
    const byBlock = a.blockName.localeCompare(b.blockName, "es");
    if (byBlock) return byBlock;
    const byAct = a.activityName.localeCompare(b.activityName, "es");
    if (byAct) return byAct;
    return (
      a.step.order - b.step.order ||
      a.step.name.localeCompare(b.step.name, "es")
    );
  });
}
