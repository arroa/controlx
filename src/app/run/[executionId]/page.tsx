import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { DevActorSwitcher } from "@/components/dev-actor-switcher";
import { ExecutionTimesPanel2 } from "@/components/execution-times-panel-2";
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
  const homeHref = "/ejecuciones";
  const crumbs = [
    { label: "Ejecuciones", href: "/ejecuciones" },
    { label: detail.name },
  ];

  // Contingencia: EventAdmin / OrgAdmin / Super operan cualquier paso o
  // aprobación “en nombre de” el asignado (no lo reemplazan). Vive en /run.
  const canOperateAny = isAdmin && !impersonating;
  const canForceSuccess =
    (!impersonating && user.isSuperAdmin) ||
    Boolean(actor?.roles.includes("EVENT_ADMIN"));
  // Org/Event admin (contingencia) + SteerCo del mapa.
  const canApproveAny =
    canOperateAny || Boolean(actor?.roles.includes("STEERCO"));

  if (!actor && !canOperateAny) {
    return (
      <div className="flex h-dvh flex-col overflow-x-hidden">
        <AppHeader
          homeHref={homeHref}
          crumbs={crumbs}
          actions={
            showImpersonation ? (
              <DevActorSwitcher
                eventId={detail.eventId}
                actors={actors}
                selectedActorId={null}
              />
            ) : null
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
      <AppHeader
        homeHref={homeHref}
        crumbs={crumbs}
        actions={
          <>
            <Badge variant="outline" className="hidden sm:inline-flex">
              {detail.type}
            </Badge>
            {showImpersonation ? (
              <DevActorSwitcher
                eventId={detail.eventId}
                actors={actors}
                selectedActorId={impersonating ? actor?.id ?? null : null}
              />
            ) : null}
          </>
        }
      />
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 pb-4 sm:px-6">
        <ExecutionTimesPanel2
          initial={detail}
          actorId={actor?.id ?? null}
          actorName={actor?.name ?? null}
          actorRoles={actor?.roles ?? []}
          canOperateAny={canOperateAny}
          canForceSuccess={canForceSuccess}
          canApproveAny={canApproveAny}
          title="Mi turno"
        />
      </main>
    </div>
  );
}
