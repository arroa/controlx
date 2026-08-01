import { headers } from "next/headers";

/** Detecta móvil/tablet por Client Hints o User-Agent. */
export function isMobileUserAgent(
  userAgent: string | null | undefined,
  secChUaMobile?: string | null,
): boolean {
  if (secChUaMobile === "?1") return true;
  if (secChUaMobile === "?0") return false;
  if (!userAgent) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    userAgent,
  );
}

/** Server Components / Route Handlers: lee headers de la petición. */
export async function isMobileRequest(): Promise<boolean> {
  const h = await headers();
  return isMobileUserAgent(
    h.get("user-agent"),
    h.get("sec-ch-ua-mobile"),
  );
}
