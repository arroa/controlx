export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "DONE",
] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En curso",
  DONE: "Cerrado",
};

export type FeedbackItem = {
  id: string;
  message: string;
  status: FeedbackStatus;
  authorEmail: string;
  createdAt: string;
  updatedAt: string | null;
};
