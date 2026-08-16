import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ExecutionObserveNav } from "@/components/execution-observe-nav";
import { MapaGeneral } from "@/components/mapa-general";
import { canAccessEvent, listEventActors } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { canViewExecution } from "@/lib/execution-auth";
import { getExecutionDetail } from "@/lib/execution-runtime";

export default async function MapaGeneralPage({
  params,
}: {
  params: Promise<{ eventId: string; executionId: string }>;
}) {
  const { eventId, executionId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const detail = await getExecutionDetail(executionId);
  if (!detail || detail.eventId !== eventId) notFound();

  const canView = await canViewExecution(user, eventId);
  if (!canView) redirect("/");

  const isAdmin =
    user.isSuperAdmin || (await canAccessEvent(user.email, eventId));
  if (!isAdmin) redirect(`/run/${executionId}`);

  const actors = await listEventActors(eventId);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        homeHref="/ejecuciones"
        crumbs={[
          { label: "Evento", href: `/events/${eventId}` },
          { label: "Ejecuciones", href: `/events/${eventId}/executions` },
          {
            label: detail.name,
            href: `/events/${eventId}/executions/${executionId}`,
          },
          { label: "Mapa General" },
        ]}
        actions={
          <ExecutionObserveNav
            eventId={eventId}
            executionId={executionId}
            current="mapa"
          />
        }
      />
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 sm:px-6">
        <MapaGeneral initial={detail} actors={actors} />
      </main>
    </div>
  );
}
