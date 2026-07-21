/** Bump this when you want the login modal to show again for everyone. */
export const RELEASE_NOTES_VERSION = "2026-07-20-roles";

export const RELEASE_NOTES_STORAGE_KEY = `controlx:release-notes-dismissed:${RELEASE_NOTES_VERSION}`;

export type ReleaseNoteItem = {
  title: string;
  detail: string;
};

export const RELEASE_NOTES: {
  title: string;
  summary: string;
  items: ReleaseNoteItem[];
} = {
  title: "Hay cambios nuevos en ControlX",
  summary:
    "Actualizamos la preparación del evento: actores, roles y un canal de novedades.",
  items: [
    {
      title: "Mapa de actores (Setup)",
      detail:
        "Alta, edición y baja de actores con nombre, email, área y roles del evento.",
    },
    {
      title: "Roles",
      detail:
        "Asigna ejecutores y aprobadores a los pasos desde una sola lista, con filtro por tipo de actor.",
    },
    {
      title: "Novedades",
      detail:
        "Consulta el historial de cambios del producto desde el menú superior.",
    },
  ],
};
