import { cookies } from "next/headers";

import { isDevBypassEnabled } from "@/lib/dev-flags";
import {
  createDevSessionToken,
  DEV_SESSION_COOKIE,
  devSessionCookieOptions,
  verifyDevSessionToken,
} from "@/lib/dev-session-token";

export {
  createDevSessionToken,
  DEV_SESSION_COOKIE,
  devSessionCookieOptions,
  verifyDevSessionToken,
};

export async function getDevSessionUserId(): Promise<string | null> {
  if (!isDevBypassEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(DEV_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  return verifyDevSessionToken(token);
}
