import { ChevronRight, Command } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
    <>
      <Link
        href={`/events/${eventId}`}
        className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
      >
        Evento
      </Link>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      <Link
        href={`/events/${eventId}/executions`}
        className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
      >
        Ejecuciones
      </Link>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium">{executionName}</span>
    </>
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

  if (!actor) {
    return (
      <div className="flex h-dvh flex-col">
        <header className="shrink-0 border-b">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-6">
            <Link
              href={user.isSuperAdmin ? "/dashboard" : "/"}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <Command className="size-4" />
            </Link>
            <RunBreadcrumb
              eventId={detail.eventId}
              executionName={detail.name}
            />
            <div className="ml-auto flex items-center gap-2">
              {showImpersonation ? (
                <DevActorSwitcher
                  eventId={detail.eventId}
                  actors={actors}
                  selectedActorId={null}
                />
              ) : null}
              <AuthHeader />
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-sm space-y-2">
            <p className="font-semibold">
              {showImpersonation
                ? "Elige un actor del mapa"
                : "No estás en el mapa de actores"}
            </p>
            <p className="text-sm text-muted-foreground">
              {showImpersonation
                ? "En Mi turno elige “actuar como” un ejecutor del mapa con pasos asignados."
                : "Agrégate en Setup con rol Ejecutor y asígnate pasos en Roles."}
            </p>
            {isAdmin ? (
              <Link
                href={`/events/${detail.eventId}/executions/${detail.id}`}
                className="inline-block text-sm text-primary underline"
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
      <header className="shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-6">
          <Link
            href={user.isSuperAdmin ? "/dashboard" : "/"}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          <RunBreadcrumb
            eventId={detail.eventId}
            executionName={detail.name}
          />
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{detail.type}</Badge>
            {showImpersonation ? (
              <DevActorSwitcher
                eventId={detail.eventId}
                actors={actors}
                selectedActorId={impersonating ? actor.id : null}
              />
            ) : null}
            <AuthHeader />
          </div>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 pb-4">
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
