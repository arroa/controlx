import "server-only";

import { tool } from "ai";
import { z } from "zod";

import {
  canAccessEvent,
  canAccessOrganization,
  getEventDesign,
  getEventWorkspace,
  getOrganizationWorkspace,
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

/** Diseño sin PII: sin nombres, emails ni ids de actores. */
function compactDesign(
  design: NonNullable<Awaited<ReturnType<typeof getEventDesign>>>,
) {
  let stepsWithoutExecutor = 0;
  let stepsWithoutApprover = 0;
  let stepCount = 0;

  const matrix = design.pairs.map((pair) => ({
    workstream: { id: pair.workstream.id, name: pair.workstream.name },
    block: { id: pair.block.id, name: pair.block.name },
    activities: pair.activities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      description: activity.description || null,
      steps: activity.steps.map((step) => {
        stepCount += 1;
        const hasExecutor = Boolean(step.executorActorId);
        const approverCount = step.approverActorIds?.length ?? 0;
        if (!hasExecutor) stepsWithoutExecutor += 1;
        if (approverCount === 0) stepsWithoutApprover += 1;
        return {
          id: step.id,
          name: step.name,
          description: step.description || null,
          estimatedDurationMinutes: step.estimatedDurationMinutes,
          plannedStartAt: step.plannedStartAt,
          dependencyStepIds: step.dependencyStepIds,
          requiresGateIds: step.requiresGateIds,
          producesGateId: step.producesGateId,
          hasExecutor,
          approverCount,
          approvalRoles: step.approvalRoles,
        };
      }),
    })),
  }));

  return {
    event: {
      id: design.event.id,
      name: design.event.name,
      status: design.event.status,
      timezone: design.event.timezone,
      dayDStartAt: design.event.dayDStartAt,
      description: design.event.description || null,
    },
    organization: design.organization
      ? { id: design.organization.id, name: design.organization.name }
      : null,
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
    matrix,
    counts: {
      workstreams: design.workstreams.length,
      blocks: design.blocks.length,
      gates: design.gates.length,
      activities: design.pairs.reduce(
        (sum, pair) => sum + pair.activities.length,
        0,
      ),
      steps: stepCount,
      stepsWithoutExecutor,
      stepsWithoutApprover,
    },
    privacy:
      "Sin datos de personas (nombres, emails, admins, actores). Solo cobertura de asignación (sí/no y conteos).",
  };
}

export function createGuideTools(ctx: GuideToolContext) {
  return {
    search_knowledge_base: tool({
      description:
        "Busca en la base de conocimiento curada de ControlX (conceptos de producto). Úsala PRIMERO para 'cómo funciona', 'ayuda con roles/setup/diseño/plan', etc.",
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
        "Lista los eventos de la organización activa (nombre, estado, Día D, conteo de ejecuciones). Sin personas.",
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
          organization: {
            id: workspace.organization.id,
            name: workspace.organization.name,
            status: workspace.organization.status,
          },
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
        "Resumen del evento: estado, timezone, Día D y ejecuciones recientes. Sin admins ni personas.",
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
          organization: workspace.organization
            ? {
                id: workspace.organization.id,
                name: workspace.organization.name,
              }
            : null,
          event: workspace.event,
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
        "Lee el diseño del evento (workstreams, bloques, actividades, pasos, gates). Solo indica si cada paso tiene ejecutor/aprobadores (booleans/conteos), sin nombres de personas.",
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

        const design = await getEventDesign(id);
        if (!design) return { error: "Evento no encontrado." };

        return compactDesign(design);
      },
    }),

    search_design_steps: tool({
      description:
        "Busca pasos del diseño por texto. Devuelve contexto estructural y cobertura de roles (sí/no), sin nombres de personas.",
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

        const design = await getEventDesign(id);
        if (!design) return { error: "Evento no encontrado." };

        const needle = query.trim().toLowerCase();
        const matches: Array<Record<string, unknown>> = [];

        for (const pair of design.pairs) {
          for (const activity of pair.activities) {
            for (const step of activity.steps) {
              const haystack =
                `${step.name} ${step.description} ${step.longDescription}`.toLowerCase();
              if (!haystack.includes(needle)) continue;
              matches.push({
                stepId: step.id,
                stepName: step.name,
                description: step.description || null,
                workstream: pair.workstream.name,
                block: pair.block.name,
                activity: activity.name,
                hasExecutor: Boolean(step.executorActorId),
                approverCount: step.approverActorIds?.length ?? 0,
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

    get_event_readiness: tool({
      description:
        "Obtiene el readiness del evento: checks de setup/diseño/roles/plan, blockers y si puede arrancar. Sin listados de personas.",
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
