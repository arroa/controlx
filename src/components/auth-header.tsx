import Link from "next/link";
import { MessageSquareText, Newspaper, ScrollText } from "lucide-react";

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
    <>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/novedades" className="gap-1.5">
          <Newspaper className="size-4" />
          Novedades
        </Link>
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/feedback" className="gap-1.5">
          <MessageSquareText className="size-4" />
          Mejoras
        </Link>
      </Button>
      {user.isSuperAdmin ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/ai-audit" className="gap-1.5">
            <ScrollText className="size-4" />
            Auditoría IA
          </Link>
        </Button>
      ) : null}
      <UserMenu
        email={user.email}
        roleLabel={user.isSuperAdmin ? "SuperAdmin" : "Usuario"}
        bypassEnabled={bypassEnabled}
      />
    </>
  );
}
