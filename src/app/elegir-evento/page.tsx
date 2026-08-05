import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { hasAssignedAccess } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { listAccessibleEventsForUser } from "@/lib/my-executions";
import { isMobileRequest } from "@/lib/request-device";
import { getWorkspaceContext } from "@/lib/workspace-context";

export default async function ElegirEventoPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.isSuperAdmin && !(await hasAssignedAccess(user.email))) {
    redirect("/");
  }

  const params = await searchParams;
  const ctx = await getWorkspaceContext();
  const orgId = params.org ?? ctx.organizationId ?? undefined;
  const isMobile = await isMobileRequest();

  const events = await listAccessibleEventsForUser(user.email, {
    isSuperAdmin: user.isSuperAdmin,
    organizationId: orgId,
  });

  if (!events.length) {
    redirect(orgId ? `/ejecuciones?org=${orgId}` : "/ejecuciones");
  }
  if (events.length === 1) {
    const event = events[0]!;
    const next = isMobile
      ? `/ejecuciones?org=${event.organizationId}`
      : `/events/${event.id}/setup`;
    redirect(
      `/workspace/enter?org=${event.organizationId}&event=${event.id}&next=${encodeURIComponent(next)}`,
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AppHeader title="Cambiar evento" />

      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-y-auto px-3 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Tienes acceso a más de un evento. Elige con cuál quieres seguir.
        </p>

        <ul className="mt-5 space-y-2">
          {events.map((event) => {
            const next = isMobile
              ? `/ejecuciones?org=${event.organizationId}`
              : event.roles.includes("EVENT_ADMIN") ||
                  event.isOrgAdmin ||
                  user.isSuperAdmin
                ? `/events/${event.id}/setup`
                : `/ejecuciones?org=${event.organizationId}`;
            const href = `/workspace/enter?org=${event.organizationId}&event=${event.id}&next=${encodeURIComponent(next)}`;
            return (
              <li key={event.id}>
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start px-4 py-3 text-left text-base font-medium"
                  asChild
                >
                  <Link href={href}>
                    <span className="block">{event.name}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {event.organizationName}
                    </span>
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
