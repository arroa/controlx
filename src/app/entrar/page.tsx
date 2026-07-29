import { redirect } from "next/navigation";

import { getFirstAssignedPath } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

/**
 * Resolver post-login: SuperAdmin → dashboard; resto con acceso → /ejecuciones.
 */
export default async function EntrarPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  if (user.isSuperAdmin) {
    redirect("/dashboard");
  }

  const path = await getFirstAssignedPath(user.email);
  redirect(path);
}
