import "server-only";

import { put } from "@vercel/blob";

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_MAX_PER_STEP = 8;
export const EVIDENCE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadEvidenceBlob(input: {
  executionId: string;
  stepId: string;
  file: File;
  uploadedBy: string;
}) {
  if (!isBlobConfigured()) {
    throw new Error(
      "Evidencias no configuradas: falta BLOB_READ_WRITE_TOKEN en el entorno.",
    );
  }
  if (input.file.size > EVIDENCE_MAX_BYTES) {
    throw new Error("El archivo supera el límite de 10 MB.");
  }
  if (
    !EVIDENCE_ALLOWED_TYPES.includes(
      input.file.type as (typeof EVIDENCE_ALLOWED_TYPES)[number],
    )
  ) {
    throw new Error("Solo se permiten JPG, PNG, WEBP o PDF.");
  }

  const safeName = input.file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const pathname = `evidences/${input.executionId}/${input.stepId}/${Date.now()}-${safeName}`;
  const blob = await put(pathname, input.file, {
    access: "public",
    contentType: input.file.type,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: input.file.type,
    size: input.file.size,
    uploadedBy: input.uploadedBy,
    uploadedAt: new Date().toISOString(),
  };
}
