import "server-only";

import { cookies } from "next/headers";

import { getEventActorByEmail, listEventActors } from "@/lib/admin-data";
import type { EventActorSummary } from "@/lib/event-actors";
import type { CurrentUser } from "@/lib/current-user";
import { isDevBypassEnabled } from "@/lib/dev-flags";

export const DEV_ACTOR_COOKIE = "controlx_act_as";

/** Solo mock/dev — nunca en producción. */
export function isDevActorImpersonationEnabled(): boolean {
  return (
    process.env.CONTROLX_DEV_ACTOR_IMPERSONATION === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export function canUseDevActorImpersonation(user: CurrentUser): boolean {
  if (!isDevActorImpersonationEnabled()) return false;
  return user.isSuperAdmin || isDevBypassEnabled();
}

export function encodeActAsCookie(eventId: string, actorId: string) {
  return `${eventId}:${actorId}`;
}

export function parseActAsCookie(
  raw: string | undefined,
): { eventId: string; actorId: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx <= 0) return null;
  const eventId = raw.slice(0, idx);
  const actorId = raw.slice(idx + 1);
  if (!eventId || !actorId) return null;
  return { eventId, actorId };
}

export async function readActAsCookie(): Promise<{
  eventId: string;
  actorId: string;
} | null> {
  const jar = await cookies();
  return parseActAsCookie(jar.get(DEV_ACTOR_COOKIE)?.value);
}

/**
 * Actor efectivo en el evento: impersonación mock si aplica,
 * si no el membership del email logueado.
 */
export async function getEffectiveEventActor(
  eventId: string,
  user: CurrentUser,
): Promise<{
  actor: EventActorSummary | null;
  impersonating: boolean;
}> {
  if (canUseDevActorImpersonation(user)) {
    const actAs = await readActAsCookie();
    if (actAs?.eventId === eventId) {
      const actors = await listEventActors(eventId);
      const actor = actors.find((item) => item.id === actAs.actorId) ?? null;
      if (actor) return { actor, impersonating: true };
    }
  }

  const actor = await getEventActorByEmail(eventId, user.email);
  return { actor, impersonating: false };
}
