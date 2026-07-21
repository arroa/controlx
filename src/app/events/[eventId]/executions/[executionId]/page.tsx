import { ChevronRight, Command } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { ExecutionConsole } from "@/components/execution-console";
import { Badge } from "@/components/ui/badge";
import { canAccessEvent } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { getExecutionDetail } from "@/lib/execution-runtime";

export default async function ExecutionPage({
  params,
}: {
  params: Promise<{ eventId: string; executionId: string }>;
}) {
  const { eventId, executionId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const canAccess =
    user.isSuperAdmin || (await canAccessEvent(user.email, eventId));
  if (!canAccess) redirect("/");

  const detail = await getExecutionDetail(executionId);
  if (!detail || detail.eventId !== eventId) notFound();

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
          <span className="truncate text-sm font-medium">{detail.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{detail.type}</Badge>
            <AuthHeader />
          </div>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 py-4">
        <ExecutionConsole initial={detail} />
      </main>
    </div>
  );
}
