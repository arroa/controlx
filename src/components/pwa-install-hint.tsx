"use client";

import { Download, Share, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIos() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * CTA explícito para instalar la PWA.
 * - Si Chrome dispara beforeinstallprompt → prompt nativo
 * - Si no → muestra cómo hacerlo (menú ⋮ o Compartir en iOS)
 */
export function PwaInstallHint({
  className,
  variant = "compact",
}: {
  className?: string;
  /** landing = botón grande siempre visible */
  variant?: "compact" | "landing";
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setHidden(true);
      return;
    }
    setHidden(false);
    setIos(isIos());

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (hidden) return null;

  async function installNative() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === "accepted") setHidden(true);
  }

  function onInstallClick() {
    if (deferred) {
      void installNative();
      return;
    }
    setShowHelp((open) => !open);
  }

  const help = (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-left text-xs leading-relaxed text-muted-foreground">
      {ios ? (
        <p className="flex items-start gap-2">
          <Share className="mt-0.5 size-3.5 shrink-0" />
          <span>
            En Safari: tocá <strong className="text-foreground">Compartir</strong>{" "}
            →{" "}
            <strong className="text-foreground">
              Añadir a pantalla de inicio
            </strong>
            .
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2">
          <Smartphone className="mt-0.5 size-3.5 shrink-0" />
          <span>
            En Chrome: menú <strong className="text-foreground">⋮</strong> →{" "}
            <strong className="text-foreground">Instalar app</strong> o{" "}
            <strong className="text-foreground">
              Añadir a la pantalla de inicio
            </strong>
            .
          </span>
        </p>
      )}
    </div>
  );

  if (variant === "landing") {
    return (
      <div className={cn("flex w-full flex-col items-stretch gap-2", className)}>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-11 min-h-11 w-full text-base"
          onClick={onInstallClick}
        >
          <Download className="size-4" />
          {deferred ? "Instalar app" : "Cómo instalar la app"}
        </Button>
        {showHelp ? help : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/40 px-3 py-2.5">
        <p className="min-w-0 text-xs text-cyan-50/90">
          Instalá ControlX en el teléfono para entrar más rápido.
        </p>
        <Button size="sm" type="button" onClick={onInstallClick}>
          <Download className="size-3.5" />
          {deferred ? "Instalar" : "Cómo"}
        </Button>
      </div>
      {showHelp ? help : null}
    </div>
  );
}
