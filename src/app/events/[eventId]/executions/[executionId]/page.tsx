import { ChevronRight, Command, Play } from "lucide-react";
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

  // Panel = solo observación. Impersonar / operar vive en Mi turno (/run).
  const canOpenCockpit =
    Boolean(realActor?.roles.includes("EXECUTOR")) ||
    canUseDevActorImpersonation(user);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 overflow-hidden px-3 sm:h-16 sm:gap-3 sm:px-6">
          <Link
            href={user.isSuperAdmin ? "/dashboard" : "/"}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden sm:gap-2">
            <Link
              href={`/events/${eventId}`}
              className="hidden shrink-0 text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              Evento
            </Link>
            <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
            <Link
              href={`/events/${eventId}/executions`}
              className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
            >
              Ejecuciones
            </Link>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{detail.name}</span>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              {detail.type}
            </Badge>
            {canOpenCockpit ? (
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/run/${executionId}`}>
                  <Play className="size-3.5" />
                  Mi turno
                </Link>
              </Button>
            ) : null}
            <AuthHeader />
          </div>
        </div>
      </header>
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
          title="Panel"
        />
      </main>
    </div>
  );
}
