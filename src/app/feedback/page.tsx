import { Command, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthHeader } from "@/components/auth-header";
import { FeedbackBoard } from "@/components/feedback-board";
import { Badge } from "@/components/ui/badge";
import { canAccessFeedback, listFeedback } from "@/lib/feedback";
import { getCurrentUser } from "@/lib/current-user";

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await canAccessFeedback(user))) redirect("/");

  const items = await listFeedback();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
          <Link
            href={user.isSuperAdmin ? "/dashboard" : "/"}
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          <div>
            <p className="text-sm font-semibold leading-none">Mejoras</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Beta temporal
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <MessageSquareText className="size-3" />
              OrgAdmin+
            </Badge>
            <AuthHeader />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <section className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Canal de mejoras
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ideas y hallazgos del equipo. Página temporal de la beta.
          </p>
        </section>

        <FeedbackBoard initialItems={items} />
      </main>
    </div>
  );
}
