import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getEventWorkspace } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { getWorkspaceContext } from "@/lib/workspace-context";

/**
 * Mantiene org/evento sticky al navegar bajo /events/[eventId]/…
 * sin sacar al usuario de la subruta (setup, diseño, etc.).
 */
export default async function EventIdLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await getCurrentUser();
  if (!user) return children;

  const workspace = await getEventWorkspace(eventId);
  if (!workspace) notFound();

  const orgId = workspace.organization?.id;
  if (!orgId) return children;

  const ctx = await getWorkspaceContext();
  if (ctx.organizationId === orgId && ctx.eventId === eventId) {
    return children;
  }

  const headerList = await headers();
  const fromHeader = headerList.get("x-pathname");
  const nextPath =
    fromHeader && fromHeader.startsWith(`/events/${eventId}`)
      ? fromHeader
      : `/events/${eventId}`;

  redirect(
    `/workspace/enter?org=${orgId}&event=${eventId}&next=${encodeURIComponent(nextPath)}`,
  );
}
