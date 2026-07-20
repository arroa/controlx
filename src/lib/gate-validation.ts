export type GateTargetRef = {
  workstreamId: string;
  blockId: string | null;
};

export type GateGraphNode = {
  id: string | null;
  name: string;
  opensTargets: GateTargetRef[];
  closesAfterTargets: GateTargetRef[];
};

export type DesignedPairRef = {
  workstreamId: string;
  blockId: string;
  workstreamName?: string;
  blockName?: string;
};

/** Unidad atómica del grafo: un WS×bloque del diseño. */
function atomKey(workstreamId: string, blockId: string) {
  return `${workstreamId}:${blockId}`;
}

function expandTargets(
  targets: GateTargetRef[],
  designed: DesignedPairRef[],
): string[] {
  const atoms = new Set<string>();
  for (const target of targets) {
    if (target.blockId) {
      atoms.add(atomKey(target.workstreamId, target.blockId));
      continue;
    }
    for (const pair of designed) {
      if (pair.workstreamId === target.workstreamId) {
        atoms.add(atomKey(pair.workstreamId, pair.blockId));
      }
    }
  }
  return [...atoms];
}

function targetsOverlap(a: GateTargetRef, b: GateTargetRef) {
  if (a.workstreamId !== b.workstreamId) return false;
  if (a.blockId == null || b.blockId == null) return true;
  return a.blockId === b.blockId;
}

function findSameGateOverlap(gate: GateGraphNode): string | null {
  for (const open of gate.opensTargets) {
    for (const close of gate.closesAfterTargets) {
      if (targetsOverlap(open, close)) {
        return `“${gate.name || "Este gate"}” no puede requerir y abrir el mismo workstream/bloque.`;
      }
    }
  }
  return null;
}

function buildEnablementGraph(
  gates: GateGraphNode[],
  designed: DesignedPairRef[],
) {
  const outgoing = new Map<string, Set<string>>();

  function addEdge(from: string, to: string) {
    if (from === to) return;
    const set = outgoing.get(from) ?? new Set<string>();
    set.add(to);
    outgoing.set(from, set);
  }

  for (const gate of gates) {
    const fromAtoms = expandTargets(gate.closesAfterTargets, designed);
    const toAtoms = expandTargets(gate.opensTargets, designed);
    for (const from of fromAtoms) {
      for (const to of toAtoms) {
        addEdge(from, to);
      }
    }
  }

  return outgoing;
}

function findCycleMessage(
  outgoing: Map<string, Set<string>>,
  designed: DesignedPairRef[],
  gates: GateGraphNode[],
): string | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();

  function atomLabel(key: string) {
    const sep = key.indexOf(":");
    const workstreamId = key.slice(0, sep);
    const blockId = key.slice(sep + 1);
    const pair = designed.find(
      (item) =>
        item.workstreamId === workstreamId && item.blockId === blockId,
    );
    if (pair?.workstreamName && pair.blockName) {
      return `${pair.workstreamName} · ${pair.blockName}`;
    }
    return key;
  }

  function explainCycle(cycleAtoms: string[]) {
    const involved = gates
      .filter((gate) => {
        const from = new Set(expandTargets(gate.closesAfterTargets, designed));
        const to = new Set(expandTargets(gate.opensTargets, designed));
        for (let i = 0; i < cycleAtoms.length - 1; i++) {
          const a = cycleAtoms[i]!;
          const b = cycleAtoms[i + 1]!;
          if (from.has(a) && to.has(b)) return true;
        }
        return false;
      })
      .map((gate) => gate.name || "gate")
      .filter((name, index, all) => all.indexOf(name) === index);

    const chain = cycleAtoms.map(atomLabel).join(" → ");
    if (involved.length) {
      return `Referencia circular entre gates (${involved.join(", ")}): ${chain}.`;
    }
    return `Referencia circular en habilitación de workstreams/bloques: ${chain}.`;
  }

  function dfs(node: string): string[] | null {
    visiting.add(node);
    parent.set(node, parent.get(node) ?? null);
    for (const next of outgoing.get(node) ?? []) {
      if (visiting.has(next)) {
        const cycle = [next];
        let cursor: string | null = node;
        while (cursor && cursor !== next) {
          cycle.push(cursor);
          cursor = parent.get(cursor) ?? null;
        }
        cycle.push(next);
        cycle.reverse();
        return cycle;
      }
      if (visited.has(next)) continue;
      parent.set(next, node);
      const cycle = dfs(next);
      if (cycle) return cycle;
    }
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const node of outgoing.keys()) {
    if (visited.has(node)) continue;
    parent.set(node, null);
    const cycle = dfs(node);
    if (cycle) return explainCycle(cycle);
  }
  return null;
}

/**
 * Valida el grafo de gates antes de persistir.
 * - Solape origen/destino en el mismo gate
 * - Ciclos entre gates vía WS/bloques (incl. “todo el WS” vs bloque)
 */
export function validateGateGraph(options: {
  gates: GateGraphNode[];
  draft: GateGraphNode;
  designedPairs: DesignedPairRef[];
}): { ok: true } | { ok: false; message: string } {
  const same = findSameGateOverlap(options.draft);
  if (same) return { ok: false, message: same };

  if (
    !options.draft.opensTargets.length ||
    !options.draft.closesAfterTargets.length
  ) {
    // Sin ambos lados no hay arista de habilitación; no hay ciclo por este gate.
    // Aun así revisamos el grafo del resto por si el draft quitaba un edge
    // (no aplica a create) — al editar, usamos el draft en el set.
  }

  const merged = [
    ...options.gates.filter((gate) => gate.id !== options.draft.id),
    options.draft,
  ];

  const graph = buildEnablementGraph(merged, options.designedPairs);
  const cycle = findCycleMessage(graph, options.designedPairs, merged);
  if (cycle) return { ok: false, message: cycle };

  // Autobucle: un gate que cierra A y abre A ya se cubrió; también
  // aristas from→from si expand deja el mismo átomo.
  for (const [from, tos] of graph) {
    if (tos.has(from)) {
      return {
        ok: false,
        message:
          "Un gate no puede habilitar el mismo workstream/bloque que usa como condición de cierre.",
      };
    }
  }

  return { ok: true };
}
