import "server-only";

import {
  canAccessEvent,
  canAccessEventAsMember,
} from "@/lib/admin-data";
import { getEffectiveEventActor } from "@/lib/dev-impersonation";
import type { RuntimeStepAction } from "@/lib/execution-types";
import type { RuntimeStepSummary } from "@/lib/execution-types";
import type { EventActorSummary } from "@/lib/event-actors";

type AuthUser = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
};

/** ¿Puede ver la consola/cockpit de esta ejecución? */
export async function canViewExecution(
  user: AuthUser,
  eventId: string,
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  return canAccessEventAsMember(user.email, eventId);
}

/** ¿Puede adjuntar evidencia a este paso? Admin o ejecutor asignado. */
export async function canAttachStepEvidence(input: {
  user: AuthUser;
  eventId: string;
  step: Pick<RuntimeStepSummary, "executorActorId">;
}): Promise<boolean> {
  const { user, eventId, step } = input;
  const { actor, impersonating } = await getEffectiveEventActor(eventId, user);
  const isAdmin =
    user.isSuperAdmin || (await canAccessEvent(user.email, eventId));
  if (isAdmin && !impersonating) return true;
  if (!actor) return false;
  return step.executorActorId === actor.id;
}

/**
 * ¿Puede aplicar esta acción al paso?
 * - EventAdmin / OrgAdmin / Super (sin impersonar): todo
 * - Si impersona (mock): actúa con los permisos de ese actor
 * - Ejecutor / aprobador reales: según asignación
 */
export async function canOperateExecutionStep(input: {
  user: AuthUser;
  eventId: string;
  step: Pick<
    RuntimeStepSummary,
    "executorActorId" | "approverActorIds"
  >;
  action: RuntimeStepAction;
}): Promise<boolean> {
  const { user, eventId, step, action } = input;
  const { actor, impersonating } = await getEffectiveEventActor(eventId, user);
  const isAdmin =
    user.isSuperAdmin || (await canAccessEvent(user.email, eventId));

  if (isAdmin && !impersonating) return true;
  if (!actor) return false;
  return actorCanDoAction(actor, step, action);
}

function actorCanDoAction(
  actor: EventActorSummary,
  step: Pick<RuntimeStepSummary, "executorActorId" | "approverActorIds">,
  action: RuntimeStepAction,
): boolean {
  if (action === "force_success") return actor.roles.includes("EVENT_ADMIN");

  if (action === "approve" || action === "reject") {
    if (actor.roles.includes("STEERCO")) return true;
    return step.approverActorIds.includes(actor.id);
  }

  if (
    action === "start" ||
    action === "complete_success" ||
    action === "complete_fail" ||
    action === "omit" ||
    action === "simulate"
  ) {
    return step.executorActorId === actor.id;
  }

  return false;
}
