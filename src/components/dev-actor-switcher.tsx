"use client";

import { UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventActorSummary } from "@/lib/event-actors";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export function DevActorSwitcher({
  eventId,
  actors,
  selectedActorId,
  className,
}: {
  eventId: string;
  actors: EventActorSummary[];
  selectedActorId: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(selectedActorId ?? NONE);
  const [error, setError] = useState("");

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
    startTransition(() => {
      router.refresh();
    });
  }

  if (!actors.length) return null;

  return (
    <div className={cn("flex max-w-[14rem] flex-col gap-0.5", className)}>
      <Select
        value={value}
        disabled={pending}
        onValueChange={(next) => {
          if (next) void apply(next);
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-8 border-amber-500/40 bg-amber-500/10 text-amber-100"
        >
          <UserRound className="size-3.5 shrink-0 text-amber-200" />
          <SelectValue placeholder="Actuar como…" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={NONE}>Yo (sin impersonar)</SelectItem>
          {actors.map((actor) => (
            <SelectItem key={actor.id} value={actor.id}>
              {actor.name}
              {actor.roles.includes("EXECUTOR") ? " · ej" : ""}
              {actor.roles.includes("APPROVER") ? " · ap" : ""}
              {actor.roles.includes("STEERCO") ? " · sc" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p className="text-[10px] text-red-300">{error}</p>
      ) : (
        <p className="truncate text-[10px] text-amber-200/70">
          Mock · actuar como
        </p>
      )}
    </div>
  );
}
