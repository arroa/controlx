import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canAccessEvent,
  canAccessOrganization,
  getEventWorkspace,
} from "@/lib/admin-data";
import { assertGuideRateLimit, recordGuideAudit } from "@/lib/ai/guide-audit";
import {
  looksLikePromptInjection,
  validateGuideMessages,
} from "@/lib/ai/guide-messages";
import { buildGuideSystemPrompt } from "@/lib/ai/guide-prompt";
import { createGuideTools } from "@/lib/ai/guide-tools";
import { isGuideZone } from "@/lib/ai/guide-zones";
import { requireUser } from "@/lib/api-auth";
import { isMongoConfigured } from "@/lib/mongodb";

export const maxDuration = 60;

const GUIDE_MODEL = "gpt-4o-mini";

const bodySchema = z.object({
  messages: z.array(z.unknown()),
  organizationId: z.string().optional(),
  eventId: z.string().optional(),
  zone: z.string().optional(),
});

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY no está configurada. Agrégala a .env.local para usar el asistente.",
      },
      { status: 503 },
    );
  }

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "MongoDB no está configurado." },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const zone = isGuideZone(parsed.data.zone) ? parsed.data.zone : "events";
  const organizationId = parsed.data.organizationId?.trim() || undefined;
  const eventId = parsed.data.eventId?.trim() || undefined;
  const { user } = authResult;

  const validated = validateGuideMessages(parsed.data.messages);
  if (!validated.ok) {
    await recordGuideAudit({
      status: "rejected",
      userId: user.id,
      userEmail: user.email,
      organizationId,
      eventId,
      zone,
      userMessage: "(mensaje inválido)",
      blockedReason: validated.error,
      model: GUIDE_MODEL,
    });
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (looksLikePromptInjection(validated.lastUserText)) {
    await recordGuideAudit({
      status: "rejected",
      userId: user.id,
      userEmail: user.email,
      organizationId,
      eventId,
      zone,
      userMessage: validated.lastUserText,
      blockedReason: "Posible prompt injection / jailbreak",
      model: GUIDE_MODEL,
    });
    return NextResponse.json(
      {
        error:
          "Esa solicitud no está permitida. Pregunta sobre ControlX o el diseño del evento.",
      },
      { status: 400 },
    );
  }

  if (eventId) {
    const allowed =
      user.isSuperAdmin || (await canAccessEvent(user.email, eventId));
    if (!allowed) {
      await recordGuideAudit({
        status: "rejected",
        userId: user.id,
        userEmail: user.email,
        organizationId,
        eventId,
        zone,
        userMessage: validated.lastUserText,
        blockedReason: "Sin acceso al evento",
        model: GUIDE_MODEL,
      });
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }
  } else if (organizationId) {
    const allowed =
      user.isSuperAdmin ||
      (await canAccessOrganization(user.email, organizationId));
    if (!allowed) {
      await recordGuideAudit({
        status: "rejected",
        userId: user.id,
        userEmail: user.email,
        organizationId,
        eventId,
        zone,
        userMessage: validated.lastUserText,
        blockedReason: "Sin acceso a la organización",
        model: GUIDE_MODEL,
      });
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }
  } else {
    return NextResponse.json(
      { error: "Falta organizationId o eventId." },
      { status: 400 },
    );
  }

  const rate = await assertGuideRateLimit(user.id);
  if (!rate.ok) {
    await recordGuideAudit({
      status: "rate_limited",
      userId: user.id,
      userEmail: user.email,
      organizationId,
      eventId,
      zone,
      userMessage: validated.lastUserText,
      blockedReason: rate.error,
      model: GUIDE_MODEL,
    });
    return NextResponse.json({ error: rate.error }, { status: 429 });
  }

  let eventName: string | undefined;
  let resolvedOrganizationId = organizationId;

  if (eventId) {
    const workspace = await getEventWorkspace(eventId);
    if (!workspace) {
      return NextResponse.json(
        { error: "Evento no encontrado." },
        { status: 404 },
      );
    }
    eventName = workspace.event.name;
    resolvedOrganizationId =
      resolvedOrganizationId ?? workspace.organization?.id;
  }

  const result = streamText({
    model: openai(GUIDE_MODEL),
    instructions: buildGuideSystemPrompt({
      zone,
      organizationId: resolvedOrganizationId,
      eventId,
      eventName,
    }),
    messages: await convertToModelMessages(validated.messages),
    tools: createGuideTools({
      userEmail: user.email,
      isSuperAdmin: user.isSuperAdmin,
      organizationId: resolvedOrganizationId,
      eventId,
      zone,
    }),
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1200,
    onEnd: async (event) => {
      const toolNames = Array.from(
        new Set(
          (event.toolCalls ?? [])
            .map((call) =>
              "toolName" in call && typeof call.toolName === "string"
                ? call.toolName
                : null,
            )
            .filter((name): name is string => Boolean(name)),
        ),
      );

      await recordGuideAudit({
        status: "ok",
        userId: user.id,
        userEmail: user.email,
        organizationId: resolvedOrganizationId,
        eventId,
        zone,
        userMessage: validated.lastUserText,
        assistantPreview: event.text ?? null,
        toolNames,
        finishReason: event.finishReason ?? null,
        promptTokens: event.usage?.inputTokens ?? null,
        completionTokens: event.usage?.outputTokens ?? null,
        totalTokens: event.usage?.totalTokens ?? null,
        model: GUIDE_MODEL,
      });
    },
  });

  void Promise.resolve(result.consumeStream()).catch(async (error: unknown) => {
    console.error("[ai-guide] stream error", error);
    await recordGuideAudit({
      status: "error",
      userId: user.id,
      userEmail: user.email,
      organizationId: resolvedOrganizationId,
      eventId,
      zone,
      userMessage: validated.lastUserText,
      blockedReason:
        error instanceof Error ? error.message : "Error de streaming",
      model: GUIDE_MODEL,
    });
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
