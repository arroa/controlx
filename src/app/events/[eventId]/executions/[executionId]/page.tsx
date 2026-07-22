import { ChevronRight, Command, Smartphone } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { DevActorSwitcher } from "@/components/dev-actor-switcher";
import { ExecutionConsole } from "@/components/execution-console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  canAccessEvent,
  getEventActorByEmail,
  listEventActors,
} from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import {
  canUseDevActorImpersonation,
  getEffectiveEventActor,
} from "@/lib/dev-impersonation";
import { canViewExecution } from "@/lib/execution-auth";
import { getExecutionDetail } from "@/lib/execution-runtime";

export default async function ExecutionPage({
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
  const showImpersonation = canUseDevActorImpersonation(user);
  const actors = showImpersonation ? await listEventActors(eventId) : [];
  const { actor, impersonating } = await getEffectiveEventActor(eventId, user);
  const realActor = await getEventActorByEmail(eventId, user.email);

  // Ejecutor puro (sin ser admin) → cockpit.
  if (!isAdmin && realActor?.roles.includes("EXECUTOR")) {
    redirect(`/run/${executionId}`);
  }

  const canOpenCockpit =
    Boolean(actor?.roles.includes("EXECUTOR")) || showImpersonation;

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
            Evento
          </Link>
          <ChevronRight className="size-4 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{detail.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{detail.type}</Badge>
            {showImpersonation ? (
              <DevActorSwitcher
                eventId={eventId}
                actors={actors}
                selectedActorId={impersonating && actor ? actor.id : null}
              />
            ) : null}
            {canOpenCockpit ? (
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/run/${executionId}`}>
                  <Smartphone className="size-3.5" />
                  Mi turno
                </Link>
              </Button>
            ) : null}
            <AuthHeader />
          </div>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 py-4">
        <ExecutionConsole initial={detail} />
      </main>
    </div>
  );
}
