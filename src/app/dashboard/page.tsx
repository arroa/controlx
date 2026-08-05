import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin-dashboard";
import { AppHeader } from "@/components/app-header";
import { getPostLoginPath, listOrganizations } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { isMobileRequest } from "@/lib/request-device";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  if (!user.isSuperAdmin) {
    const isMobile = await isMobileRequest();
    redirect(
      await getPostLoginPath(user.email, {
        isMobile,
        isSuperAdmin: false,
      }),
    );
  }

  const data = await listOrganizations().catch(() => ({
    databaseReady: false,
    organizations: [],
  }));

  return (
    <div className="min-h-screen">
      <AppHeader homeHref="/dashboard" title="Organizaciones" />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-10">
          <p className="text-sm text-muted-foreground">Panel de organizaciones</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Organizaciones
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
        </section>

        <AdminDashboard
          databaseReady={data.databaseReady}
          initialOrganizations={data.organizations}
        />
      </main>
    </div>
  );
}
