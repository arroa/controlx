/**
 * Activa login sin OTP (cookie cx_dev_session).
 * En prod solo si CONTROLX_DEV_BYPASS=true en Vercel — apagar al terminar pruebas.
 */
export function isDevBypassEnabled(): boolean {
  return process.env.CONTROLX_DEV_BYPASS === "true";
}

export function isDevClerkUserId(clerkUserId: string): boolean {
  return clerkUserId.startsWith("dev:");
}
