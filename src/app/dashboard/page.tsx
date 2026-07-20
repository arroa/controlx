import { Command, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin-dashboard";
import { AuthHeader } from "@/components/auth-header";
import { Badge } from "@/components/ui/badge";
import { getFirstAssignedPath, listOrganizations } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  if (!user.isSuperAdmin) {
    redirect(await getFirstAssignedPath(user.email));
  }

  const data = await listOrganizations().catch(() => ({
    databaseReady: false,
    organizations: [],
  }));

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Command className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">ControlX</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Administración
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <ShieldCheck className="size-3" />
              SuperAdmin
            </Badge>
            <AuthHeader />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-10">
          <p className="text-sm text-muted-foreground">Bienvenida</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Administración de ControlX
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
