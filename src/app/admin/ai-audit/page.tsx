import { ScrollText } from "lucide-react";
import { redirect } from "next/navigation";

import { AiAuditBoard } from "@/components/ai-audit-board";
import { AppHeader } from "@/components/app-header";
import { listGuideAudits } from "@/lib/ai/guide-audit";
import {
  GUIDE_MAX_MESSAGE_CHARS,
  GUIDE_MAX_MESSAGES,
  GUIDE_RATE_LIMIT_PER_HOUR,
} from "@/lib/ai/guide-limits";
import { getCurrentUser } from "@/lib/current-user";

export default async function AiAuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.isSuperAdmin) redirect("/");

  const items = await listGuideAudits(200);

  return (
    <div className="min-h-screen">
      <AppHeader homeHref="/dashboard" title="Auditoría IA" />

      <main className="mx-auto max-w-7xl px-6 py-6">
        <section className="mb-6">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ScrollText className="size-4" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Auditoría del asistente
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Registro de consultas al guía de ControlX: quién preguntó, qué
                zona, tools usadas, rechazos y rate limits. Límites actuales:{" "}
                {GUIDE_RATE_LIMIT_PER_HOUR}/hora · máx. {GUIDE_MAX_MESSAGES}{" "}
                msgs · {GUIDE_MAX_MESSAGE_CHARS} chars/msg.
              </p>
            </div>
          </div>
        </section>

        <AiAuditBoard initialItems={items} />
      </main>
    </div>
  );
}
