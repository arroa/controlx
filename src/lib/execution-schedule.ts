const DEFAULT_DURATION_MINUTES = 30;

/** Día civil YYYY-MM-DD en una zona horaria. */
export function calendarDayKey(isoOrDate: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoOrDate));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** Etiqueta corta dd/mm/yyyy en TZ. */
export function formatDayLabel(isoOrDate: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoOrDate));
}

export type ScheduleStepInput = {
  id: string;
  plannedStartAt: string | null;
  estimatedDurationMinutes: number | null;
  dependencyStepIds: string[];
  producesGateId: string | null;
  requiresGateIds: string[];
  workstreamId: string;
  blockId: string;
};

export type ScheduleGateInput = {
  id: string;
  plannedOpenAt: string | null;
};

/**
 * Calcula plannedStartAt absoluto por paso usando T0 de la instancia
 * (día de arranque simulado o Día D real) + deps/gates/anclas del diseño.
 */
export function computeRuntimePlannedStarts(input: {
  steps: ScheduleStepInput[];
  gates: ScheduleGateInput[];
  /** T0 de diseño (Día D del evento); anclas absolutas se miden desde aquí. */
  designDayDStartAt: string | null;
  /** T0 de esta ejecución. */
  instanceAnchorStartAt: Date;
}): Map<string, Date> {
  const rows = input.steps;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const producerByGate = new Map<string, string>();
  for (const row of rows) {
    if (row.producesGateId) producerByGate.set(row.producesGateId, row.id);
  }

  const designT0Ms = input.designDayDStartAt
    ? new Date(input.designDayDStartAt).getTime()
    : null;

  const toOffsetMin = (iso: string) => {
    if (designT0Ms == null) return 0;
    return Math.max(
      0,
      Math.round((new Date(iso).getTime() - designT0Ms) / 60_000),
    );
  };

  const inbound = new Map(rows.map((row) => [row.id, 0]));
  const outgoing = new Map<string, string[]>(rows.map((row) => [row.id, []]));

  function addEdge(fromId: string, toId: string) {
    if (!byId.has(fromId) || !byId.has(toId) || fromId === toId) return;
    inbound.set(toId, (inbound.get(toId) ?? 0) + 1);
    outgoing.get(fromId)?.push(toId);
  }

  for (const row of rows) {
    for (const depId of row.dependencyStepIds) addEdge(depId, row.id);
    for (const gateId of row.requiresGateIds) {
      const producerId = producerByGate.get(gateId);
      if (producerId) addEdge(producerId, row.id);
    }
  }

  const queue = rows
    .filter((row) => (inbound.get(row.id) ?? 0) === 0)
    .map((row) => row.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const remaining = (inbound.get(next) ?? 0) - 1;
      inbound.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  for (const row of rows) {
    if (!order.includes(row.id)) order.push(row.id);
  }

  type Item = { startMin: number; endMin: number };
  const items = new Map<string, Item>();

  for (const id of order) {
    const row = byId.get(id)!;
    const depEnds = row.dependencyStepIds
      .map((depId) => items.get(depId)?.endMin)
      .filter((value): value is number => value != null);

    const gateEnds: number[] = [];
    for (const gateId of row.requiresGateIds) {
      const producerId = producerByGate.get(gateId);
      if (producerId) {
        const end = items.get(producerId)?.endMin;
        if (end != null) gateEnds.push(end);
      }
      const gate = input.gates.find((item) => item.id === gateId);
      if (gate?.plannedOpenAt && designT0Ms != null) {
        gateEnds.push(toOffsetMin(gate.plannedOpenAt));
      }
    }

    const anchored =
      row.plannedStartAt && designT0Ms != null
        ? toOffsetMin(row.plannedStartAt)
        : undefined;

    const startMin =
      anchored !== undefined
        ? Math.max(anchored, ...depEnds, ...gateEnds, 0)
        : Math.max(0, ...depEnds, ...gateEnds);

    const durationMin =
      row.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES;
    items.set(id, { startMin, endMin: startMin + durationMin });
  }

  const instanceT0 = input.instanceAnchorStartAt.getTime();
  const result = new Map<string, Date>();
  for (const [id, item] of items) {
    result.set(id, new Date(instanceT0 + item.startMin * 60_000));
  }
  return result;
}
