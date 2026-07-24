export const GUIDE_MAX_MESSAGES = 20;
export const GUIDE_MAX_MESSAGE_CHARS = 2000;
export const GUIDE_MAX_TOTAL_USER_CHARS = 12_000;
export const GUIDE_RATE_LIMIT_PER_HOUR = 30;
export const GUIDE_AUDIT_USER_MESSAGE_MAX = 500;
export const GUIDE_AUDIT_ASSISTANT_PREVIEW_MAX = 800;

export function truncateText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
