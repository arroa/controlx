/** Cookie que el cliente setea al abrir la app instalada (standalone). */
export const PWA_DISPLAY_COOKIE = "cx_display";
export const PWA_DISPLAY_STANDALONE = "standalone";

/** ¿App instalada (PWA / “Añadir a inicio”)? */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    ("standalone" in navigator &&
      Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone,
      ))
  );
}

export function isStandaloneDisplayCookie(
  value: string | undefined | null,
): boolean {
  return value === PWA_DISPLAY_STANDALONE;
}

/** Sincroniza cookie para que el servidor trate la sesión como móvil/PWA. */
export function syncPwaDisplayCookie() {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:";
  const maxAge = 60 * 60 * 24 * 365;
  if (isStandaloneDisplayMode()) {
    document.cookie = `${PWA_DISPLAY_COOKIE}=${PWA_DISPLAY_STANDALONE}; path=/; max-age=${maxAge}; SameSite=Lax${secure ? "; Secure" : ""}`;
  }
}

/** Vista compacta: PWA instalada o viewport estrecho. */
export function prefersCompactExecutionUi(): boolean {
  if (typeof window === "undefined") return false;
  if (isStandaloneDisplayMode()) return true;
  return window.matchMedia("(max-width: 767px)").matches;
}
