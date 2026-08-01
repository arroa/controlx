import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { EventRoles } from "@/components/event-roles";
import {
  canAccessEvent,
  getEventDesign,
  listEventActors,
} from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { pairsToRoleSteps } from "@/lib/role-steps";

/** Siempre fresco: actores de Setup deben verse al entrar a Roles. */
export const dynamic = "force-dynamic";

export default async function EventRolesPage({
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

  const [design, actors] = await Promise.all([
    getEventDesign(eventId),
    listEventActors(eventId),
  ]);
  if (!design) notFound();

  const steps = pairsToRoleSteps(design.pairs);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        homeHref={user.isSuperAdmin ? "/dashboard" : "/ejecuciones"}
        crumbs={[
          { label: design.event.name, href: `/events/${eventId}` },
          { label: "Roles" },
        ]}
      />

      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 py-4">
        <section className="mb-4 shrink-0">
          <p className="text-sm text-muted-foreground">Paso 3 de 4</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Roles del evento
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Una sola lista de pasos: elige un actor y asígnalo como ejecutor o
            aprobador.
          </p>
        </section>
        <div className="min-h-0 flex-1">
          <EventRoles
            eventId={eventId}
            initialActors={actors}
            initialSteps={steps}
          />
        </div>
      </main>
    </div>
  );
}
