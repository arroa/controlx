import type { NovedadIcon } from "@/lib/novedades-types";

/** Bump this when you want the login modal (and seed de novedades) to refrescarse. */
export const RELEASE_NOTES_VERSION = "2026-07-21-cockpit";

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
  novedadIcon: NovedadIcon;
  items: ReleaseNoteItem[];
} = {
  title: "Hay cambios nuevos en ControlX",
  summary:
    "Llegó el cockpit del ejecutor en el Día D: mapa vertical, acciones claras y evidencias opcionales.",
  novedadTitle: "Cockpit del ejecutor y mapa del Día D",
  novedadIcon: "planner",
  items: [
    {
      title: "Cockpit PWA (/run)",
      detail:
        "Vista móvil para el ejecutor: dónde estás en el Día D, filtros por workstream y Solo míos.",
    },
    {
      title: "Mapa de tiempos vertical",
      detail:
        "Horas hacia abajo, columnas por paso, columna de horas y fila del día fijas al desplazar.",
    },
    {
      title: "Acciones del paso",
      detail:
        "Botón ? con flor de acciones: Info, Iniciar, Exitoso y Fallido. Adjuntos opcionales al cerrar.",
    },
    {
      title: "Descripciones corta y larga",
      detail:
        "En Diseño cada paso tiene descripción corta y larga; Info las muestra en ejecución.",
    },
    {
      title: "Colores del mapa",
      detail:
        "Azul pendiente, azul claro siguiente, gris ajeno, verde exitoso, rojo fallido.",
    },
    {
      title: "Simulacro simplificado",
      detail:
        "Sin botones Omitido/Simulado en la flor: el tipo de ejecución ya indica que es simulacro.",
    },
    {
      title: "Impersonación de actor (dev)",
      detail:
        "Mock para actuar como un actor del mapa (CONTROLX_DEV_ACTOR_IMPERSONATION).",
    },
  ],
};

/** Texto multilínea para el campo `changes` de novedades. */
export function releaseNotesChangesText(): string {
  return RELEASE_NOTES.items
    .map((item) => `${item.title}: ${item.detail}`)
    .join("\n");
}
