import type { GuideZone } from "@/lib/ai/guide-zones";

export const AI_GUIDE_AUDIT_STATUSES = [
  "ok",
  "rate_limited",
  "rejected",
  "error",
] as const;

export type AiGuideAuditStatus = (typeof AI_GUIDE_AUDIT_STATUSES)[number];

export type AiGuideAuditItem = {
  id: string;
  status: AiGuideAuditStatus;
  userId: string;
  userEmail: string;
  organizationId: string | null;
  eventId: string | null;
  zone: GuideZone;
  userMessage: string;
  assistantPreview: string | null;
  toolNames: string[];
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  blockedReason: string | null;
  model: string;
  createdAt: string;
};
