import { CalendarRange, ChevronRight, Command, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { EventWorkspace } from "@/components/event-workspace";
import { Badge } from "@/components/ui/badge";
import { canAccessEvent, getEventWorkspace } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

export default async function EventPage({
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

  const workspace = await getEventWorkspace(eventId);
  if (!workspace) notFound();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
          <Link
            href={user.isSuperAdmin ? "/dashboard" : "/"}
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          {workspace.organization ? (
            <>
              <Link
                href={`/organizations/${workspace.organization.id}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {workspace.organization.name}
              </Link>
              <ChevronRight className="size-4 text-muted-foreground" />
            </>
          ) : null}
          <span className="text-sm font-medium">{workspace.event.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              {user.isSuperAdmin ? (
                <ShieldCheck className="size-3" />
              ) : (
                <CalendarRange className="size-3" />
              )}
              {user.isSuperAdmin ? "SuperAdmin" : "EventAdmin"}
            </Badge>
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
        />
      </main>
    </div>
  );
}
