import { Command } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
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
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
          <Link
            href={user.isSuperAdmin ? "/dashboard" : "/"}
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          <div>
            <p className="text-sm font-semibold leading-none">Novedades</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Cambios del sitio
            </p>
          </div>
          <div className="ml-auto">
            <AuthHeader />
          </div>
        </div>
      </header>

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
