"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Bot,
  LoaderCircle,
  MessageCircle,
  SendHorizontal,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  GUIDE_ZONE_LABELS,
  type GuideZone,
} from "@/lib/ai/guide-zones";
import { cn } from "@/lib/utils";

const SUGGESTIONS_BY_ZONE: Record<GuideZone, string[]> = {
  events: [
    "¿Cómo funciona ControlX de punta a punta?",
    "¿Qué eventos tengo y en qué estado están?",
    "¿Qué debo preparar antes de una ejecución?",
  ],
  overview: [
    "¿Qué falta para que este evento pueda arrancar?",
    "Explícame el readiness de este evento",
    "¿Cómo se relaciona setup, diseño, roles y plan?",
  ],
  setup: [
    "¿Qué es el Día D y para qué sirve?",
    "¿Qué actores y roles tiene este evento?",
    "¿Cómo se usan workstreams y bloques?",
  ],
  design: [
    "Resume el diseño de este evento",
    "¿Cuántos pasos hay y cómo están organizados?",
    "¿Qué gates existen y qué abren?",
  ],
  roles: [
    "¿Qué pasos no tienen ejecutor?",
    "¿Cuántos pasos faltan de aprobador?",
    "¿Cómo se asignan roles a los pasos?",
  ],
  plan: [
    "¿Qué pasos no tienen condición de arranque?",
    "Explícame las dependencias del plan",
    "¿Cómo se conectan gates y horarios?",
  ],
  executions: [
    "¿Qué es una ejecución vs el diseño?",
    "¿Cuántas ejecuciones hay y en qué estado?",
    "¿Cuándo conviene un simulacro?",
  ],
};

export function ControlXGuideChat({
  zone,
  organizationId,
  eventId,
  eventName,
}: {
  zone: GuideZone;
  organizationId?: string;
  eventId?: string;
  eventName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/guide",
        body: {
          organizationId,
          eventId,
          zone,
        },
      }),
    [organizationId, eventId, zone],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: `guide:${zone}:${eventId ?? organizationId ?? "none"}`,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";
  const suggestions = SUGGESTIONS_BY_ZONE[zone];
  const title = eventId
    ? `Guía · ${eventName ?? "Evento"}`
    : "Guía de ControlX";

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    await sendMessage({ text: trimmed });
  }

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="fixed right-5 bottom-5 z-40 h-12 gap-2 rounded-full px-4 shadow-lg"
        onClick={() => setOpen(true)}
      >
        <MessageCircle className="size-4" />
        Asistente
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            "flex h-[min(820px,90vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border border-border bg-popover p-0 shadow-xl sm:max-w-3xl",
            "ring-1 ring-foreground/10",
          )}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-4 pr-12 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-4 text-primary" />
              {title}
            </DialogTitle>
            <DialogDescription>
              Explica el sistema con base de conocimiento y consulta el diseño
              real. Zona: {GUIDE_ZONE_LABELS[zone]}.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1 px-5">
            <div className="flex flex-col gap-3 py-4">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <div className="rounded-xl border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                    Preguntas de producto salen de la base de conocimiento.
                    Preguntas del evento leen la base de datos (solo lectura).
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="rounded-xl border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
                        onClick={() => void submit(suggestion)}
                        disabled={busy}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((message) => {
                const text = message.parts
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("");
                if (!text.trim()) return null;

                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-2",
                      isUser ? "justify-end" : "justify-start",
                    )}
                  >
                    {!isUser ? (
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Bot className="size-3.5" />
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "border bg-card",
                      )}
                    >
                      {text}
                    </div>
                  </div>
                );
              })}

              {busy ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  Consultando…
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  No pude responder. Revisa la API key o inténtalo de nuevo.
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <form
            className="shrink-0 border-t p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(input);
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Pregunta sobre el sistema o este diseño…"
                className="min-h-12 max-h-36 resize-none"
                disabled={busy}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit(input);
                  }
                }}
              />
              <Button
                type="submit"
                size="icon"
                className="size-12 shrink-0"
                disabled={busy || !input.trim()}
              >
                <SendHorizontal className="size-4" />
                <span className="sr-only">Enviar</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
