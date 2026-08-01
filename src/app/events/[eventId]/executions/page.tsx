import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { EventExecutions } from "@/components/event-executions";
import {
  canAccessEvent,
  getEventWorkspace,
  listEventActors,
} from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { canUseDevActorImpersonation } from "@/lib/dev-impersonation";
import { getEventReadinessSnapshot } from "@/lib/event-readiness";

export default async function EventExecutionsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const canAccess =
    user.isSuperAdmin || (await canAccessEvent(user.email, eventId));
  if (!canAccess) redirect("/");

  const canImpersonate = canUseDevActorImpersonation(user);
  const [workspace, readiness, actors] = await Promise.all([
    getEventWorkspace(eventId),
    getEventReadinessSnapshot(eventId),
    canImpersonate ? listEventActors(eventId) : Promise.resolve([]),
  ]);
  if (!workspace || !readiness) notFound();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        homeHref="/ejecuciones"
        crumbs={[
          { label: workspace.event.name, href: `/events/${eventId}` },
          { label: "Ejecuciones" },
        ]}
      />

      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 py-4">
        <section className="mb-4 shrink-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Ejecuciones
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Simulacros y corridas reales del evento. Crea, abre la consola o
            entra a Mi turno.
          </p>
        </section>
        <div className="min-h-0 flex-1">
          <EventExecutions
            event={workspace.event}
            initialExecutions={workspace.executions}
            initialReadiness={readiness}
            canImpersonate={canImpersonate}
            actors={actors}
          />
        </div>
      </main>
    </div>
  );
}
