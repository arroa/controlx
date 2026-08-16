import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { EventPlanner } from "@/components/event-planner";
import { canAccessEvent, getEventDesign } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

export default async function EventPlanPage({
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

  const design = await getEventDesign(eventId);
  if (!design) notFound();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        homeHref={user.isSuperAdmin ? "/dashboard" : "/ejecuciones"}
        crumbs={[
          { label: design.event.name, href: `/events/${eventId}` },
          { label: "Planificador" },
        ]}
      />

      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 py-4">
        <section className="mb-4 shrink-0">
          <p className="text-sm text-muted-foreground">Paso 4 de 4</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Planificador
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            En Lista de Pasos defines deps, gates, aprobaciones y hora. Vista
            Panorámica muestra el cronograma con zoom y pan.
          </p>
        </section>
        <div className="min-h-0 flex-1 overflow-hidden">
        <EventPlanner
          eventId={eventId}
          eventTimezone={design.event.timezone}
          dayDStartAt={design.event.dayDStartAt}
          pairs={design.pairs}
          initialGates={design.gates}
        />
        </div>
      </main>
    </div>
  );
}
