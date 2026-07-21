export const NOVEDAD_ICONS = [
  "sparkles",
  "users",
  "roles",
  "setup",
  "planner",
  "fix",
  "shield",
] as const;

export type NovedadIcon = (typeof NOVEDAD_ICONS)[number];

export const NOVEDAD_ICON_LABELS: Record<NovedadIcon, string> = {
  sparkles: "General",
  users: "Actores",
  roles: "Roles",
  setup: "Setup",
  planner: "Planificador",
  fix: "Corrección",
  shield: "Acceso",
};

export type NovedadItem = {
  id: string;
  publishedAt: string;
  title: string;
  changes: string;
  icon: NovedadIcon;
  createdAt: string;
};
