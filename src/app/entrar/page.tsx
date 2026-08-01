import { redirect } from "next/navigation";

import { getPostLoginPath } from "@/lib/admin-data";
import { getCurrentUser } from "@/lib/current-user";
import { isMobileRequest } from "@/lib/request-device";

/**
 * Resolver post-login:
 * - Móvil → /ejecuciones (hub operativo / PWA)
 * - PC → portal según rol (org → eventos, event admin → setup, resto → ejecuciones)
 *
 * Si aún no hay cookie (race en PWA), manda a /sign-in — no a la landing.
 */
export default async function EntrarPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const isMobile = await isMobileRequest();
  redirect(
    await getPostLoginPath(user.email, {
      isMobile,
      isSuperAdmin: user.isSuperAdmin,
    }),
  );
}
