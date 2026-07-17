import { Building2, ChevronRight, Command, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { OrganizationWorkspace } from "@/components/organization-workspace";
import { Badge } from "@/components/ui/badge";
import { canAccessOrganization, getOrganizationWorkspace } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const canAccess =
    user.isSuperAdmin ||
    (await canAccessOrganization(user.email, organizationId));
  if (!canAccess) redirect("/");

  const workspace = await getOrganizationWorkspace(organizationId);
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
          <span className="text-sm text-muted-foreground">ControlX</span>
          <ChevronRight className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {workspace.organization.name}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              {user.isSuperAdmin ? (
                <ShieldCheck className="size-3" />
              ) : (
                <Building2 className="size-3" />
              )}
              {user.isSuperAdmin ? "SuperAdmin" : "OrgAdmin"}
            </Badge>
            <AuthHeader />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-10">
          <p className="text-sm text-muted-foreground">Organización</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {workspace.organization.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {workspace.organization.description || "Sin descripción"}
          </p>
        </section>

        <OrganizationWorkspace
          organization={workspace.organization}
          initialAdmins={workspace.admins}
          initialEvents={workspace.events}
        />
      </main>
    </div>
  );
}
