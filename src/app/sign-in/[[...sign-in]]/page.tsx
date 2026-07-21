import { redirect } from "next/navigation";

import { ControlXSignInForm } from "@/components/controlx-sign-in-form";
import { LoginChangelogModal } from "@/components/login-changelog-modal";
import { isDevBypassEnabled } from "@/lib/dev-flags";

export default async function SignInPage() {
  if (isDevBypassEnabled()) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <LoginChangelogModal />
      <div className="w-full max-w-md rounded-xl border-4 border-amber-400/80 bg-popover p-6 shadow-lg">
        <div className="mb-4 space-y-1 text-center">
          <h1 className="text-lg font-semibold">Ingresar a ControlX</h1>
          <p className="text-sm text-muted-foreground">
            Te enviaremos un código por email. Solo usuarios autorizados.
          </p>
        </div>
        <ControlXSignInForm destination="/entrar" />
      </div>
    </main>
  );
}
