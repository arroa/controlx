import { cookies, headers } from "next/headers";

import {
  isStandaloneDisplayCookie,
  PWA_DISPLAY_COOKIE,
} from "@/lib/pwa-display";

function normalizeClientHintPlatform(value: string | null | undefined) {
  return value?.replace(/"/g, "").trim() ?? "";
}

/** Detecta móvil/tablet por Client Hints o User-Agent. */
export function isMobileUserAgent(
  userAgent: string | null | undefined,
  secChUaMobile?: string | null,
  secChUaPlatform?: string | null,
): boolean {
  const platform = normalizeClientHintPlatform(secChUaPlatform);
  if (platform === "iOS" || platform === "Android") return true;

  if (secChUaMobile === "?1") return true;
  if (secChUaMobile === "?0") {
    // iPadOS puede reportar ?0 con UA de Macintosh; no asumir desktop.
    if (userAgent && /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent)) {
      return true;
    }
    return false;
  }
  if (!userAgent) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    userAgent,
  );
}

/** Server Components / Route Handlers: lee headers de la petición. */
export async function isMobileRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  if (
    isStandaloneDisplayCookie(cookieStore.get(PWA_DISPLAY_COOKIE)?.value)
  ) {
    return true;
  }

  const h = await headers();
  return isMobileUserAgent(
    h.get("user-agent"),
    h.get("sec-ch-ua-mobile"),
    h.get("sec-ch-ua-platform"),
  );
}
