import { redirect } from "next/navigation";

import { getFirstAssignedPath } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

/**
 * Resolver post-login: home operativo = /ejecuciones (también SuperAdmin).
 * Administración sigue en /dashboard desde el header.
 *
 * Si aún no hay cookie (race en PWA), manda a /sign-in — no a la landing —
 * para que el usuario no vea el bucle "Ingresar al sistema".
 */
export default async function EntrarPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  if (user.isSuperAdmin) {
    redirect("/ejecuciones");
  }

  const path = await getFirstAssignedPath(user.email);
  redirect(path);
}
