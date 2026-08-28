"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  isStandaloneDisplayMode,
  PWA_DISPLAY_COOKIE,
  PWA_DISPLAY_STANDALONE,
  syncPwaDisplayCookie,
} from "@/lib/pwa-display";

/**
 * Registra el SW solo en producción (HTTPS).
 * En dev/LAN no molesta ni cachea.
 */
export function PwaRegister() {
  const router = useRouter();

  useEffect(() => {
    const hadCookie = document.cookie.includes(
      `${PWA_DISPLAY_COOKIE}=${PWA_DISPLAY_STANDALONE}`,
    );
    syncPwaDisplayCookie();
    if (isStandaloneDisplayMode() && !hadCookie) {
      router.refresh();
    }

    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[pwa] No se pudo registrar el service worker:", error);
    });
  }, [router]);

  return null;
}
