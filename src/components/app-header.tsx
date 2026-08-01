import { Command } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppNavSheet } from "@/components/app-nav-sheet";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { isDevBypassEnabled } from "@/lib/dev-flags";
import { cn } from "@/lib/utils";

export type AppHeaderCrumb = {
  label: string;
  href?: string;
};

type AppHeaderProps = {
  /** Destino del logo ControlX. Por defecto /ejecuciones. */
  homeHref?: string;
  /** Ruta completa; en UI solo se muestra … + paso actual. */
  crumbs?: AppHeaderCrumb[];
  /** Título cuando no hay crumbs (o como único crumb). */
  title?: string;
  /** Acciones de página (p. ej. “Mi turno”), a la izquierda del menú. */
  actions?: ReactNode;
  className?: string;
  innerClassName?: string;
};

function TruncatedTrail({ crumbs }: { crumbs: AppHeaderCrumb[] }) {
  if (crumbs.length === 0) return null;

  const current = crumbs[crumbs.length - 1]!;
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;

  return (
    <nav
      aria-label="Ubicación"
      className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
    >
      {parent?.href ? (
        <Link
          href={parent.href}
          className="shrink-0 text-sm text-muted-foreground transition hover:text-foreground"
          title={`Volver a ${parent.label}`}
          aria-label={`Volver a ${parent.label}`}
        >
          …
        </Link>
      ) : parent ? (
        <span
          className="shrink-0 text-sm text-muted-foreground"
          title={parent.label}
        >
          …
        </span>
      ) : null}

      {parent ? (
        <span className="shrink-0 text-muted-foreground/50" aria-hidden>
          /
        </span>
      ) : null}

      {current.href ? (
        <Link
          href={current.href}
          className="truncate text-sm font-medium hover:text-foreground"
        >
          {current.label}
        </Link>
      ) : (
        <span className="truncate text-sm font-medium">{current.label}</span>
      )}
    </nav>
  );
}

export async function AppHeader({
  homeHref = "/ejecuciones",
  crumbs,
  title,
  actions,
  className,
  innerClassName,
}: AppHeaderProps) {
  const bypassEnabled = isDevBypassEnabled();
  const user = await getCurrentUser();

  const trail: AppHeaderCrumb[] =
    crumbs && crumbs.length > 0
      ? crumbs
      : title
        ? [{ label: title }]
        : [];

  return (
    <header
      className={cn(
        "shrink-0 border-b bg-background/95 backdrop-blur",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex h-14 max-w-7xl items-center gap-2 overflow-hidden px-3 sm:h-16 sm:gap-3 sm:px-6",
          innerClassName,
        )}
      >
        <Link
          href={homeHref}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          title="Inicio ControlX"
          aria-label="Inicio ControlX"
        >
          <Command className="size-4" />
        </Link>

        <TruncatedTrail crumbs={trail} />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}
          {user ? (
            <AppNavSheet
              email={user.email}
              roleLabel={user.isSuperAdmin ? "SuperAdmin" : "Usuario"}
              isSuperAdmin={user.isSuperAdmin}
              bypassEnabled={bypassEnabled}
            />
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href={bypassEnabled ? "/" : "/sign-in"}>Ingresar</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
