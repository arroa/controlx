import type { GuideZone } from "@/lib/ai/guide-zones";

export type GuideRouteContext = {
  zone: GuideZone;
  organizationId?: string;
  eventId?: string;
};

/**
 * Infere zona y ids del asistente a partir de la URL actual.
 */
export function resolveGuideContext(pathname: string): GuideRouteContext {
  const orgMatch = pathname.match(/^\/organizations\/([^/]+)/);
  if (orgMatch?.[1]) {
    return { zone: "events", organizationId: orgMatch[1] };
  }

  const eventMatch = pathname.match(/^\/events\/([^/]+)(?:\/([^/]+))?/);
  if (eventMatch?.[1]) {
    const eventId = eventMatch[1];
    const section = eventMatch[2];
    const bySection: Record<string, GuideZone> = {
      setup: "setup",
      design: "design",
      roles: "roles",
      plan: "plan",
      executions: "executions",
    };
    return {
      zone: section && bySection[section] ? bySection[section] : "overview",
      eventId,
    };
  }

  if (pathname.startsWith("/run/") || pathname.startsWith("/ejecuciones")) {
    return { zone: "executions" };
  }

  return { zone: "events" };
}
