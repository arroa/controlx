import { redirect } from "next/navigation";

import { getFirstAssignedPath } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";

/**
 * Resolver post-login: manda a cada rol a su destino correcto.
 * Evita el bug de enviar a todos a /dashboard (solo SuperAdmin).
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
