import "server-only";

import { tool } from "ai";
import { z } from "zod";

import {
  canAccessEvent,
  canAccessOrganization,
  getEventDesign,
  getEventWorkspace,
  getOrganizationWorkspace,
  listEventActors,
} from "@/lib/admin-data";
import type { GuideZone } from "@/lib/ai/guide-zones";
import {
  listGuideKnowledgeIndex,
  searchGuideKnowledge,
} from "@/lib/ai/guide-knowledge";
import { getEventReadinessSnapshot } from "@/lib/event-readiness";
import { isMongoConfigured } from "@/lib/mongodb";

export type GuideToolContext = {
  userEmail: string;
  isSuperAdmin: boolean;
  organizationId?: string;
  eventId?: string;
  zone: GuideZone;
};

async function assertEventAccess(ctx: GuideToolContext, eventId: string) {
  if (!isMongoConfigured()) {
    return { error: "MongoDB no está configurado." } as const;
  }
  const allowed =
    ctx.isSuperAdmin || (await canAccessEvent(ctx.userEmail, eventId));
  if (!allowed) {
    return { error: "No tienes acceso a este evento." } as const;
  }
  return { ok: true } as const;
}

async function assertOrgAccess(ctx: GuideToolContext, organizationId: string) {
  if (!isMongoConfigured()) {
    return { error: "MongoDB no está configurado." } as const;
  }
  const allowed =
    ctx.isSuperAdmin ||
    (await canAccessOrganization(ctx.userEmail, organizationId));
  if (!allowed) {
    return { error: "No tienes acceso a esta organización." } as const;
  }
  return { ok: true } as const;
}

function resolveEventId(ctx: GuideToolContext, eventId?: string) {
  return eventId?.trim() || ctx.eventId || null;
}

function compactDesign(design: NonNullable<Awaited<ReturnType<typeof getEventDesign>>>) {
  return {
    event: {
      id: design.event.id,
      name: design.event.name,
      status: design.event.status,
      timezone: design.event.timezone,
      dayDStartAt: design.event.dayDStartAt,
      description: design.event.description || null,
    },
    organization: design.organization,
    workstreams: design.workstreams.map((ws) => ({
      id: ws.id,
      name: ws.name,
      description: ws.description || null,
      order: ws.order,
    })),
    blocks: design.blocks.map((block) => ({
      id: block.id,
      name: block.name,
      description: block.description || null,
      order: block.order,
    })),
    gates: design.gates.map((gate) => ({
      id: gate.id,
      name: gate.name,
      description: gate.description || null,
      plannedOpenAt: gate.plannedOpenAt,
      approvalRoles: gate.approvalRoles,
      opensTargets: gate.opensTargets,
      closesAfterTargets: gate.closesAfterTargets,
    })),
    matrix: design.pairs.map((pair) => ({
      workstream: { id: pair.workstream.id, name: pair.workstream.name },
      block: { id: pair.block.id, name: pair.block.name },
      activities: pair.activities.map((activity) => ({
        id: activity.id,
        name: activity.name,
        description: activity.description || null,
        steps: activity.steps.map((step) => ({
          id: step.id,
          name: step.name,
          description: step.description || null,
          estimatedDurationMinutes: step.estimatedDurationMinutes,
          plannedStartAt: step.plannedStartAt,
          dependencyStepIds: step.dependencyStepIds,
          requiresGateIds: step.requiresGateIds,
          producesGateId: step.producesGateId,
          executorActorId: step.executorActorId,
          approverActorIds: step.approverActorIds,
          approvalRoles: step.approvalRoles,
        })),
      })),
    })),
    counts: {
      workstreams: design.workstreams.length,
      blocks: design.blocks.length,
      gates: design.gates.length,
      activities: design.pairs.reduce(
        (sum, pair) => sum + pair.activities.length,
        0,
      ),
      steps: design.pairs.reduce(
        (sum, pair) =>
          sum +
          pair.activities.reduce(
            (inner, activity) => inner + activity.steps.length,
            0,
          ),
        0,
      ),
    },
  };
}

function withActorNames(
  compact: ReturnType<typeof compactDesign>,
  actors: Awaited<ReturnType<typeof listEventActors>>,
) {
  const byId = new Map(actors.map((actor) => [actor.id, actor.name]));
  return {
    ...compact,
    actorsIndex: actors.map((actor) => ({
      id: actor.id,
      name: actor.name,
      area: actor.area,
      roles: actor.roles,
    })),
    matrix: compact.matrix.map((pair) => ({
      ...pair,
      activities: pair.activities.map((activity) => ({
        ...activity,
        steps: activity.steps.map((step) => ({
          ...step,
          executorName: step.executorActorId
            ? (byId.get(step.executorActorId) ?? null)
            : null,
          approverNames: step.approverActorIds.map(
            (id) => byId.get(id) ?? id,
          ),
        })),
      })),
    })),
  };
}

export function createGuideTools(ctx: GuideToolContext) {
  return {
    search_knowledge_base: tool({
      description:
        "Busca en la base de conocimiento curada de ControlX (conceptos de producto). Úsala PRIMERO para preguntas de cómo funciona el sistema, antes de improvisar.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Tema o pregunta (ej. Día D, gates, readiness)."),
      }),
      execute: async ({ query }) => {
        const articles = searchGuideKnowledge({
          query,
          zone: ctx.zone,
          limit: 4,
        });
        return {
          query,
          zone: ctx.zone,
          matchCount: articles.length,
          articles,
          hint: "Responde apoyándote en estos artículos. No inventes conceptos fuera de esta base + datos del evento.",
        };
      },
    }),

    list_knowledge_topics: tool({
      description:
        "Lista los temas disponibles en la base de conocimiento del producto.",
      inputSchema: z.object({}),
      execute: async () => ({
        topics: listGuideKnowledgeIndex(),
      }),
    }),

    list_organization_events: tool({
      description:
        "Lista los eventos de la organización activa (nombre, estado, Día D, conteo de ejecuciones).",
      inputSchema: z.object({}),
      execute: async () => {
        const organizationId = ctx.organizationId;
        if (!organizationId) {
          return {
            error:
              "No hay organización en contexto. Abre la lista de eventos de una organización.",
          };
        }
        const access = await assertOrgAccess(ctx, organizationId);
        if ("error" in access) return access;

        const workspace = await getOrganizationWorkspace(organizationId);
        if (!workspace) return { error: "Organización no encontrada." };

        return {
          organization: workspace.organization,
          events: workspace.events.map((event) => ({
            id: event.id,
            name: event.name,
            status: event.status,
            timezone: event.timezone,
            dayDStartAt: event.dayDStartAt,
            executionCount: event.executionCount,
            description: event.description || null,
          })),
        };
      },
    }),

    get_event_overview: tool({
      description:
        "Obtiene resumen del evento: estado, timezone, Día D, admins y ejecuciones recientes.",
      inputSchema: z.object({
        eventId: z
          .string()
          .optional()
          .describe("Id del evento. Si se omite, usa el evento de la sesión."),
      }),
      execute: async ({ eventId }) => {
        const id = resolveEventId(ctx, eventId);
        if (!id) {
          return {
            error:
              "Indica un eventId o abre un evento concreto para consultar el overview.",
          };
        }
        const access = await assertEventAccess(ctx, id);
        if ("error" in access) return access;

        const workspace = await getEventWorkspace(id);
        if (!workspace) return { error: "Evento no encontrado." };

        return {
          organization: workspace.organization,
          event: workspace.event,
          admins: workspace.admins.map((admin) => ({
            name: admin.name,
            email: admin.email,
            role: admin.role,
          })),
          executions: workspace.executions.slice(0, 10).map((execution) => ({
            id: execution.id,
            name: execution.name,
            type: execution.type,
            status: execution.status,
            iteration: execution.iteration,
            anchorStartAt: execution.anchorStartAt,
          })),
          executionCount: workspace.executions.length,
        };
      },
    }),

    get_event_design: tool({
      description:
        "Lee el diseño completo del evento: workstreams, bloques, actividades, pasos, gates y asignaciones.",
      inputSchema: z.object({
        eventId: z
          .string()
          .optional()
          .describe("Id del evento. Si se omite, usa el evento de la sesión."),
      }),
      execute: async ({ eventId }) => {
        const id = resolveEventId(ctx, eventId);
        if (!id) {
          return {
            error:
              "Indica un eventId o abre un evento para consultar el diseño.",
          };
        }
        const access = await assertEventAccess(ctx, id);
        if ("error" in access) return access;

        const [design, actors] = await Promise.all([
          getEventDesign(id),
          listEventActors(id),
        ]);
        if (!design) return { error: "Evento no encontrado." };

        return withActorNames(compactDesign(design), actors);
      },
    }),

    search_design_steps: tool({
      description:
        "Busca pasos del diseño por texto (nombre o descripción) y devuelve coincidencias con contexto.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Texto a buscar en pasos."),
        eventId: z.string().optional(),
      }),
      execute: async ({ query, eventId }) => {
        const id = resolveEventId(ctx, eventId);
        if (!id) {
          return { error: "Necesitas un evento abierto o un eventId." };
        }
        const access = await assertEventAccess(ctx, id);
        if ("error" in access) return access;

        const [design, actors] = await Promise.all([
          getEventDesign(id),
          listEventActors(id),
        ]);
        if (!design) return { error: "Evento no encontrado." };

        const byId = new Map(actors.map((actor) => [actor.id, actor.name]));
        const needle = query.trim().toLowerCase();
        const matches: Array<Record<string, unknown>> = [];

        for (const pair of design.pairs) {
          for (const activity of pair.activities) {
            for (const step of activity.steps) {
              const haystack = `${step.name} ${step.description} ${step.longDescription}`.toLowerCase();
              if (!haystack.includes(needle)) continue;
              matches.push({
                stepId: step.id,
                stepName: step.name,
                description: step.description || null,
                workstream: pair.workstream.name,
                block: pair.block.name,
                activity: activity.name,
                executorName: step.executorActorId
                  ? (byId.get(step.executorActorId) ?? null)
                  : null,
                approverNames: step.approverActorIds.map(
                  (actorId) => byId.get(actorId) ?? actorId,
                ),
                dependencyStepIds: step.dependencyStepIds,
                requiresGateIds: step.requiresGateIds,
                plannedStartAt: step.plannedStartAt,
              });
              if (matches.length >= 25) break;
            }
            if (matches.length >= 25) break;
          }
          if (matches.length >= 25) break;
        }

        return {
          query,
          matchCount: matches.length,
          matches,
          truncated: matches.length >= 25,
        };
      },
    }),

    get_event_actors: tool({
      description:
        "Lista actores del mapa del evento con área y roles (EventAdmin, Ejecutor, Aprobador, SteerCo).",
      inputSchema: z.object({
        eventId: z.string().optional(),
      }),
      execute: async ({ eventId }) => {
        const id = resolveEventId(ctx, eventId);
        if (!id) {
          return { error: "Necesitas un evento abierto o un eventId." };
        }
        const access = await assertEventAccess(ctx, id);
        if ("error" in access) return access;

        const actors = await listEventActors(id);
        return {
          eventId: id,
          actors: actors.map((actor) => ({
            id: actor.id,
            name: actor.name,
            email: actor.email,
            area: actor.area,
            roles: actor.roles,
          })),
          count: actors.length,
        };
      },
    }),

    get_event_readiness: tool({
      description:
        "Obtiene el readiness del evento: checks de setup/diseño/roles/plan, blockers y si puede arrancar.",
      inputSchema: z.object({
        eventId: z.string().optional(),
      }),
      execute: async ({ eventId }) => {
        const id = resolveEventId(ctx, eventId);
        if (!id) {
          return { error: "Necesitas un evento abierto o un eventId." };
        }
        const access = await assertEventAccess(ctx, id);
        if ("error" in access) return access;

        const readiness = await getEventReadinessSnapshot(id);
        if (!readiness) return { error: "No hay readiness para este evento." };

        return {
          eventId: readiness.eventId,
          canStart: readiness.canStart,
          blockers: readiness.blockers,
          summary: readiness.summary,
          stale: readiness.stale,
          computedAt: readiness.computedAt,
          setup: readiness.setup,
          design: readiness.design,
          roles: readiness.roles,
          plan: readiness.plan,
        };
      },
    }),
  };
}
