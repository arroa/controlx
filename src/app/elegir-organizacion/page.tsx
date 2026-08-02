import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { hasAssignedAccess } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { listAccessibleOrganizationsForUser } from "@/lib/my-executions";

export default async function ElegirOrganizacionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  if (!user.isSuperAdmin && !(await hasAssignedAccess(user.email))) {
    redirect("/");
  }

  const orgs = await listAccessibleOrganizationsForUser(user.email, {
    isSuperAdmin: user.isSuperAdmin,
  });

  if (!orgs.length) redirect("/");
  if (orgs.length === 1) {
    redirect(`/ejecuciones?org=${orgs[0]!.id}`);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AppHeader homeHref="/elegir-organizacion" title="Organización" />

      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-y-auto px-3 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Tienes acceso a más de una organización. Elige con cuál quieres
          operar.
        </p>

        <ul className="mt-5 space-y-2">
          {orgs.map((org) => (
            <li key={org.id}>
              <Button
                variant="outline"
                className="h-auto w-full justify-start px-4 py-3 text-left text-base font-medium"
                asChild
              >
                <Link href={`/ejecuciones?org=${org.id}`}>{org.name}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
