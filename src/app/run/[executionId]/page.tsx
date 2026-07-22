import { Command } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { DevActorSwitcher } from "@/components/dev-actor-switcher";
import { ExecutorCockpit } from "@/components/executor-cockpit";
import { Badge } from "@/components/ui/badge";
import { canAccessEvent, listEventActors } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import {
  canUseDevActorImpersonation,
  getEffectiveEventActor,
} from "@/lib/dev-impersonation";
import { canViewExecution } from "@/lib/execution-auth";
import { getExecutionDetail } from "@/lib/execution-runtime";

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
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <Link
            href={`/events/${detail.eventId}/executions/${detail.id}`}
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{detail.name}</p>
            <p className="text-xs text-muted-foreground">Vista ejecutor</p>
          </div>
          {showImpersonation ? (
            <DevActorSwitcher
              eventId={detail.eventId}
              actors={actors}
              selectedActorId={null}
            />
          ) : null}
          <AuthHeader />
        </header>
        <main className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-sm space-y-2">
            <p className="font-semibold">
              {showImpersonation
                ? "Elige un actor del mapa"
                : "No estás en el mapa de actores"}
            </p>
            <p className="text-sm text-muted-foreground">
              {showImpersonation
                ? "Usa el combo ámbar “actuar como” y selecciona un ejecutor con pasos asignados."
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
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Link
          href={
            isAdmin
              ? `/events/${detail.eventId}/executions/${detail.id}`
              : `/events/${detail.eventId}`
          }
          className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <Command className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{detail.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            Cockpit · {actor.name}
            {impersonating ? " (mock)" : ""}
          </p>
        </div>
        <Badge variant="outline">{detail.type}</Badge>
        {showImpersonation ? (
          <DevActorSwitcher
            eventId={detail.eventId}
            actors={actors}
            selectedActorId={impersonating ? actor.id : null}
          />
        ) : null}
        <AuthHeader />
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <ExecutorCockpit
          initial={detail}
          actorId={actor.id}
          actorName={actor.name}
        />
      </main>
    </div>
  );
}
