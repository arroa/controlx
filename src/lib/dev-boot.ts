declare global {
  var controlXDevBootId: string | undefined;
}

/**
 * Identificador de “arranque” para invalidar sesiones dev al reiniciar.
 * En local: UUID por proceso (se pierde al reiniciar `next dev`).
 * En Vercel/prod: valor estable — un UUID por isolate Edge vs Node hace
 * que el login escriba una cookie que el middleware rechaza al instante.
 */
export function getDevBootId(): string {
  if (process.env.CONTROLX_DEV_BOOT_ID) {
    return process.env.CONTROLX_DEV_BOOT_ID;
  }

  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return "prod-stable";
  }

  globalThis.controlXDevBootId ??= crypto.randomUUID();
  return globalThis.controlXDevBootId;
}
