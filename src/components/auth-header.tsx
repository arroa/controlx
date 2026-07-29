import Link from "next/link";
import {
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Newspaper,
  ScrollText,
} from "lucide-react";

import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { isDevBypassEnabled } from "@/lib/dev-flags";

export async function AuthHeader() {
  const bypassEnabled = isDevBypassEnabled();
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link href={bypassEnabled ? "/" : "/sign-in"}>Ingresar</Link>
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        asChild
        className="sm:size-auto sm:h-8 sm:px-2.5"
      >
        <Link href="/ejecuciones" className="gap-1.5" title="Ejecuciones">
          <ListChecks className="size-4" />
          <span className="hidden sm:inline">Ejecuciones</span>
        </Link>
      </Button>
      {user.isSuperAdmin ? (
        <Button
          variant="ghost"
          size="icon-sm"
          asChild
          className="sm:size-auto sm:h-8 sm:px-2.5"
        >
          <Link href="/dashboard" className="gap-1.5" title="Administración">
            <LayoutDashboard className="size-4" />
            <span className="hidden sm:inline">Admin</span>
          </Link>
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        asChild
        className="sm:size-auto sm:h-8 sm:px-2.5"
      >
        <Link href="/novedades" className="gap-1.5" title="Novedades">
          <Newspaper className="size-4" />
          <span className="hidden sm:inline">Novedades</span>
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        asChild
        className="sm:size-auto sm:h-8 sm:px-2.5"
      >
        <Link href="/feedback" className="gap-1.5" title="Mejoras">
          <MessageSquareText className="size-4" />
          <span className="hidden sm:inline">Mejoras</span>
        </Link>
      </Button>
      {user.isSuperAdmin ? (
        <Button
          variant="ghost"
          size="icon-sm"
          asChild
          className="sm:size-auto sm:h-8 sm:px-2.5"
        >
          <Link href="/admin/ai-audit" className="gap-1.5" title="Auditoría IA">
            <ScrollText className="size-4" />
            <span className="hidden md:inline">Auditoría IA</span>
          </Link>
        </Button>
      ) : null}
      <UserMenu
        email={user.email}
        roleLabel={user.isSuperAdmin ? "SuperAdmin" : "Usuario"}
        bypassEnabled={bypassEnabled}
      />
    </div>
  );
}
