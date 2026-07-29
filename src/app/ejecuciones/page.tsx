import { Command, Eye, Play } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hasAssignedAccess } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { formatDayTimeLabel } from "@/lib/execution-schedule";
import {
  listAccessibleExecutionsForUser,
  type AccessibleExecutionCard,
} from "@/lib/my-executions";
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
    item.assignedStepCount > 0 || item.roles.includes("EXECUTOR");
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
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn("text-[10px]", statusTone(item.status))}
            >
              {STATUS_LABELS[item.status]}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {item.type}
              {item.iteration > 1 ? ` · #${item.iteration}` : ""}
            </Badge>
            {item.assignedStepCount > 0 ? (
              <Badge variant="outline" className="text-[10px] text-cyan-200">
                {item.assignedStepCount} mío
                {item.assignedStepCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-1.5 truncate text-base font-semibold tracking-tight">
            {item.name}
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.organizationName} · {item.eventName}
          </p>
          {item.anchorStartAt ? (
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              T0 {formatDayTimeLabel(item.anchorStartAt, item.timezone)}
            </p>
          ) : null}
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canRun ? (
          <Button size="sm" asChild>
            <Link href={`/run/${item.id}`}>
              <Play className="size-3.5" />
              Mi turno
            </Link>
          </Button>
        ) : null}
        {canPanel ? (
          <Button size="sm" variant={canRun ? "outline" : "default"} asChild>
            <Link href={`/events/${item.eventId}/executions/${item.id}`}>
              <Eye className="size-3.5" />
              Panel
            </Link>
          </Button>
        ) : null}
        {!canRun && !canPanel ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/run/${item.id}`}>
              <Play className="size-3.5" />
              Abrir
            </Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export default async function EjecucionesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (
    !user.isSuperAdmin &&
    !(await hasAssignedAccess(user.email))
  ) {
    redirect("/");
  }

  const executions = await listAccessibleExecutionsForUser(user.email, {
    isSuperAdmin: user.isSuperAdmin,
  });

  const open = executions.filter((item) => OPEN_STATUSES.has(item.status));
  const closed = executions.filter((item) => !OPEN_STATUSES.has(item.status));

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
          <Link
            href="/ejecuciones"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              ControlX
            </p>
            <h1 className="truncate text-sm font-semibold sm:text-base">
              Ejecuciones
            </h1>
          </div>
          <AuthHeader />
        </div>
      </header>

      <main className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Simulacros y corridas de tus organizaciones. Entrá a Mi turno o al
          Panel según tu rol.
        </p>

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
