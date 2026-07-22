import {
  Building2,
  CalendarRange,
  ChevronRight,
  Command,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { DevActorSwitcher } from "@/components/dev-actor-switcher";
import { EventWorkspace } from "@/components/event-workspace";
import { Badge } from "@/components/ui/badge";
import {
  getEventWorkspace,
  getEventWorkspaceRole,
  listEventActors,
} from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import {
  canUseDevActorImpersonation,
  getEffectiveEventActor,
} from "@/lib/dev-impersonation";
import { getEventReadinessSnapshot } from "@/lib/event-readiness";

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const role = await getEventWorkspaceRole(
    user.email,
    eventId,
    user.isSuperAdmin,
  );
  if (!role) redirect("/");

  const workspace = await getEventWorkspace(eventId);
  if (!workspace) notFound();

  const readiness = await getEventReadinessSnapshot(eventId);
  if (!readiness) notFound();

  const canManageAdmins = role === "SuperAdmin" || role === "OrgAdmin";
  const RoleIcon =
    role === "SuperAdmin"
      ? ShieldCheck
      : role === "OrgAdmin"
        ? Building2
        : CalendarRange;

  const showImpersonation = canUseDevActorImpersonation(user);
  const actors = showImpersonation ? await listEventActors(eventId) : [];
  const { actor, impersonating } = showImpersonation
    ? await getEffectiveEventActor(eventId, user)
    : { actor: null, impersonating: false };

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
          <Link
            href={
              role === "SuperAdmin"
                ? "/dashboard"
                : role === "OrgAdmin" && workspace.organization
                  ? `/organizations/${workspace.organization.id}`
                  : "/"
            }
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          {workspace.organization ? (
            <>
              {role === "SuperAdmin" || role === "OrgAdmin" ? (
                <Link
                  href={`/organizations/${workspace.organization.id}`}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {workspace.organization.name}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {workspace.organization.name}
                </span>
              )}
              <ChevronRight className="size-4 text-muted-foreground" />
            </>
          ) : null}
          <span className="text-sm font-medium">{workspace.event.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <RoleIcon className="size-3" />
              {role}
            </Badge>
            {showImpersonation ? (
              <DevActorSwitcher
                eventId={eventId}
                actors={actors}
                selectedActorId={impersonating && actor ? actor.id : null}
              />
            ) : null}
            <AuthHeader />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-10">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Evento</p>
            <Badge variant="outline">{workspace.event.status}</Badge>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {workspace.event.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {workspace.event.description || "Sin descripción"} ·{" "}
            {workspace.event.timezone}
          </p>
        </section>

        <EventWorkspace
          event={workspace.event}
          initialAdmins={workspace.admins}
          initialExecutions={workspace.executions}
          readiness={readiness}
          canManageAdmins={canManageAdmins}
        />
      </main>
    </div>
  );
}
