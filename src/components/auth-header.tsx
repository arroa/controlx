import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

import { DevAuthControls } from "@/components/dev-auth-controls";
import { Button } from "@/components/ui/button";
import { isDevBypassEnabled } from "@/lib/dev-flags";
import { getDevSessionUserId } from "@/lib/dev-session";

export async function AuthHeader() {
  if (isDevBypassEnabled()) {
    const userId = await getDevSessionUserId();
    return <DevAuthControls userId={userId} />;
  }

  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button variant="ghost" size="sm">
            Ingresar
          </Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button size="sm">Crear cuenta</Button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  );
}
