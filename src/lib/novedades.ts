import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";

import {
  NOVEDAD_ICONS,
  type NovedadIcon,
  type NovedadItem,
} from "@/lib/novedades-types";
import { getDatabase, isMongoConfigured } from "@/lib/mongodb";

export type { NovedadIcon, NovedadItem } from "@/lib/novedades-types";
export { NOVEDAD_ICON_LABELS, NOVEDAD_ICONS } from "@/lib/novedades-types";

export const novedadInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  changes: z.string().trim().min(5).max(8000),
  icon: z.enum(NOVEDAD_ICONS).default("sparkles"),
  publishedAt: z.iso.datetime().optional(),
});

export const novedadUpdateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  changes: z.string().trim().min(5).max(8000),
  icon: z.enum(NOVEDAD_ICONS),
  publishedAt: z.iso.datetime(),
});

type NovedadDocument = {
  _id?: ObjectId;
  title: string;
  changes: string;
  icon: NovedadIcon;
  publishedAt: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
};

function toItem(row: NovedadDocument): NovedadItem {
  return {
    id: row._id!.toHexString(),
    publishedAt: row.publishedAt.toISOString(),
    title: row.title,
    changes: row.changes,
    icon: row.icon,
    createdAt: row.createdAt.toISOString(),
  };
}

/** ABM de novedades: solo SuperAdmin. El resto solo lee. */
export function canManageNovedades(user: {
  isSuperAdmin: boolean;
}): boolean {
  return user.isSuperAdmin;
}

export async function listNovedades(limit = 200): Promise<NovedadItem[]> {
  if (!isMongoConfigured()) return [];
  const database = await getDatabase();
  const collection = database.collection<NovedadDocument>("novedades");
  const count = await collection.countDocuments();
  if (count === 0) {
    const now = new Date();
    await collection.insertOne({
      title: "Actores, Roles y preparación del evento",
      changes: [
        "Mapa de actores en Setup (nombre, email, área y roles múltiples).",
        "Nueva estación Roles entre Diseño y Plan: asignación de ejecutores a pasos.",
        "Tabla de pasos con Workstream / Actividad / Paso, filtros pendientes/asignados y ABM.",
        "Mejoras de UX en Tiempos del planificador y guardado del Día D.",
      ].join("\n"),
      icon: "roles",
      publishedAt: now,
      createdBy: "system",
      createdAt: now,
    });
  }
  const rows = await collection
    .find({})
    .sort({ publishedAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(toItem);
}

export async function createNovedad(
  input: z.infer<typeof novedadInputSchema>,
  actorId: string,
): Promise<NovedadItem> {
  const database = await getDatabase();
  const now = new Date();
  const doc: NovedadDocument = {
    title: input.title.trim(),
    changes: input.changes.trim(),
    icon: input.icon,
    publishedAt: input.publishedAt ? new Date(input.publishedAt) : now,
    createdBy: actorId,
    createdAt: now,
  };
  const result = await database
    .collection<NovedadDocument>("novedades")
    .insertOne(doc);
  return toItem({ ...doc, _id: result.insertedId });
}

export async function updateNovedad(
  id: string,
  input: z.infer<typeof novedadUpdateSchema>,
): Promise<NovedadItem> {
  if (!ObjectId.isValid(id)) throw new Error("Novedad inválida.");
  const database = await getDatabase();
  const result = await database
    .collection<NovedadDocument>("novedades")
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          title: input.title.trim(),
          changes: input.changes.trim(),
          icon: input.icon,
          publishedAt: new Date(input.publishedAt),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  if (!result) throw new Error("La novedad no existe.");
  return toItem(result);
}

export async function deleteNovedad(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Novedad inválida.");
  const database = await getDatabase();
  const result = await database
    .collection<NovedadDocument>("novedades")
    .deleteOne({ _id: new ObjectId(id) });
  if (!result.deletedCount) throw new Error("La novedad no existe.");
}
