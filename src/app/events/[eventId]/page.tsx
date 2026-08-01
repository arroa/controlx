import { Command } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { DevActorSwitcher } from "@/components/dev-actor-switcher";
import { EventWorkspace } from "@/components/event-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getEventWorkspace,
  getEventWorkspaceRole,
  listEventActors,
} from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import {
  canUseDevActorImpersonation,
  getEffectiveEventActor,
} from "@/lib/dev-impersonation";
import { getEventReadinessSnapshot } from "@/lib/event-readiness";

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const role = await getEventWorkspaceRole(
    user.email,
    eventId,
    user.isSuperAdmin,
  );
  if (!role) redirect("/");

  const workspace = await getEventWorkspace(eventId);
  if (!workspace) notFound();

  const readiness = await getEventReadinessSnapshot(eventId);
  if (!readiness) notFound();

  const showImpersonation = canUseDevActorImpersonation(user);
  const actors = showImpersonation ? await listEventActors(eventId) : [];
  const { actor, impersonating } = showImpersonation
    ? await getEffectiveEventActor(eventId, user)
    : { actor: null, impersonating: false };

  const homeHref =
    role === "SuperAdmin"
      ? "/dashboard"
      : role === "OrgAdmin" && workspace.organization
        ? `/organizations/${workspace.organization.id}`
        : "/ejecuciones";

  const crumbs = [
    ...(workspace.organization
      ? [
          {
            label: workspace.organization.name,
            href:
              role === "SuperAdmin" || role === "OrgAdmin"
                ? `/organizations/${workspace.organization.id}`
                : undefined,
          },
        ]
      : []),
    { label: workspace.event.name },
  ];

  return (
    <div className="min-h-screen">
      <AppHeader
        homeHref={homeHref}
        crumbs={crumbs}
        actions={
          showImpersonation ? (
            <DevActorSwitcher
              eventId={eventId}
              actors={actors}
              selectedActorId={impersonating && actor ? actor.id : null}
            />
          ) : null
        }
      />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Evento</p>
              <Badge variant="outline">{workspace.event.status}</Badge>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {workspace.event.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {workspace.event.description || "Sin descripción"} ·{" "}
              {workspace.event.timezone}
            </p>
            {workspace.event.status === "ARCHIVED" ? (
              <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100/90">
                Este evento está archivado. Solo consulta; no se pueden crear
                ejecuciones ni modificar la preparación.
              </div>
            ) : null}
          </div>

          {workspace.event.status !== "ARCHIVED" ? (
            <Button
              asChild
              className="h-14 shrink-0 gap-2.5 bg-primary px-6 text-base text-primary-foreground shadow-sm hover:bg-primary/90 sm:self-center"
            >
              <Link href={`/events/${eventId}/executions`}>
                <Command className="size-5" />
                Ejecuciones
              </Link>
            </Button>
          ) : null}
        </section>

        <EventWorkspace
          event={workspace.event}
          readiness={readiness}
          readOnly={workspace.event.status === "ARCHIVED"}
        />
      </main>
    </div>
  );
}
