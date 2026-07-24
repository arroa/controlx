export const GUIDE_ZONES = [
  "events",
  "overview",
  "setup",
  "design",
  "roles",
  "plan",
  "executions",
] as const;

export type GuideZone = (typeof GUIDE_ZONES)[number];

export const GUIDE_ZONE_LABELS: Record<GuideZone, string> = {
  events: "Lista de eventos",
  overview: "Resumen y readiness del evento",
  setup: "Setup",
  design: "Diseño",
  roles: "Roles",
  plan: "Planificador",
  executions: "Ejecuciones",
};

export function isGuideZone(value: unknown): value is GuideZone {
  return (
    typeof value === "string" &&
    (GUIDE_ZONES as readonly string[]).includes(value)
  );
}
