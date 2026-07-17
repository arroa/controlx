import { isDevBypassEnabled } from "@/lib/dev-flags";
import {
  DEV_SESSION_COOKIE,
  verifyDevSessionToken,
} from "@/lib/dev-session-token";

export async function getDevSessionUserIdFromRequest(
  request: Request,
): Promise<string | null> {
  if (!isDevBypassEnabled()) {
    return null;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const match = cookieHeader.match(new RegExp(`${DEV_SESSION_COOKIE}=([^;]+)`));
  if (!match?.[1]) {
    return null;
  }

  return verifyDevSessionToken(decodeURIComponent(match[1]));
}
