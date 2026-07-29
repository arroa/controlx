import "server-only";

import { del, get, list, put } from "@vercel/blob";

import { EVIDENCE_MAX_BYTES } from "@/lib/evidence-limits";

export { EVIDENCE_MAX_BYTES, EVIDENCE_MAX_PER_STEP } from "@/lib/evidence-limits";

export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

/** ¿El pathname pertenece a evidencias de esta ejecución? */
export function isEvidencePathForExecution(
  executionId: string,
  pathname: string,
) {
  const prefix = `evidences/${executionId}/`;
  return (
    pathname.startsWith(prefix) &&
    !pathname.includes("..") &&
    !pathname.includes("\\")
  );
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
  if (input.file.size <= 0) {
    throw new Error("El archivo está vacío.");
  }
  if (input.file.size > EVIDENCE_MAX_BYTES) {
    throw new Error("El archivo supera el límite de 10 MB.");
  }

  const safeName = input.file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const pathname = `evidences/${input.executionId}/${input.stepId}/${Date.now()}-${safeName}`;
  const contentType = input.file.type || "application/octet-stream";
  const blob = await put(pathname, input.file, {
    access: "private",
    contentType,
    token: blobToken(),
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType,
    size: input.file.size,
    uploadedBy: input.uploadedBy,
    uploadedAt: new Date().toISOString(),
  };
}

/** Lee un blob privado (stream) para servirlo tras autenticación. */
export async function getEvidenceBlob(pathname: string) {
  if (!isBlobConfigured()) {
    throw new Error(
      "Evidencias no configuradas: falta BLOB_READ_WRITE_TOKEN en el entorno.",
    );
  }

  return get(pathname, {
    access: "private",
    token: blobToken(),
  });
}

/** Borra evidencias en Blob de una ejecución (best-effort). */
export async function deleteExecutionEvidenceBlobs(
  executionId: string,
): Promise<void> {
  if (!isBlobConfigured() || !executionId.trim()) return;

  try {
    const token = blobToken();
    const prefix = `evidences/${executionId}/`;
    let cursor: string | undefined;

    do {
      const page = await list({
        prefix,
        cursor,
        token,
      });
      if (page.blobs.length) {
        await del(
          page.blobs.map((blob) => blob.url),
          { token },
        );
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (error) {
    console.error(
      "[evidence-blob] no se pudieron borrar blobs de",
      executionId,
      error,
    );
  }
}
