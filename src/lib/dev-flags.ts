/**
 * Login sin OTP (cookie cx_dev_session).
 *
 * true  = pruebas temporales en Vercel (solo CONTROLX_DEV_BYPASS)
 * false = como antes: bypass solo en local
 */
const ALLOW_DEV_BYPASS_IN_PROD = true;

export function isDevBypassEnabled(): boolean {
  if (ALLOW_DEV_BYPASS_IN_PROD) {
    return process.env.CONTROLX_DEV_BYPASS === "true";
  } else {
    // como antes (solo local)
    return (
      process.env.CONTROLX_DEV_BYPASS === "true" &&
      process.env.NODE_ENV !== "production"
    );
  }
}

export function isDevClerkUserId(clerkUserId: string): boolean {
  return clerkUserId.startsWith("dev:");
}
