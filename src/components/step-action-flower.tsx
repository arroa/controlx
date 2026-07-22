"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export type FlowerTone = "info" | "go" | "success" | "danger" | "neutral";

export type FlowerAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** @deprecated prefer `tone` */
  danger?: boolean;
  tone?: FlowerTone;
};

const TONE_STYLES: Record<FlowerTone, string> = {
  info: "border-sky-200 bg-sky-500 text-white shadow-sky-500/40 hover:bg-sky-400 hover:scale-110",
  go: "border-lime-200 bg-lime-500 text-lime-950 shadow-lime-500/40 hover:bg-lime-400 hover:scale-110",
  success:
    "border-emerald-200 bg-emerald-500 text-white shadow-emerald-500/45 hover:bg-emerald-400 hover:scale-110",
  danger:
    "border-rose-200 bg-rose-500 text-white shadow-rose-500/45 hover:bg-rose-400 hover:scale-110",
  neutral:
    "border-zinc-200 bg-zinc-100 text-zinc-900 shadow-black/30 hover:bg-white hover:scale-110",
};

function resolveTone(action: FlowerAction): FlowerTone {
  if (action.tone) return action.tone;
  if (action.danger) return "danger";
  return "neutral";
}

/** Menú tipo “flor” — horizontal (planificador) o vertical a la derecha (móvil). */
export function StepActionFlower({
  open,
  layout = "horizontal",
  openToRight = false,
  onToggle,
  onClose,
  actions,
}: {
  open: boolean;
  /** horizontal = encima del botón; vertical = a la derecha, de arriba a abajo */
  layout?: "horizontal" | "vertical";
  openToRight?: boolean;
  onToggle: () => void;
  onClose: () => void;
  actions: FlowerAction[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  return (
    <div ref={rootRef} className="relative size-6 shrink-0">
      <button
        type="button"
        aria-label="Acciones del paso"
        aria-expanded={open}
        title="Acciones"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={cn(
          "relative z-20 flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-black leading-none shadow-md transition-all",
          open
            ? "scale-110 border-white bg-violet-500 text-white ring-2 ring-violet-300/80"
            : "border-white/80 bg-violet-600 text-white hover:scale-110 hover:bg-violet-500",
        )}
      >
        ?
      </button>

      {open ? (
        <div
          className={cn(
            "absolute z-30 flex gap-2",
            layout === "vertical"
              ? "top-0 left-full ml-2 flex-col"
              : cn(
                  "bottom-full mb-2 flex-row items-center",
                  openToRight ? "left-0" : "right-0",
                ),
          )}
        >
          {actions.map((action, index) => {
            const Icon = action.icon;
            const tone = resolveTone(action);
            return (
              <button
                key={action.key}
                type="button"
                title={action.label}
                aria-label={action.label}
                disabled={action.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!action.disabled) action.onClick();
                }}
                className={cn(
                  "flex size-11 items-center justify-center rounded-full border-2 shadow-xl ring-2 ring-black/50 transition-transform animate-in fade-in-0 zoom-in-95 fill-mode-both",
                  layout === "vertical"
                    ? "slide-in-from-left-2"
                    : "slide-in-from-bottom-2",
                  action.disabled
                    ? "cursor-not-allowed border-zinc-500 bg-zinc-400 text-zinc-700 opacity-70"
                    : TONE_STYLES[tone],
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Icon
                  className="size-5 drop-shadow-sm"
                  strokeWidth={2.75}
                  absoluteStrokeWidth
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
