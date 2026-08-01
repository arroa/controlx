import Link from "next/link";

import { AppNavSheet } from "@/components/app-nav-sheet";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { isDevBypassEnabled } from "@/lib/dev-flags";

/**
 * @deprecated Prefer `AppHeader`. Se mantiene para páginas que aún solo
 * necesitan el menú hamburguesa sin reemplazar el shell.
 */
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
    <AppNavSheet
      email={user.email}
      roleLabel={user.isSuperAdmin ? "SuperAdmin" : "Usuario"}
      isSuperAdmin={user.isSuperAdmin}
      bypassEnabled={bypassEnabled}
    />
  );
}
