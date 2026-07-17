import { ChevronRight, Command } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { EventDesign } from "@/components/event-design";
import { canAccessEvent, getEventDesign } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

export default async function EventDesignPage({
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
    <div className="min-h-screen">
      <header className="border-b bg-background/90 backdrop-blur">
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
          <span className="text-sm font-medium">Diseño</span>
          <div className="ml-auto">
            <AuthHeader />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-8">
          <p className="text-sm text-muted-foreground">Paso 2 de 3</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Diseño del evento
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Planilla del diseño: busca, edita en la fila superior y crece hacia
            abajo con actividades y pasos agrupados.
          </p>
        </section>
        <EventDesign
          eventId={eventId}
          initialWorkstreams={design.workstreams}
          initialBlocks={design.blocks}
          initialPairs={design.pairs}
        />
      </main>
    </div>
  );
}
