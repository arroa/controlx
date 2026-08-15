export const FEEDBACK_STATUSES = [
  "OPEN",
  "DISCARDED",
  "IMPLEMENTED",
] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  OPEN: "Abierta",
  DISCARDED: "Descartada",
  IMPLEMENTED: "Implementada",
};

const LEGACY_STATUS_MAP: Record<string, FeedbackStatus> = {
  OPEN: "OPEN",
  IN_PROGRESS: "OPEN",
  DONE: "IMPLEMENTED",
  DISCARDED: "DISCARDED",
  IMPLEMENTED: "IMPLEMENTED",
};

export function normalizeFeedbackStatus(
  status: string | null | undefined,
): FeedbackStatus {
  return LEGACY_STATUS_MAP[status ?? ""] ?? "OPEN";
}

export function feedbackStatusNoteLabel(status: FeedbackStatus): string {
  if (status === "DISCARDED") return "Motivo";
  if (status === "IMPLEMENTED") return "Implementación";
  return "Nota de estado";
}

export function feedbackStatusNoteHint(status: FeedbackStatus): string {
  if (status === "DISCARDED") return "Por qué se descarta esta mejora…";
  if (status === "IMPLEMENTED") return "Cómo se implementó…";
  return "Nota opcional sobre el estado.";
}

export type FeedbackItem = {
  id: string;
  message: string;
  status: FeedbackStatus;
  statusNote: string | null;
  statusChangedAt: string;
  authorId: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string | null;
};
