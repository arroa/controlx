import "server-only";

import { canAccessOrganization } from "@/lib/admin-data";
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
  /** Setup del evento activo — solo PC. */
  eventAdminHref: string | null;
  changeEventHref: string | null;
  orgCount: number;
  eventCount: number;
};

export async function getNavWorkspaceModel(input: {
  email: string;
  isSuperAdmin: boolean;
  isMobile: boolean;
}): Promise<NavWorkspaceModel> {
  const ctx = await getWorkspaceContext();
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

  let eventId = ctx.eventId;
  if (eventId && !events.some((e) => e.id === eventId)) {
    eventId = null;
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
  if (!input.isMobile && eventId) {
    const ev = events.find((e) => e.id === eventId);
    if (
      input.isSuperAdmin ||
      ev?.isOrgAdmin ||
      ev?.roles.includes("EVENT_ADMIN")
    ) {
      eventAdminHref = `/events/${eventId}/setup`;
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
    // Eventos ya es el catálogo/cambio; no duplicar “Cambiar evento”.
    changeEventHref: null,
    orgCount,
    eventCount,
  };
}
