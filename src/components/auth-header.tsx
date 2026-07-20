import Link from "next/link";

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
    <UserMenu
      email={user.email}
      roleLabel={user.isSuperAdmin ? "SuperAdmin" : "Usuario"}
      bypassEnabled={bypassEnabled}
    />
  );
}
