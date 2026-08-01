import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { NovedadesBoard } from "@/components/novedades-board";
import { getCurrentUser } from "@/lib/current-user";
import { canManageNovedades, listNovedades } from "@/lib/novedades";

export default async function NovedadesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const items = await listNovedades();
  const canManage = canManageNovedades(user);

  return (
    <div className="min-h-screen">
      <AppHeader
        homeHref={user.isSuperAdmin ? "/dashboard" : "/ejecuciones"}
        title="Novedades"
      />

      <main className="mx-auto max-w-7xl px-6 py-6">
        <section className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Novedades de ControlX
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumen de cambios publicados para todo el equipo.
          </p>
        </section>

        <NovedadesBoard initialItems={items} canManage={canManage} />
      </main>
    </div>
  );
}
