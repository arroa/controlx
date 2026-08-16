import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { EventSetup } from "@/components/event-setup";
import {
  canAccessEvent,
  canManageEventAdmins,
  getEventDesign,
  listEventActors,
} from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

export default async function EventSetupPage({
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

  const [setup, actors] = await Promise.all([
    getEventDesign(eventId),
    listEventActors(eventId),
  ]);
  if (!setup) notFound();

  const canManageEventAdminRole =
    user.isSuperAdmin ||
    (await canManageEventAdmins(user.email, eventId));

  return (
    <div className="min-h-screen">
      <AppHeader
        homeHref={user.isSuperAdmin ? "/dashboard" : "/ejecuciones"}
        crumbs={[
          { label: setup.event.name, href: `/events/${eventId}` },
          { label: "Setup" },
        ]}
      />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-8">
          <p className="text-sm text-muted-foreground">Paso 1 de 4</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Setup del evento
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Define actores, el inicio del Día D y los catálogos cerrados de
            workstreams y bloques.
          </p>
        </section>
        <EventSetup
          eventId={eventId}
          eventName={setup.event.name}
          eventTimezone={setup.event.timezone}
          initialDayDStartAt={setup.event.dayDStartAt}
          initialWorkstreams={setup.workstreams}
          initialBlocks={setup.blocks}
          initialActors={actors}
          canManageEventAdminRole={canManageEventAdminRole}
        />
      </main>
    </div>
  );
}
