/** Bump this when you want the login modal (and seed de novedades) to refrescarse. */
export const RELEASE_NOTES_VERSION = "2026-07-20-roles";

export const RELEASE_NOTES_STORAGE_KEY = `controlx:release-notes-dismissed:${RELEASE_NOTES_VERSION}`;

export type ReleaseNoteItem = {
  title: string;
  detail: string;
};

export const RELEASE_NOTES: {
  title: string;
  summary: string;
  /** Título en la tabla de /novedades */
  novedadTitle: string;
  novedadIcon: "roles";
  items: ReleaseNoteItem[];
} = {
  title: "Hay cambios nuevos en ControlX",
  summary:
    "Actualizamos la preparación del evento: actores, roles y un canal de novedades.",
  novedadTitle: "Actores, Roles, aprobadores y canal de novedades",
  novedadIcon: "roles",
  items: [
    {
      title: "Mapa de actores (Setup)",
      detail:
        "Alta, edición y baja de actores con nombre, email, área y roles del evento (incluye Clerk en el alta).",
    },
    {
      title: "Roles",
      detail:
        "Nueva estación entre Diseño y Plan: una sola lista de pasos con columnas de ejecutor y aprobadores.",
    },
    {
      title: "Ejecutores y aprobadores",
      detail:
        "Toggle en el mapa de actores para filtrar Ejecutores / Aprobadores (SteerCo incluido). Un ejecutor por paso; varios aprobadores.",
    },
    {
      title: "Novedades",
      detail:
        "Historial de cambios del producto en el menú superior (ABM solo SuperAdmin).",
    },
    {
      title: "Planificador",
      detail:
        "Ajustes de UX en Tiempos y guardado del Día D.",
    },
  ],
};

/** Texto multilínea para el campo `changes` de novedades. */
export function releaseNotesChangesText(): string {
  return RELEASE_NOTES.items
    .map((item) => `${item.title}: ${item.detail}`)
    .join("\n");
}
