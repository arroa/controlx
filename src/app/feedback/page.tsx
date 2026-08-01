import { MessageSquareText } from "lucide-react";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { FeedbackBoard } from "@/components/feedback-board";
import { Badge } from "@/components/ui/badge";
import {
  canAccessFeedback,
  canModerateFeedback,
  listFeedbackForUser,
} from "@/lib/feedback";
import { getCurrentUser } from "@/lib/current-user";

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await canAccessFeedback(user))) redirect("/");

  const canModerate = await canModerateFeedback(user);
  const items = await listFeedbackForUser(user);

  return (
    <div className="min-h-screen">
      <AppHeader
        homeHref={user.isSuperAdmin ? "/dashboard" : "/ejecuciones"}
        title="Mejoras"
        actions={
          <Badge variant="outline" className="gap-1.5">
            <MessageSquareText className="size-3" />
            {canModerate ? "Todos" : "Míos"}
          </Badge>
        }
      />

      <main className="mx-auto max-w-7xl px-6 py-6">
        <section className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Canal de mejoras
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ideas y hallazgos del equipo. Página temporal de la beta.
            {canModerate
              ? " Como moderador ves todos los comentarios."
              : " Solo ves y editas los tuyos."}
          </p>
        </section>

        <FeedbackBoard
          initialItems={items}
          viewer={{
            id: user.id,
            email: user.email,
            canModerate,
          }}
        />
      </main>
    </div>
  );
}
