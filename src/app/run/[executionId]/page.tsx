import { ChevronRight, Command } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AuthHeader } from "@/components/auth-header";
import { DevActorSwitcher } from "@/components/dev-actor-switcher";
import { ExecutionTimesPanel } from "@/components/execution-times-panel";
import { Badge } from "@/components/ui/badge";
import { canAccessEvent, listEventActors } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import {
  canUseDevActorImpersonation,
  getEffectiveEventActor,
} from "@/lib/dev-impersonation";
import { canViewExecution } from "@/lib/execution-auth";
import { getExecutionDetail } from "@/lib/execution-runtime";

function RunBreadcrumb({
  eventId,
  executionName,
}: {
  eventId: string;
  executionName: string;
}) {
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden sm:gap-2">
      <Link
        href={`/events/${eventId}`}
        className="hidden shrink-0 text-sm text-muted-foreground hover:text-foreground sm:inline"
      >
        Evento
      </Link>
      <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
      <Link
        href="/ejecuciones"
        className="hidden shrink-0 text-sm text-muted-foreground hover:text-foreground sm:inline"
      >
        Ejecuciones
      </Link>
      <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />

      <Link
        href="/ejecuciones"
        className="shrink-0 text-sm text-muted-foreground hover:text-foreground sm:hidden"
      >
        Ejecuciones
      </Link>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground sm:hidden" />

      <span className="truncate text-sm font-medium">{executionName}</span>
    </nav>
  );
}

function RunHeaderShell({
  homeHref,
  eventId,
  executionName,
  actions,
}: {
  homeHref: string;
  eventId: string;
  executionName: string;
  actions: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 overflow-hidden px-3 sm:gap-3 sm:px-6">
        <Link
          href={homeHref}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <Command className="size-4" />
        </Link>
        <RunBreadcrumb eventId={eventId} executionName={executionName} />
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}
        </div>
      </div>
    </header>
  );
}

export default async function ExecutorRunPage({
  params,
}: {
  params: Promise<{ executionId: string }>;
}) {
  const { executionId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const detail = await getExecutionDetail(executionId);
  if (!detail) notFound();

  const canView = await canViewExecution(user, detail.eventId);
  if (!canView) redirect("/");

  const isAdmin =
    user.isSuperAdmin || (await canAccessEvent(user.email, detail.eventId));
  const showImpersonation = canUseDevActorImpersonation(user);
  const actors = showImpersonation
    ? await listEventActors(detail.eventId)
    : [];
  const { actor, impersonating } = await getEffectiveEventActor(
    detail.eventId,
    user,
  );
  const homeHref = "/ejecuciones";

  if (!actor) {
    return (
      <div className="flex h-dvh flex-col overflow-x-hidden">
        <RunHeaderShell
          homeHref={homeHref}
          eventId={detail.eventId}
          executionName={detail.name}
          actions={
            <>
              {showImpersonation ? (
                <DevActorSwitcher
                  eventId={detail.eventId}
                  actors={actors}
                  selectedActorId={null}
                />
              ) : null}
              <AuthHeader />
            </>
          }
        />
        <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-3 text-center sm:px-6">
          <div className="flex max-w-sm flex-col items-center gap-4">
            <div className="space-y-2">
              <p className="font-semibold">
                {showImpersonation
                  ? "Elige un actor del mapa"
                  : "No estás en el mapa de actores"}
              </p>
              <p className="text-sm text-muted-foreground">
                {showImpersonation
                  ? "Tocá el icono de personas en el header, o elegí acá abajo."
                  : "Agrégate en Setup con rol Ejecutor y asígnate pasos en Roles."}
              </p>
            </div>
            {showImpersonation ? (
              <DevActorSwitcher
                eventId={detail.eventId}
                actors={actors}
                selectedActorId={null}
                embedInPage
                className="w-full max-w-xs text-left"
              />
            ) : null}
            {isAdmin ? (
              <Link
                href={`/events/${detail.eventId}/executions/${detail.id}`}
                className="text-sm text-primary underline"
              >
                Volver a consola admin
              </Link>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <RunHeaderShell
        homeHref={homeHref}
        eventId={detail.eventId}
        executionName={detail.name}
        actions={
          <>
            <Badge variant="outline" className="hidden sm:inline-flex">
              {detail.type}
            </Badge>
            {showImpersonation ? (
              <DevActorSwitcher
                eventId={detail.eventId}
                actors={actors}
                selectedActorId={impersonating ? actor.id : null}
              />
            ) : null}
            <AuthHeader />
          </>
        }
      />
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 pb-4 sm:px-6">
        <ExecutionTimesPanel
          initial={detail}
          actorId={actor.id}
          actorName={actor.name}
          canForceSuccess={
            (!impersonating && user.isSuperAdmin) ||
            Boolean(actor.roles.includes("EVENT_ADMIN"))
          }
          title="Mi turno"
        />
      </main>
    </div>
  );
}
