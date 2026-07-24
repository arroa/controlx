import "server-only";

import { ObjectId } from "mongodb";

import {
  GUIDE_AUDIT_ASSISTANT_PREVIEW_MAX,
  GUIDE_AUDIT_USER_MESSAGE_MAX,
  GUIDE_RATE_LIMIT_PER_HOUR,
  truncateText,
} from "@/lib/ai/guide-limits";
import type {
  AiGuideAuditItem,
  AiGuideAuditStatus,
} from "@/lib/ai/guide-audit-types";
import type { GuideZone } from "@/lib/ai/guide-zones";
import { getDatabase, isMongoConfigured } from "@/lib/mongodb";

export type { AiGuideAuditItem, AiGuideAuditStatus } from "@/lib/ai/guide-audit-types";
export { AI_GUIDE_AUDIT_STATUSES } from "@/lib/ai/guide-audit-types";

type AiGuideAuditDocument = {
  _id?: ObjectId;
  status: AiGuideAuditStatus;
  userId: string;
  userEmail: string;
  organizationId: string | null;
  eventId: string | null;
  zone: GuideZone;
  userMessage: string;
  assistantPreview?: string | null;
  toolNames?: string[];
  finishReason?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  blockedReason?: string | null;
  model: string;
  createdAt: Date;
};

function toItem(doc: AiGuideAuditDocument): AiGuideAuditItem {
  return {
    id: doc._id!.toHexString(),
    status: doc.status,
    userId: doc.userId,
    userEmail: doc.userEmail,
    organizationId: doc.organizationId,
    eventId: doc.eventId,
    zone: doc.zone,
    userMessage: doc.userMessage,
    assistantPreview: doc.assistantPreview ?? null,
    toolNames: doc.toolNames ?? [],
    finishReason: doc.finishReason ?? null,
    promptTokens: doc.promptTokens ?? null,
    completionTokens: doc.completionTokens ?? null,
    totalTokens: doc.totalTokens ?? null,
    blockedReason: doc.blockedReason ?? null,
    model: doc.model,
    createdAt: doc.createdAt.toISOString(),
  };
}

async function collection() {
  const database = await getDatabase();
  return database.collection<AiGuideAuditDocument>("aiGuideAudits");
}

export async function countRecentGuideRequests(
  userId: string,
  windowMs = 60 * 60 * 1000,
): Promise<number> {
  if (!isMongoConfigured()) return 0;
  const since = new Date(Date.now() - windowMs);
  const col = await collection();
  return col.countDocuments({
    userId,
    createdAt: { $gte: since },
    status: { $in: ["ok", "error"] },
  });
}

export async function assertGuideRateLimit(userId: string): Promise<
  | { ok: true }
  | { ok: false; error: string; count: number }
> {
  const count = await countRecentGuideRequests(userId);
  if (count >= GUIDE_RATE_LIMIT_PER_HOUR) {
    return {
      ok: false,
      count,
      error: `Límite de ${GUIDE_RATE_LIMIT_PER_HOUR} consultas por hora alcanzado. Intenta más tarde.`,
    };
  }
  return { ok: true };
}

export async function recordGuideAudit(input: {
  status: AiGuideAuditStatus;
  userId: string;
  userEmail: string;
  organizationId?: string | null;
  eventId?: string | null;
  zone: GuideZone;
  userMessage: string;
  assistantPreview?: string | null;
  toolNames?: string[];
  finishReason?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  blockedReason?: string | null;
  model: string;
}): Promise<void> {
  if (!isMongoConfigured()) return;

  try {
    const col = await collection();
    await col.insertOne({
      status: input.status,
      userId: input.userId,
      userEmail: input.userEmail.toLowerCase(),
      organizationId: input.organizationId ?? null,
      eventId: input.eventId ?? null,
      zone: input.zone,
      userMessage: truncateText(
        input.userMessage,
        GUIDE_AUDIT_USER_MESSAGE_MAX,
      ),
      assistantPreview: input.assistantPreview
        ? truncateText(
            input.assistantPreview,
            GUIDE_AUDIT_ASSISTANT_PREVIEW_MAX,
          )
        : null,
      toolNames: input.toolNames ?? [],
      finishReason: input.finishReason ?? null,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      blockedReason: input.blockedReason ?? null,
      model: input.model,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[ai-guide-audit] no se pudo guardar", error);
  }
}

export async function listGuideAudits(limit = 100): Promise<AiGuideAuditItem[]> {
  if (!isMongoConfigured()) return [];
  const col = await collection();
  const rows = await col
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 300))
    .toArray();
  return rows.map(toItem);
}
