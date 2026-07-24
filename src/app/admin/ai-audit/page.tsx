import { Command, ScrollText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AiAuditBoard } from "@/components/ai-audit-board";
import { AuthHeader } from "@/components/auth-header";
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
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
          <Link
            href="/dashboard"
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Command className="size-4" />
          </Link>
          <div>
            <p className="text-sm font-semibold leading-none">Auditoría IA</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Solo SuperAdmin
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <AuthHeader />
          </div>
        </div>
      </header>

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
