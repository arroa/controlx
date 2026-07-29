import { redirect } from "next/navigation";

import { getFirstAssignedPath } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

/**
 * Resolver post-login: home operativo = /ejecuciones (también SuperAdmin).
 * Administración sigue en /dashboard desde el header.
 */
export default async function EntrarPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  if (user.isSuperAdmin) {
    redirect("/ejecuciones");
  }

  const path = await getFirstAssignedPath(user.email);
  redirect(path);
}
