"use client";

import type { LucideIcon } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type FlowerTone = "info" | "go" | "success" | "danger" | "neutral";

export type FlowerAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Tooltip nativo del botón. */
  title?: string;
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

type MenuCoords = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

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
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function update() {
      const node = rootRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (layout === "vertical") {
        setCoords({
          top: rect.top,
          left: rect.right + 8,
        });
        return;
      }
      const bottom = window.innerHeight - rect.top + 8;
      if (openToRight) {
        setCoords({ bottom, left: rect.left });
      } else {
        setCoords({ bottom, right: window.innerWidth - rect.right });
      }
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, layout, openToRight]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.getElementById("step-action-flower-menu");
      if (menu?.contains(target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  const menu =
    open && mounted && coords
      ? createPortal(
          <div
            id="step-action-flower-menu"
            className={cn(
              "pointer-events-auto fixed z-[200] flex gap-2",
              layout === "vertical" ? "flex-col" : "flex-row items-center",
            )}
            style={{
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
              right: coords.right,
            }}
          >
            {actions.map((action, index) => {
              const Icon = action.icon;
              const tone = resolveTone(action);
              return (
                <button
                  key={action.key}
                  type="button"
                  title={action.title ?? action.label}
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative size-6 shrink-0 overflow-visible">
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
      {menu}
    </div>
  );
}
