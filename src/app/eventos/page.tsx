import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hasAssignedAccess } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { listAccessibleEventsForUser } from "@/lib/my-executions";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { isMobileRequest } from "@/lib/request-device";

export default async function EventosPage({
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

  if (!events.length && orgId) {
    redirect(`/workspace/enter?org=${orgId}&next=/ejecuciones?org=${orgId}`);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AppHeader
        title="Eventos"
        crumbs={
          orgId
            ? [
                { label: "Orgs", href: "/elegir-organizacion" },
                { label: "Eventos" },
              ]
            : [{ label: "Eventos" }]
        }
      />

      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-y-auto px-3 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Elige un evento para operar
          {isMobile ? " (en móvil: ejecuciones)" : " o configurarlo"}.
        </p>

        <ul className="mt-5 space-y-2">
          {events.map((event) => {
            const next = isMobile
              ? `/ejecuciones?org=${event.organizationId}`
              : event.isOrgAdmin ||
                  event.roles.includes("EVENT_ADMIN") ||
                  user.isSuperAdmin
                ? `/events/${event.id}/setup`
                : `/ejecuciones?org=${event.organizationId}`;
            const href = `/workspace/enter?org=${event.organizationId}&event=${event.id}&next=${encodeURIComponent(next)}`;
            return (
              <li key={event.id}>
                <Button
                  variant="outline"
                  className="h-auto w-full flex-col items-start gap-1 px-4 py-3 text-left"
                  asChild
                >
                  <Link href={href}>
                    <span className="text-base font-medium">{event.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {event.organizationName}
                    </span>
                    {event.roles.includes("EVENT_ADMIN") || event.isOrgAdmin ? (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        Admin
                      </Badge>
                    ) : null}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>

        {!events.length ? (
          <p className="mt-6 text-sm text-muted-foreground">
            No hay eventos accesibles en este contexto.
          </p>
        ) : null}
      </main>
    </div>
  );
}
