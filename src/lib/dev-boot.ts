declare global {
  var controlXDevBootId: string | undefined;
}

/** Identificador único por arranque del servidor (invalida sesiones dev al reiniciar). */
export function getDevBootId(): string {
  if (process.env.CONTROLX_DEV_BOOT_ID) {
    return process.env.CONTROLX_DEV_BOOT_ID;
  }

  globalThis.controlXDevBootId ??= crypto.randomUUID();
  return globalThis.controlXDevBootId;
}
