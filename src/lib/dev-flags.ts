/** Solo desarrollo local — nunca activar en producción. */
export function isDevBypassEnabled(): boolean {
  return (
    process.env.CONTROLX_DEV_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export function isDevClerkUserId(clerkUserId: string): boolean {
  return clerkUserId.startsWith("dev:");
}
