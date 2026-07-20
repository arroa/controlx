import "server-only";

import { ObjectId } from "mongodb";
import { z } from "zod";

import { getDatabase, isMongoConfigured } from "@/lib/mongodb";
import type { FeedbackItem } from "@/lib/feedback-types";

export type { FeedbackItem } from "@/lib/feedback-types";

export const feedbackInputSchema = z.object({
  message: z.string().trim().min(5).max(4000),
});

type FeedbackDocument = {
  _id?: ObjectId;
  message: string;
  authorEmail: string;
  authorId: string;
  createdAt: Date;
};

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

  return rows.map((row) => ({
    id: row._id!.toHexString(),
    message: row.message,
    authorEmail: row.authorEmail,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createFeedback(
  message: string,
  author: { id: string; email: string },
): Promise<FeedbackItem> {
  const database = await getDatabase();
  const now = new Date();
  const doc: FeedbackDocument = {
    message: message.trim(),
    authorEmail: author.email.toLowerCase(),
    authorId: author.id,
    createdAt: now,
  };
  const result = await database.collection<FeedbackDocument>("feedback").insertOne(doc);
  return {
    id: result.insertedId.toHexString(),
    message: doc.message,
    authorEmail: doc.authorEmail,
    createdAt: now.toISOString(),
  };
}
