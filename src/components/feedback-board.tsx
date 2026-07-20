"use client";

import { LoaderCircle, MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FeedbackItem } from "@/lib/feedback-types";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function FeedbackBoard({
  initialItems,
}: {
  initialItems: FeedbackItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        item?: FeedbackItem;
      } | null;

      if (!response.ok || !payload?.item) {
        setError(payload?.error ?? "No fue posible enviar el comentario.");
        return;
      }

      setItems((current) => [payload.item!, ...current]);
      setMessage("");
      router.refresh();
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="size-5 text-primary" />
            Nueva mejora o comentario
          </CardTitle>
          <CardDescription>
            Canal temporal de la beta. Visible solo para OrgAdmins y SuperAdmin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="feedback-message">Comentario</Label>
              <Textarea
                id="feedback-message"
                required
                minLength={5}
                maxLength={4000}
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ideas, bugs, dudas de UX, prioridades…"
              />
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300"
              >
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={loading || message.trim().length < 5}>
              {loading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                "Publicar"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Comentarios</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Más recientes primero.
            </p>
          </div>
          <Badge variant="outline">{items.length}</Badge>
        </div>

        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium">
                      {item.authorEmail}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {formatWhen(item.createdAt)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {item.message}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Todavía no hay comentarios. Sé el primero.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
