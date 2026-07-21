import { Command, LockKeyhole, Network, RadioTower } from "lucide-react";

import { LandingAccess } from "@/components/landing-access";
import { LoginChangelogModal } from "@/components/login-changelog-modal";
import { Badge } from "@/components/ui/badge";
import { getFirstAssignedPath } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { isDevBypassEnabled } from "@/lib/dev-flags";

export default async function Home() {
  const currentUser = await getCurrentUser();
  const destination = currentUser
    ? currentUser.isSuperAdmin
      ? "/dashboard"
      : await getFirstAssignedPath(currentUser.email)
    : "/entrar";

  return (
    <main className="relative min-h-screen overflow-hidden">
      {!currentUser ? <LoginChangelogModal /> : null}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(1_0_0/0.035)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]" />

      <header className="relative z-10 mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Command className="size-5" />
          </div>
          <div>
            <p className="font-semibold leading-none">ControlX</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Critical operations
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-primary/25 bg-primary/5 text-primary"
        >
          Beta privada
        </Badge>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-10rem)] max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-7 flex items-center gap-2 rounded-full border bg-card/70 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Una única fuente de verdad para cada ejecución crítica
        </div>

        <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          Control total cuando cada{" "}
          <span className="text-primary">paso importa.</span>
        </h1>
        <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
          Prepara, coordina y gobierna eventos operativos críticos con
          responsables claros, dependencias, aprobaciones y trazabilidad
          completa.
        </p>

        <div className="mt-10">
          <LandingAccess
            bypassEnabled={isDevBypassEnabled()}
            isAuthenticated={Boolean(currentUser)}
            destination={destination}
          />
        </div>

        <div className="mt-16 grid w-full max-w-3xl gap-4 text-left sm:grid-cols-3">
          <Feature
            icon={Network}
            title="Orquestación"
            description="Dependencias y workstreams coordinados."
          />
          <Feature
            icon={RadioTower}
            title="Tiempo real"
            description="Una mirada común durante la ejecución."
          />
          <Feature
            icon={LockKeyhole}
            title="Trazabilidad"
            description="Cada decisión conserva su evidencia."
          />
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-7xl items-center justify-between border-t px-6 py-6 text-xs text-muted-foreground">
        <span>© 2026 ControlX</span>
        <span>Operaciones críticas, bajo control.</span>
      </footer>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Network;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-card/50 p-4 backdrop-blur">
      <Icon className="mb-3 size-4 text-primary" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
