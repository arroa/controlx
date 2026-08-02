import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Eye } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { ThresholdMonitor } from "@/components/threshold-monitor";
import { Button } from "@/components/ui/button";
import { canAccessEvent } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { canViewExecution } from "@/lib/execution-auth";
import { getExecutionDetail } from "@/lib/execution-runtime";

export default async function ThresholdMonitorPage({
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
  if (!isAdmin) redirect(`/run/${executionId}`);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        homeHref="/ejecuciones"
        crumbs={[
          { label: "Evento", href: `/events/${eventId}` },
          { label: "Ejecuciones", href: `/events/${eventId}/executions` },
          {
            label: detail.name,
            href: `/events/${eventId}/executions/${executionId}`,
          },
          { label: "Monitor de Umbral" },
        ]}
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href={`/events/${eventId}/executions/${executionId}`}>
              <Eye className="size-3.5" />
              Panel
            </Link>
          </Button>
        }
      />
      <main className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto px-3 pb-8 sm:px-6">
        <ThresholdMonitor initial={detail} />
      </main>
    </div>
  );
}
