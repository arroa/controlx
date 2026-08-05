import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { OrganizationWorkspace } from "@/components/organization-workspace";
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
      <AppHeader
        crumbs={
          user.isSuperAdmin
            ? [
                { label: "Organizaciones", href: "/dashboard" },
                { label: workspace.organization.name },
              ]
            : [{ label: workspace.organization.name }]
        }
      />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-10">
          <p className="text-sm text-muted-foreground">Organización</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {workspace.organization.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {workspace.organization.description || "Sin descripción"}
          </p>
          {workspace.organization.status === "ARCHIVED" ? (
            <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100/90">
              Esta organización está archivada. Solo puedes consultarla; no se
              pueden crear ni editar eventos.
            </div>
          ) : null}
        </section>

        <OrganizationWorkspace
          organization={workspace.organization}
          initialEvents={workspace.events}
          readOnly={workspace.organization.status === "ARCHIVED"}
        />
      </main>
    </div>
  );
}
