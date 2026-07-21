export type ReadinessTone = "ready" | "warn" | "blocked" | "empty";

export type ReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  tone: ReadinessTone;
  href?: string;
};

export type EventReadinessSummary = {
  setup: ReadinessTone;
  design: ReadinessTone;
  roles: ReadinessTone;
  plan: ReadinessTone;
};

export type EventReadiness = {
  eventId: string;
  setup: ReadinessCheck[];
  design: ReadinessCheck[];
  roles: ReadinessCheck[];
  plan: ReadinessCheck[];
  canStart: boolean;
  blockers: string[];
  summary: EventReadinessSummary;
  /** true = hubo cambios de preparación; hay que recalcular. */
  stale: boolean;
  computedAt: string | null;
  /**
   * Reserva para análisis IA futuro (OpenAI, etc.).
   * No se usa aún en el MVP.
   */
  aiAnalysis?: {
    summary: string;
    model: string;
    computedAt: string;
  } | null;
};
