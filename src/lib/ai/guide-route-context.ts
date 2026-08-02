import type { GuideZone } from "@/lib/ai/guide-zones";

export type GuideRouteContext = {
  zone: GuideZone;
  organizationId?: string;
  eventId?: string;
};

/**
 * Infere zona y ids del asistente a partir de la URL actual.
 * La org del hub móvil viene en ?org= (elegida en login / elegir-organizacion).
 */
export function resolveGuideContext(
  pathname: string,
  searchParams?: URLSearchParams | { get(name: string): string | null },
): GuideRouteContext {
  const orgFromQuery = searchParams?.get("org")?.trim() || undefined;

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
      organizationId: orgFromQuery,
    };
  }

  if (pathname.startsWith("/ejecuciones")) {
    return { zone: "executions", organizationId: orgFromQuery };
  }

  if (pathname.startsWith("/run/")) {
    return { zone: "executions", organizationId: orgFromQuery };
  }

  if (pathname.startsWith("/elegir-organizacion")) {
    return { zone: "events" };
  }

  return { zone: "events", organizationId: orgFromQuery };
}
