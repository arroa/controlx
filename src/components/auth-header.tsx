import Link from "next/link";
import { MessageSquareText } from "lucide-react";

import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { isDevBypassEnabled } from "@/lib/dev-flags";
import { canAccessFeedback } from "@/lib/feedback";

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

  const showFeedback = await canAccessFeedback(user);

  return (
    <>
      {showFeedback ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href="/feedback" className="gap-1.5">
            <MessageSquareText className="size-4" />
            Mejoras
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
