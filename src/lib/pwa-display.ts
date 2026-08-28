/** Cookie que el cliente setea al abrir la app instalada (standalone). */
export const PWA_DISPLAY_COOKIE = "cx_display";
export const PWA_DISPLAY_STANDALONE = "standalone";
export const PWA_DOCUMENT_CLASS = "cx-pwa";

export const COMPACT_WIDTH_MQ = "(max-width: 1023px)";
const NARROW_WIDTH_MQ = "(max-width: 767px)";
const STANDALONE_MQ = "(display-mode: standalone)";
const FULLSCREEN_MQ = "(display-mode: fullscreen)";
const MINIMAL_UI_MQ = "(display-mode: minimal-ui)";

/** ¿App instalada (PWA / “Añadir a inicio”)? */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia(STANDALONE_MQ).matches ||
    window.matchMedia(FULLSCREEN_MQ).matches ||
    window.matchMedia(MINIMAL_UI_MQ).matches ||
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

export function hasPwaDisplayCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes(
    `${PWA_DISPLAY_COOKIE}=${PWA_DISPLAY_STANDALONE}`,
  );
}

function isTouchLikeDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches
  );
}

/** Vista compacta: PWA instalada, cookie, táctil o viewport estrecho. */
export function prefersCompactExecutionUi(): boolean {
  if (typeof window === "undefined") return false;
  if (hasPwaDisplayCookie()) return true;
  if (isStandaloneDisplayMode()) return true;
  if (document.documentElement.classList.contains(PWA_DOCUMENT_CLASS)) {
    return true;
  }
  if (isTouchLikeDevice() && window.matchMedia(COMPACT_WIDTH_MQ).matches) {
    return true;
  }
  return window.matchMedia(NARROW_WIDTH_MQ).matches;
}

export function applyCompactDocumentClass() {
  if (typeof document === "undefined") return;
  if (prefersCompactExecutionUi()) {
    document.documentElement.classList.add(PWA_DOCUMENT_CLASS);
  } else {
    document.documentElement.classList.remove(PWA_DOCUMENT_CLASS);
  }
}

/** Sincroniza cookie + clase para que servidor y CSS traten la sesión como PWA. */
export function syncPwaDisplayCookie() {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:";
  const maxAge = 60 * 60 * 24 * 365;
  if (isStandaloneDisplayMode()) {
    document.cookie = `${PWA_DISPLAY_COOKIE}=${PWA_DISPLAY_STANDALONE}; path=/; max-age=${maxAge}; SameSite=Lax${secure ? "; Secure" : ""}`;
    document.documentElement.classList.add(PWA_DOCUMENT_CLASS);
    return;
  }
  applyCompactDocumentClass();
}

export function subscribeCompactUi(onChange: () => void) {
  const widthMq = window.matchMedia(COMPACT_WIDTH_MQ);
  const narrowMq = window.matchMedia(NARROW_WIDTH_MQ);
  const standaloneMq = window.matchMedia(STANDALONE_MQ);
  const coarseMq = window.matchMedia("(pointer: coarse)");
  widthMq.addEventListener("change", onChange);
  narrowMq.addEventListener("change", onChange);
  standaloneMq.addEventListener("change", onChange);
  coarseMq.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => {
    widthMq.removeEventListener("change", onChange);
    narrowMq.removeEventListener("change", onChange);
    standaloneMq.removeEventListener("change", onChange);
    coarseMq.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

export function getCompactUiSnapshot() {
  return prefersCompactExecutionUi();
}

export function getCompactUiServerSnapshot() {
  return false;
}

/** Script inline: corre antes del paint para cookie/clase PWA. */
export const PWA_BOOTSTRAP_SCRIPT = `(function(){try{var s=matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: fullscreen)").matches||matchMedia("(display-mode: minimal-ui)").matches||window.navigator.standalone;if(s){document.documentElement.classList.add("cx-pwa");document.cookie="cx_display=standalone;path=/;max-age=31536000;SameSite=Lax"+(location.protocol==="https:"?"; Secure":"");}}catch(e){}})();`;
