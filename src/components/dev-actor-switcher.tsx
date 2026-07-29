"use client";

import { Check, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EventActorSummary } from "@/lib/event-actors";
import { cn } from "@/lib/utils";

const NONE = "__none__";

function roleHints(actor: EventActorSummary) {
  const bits: string[] = [];
  if (actor.roles.includes("EXECUTOR")) bits.push("ejecutor");
  if (actor.roles.includes("APPROVER")) bits.push("aprobador");
  if (actor.roles.includes("STEERCO")) bits.push("steerco");
  if (actor.roles.includes("EVENT_ADMIN")) bits.push("admin");
  return bits.join(" · ");
}

export function DevActorSwitcher({
  eventId,
  actors,
  selectedActorId,
  className,
  /** Abre la modal al montar (p. ej. pantalla “elige actor”). */
  defaultOpen = false,
  /** Solo lista, sin botón de header (útil en empty state). */
  embedInPage = false,
}: {
  eventId: string;
  actors: EventActorSummary[];
  selectedActorId: string | null;
  className?: string;
  defaultOpen?: boolean;
  embedInPage?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(selectedActorId ?? NONE);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(selectedActorId ?? NONE);
  }, [selectedActorId]);

  const selected = actors.find((actor) => actor.id === selectedActorId);
  const active = Boolean(selectedActorId);

  async function apply(next: string) {
    setError("");
    setValue(next);
    const response = await fetch("/api/dev/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        actorId: next === NONE ? null : next,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      const payload = (await response?.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(payload?.error ?? "No se pudo cambiar de actor.");
      setValue(selectedActorId ?? NONE);
      return;
    }
    setOpen(false);
    startTransition(() => {
      router.refresh();
    });
  }

  if (!actors.length) return null;

  const picker = (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void apply(NONE)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
          value === NONE
            ? "border-amber-400/50 bg-amber-500/15"
            : "border-border/60 bg-muted/20 hover:bg-muted/40",
          pending && "opacity-60",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Yo (sin impersonar)</span>
          <span className="block text-xs text-muted-foreground">
            Sesión real, sin mock de actor
          </span>
        </span>
        {value === NONE ? (
          <Check className="size-4 shrink-0 text-amber-200" />
        ) : null}
      </button>

      <ul className="max-h-[min(50vh,22rem)] space-y-1.5 overflow-y-auto">
        {actors.map((actor) => {
          const selectedRow = value === actor.id;
          const hints = roleHints(actor);
          return (
            <li key={actor.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => void apply(actor.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
                  selectedRow
                    ? "border-amber-400/50 bg-amber-500/15"
                    : "border-border/60 bg-muted/20 hover:bg-muted/40",
                  pending && "opacity-60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {actor.name}
                  </span>
                  {hints ? (
                    <span className="block truncate text-xs text-muted-foreground capitalize">
                      {hints}
                    </span>
                  ) : null}
                </span>
                {selectedRow ? (
                  <Check className="size-4 shrink-0 text-amber-200" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );

  if (embedInPage) {
    return <div className={cn("w-full", className)}>{picker}</div>;
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={
          selected
            ? `Actuar como ${selected.name}`
            : "Mock · actuar como un actor"
        }
        aria-label="Elegir actor (mock)"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen(true)}
        className={cn(
          "relative shrink-0 border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 hover:text-amber-50",
          className,
        )}
      >
        <Users className="size-4" />
        {active ? (
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-300 ring-2 ring-background" />
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-4 text-amber-200" />
              Actuar como…
            </DialogTitle>
            <DialogDescription>
              Mock de desarrollo: elegí un actor del mapa para probar Mi turno
              y permisos.
              {selected ? (
                <>
                  {" "}
                  Ahora: <span className="text-foreground">{selected.name}</span>.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {picker}
        </DialogContent>
      </Dialog>
    </>
  );
}
