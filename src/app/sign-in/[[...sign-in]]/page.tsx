import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { isDevBypassEnabled } from "@/lib/dev-flags";

export default async function SignInPage() {
  if (isDevBypassEnabled()) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <SignIn />
    </main>
  );
}
