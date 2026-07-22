import "server-only";

import { ObjectId } from "mongodb";

import { getEventDesign } from "@/lib/admin-data";
import {
  loadStoredEventReadiness,
  markEventReadinessStale,
  saveEventReadinessSnapshot,
} from "@/lib/event-readiness-store";
import type {
  EventReadiness,
  ReadinessCheck,
  ReadinessTone,
} from "@/lib/event-readiness-types";
import { getDatabase } from "@/lib/mongodb";

export type {
  EventReadiness,
  ReadinessCheck,
  ReadinessTone,
} from "@/lib/event-readiness-types";

export { markEventReadinessStale } from "@/lib/event-readiness-store";

function worstTone(tones: ReadinessTone[]): ReadinessTone {
  if (tones.includes("blocked")) return "blocked";
  if (tones.includes("empty")) return "empty";
  if (tones.includes("warn")) return "warn";
  return "ready";
}

type PlanStepLike = {
  plannedStartAt: string | null;
  dependencyStepIds: string[];
  requiresGateIds: string[];
};

/**
 * Un paso puede arrancar si tiene condición de inicio:
 * deps, gate, ancla "no antes de", o es raíz con Día D (T0).
 */
function stepCanStart(step: PlanStepLike, hasDayD: boolean): boolean {
  if ((step.dependencyStepIds ?? []).length > 0) return true;
  if ((step.requiresGateIds ?? []).length > 0) return true;
  if (step.plannedStartAt) return true;
  return hasDayD;
}

/** Cálculo en vivo (sin persistir). */
export async function computeEventReadiness(
  eventId: string,
): Promise<Omit<EventReadiness, "stale" | "computedAt" | "aiAnalysis"> | null> {
  const design = await getEventDesign(eventId);
  if (!design) return null;

  const steps = design.pairs.flatMap((pair) =>
    pair.activities.flatMap((activity) => activity.steps),
  );
  const workstreamCount = design.workstreams.length;
  const blockCount = design.blocks.length;
  const stepCount = steps.length;
  const withoutExecutor = steps.filter((step) => !step.executorActorId).length;
  const withoutApprover = steps.filter(
    (step) => (step.approverActorIds ?? []).length === 0,
  ).length;
  const hasDayD = Boolean(design.event.dayDStartAt);
  const withoutStartCondition = steps.filter(
    (step) => !stepCanStart(step, hasDayD),
  ).length;

  const database = await getDatabase();
  const actors = await database.collection("eventMemberships").countDocuments({
    eventId: new ObjectId(eventId),
    status: "ACTIVE",
  });

  const setup: ReadinessCheck[] = [
    {
      id: "day-d",
      label: "Día D",
      detail: design.event.dayDStartAt
        ? "Origen de timeline definido"
        : "Falta definir el Día D",
      tone: design.event.dayDStartAt ? "ready" : "blocked",
      href: `/events/${eventId}/setup`,
    },
    {
      id: "actors",
      label: "Actores",
      detail:
        actors > 0
          ? `${actors} actor(es) en el mapa`
          : "Sin actores en el mapa",
      tone: actors > 0 ? "ready" : "warn",
      href: `/events/${eventId}/setup`,
    },
    {
      id: "workstreams",
      label: "Workstreams",
      detail:
        workstreamCount > 0
          ? `${workstreamCount} workstream(s)`
          : "Sin workstreams",
      tone: workstreamCount > 0 ? "ready" : "blocked",
      href: `/events/${eventId}/setup`,
    },
    {
      id: "blocks",
      label: "Bloques",
      detail: blockCount > 0 ? `${blockCount} bloque(s)` : "Sin bloques",
      tone: blockCount > 0 ? "ready" : "blocked",
      href: `/events/${eventId}/setup`,
    },
  ];

  const designChecks: ReadinessCheck[] = [
    {
      id: "steps",
      label: "Pasos de diseño",
      detail:
        stepCount > 0
          ? `${stepCount} paso(s) definidos`
          : "Todavía no hay pasos",
      tone: stepCount > 0 ? "ready" : "blocked",
      href: `/events/${eventId}/design`,
    },
  ];

  const roles: ReadinessCheck[] = [
    {
      id: "executors",
      label: "Ejecutores",
      detail:
        stepCount === 0
          ? "Sin pasos que asignar"
          : withoutExecutor === 0
            ? "Todos los pasos tienen ejecutor"
            : `${withoutExecutor} pasos sin ejecutor`,
      tone:
        stepCount === 0
          ? "empty"
          : withoutExecutor === 0
            ? "ready"
            : "blocked",
      href: `/events/${eventId}/roles`,
    },
    {
      id: "approvers",
      label: "Aprobadores",
      detail:
        stepCount === 0
          ? "Sin pasos"
          : withoutApprover === 0
            ? "Todos los pasos tienen aprobador"
            : `Aviso: ${withoutApprover} pasos sin aprobador (opcional)`,
      tone:
        stepCount === 0
          ? "empty"
          : withoutApprover === 0
            ? "ready"
            : "warn",
      href: `/events/${eventId}/roles`,
    },
  ];

  const plan: ReadinessCheck[] = [
    {
      id: "startable",
      label: "Condición de arranque",
      detail:
        stepCount === 0
          ? "Sin pasos"
          : withoutStartCondition === 0
            ? "Todos los pasos pueden arrancar"
            : `${withoutStartCondition} pasos sin condición de arranque`,
      tone:
        stepCount === 0
          ? "empty"
          : withoutStartCondition === 0
            ? "ready"
            : "blocked",
      href: `/events/${eventId}/plan`,
    },
  ];

  const blockers: string[] = [];
  if (!design.event.dayDStartAt) blockers.push("Falta definir el Día D");
  if (workstreamCount === 0) blockers.push("Falta al menos un workstream");
  if (blockCount === 0) blockers.push("Falta al menos un bloque");
  if (stepCount === 0) blockers.push("Falta al menos un paso");
  if (withoutExecutor > 0) {
    blockers.push(`${withoutExecutor} pasos sin ejecutor`);
  }
  if (withoutStartCondition > 0) {
    blockers.push(
      `${withoutStartCondition} pasos sin condición de arranque`,
    );
  }

  return {
    eventId,
    setup,
    design: designChecks,
    roles,
    plan,
    canStart: blockers.length === 0,
    blockers,
    summary: {
      setup: worstTone(setup.map((c) => c.tone)),
      design: worstTone(designChecks.map((c) => c.tone)),
      roles: worstTone(roles.map((c) => c.tone)),
      plan: worstTone(plan.map((c) => c.tone)),
    },
  };
}

/** Recalcula, persiste snapshot y limpia el flag stale. */
export async function recomputeEventReadiness(
  eventId: string,
): Promise<EventReadiness | null> {
  const computed = await computeEventReadiness(eventId);
  if (!computed) return null;
  const computedAt = await saveEventReadinessSnapshot(eventId, computed);
  return {
    ...computed,
    stale: false,
    computedAt: computedAt.toISOString(),
    aiAnalysis: null,
  };
}

/**
 * Para el hub: si está stale o nunca se calculó, recalcula.
 * Si está fresco, sirve el snapshot (barato).
 */
export async function getEventReadiness(
  eventId: string,
): Promise<EventReadiness | null> {
  const stored = await loadStoredEventReadiness(eventId);
  if (!stored || stored.stale || !stored.computedAt) {
    return recomputeEventReadiness(eventId);
  }

  return {
    eventId,
    setup: stored.setup,
    design: stored.design,
    roles: stored.roles,
    plan: stored.plan,
    canStart: stored.canStart,
    blockers: stored.blockers,
    summary: stored.summary,
    stale: false,
    computedAt: stored.computedAt.toISOString(),
    aiAnalysis: stored.aiAnalysis ?? null,
  };
}

/** Vista del hub: no auto-recalcula si solo está stale (hay que pulsar Recalcular). */
export async function getEventReadinessSnapshot(
  eventId: string,
): Promise<EventReadiness | null> {
  const stored = await loadStoredEventReadiness(eventId);

  // Primera vez: calcula y persiste.
  if (!stored || !stored.computedAt) {
    return recomputeEventReadiness(eventId);
  }

  const stale = Boolean(stored.stale);
  return {
    eventId,
    setup: stored.setup ?? [],
    design: stored.design ?? [],
    roles: stored.roles ?? [],
    plan: stored.plan ?? [],
    canStart: stale ? false : stored.canStart,
    blockers: stale
      ? ["Hay cambios de preparación · recalcula el readiness"]
      : stored.blockers,
    summary: stored.summary ?? {
      setup: "empty",
      design: "empty",
      roles: "empty",
      plan: "empty",
    },
    stale,
    computedAt: stored.computedAt.toISOString(),
    aiAnalysis: stored.aiAnalysis ?? null,
  };
}

export async function assertCanCreateExecution(
  eventId: string,
  type: "SIMULACRO" | "REAL",
) {
  const stored = await loadStoredEventReadiness(eventId);
  if (!stored || stored.stale || !stored.computedAt) {
    throw new Error(
      "El readiness está desactualizado. Recalcula en el hub del evento antes de ejecutar.",
    );
  }
  if (!stored.canStart) {
    throw new Error(
      `Readiness incompleto para ${type === "REAL" ? "ejecución real" : "simulacro"}: ${stored.blockers.join(" · ")}`,
    );
  }
  return stored;
}
