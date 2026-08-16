import { ChartNoAxesCombined, Eye, Map, Play } from "lucide-react";
import { ObjectId } from "mongodb";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PwaInstallHint } from "@/components/pwa-install-hint";
import { hasAssignedAccess } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import {
  listAccessibleExecutionsForUser,
  listAccessibleOrganizationsForUser,
  type AccessibleExecutionCard,
} from "@/lib/my-executions";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<AccessibleExecutionCard["status"], string> = {
  BORRADOR: "Borrador",
  PREPARADO: "Preparado",
  EN_EJECUCION: "En ejecución",
  PAUSADO: "Pausado",
  FINALIZADO: "Finalizado",
  CANCELADO: "Cancelado",
};

const OPEN_STATUSES = new Set<AccessibleExecutionCard["status"]>([
  "BORRADOR",
  "PREPARADO",
  "EN_EJECUCION",
  "PAUSADO",
]);

function statusTone(status: AccessibleExecutionCard["status"]) {
  switch (status) {
    case "EN_EJECUCION":
      return "border-sky-400/50 bg-sky-500/15 text-sky-100";
    case "PAUSADO":
      return "border-amber-400/50 bg-amber-500/15 text-amber-100";
    case "PREPARADO":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
    case "FINALIZADO":
      return "border-border bg-muted/40 text-muted-foreground";
    case "CANCELADO":
      return "border-rose-400/40 bg-rose-500/10 text-rose-100";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function ExecutionRow({ item }: { item: AccessibleExecutionCard }) {
  const canRun =
    item.isAdmin ||
    item.assignedStepCount > 0 ||
    item.roles.includes("EXECUTOR") ||
    item.roles.includes("APPROVER");
  const canPanel =
    item.isAdmin ||
    item.roles.includes("APPROVER") ||
    item.roles.includes("STEERCO");
  const primaryHref = canRun
    ? `/run/${item.id}`
    : `/events/${item.eventId}/executions/${item.id}`;

  return (
    <article className="border-b border-border/60 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <Link href={primaryHref} className="min-w-0 flex-1 text-left">
          <p className="truncate text-lg font-semibold tracking-tight">
            {item.organizationName} · {item.eventName}
          </p>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm text-muted-foreground">
              {item.name}
            </h2>
            <Badge
              variant="outline"
              className={cn("shrink-0 px-2 py-0.5 text-xs", statusTone(item.status))}
            >
              {STATUS_LABELS[item.status]}
            </Badge>
            {item.assignedStepCount > 0 ? (
              <Badge
                variant="outline"
                className="shrink-0 border-transparent bg-white px-2 py-0.5 text-xs text-black"
              >
                {item.assignedStepCount} paso
                {item.assignedStepCount === 1 ? "" : "s"} mío
                {item.assignedStepCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {canRun ? (
          <Button size="sm" className="h-12 w-full text-base font-semibold" asChild>
            <Link href={`/run/${item.id}`}>
              <Play className="size-5" />
              Mis pasos
            </Link>
          </Button>
        ) : null}
        {canPanel ? (
          <Button size="sm" variant="outline" className="h-12 w-full text-base font-semibold" asChild>
            <Link href={`/events/${item.eventId}/executions/${item.id}`}>
              <Eye className="size-5" />
              Panel
            </Link>
          </Button>
        ) : null}
        {canPanel ? (
          <Button size="sm" variant="outline" className="h-12 w-full text-base font-semibold" asChild>
            <Link href={`/events/${item.eventId}/executions/${item.id}/mapa`}>
              <Map className="size-5" />
              Mapa
            </Link>
          </Button>
        ) : null}
        {canPanel ? (
          <Button size="sm" variant="outline" className="h-12 w-full text-base font-semibold" asChild>
            <Link
              href={`/events/${item.eventId}/executions/${item.id}/umbral`}
            >
              <ChartNoAxesCombined className="size-5" aria-hidden />
              Monitor
            </Link>
          </Button>
        ) : null}
        {!canRun && !canPanel ? (
          <Button size="sm" className="h-12 w-full text-base font-semibold" asChild>
            <Link href={`/run/${item.id}`}>
              <Play className="size-5" />
              Abrir
            </Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export default async function EjecucionesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!user.isSuperAdmin && !(await hasAssignedAccess(user.email))) {
    redirect("/");
  }

  const { org: orgParam } = await searchParams;
  const orgs = await listAccessibleOrganizationsForUser(user.email, {
    isSuperAdmin: user.isSuperAdmin,
  });

  if (!orgs.length) redirect("/");

  const orgId =
    orgParam && ObjectId.isValid(orgParam) && orgs.some((o) => o.id === orgParam)
      ? orgParam
      : null;

  if (!orgId) {
    if (orgs.length === 1) {
      redirect(
        `/workspace/enter?org=${orgs[0]!.id}&next=${encodeURIComponent(`/ejecuciones?org=${orgs[0]!.id}`)}`,
      );
    }
    redirect("/elegir-organizacion");
  }

  const workspace = await getWorkspaceContext();
  if (workspace.organizationId !== orgId) {
    redirect(
      `/workspace/enter?org=${orgId}&next=${encodeURIComponent(`/ejecuciones?org=${orgId}`)}`,
    );
  }

  const selectedOrg = orgs.find((o) => o.id === orgId)!;
  const hubHref = `/ejecuciones?org=${orgId}`;

  const allExecutions = await listAccessibleExecutionsForUser(user.email, {
    isSuperAdmin: user.isSuperAdmin,
  });
  const executions = allExecutions.filter(
    (item) => item.organizationId === orgId,
  );

  const open = executions.filter((item) => OPEN_STATUSES.has(item.status));
  const closed = executions.filter((item) => !OPEN_STATUSES.has(item.status));

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AppHeader
        homeHref={hubHref}
        crumbs={[
          ...(orgs.length > 1
            ? [{ label: "Orgs", href: "/elegir-organizacion" }]
            : []),
          { label: selectedOrg.name },
        ]}
      />

      <main className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        <p className="mb-3 text-sm text-muted-foreground">
          Simulacros y corridas de {selectedOrg.name}. Entra a Mis Pasos o al
          Panel según tu rol.
        </p>
        <PwaInstallHint className="mb-4" />

        {!executions.length ? (
          <div className="rounded-xl border border-dashed px-4 py-10 text-center">
            <p className="text-sm font-medium">No hay ejecuciones todavía</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cuando un admin cree un simulacro o una corrida real, aparecerá
              aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Activas
              </h2>
              {open.length ? (
                <div className="divide-y-0 rounded-xl border px-3 sm:px-4">
                  {open.map((item) => (
                    <ExecutionRow key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ninguna abierta ahora.
                </p>
              )}
            </section>

            {closed.length ? (
              <section>
                <h2 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Cerradas
                </h2>
                <div className="divide-y-0 rounded-xl border px-3 opacity-90 sm:px-4">
                  {closed.map((item) => (
                    <ExecutionRow key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
