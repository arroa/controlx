import { ChevronRight, Command } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { EventExecutions } from "@/components/event-executions";
import {
  canAccessEvent,
  getEventWorkspace,
} from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
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

  const [workspace, readiness] = await Promise.all([
    getEventWorkspace(eventId),
    getEventReadinessSnapshot(eventId),
  ]);
  if (!workspace || !readiness) notFound();

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
            {workspace.event.name}
          </Link>
          <ChevronRight className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Ejecuciones</span>
          <div className="ml-auto">
            <AuthHeader />
          </div>
        </div>
      </header>

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
          />
        </div>
      </main>
    </div>
  );
}
