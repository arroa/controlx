"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  LoaderCircle,
  SendHorizontal,
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
import { XavierAvatar } from "@/components/xavier-avatar";
import type { GuideZone } from "@/lib/ai/guide-zones";
import { cn } from "@/lib/utils";

export const GUIDE_ASSISTANT_NAME = "Xavier";
export const GUIDE_ASSISTANT_TAGLINE = "Tu asistente de IA en ControlX";

/** TEMP: capturar cuerpo de error del API para depurar en UI. Quitar luego. */
type GuideDebugDump = {
  at: string;
  httpStatus: number | null;
  clientContext: {
    zone: GuideZone;
    organizationId?: string;
    eventId?: string;
  };
  serverBody: unknown;
  errorMessage: string;
};

export function ControlXGuideChat({
  zone,
  organizationId,
  eventId,
  open,
  onOpenChange,
}: {
  zone: GuideZone;
  organizationId?: string;
  eventId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [debugDump, setDebugDump] = useState<GuideDebugDump | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/guide",
        body: {
          organizationId,
          eventId,
          zone,
        },
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (!response.ok) {
            let serverBody: unknown = null;
            try {
              serverBody = await response.clone().json();
            } catch {
              try {
                serverBody = await response.clone().text();
              } catch {
                serverBody = null;
              }
            }
            setDebugDump({
              at: new Date().toISOString(),
              httpStatus: response.status,
              clientContext: { zone, organizationId, eventId },
              serverBody,
              errorMessage:
                typeof serverBody === "object" &&
                serverBody &&
                "error" in serverBody &&
                typeof (serverBody as { error: unknown }).error === "string"
                  ? (serverBody as { error: string }).error
                  : `HTTP ${response.status}`,
            });
          } else {
            setDebugDump(null);
          }
          return response;
        },
      }),
    [organizationId, eventId, zone],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: `guide:${zone}:${eventId ?? organizationId ?? "global"}`,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setDebugDump(null);
    await sendMessage({ text: trimmed });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[min(820px,90vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border border-border bg-popover p-0 shadow-xl sm:max-w-3xl",
          "ring-1 ring-foreground/10",
        )}
      >
          <DialogHeader className="shrink-0 flex-row items-center gap-2.5 space-y-0 border-b px-5 py-4 pr-12 text-left">
            <XavierAvatar sizeClassName="size-8" />
            <DialogTitle className="text-lg">
              {GUIDE_ASSISTANT_NAME}
            </DialogTitle>
            <DialogDescription className="truncate text-sm">
              {GUIDE_ASSISTANT_TAGLINE}
            </DialogDescription>
          </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 px-5">
          <div className="flex flex-col gap-3 py-4">
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
                    <XavierAvatar sizeClassName="size-7" className="mt-0.5" />
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
                Pensando…
              </div>
            ) : null}

            {error || debugDump ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  No pude responder. Revisa la API key o inténtalo de nuevo.
                </div>
                {/* TEMP debug Xavier — quitar cuando cerremos el caso */}
                <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  <p className="mb-1 font-semibold text-amber-50">
                    DEBUG Xavier (temporal) — copia y pégame esto
                  </p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-amber-50/95">
                    {JSON.stringify(
                      {
                        clientError: error?.message ?? null,
                        ...(debugDump ?? {
                          at: new Date().toISOString(),
                          httpStatus: null,
                          clientContext: {
                            zone,
                            organizationId,
                            eventId,
                          },
                          serverBody: null,
                          errorMessage: error?.message ?? "sin detalle",
                        }),
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
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
              placeholder={`Pregúntale a ${GUIDE_ASSISTANT_NAME}…`}
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
  );
}
