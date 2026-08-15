import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";

import {
  FEEDBACK_STATUSES,
  normalizeFeedbackStatus,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/feedback-types";
import { getDatabase, isMongoConfigured } from "@/lib/mongodb";

export type { FeedbackItem, FeedbackStatus } from "@/lib/feedback-types";
export { FEEDBACK_STATUS_LABELS, FEEDBACK_STATUSES } from "@/lib/feedback-types";

export type FeedbackUser = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
};

const statusNoteSchema = z.string().trim().max(4000).optional().default("");

function requireStatusNote(
  data: { status: FeedbackStatus; statusNote: string },
  ctx: z.RefinementCtx,
) {
  if (data.status !== "OPEN" && data.statusNote.trim().length < 5) {
    ctx.addIssue({
      code: "custom",
      path: ["statusNote"],
      message:
        data.status === "DISCARDED"
          ? "Indica por qué se descarta."
          : "Indica cómo se implementó.",
    });
  }
}

export const feedbackInputSchema = z
  .object({
    message: z.string().trim().min(5).max(4000),
    status: z.enum(FEEDBACK_STATUSES).default("OPEN"),
    statusNote: statusNoteSchema,
  })
  .superRefine(requireStatusNote);

export const feedbackUpdateSchema = z
  .object({
    message: z.string().trim().min(5).max(4000),
    status: z.enum(FEEDBACK_STATUSES),
    statusNote: statusNoteSchema,
  })
  .superRefine(requireStatusNote);

type FeedbackDocument = {
  _id?: ObjectId;
  message: string;
  status?: string;
  statusNote?: string | null;
  statusChangedAt?: Date | null;
  authorEmail: string;
  authorId: string;
  createdAt: Date;
  updatedAt?: Date | null;
};

function toItem(row: FeedbackDocument): FeedbackItem {
  const statusChangedAt = row.statusChangedAt ?? row.updatedAt ?? row.createdAt;
  return {
    id: row._id!.toHexString(),
    message: row.message,
    status: normalizeFeedbackStatus(row.status),
    statusNote: row.statusNote?.trim() ? row.statusNote.trim() : null,
    statusChangedAt: statusChangedAt.toISOString(),
    authorId: row.authorId,
    authorEmail: row.authorEmail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

/** OrgAdmin activo en alguna organización. */
export async function isOrgAdmin(email: string): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  const database = await getDatabase();
  const membership = await database
    .collection("organizationMemberships")
    .findOne(
      {
        email: email.toLowerCase(),
        status: "ACTIVE",
        role: "ORG_ADMIN",
      },
      { projection: { _id: 1 } },
    );
  return Boolean(membership);
}

/** Acceso al canal beta: cualquier usuario autenticado. */
export async function canAccessFeedback(user: {
  email: string;
  isSuperAdmin: boolean;
}): Promise<boolean> {
  return Boolean(user.email);
}

/** Ver/editar todos los comentarios: SuperAdmin u OrgAdmin. */
export async function canModerateFeedback(
  user: FeedbackUser,
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  return isOrgAdmin(user.email);
}

export async function canMutateFeedback(
  user: FeedbackUser,
  item: Pick<FeedbackItem, "authorId" | "authorEmail">,
): Promise<boolean> {
  if (await canModerateFeedback(user)) return true;
  if (item.authorId && item.authorId === user.id) return true;
  return item.authorEmail.toLowerCase() === user.email.toLowerCase();
}

export async function getFeedbackById(
  id: string,
): Promise<FeedbackItem | null> {
  if (!ObjectId.isValid(id) || !isMongoConfigured()) return null;
  const database = await getDatabase();
  const row = await database
    .collection<FeedbackDocument>("feedback")
    .findOne({ _id: new ObjectId(id) });
  return row ? toItem(row) : null;
}

export async function listFeedback(limit = 100): Promise<FeedbackItem[]> {
  if (!isMongoConfigured()) return [];
  const database = await getDatabase();
  const rows = await database
    .collection<FeedbackDocument>("feedback")
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return rows.map(toItem);
}

/** Lista según rol: moderadores ven todo; el resto solo lo propio. */
export async function listFeedbackForUser(
  user: FeedbackUser,
  limit = 100,
): Promise<FeedbackItem[]> {
  if (!isMongoConfigured()) return [];
  if (await canModerateFeedback(user)) {
    return listFeedback(limit);
  }

  const database = await getDatabase();
  const rows = await database
    .collection<FeedbackDocument>("feedback")
    .find({
      $or: [
        { authorId: user.id },
        { authorEmail: user.email.toLowerCase() },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return rows.map(toItem);
}

export async function createFeedback(
  input: {
    message: string;
    status?: FeedbackStatus;
    statusNote?: string;
  },
  author: { id: string; email: string },
): Promise<FeedbackItem> {
  const database = await getDatabase();
  const now = new Date();
  const status = input.status ?? "OPEN";
  const statusNote = input.statusNote?.trim() || null;
  const doc: FeedbackDocument = {
    message: input.message.trim(),
    status,
    statusNote,
    statusChangedAt: now,
    authorEmail: author.email.toLowerCase(),
    authorId: author.id,
    createdAt: now,
    updatedAt: null,
  };
  const result = await database
    .collection<FeedbackDocument>("feedback")
    .insertOne(doc);
  return toItem({ ...doc, _id: result.insertedId });
}

export async function updateFeedback(
  id: string,
  input: {
    message: string;
    status: FeedbackStatus;
    statusNote?: string;
  },
): Promise<FeedbackItem> {
  if (!ObjectId.isValid(id)) {
    throw new Error("Comentario inválido.");
  }
  const existing = await getFeedbackById(id);
  if (!existing) {
    throw new Error("El comentario no existe.");
  }
  const database = await getDatabase();
  const now = new Date();
  const statusChanged = existing.status !== input.status;
  const result = await database
    .collection<FeedbackDocument>("feedback")
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          message: input.message.trim(),
          status: input.status,
          statusNote: input.statusNote?.trim() || null,
          updatedAt: now,
          ...(statusChanged ? { statusChangedAt: now } : {}),
        },
      },
      { returnDocument: "after" },
    );
  if (!result) {
    throw new Error("El comentario no existe.");
  }
  return toItem(result);
}

export async function deleteFeedback(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) {
    throw new Error("Comentario inválido.");
  }
  const database = await getDatabase();
  const result = await database
    .collection<FeedbackDocument>("feedback")
    .deleteOne({ _id: new ObjectId(id) });
  if (!result.deletedCount) {
    throw new Error("El comentario no existe.");
  }
}
