"use client";

import { useEffect } from "react";

/**
 * Registra el SW solo en producción (HTTPS).
 * En dev/LAN no molesta ni cachea.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[pwa] No se pudo registrar el service worker:", error);
    });
  }, []);

  return null;
}
