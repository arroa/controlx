import { ChevronRight, Command, Smartphone } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
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

  // Ejecutor puro (sin ser admin) → cockpit.
  if (!isAdmin && realActor?.roles.includes("EXECUTOR")) {
    redirect(`/run/${executionId}`);
  }

  // Panel = observación / admin. Sin impersonación (eso vive en Mi turno).
  const canOpenCockpit =
    Boolean(realActor?.roles.includes("EXECUTOR")) ||
    canUseDevActorImpersonation(user);

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
          <Link
            href={`/events/${eventId}/executions`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Ejecuciones
          </Link>
          <ChevronRight className="size-4 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{detail.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{detail.type}</Badge>
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
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 pb-4">
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
          title="Panel"
        />
      </main>
    </div>
  );
}
