import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity, Play } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { ExecutionTimesPanel } from "@/components/execution-times-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  canAccessEvent,
  getEventActorByEmail,
} from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { canUseDevActorImpersonation } from "@/lib/dev-impersonation";
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
  const realActor = await getEventActorByEmail(eventId, user.email);

  // Ejecutor / aprobador puro (sin ser admin) → Mi turno.
  if (
    !isAdmin &&
    realActor &&
    (realActor.roles.includes("EXECUTOR") ||
      realActor.roles.includes("APPROVER"))
  ) {
    redirect(`/run/${executionId}`);
  }

  // Panel = solo observación. Impersonar / operar vive en Mi turno (/run).
  const canOpenCockpit =
    Boolean(
      realActor?.roles.includes("EXECUTOR") ||
        realActor?.roles.includes("APPROVER"),
    ) || canUseDevActorImpersonation(user);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        homeHref="/ejecuciones"
        crumbs={[
          { label: "Evento", href: `/events/${eventId}` },
          { label: "Ejecuciones", href: `/events/${eventId}/executions` },
          { label: detail.name },
        ]}
        actions={
          <>
            <Badge variant="outline" className="hidden sm:inline-flex">
              {detail.type}
            </Badge>
            <Button size="sm" variant="outline" asChild>
              <Link
                href={`/events/${eventId}/executions/${executionId}/umbral`}
              >
                <Activity className="size-3.5" />
                Monitor
              </Link>
            </Button>
            {canOpenCockpit ? (
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/run/${executionId}`}>
                  <Play className="size-3.5" />
                  Mi turno
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-x-hidden px-3 pb-4 sm:px-6">
        <ExecutionTimesPanel
          initial={detail}
          actorId={realActor?.id ?? null}
          actorName={realActor?.name ?? null}
          canOperateAny={false}
          allowStepOperations={false}
          canForceSuccess={
            user.isSuperAdmin ||
            Boolean(realActor?.roles.includes("EVENT_ADMIN"))
          }
          canApproveAny={
            user.isSuperAdmin ||
            Boolean(
              realActor?.roles.includes("EVENT_ADMIN") ||
                realActor?.roles.includes("STEERCO"),
            )
          }
          title="Panel"
        />
      </main>
    </div>
  );
}
