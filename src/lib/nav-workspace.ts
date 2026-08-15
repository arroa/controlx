import "server-only";

import { canAccessOrganization } from "@/lib/admin-data";
import { getExecutionAccessContext } from "@/lib/execution-runtime";
import {
  listAccessibleEventsForUser,
  listAccessibleOrganizationsForUser,
} from "@/lib/my-executions";
import { getWorkspaceContext } from "@/lib/workspace-context";

export type NavWorkspaceModel = {
  roleLabel: string;
  organizationId: string | null;
  organizationName: string | null;
  eventId: string | null;
  eventName: string | null;
  ejecucionesHref: string;
  eventosHref: string | null;
  /** Panel / lista de orgs (también sirve para cambiar). */
  organizacionesHref: string | null;
  /** Hub de preparación del evento contextual (ejecución o sticky). */
  eventAdminHref: string | null;
  eventDesignHref: string | null;
  eventRolesHref: string | null;
  eventPlanHref: string | null;
  changeEventHref: string | null;
  orgCount: number;
  eventCount: number;
};

function idsFromPathname(pathname: string): {
  eventId: string | null;
  executionId: string | null;
} {
  const path = pathname.split("?")[0] ?? pathname;
  const eventMatch = path.match(/^\/events\/([^/]+)/);
  if (eventMatch?.[1]) {
    return { eventId: eventMatch[1], executionId: null };
  }
  const runMatch = path.match(/^\/run\/([^/]+)/);
  if (runMatch?.[1]) {
    return { eventId: null, executionId: runMatch[1] };
  }
  return { eventId: null, executionId: null };
}

export async function getNavWorkspaceModel(input: {
  email: string;
  isSuperAdmin: boolean;
  isMobile: boolean;
  pathname?: string;
}): Promise<NavWorkspaceModel> {
  const ctx = await getWorkspaceContext();
  const fromPath = idsFromPathname(input.pathname ?? "");
  const orgs = await listAccessibleOrganizationsForUser(input.email, {
    isSuperAdmin: input.isSuperAdmin,
  });
  const orgCount = orgs.length;

  let organizationId = ctx.organizationId;
  if (organizationId && !orgs.some((o) => o.id === organizationId)) {
    organizationId = null;
  }
  if (!organizationId && orgCount === 1) {
    organizationId = orgs[0]!.id;
  }

  const events = await listAccessibleEventsForUser(input.email, {
    isSuperAdmin: input.isSuperAdmin,
    organizationId: organizationId ?? undefined,
  });
  const eventCount = events.length;

  let eventId = fromPath.eventId ?? ctx.eventId;
  if (eventId && !events.some((e) => e.id === eventId)) {
    eventId = null;
  }
  if (!eventId && fromPath.executionId) {
    const execution = await getExecutionAccessContext(fromPath.executionId);
    if (execution && events.some((e) => e.id === execution.eventId)) {
      eventId = execution.eventId;
    } else if (execution && input.isSuperAdmin) {
      eventId = execution.eventId;
    }
  }

  const orgAdminFlags = input.isSuperAdmin
    ? orgs.map(() => true)
    : await Promise.all(orgs.map((o) => canAccessOrganization(input.email, o.id)));
  const isOrgAdminAnywhere = input.isSuperAdmin || orgAdminFlags.some(Boolean);
  const isOrgAdminOfActive = Boolean(
    organizationId &&
      (input.isSuperAdmin ||
        orgAdminFlags[orgs.findIndex((o) => o.id === organizationId)] === true),
  );

  const isEventAdminSomewhere = events.some(
    (e) => e.isOrgAdmin || e.roles.includes("EVENT_ADMIN"),
  );

  let roleLabel = "Operador";
  if (input.isSuperAdmin) roleLabel = "SuperAdmin";
  else if (isOrgAdminAnywhere) roleLabel = "OrgAdmin";
  else if (isEventAdminSomewhere) roleLabel = "EventAdmin";

  const ejecucionesHref = organizationId
    ? `/ejecuciones?org=${organizationId}`
    : "/ejecuciones";

  // Panel natural de eventos:
  // - Super/OrgAdmin → workspace de la org (catálogo real)
  // - EventAdmin / resto → lista /eventos (sin acceso al workspace de org)
  let eventosHref: string | null = null;
  if (organizationId && (input.isSuperAdmin || isOrgAdminOfActive)) {
    eventosHref = `/organizations/${organizationId}`;
  } else if (
    isEventAdminSomewhere ||
    eventCount > 0 ||
    input.isSuperAdmin
  ) {
    eventosHref = organizationId
      ? `/eventos?org=${organizationId}`
      : "/eventos";
  }

  let organizacionesHref: string | null = null;
  if (input.isSuperAdmin) {
    // Panel de organizaciones (= también “cambiar”).
    organizacionesHref = "/dashboard";
  } else if (orgCount > 1) {
    organizacionesHref = "/elegir-organizacion";
  } else if (organizationId && isOrgAdminOfActive) {
    organizacionesHref = `/organizations/${organizationId}`;
  }

  let eventAdminHref: string | null = null;
  let eventDesignHref: string | null = null;
  let eventRolesHref: string | null = null;
  let eventPlanHref: string | null = null;
  if (eventId) {
    const ev = events.find((e) => e.id === eventId);
    const canPrep =
      input.isSuperAdmin ||
      ev?.isOrgAdmin ||
      ev?.roles.includes("EVENT_ADMIN");
    if (canPrep) {
      eventAdminHref = `/events/${eventId}`;
      eventDesignHref = `/events/${eventId}/design`;
      eventRolesHref = `/events/${eventId}/roles`;
      eventPlanHref = `/events/${eventId}/plan`;
    }
  }

  return {
    roleLabel,
    organizationId,
    organizationName: organizationId
      ? (orgs.find((o) => o.id === organizationId)?.name ?? null)
      : null,
    eventId,
    eventName: eventId
      ? (events.find((e) => e.id === eventId)?.name ?? null)
      : null,
    ejecucionesHref,
    eventosHref,
    organizacionesHref,
    eventAdminHref,
    eventDesignHref,
    eventRolesHref,
    eventPlanHref,
    changeEventHref: null,
    orgCount,
    eventCount,
  };
}
