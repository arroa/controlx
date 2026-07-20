import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";

import {
  FEEDBACK_STATUSES,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/feedback-types";
import { getDatabase, isMongoConfigured } from "@/lib/mongodb";

export type { FeedbackItem, FeedbackStatus } from "@/lib/feedback-types";
export { FEEDBACK_STATUS_LABELS, FEEDBACK_STATUSES } from "@/lib/feedback-types";

export const feedbackInputSchema = z.object({
  message: z.string().trim().min(5).max(4000),
  status: z.enum(FEEDBACK_STATUSES).default("OPEN"),
});

export const feedbackUpdateSchema = z.object({
  message: z.string().trim().min(5).max(4000),
  status: z.enum(FEEDBACK_STATUSES),
});

type FeedbackDocument = {
  _id?: ObjectId;
  message: string;
  status?: FeedbackStatus;
  authorEmail: string;
  authorId: string;
  createdAt: Date;
  updatedAt?: Date | null;
};

function toItem(row: FeedbackDocument): FeedbackItem {
  return {
    id: row._id!.toHexString(),
    message: row.message,
    status: row.status ?? "OPEN",
    authorEmail: row.authorEmail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export async function isOrgAdmin(email: string): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  const database = await getDatabase();
  const membership = await database
    .collection("organizationMemberships")
    .findOne(
      { email: email.toLowerCase(), status: "ACTIVE" },
      { projection: { _id: 1 } },
    );
  return Boolean(membership);
}

/** Beta feedback: SuperAdmin u OrgAdmin. */
export async function canAccessFeedback(user: {
  email: string;
  isSuperAdmin: boolean;
}): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  return isOrgAdmin(user.email);
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

export async function createFeedback(
  input: { message: string; status?: FeedbackStatus },
  author: { id: string; email: string },
): Promise<FeedbackItem> {
  const database = await getDatabase();
  const now = new Date();
  const doc: FeedbackDocument = {
    message: input.message.trim(),
    status: input.status ?? "OPEN",
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
  input: { message: string; status: FeedbackStatus },
): Promise<FeedbackItem> {
  if (!ObjectId.isValid(id)) {
    throw new Error("Comentario inválido.");
  }
  const database = await getDatabase();
  const now = new Date();
  const result = await database
    .collection<FeedbackDocument>("feedback")
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          message: input.message.trim(),
          status: input.status,
          updatedAt: now,
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
