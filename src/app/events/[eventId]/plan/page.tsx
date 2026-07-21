import { ChevronRight, Command } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
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
      <header className="shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
          <Link
            href={user.isSuperAdmin ? "/dashboard" : "/"}
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          <Link
            href={`/events/${eventId}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {design.event.name}
          </Link>
          <ChevronRight className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Planificador</span>
          <div className="ml-auto">
            <AuthHeader />
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 py-4">
        <section className="mb-4 shrink-0">
          <p className="text-sm text-muted-foreground">Paso 4 de 4</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Planificador
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            En Planilla defines las condiciones del paso: deps (OK exitoso),
            gates, aprobaciones y hora. Tiempos es solo el visor del cronograma.
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
