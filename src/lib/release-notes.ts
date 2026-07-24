import type { NovedadIcon } from "@/lib/novedades-types";

/**
 * Bump when you want the login modal (and seed de novedades) to refrescarse.
 * Si `items` está vacío, no se muestra el modal ni se siembra novedad.
 */
export const RELEASE_NOTES_VERSION = "2026-07-24-empty";

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
  summary: "",
  novedadTitle: "",
  novedadIcon: "sparkles",
  /** Vacío = sin aviso de bienvenida ni seed automático. */
  items: [],
};

/** Texto multilínea para el campo `changes` de novedades. */
export function releaseNotesChangesText(): string {
  return RELEASE_NOTES.items
    .map((item) => `${item.title}: ${item.detail}`)
    .join("\n");
}

export function hasReleaseNotes(): boolean {
  return RELEASE_NOTES.items.length > 0;
}
