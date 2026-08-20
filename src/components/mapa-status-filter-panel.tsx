"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RuntimeStepStatus } from "@/lib/execution-types";
import { cn } from "@/lib/utils";

export type StatusFilterChip = {
  status: RuntimeStepStatus;
  label: string;
  activeClass: string;
};

type MapaStatusFilterPanelProps = {
  open: boolean;
  chips: StatusFilterChip[];
  selected: Set<RuntimeStepStatus>;
  onToggle: (status: RuntimeStepStatus) => void;
  onClear: () => void;
  onClose: () => void;
};

export function MapaStatusFilterPanel({
  open,
  chips,
  selected,
  onToggle,
  onClear,
  onClose,
}: MapaStatusFilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [position, setPosition] = useState({ x: 24, y: 96 });

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  function handleDragStart(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDragMove(event: React.PointerEvent<HTMLDivElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const nextX = session.originX + (event.clientX - session.startX);
    const nextY = session.originY + (event.clientY - session.startY);
    const panel = panelRef.current;
    const maxX = panel
      ? Math.max(8, window.innerWidth - panel.offsetWidth - 8)
      : window.innerWidth - 8;
    const maxY = panel
      ? Math.max(8, window.innerHeight - panel.offsetHeight - 8)
      : window.innerHeight - 8;

    setPosition({
      x: Math.min(maxX, Math.max(8, nextX)),
      y: Math.min(maxY, Math.max(8, nextY)),
    });
  }

  function handleDragEnd(event: React.PointerEvent<HTMLDivElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="absolute w-[min(28rem,calc(100vw-2rem))] rounded-2xl border-4 border-amber-400/90 bg-card shadow-2xl"
        style={{ left: position.x, top: position.y }}
        role="dialog"
        aria-labelledby="mapa-status-filter-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex cursor-grab items-center justify-between gap-2 border-b px-3 py-2 active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div className="min-w-0">
            <p
              id="mapa-status-filter-title"
              className="text-xs font-semibold uppercase tracking-wide text-cyan-300"
            >
              Filtrar estados
            </p>
            <p className="text-[10px] text-muted-foreground">
              Arrastra · multiselección
            </p>
          </div>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[min(18rem,50vh)] overflow-y-auto p-3">
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => {
              const active = selected.has(chip.status);
              return (
                <button
                  key={chip.status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggle(chip.status)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-all",
                    active
                      ? cn("scale-[1.03] font-bold shadow-md", chip.activeClass)
                      : "border-border/70 bg-muted/20 font-medium text-muted-foreground opacity-80 hover:opacity-100",
                  )}
                >
                  {active ? "● " : null}
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 border-t px-3 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1"
            disabled={selected.size === 0}
            onClick={onClear}
          >
            Limpiar
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            onClick={onClose}
          >
            Listo
            {selected.size > 0 ? ` · ${selected.size}` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
