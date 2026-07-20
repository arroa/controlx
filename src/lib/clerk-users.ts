import { createClerkClient } from "@clerk/backend";
import { randomBytes } from "crypto";

import { isDevBypassEnabled } from "@/lib/dev-flags";

function getClerk() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Define CLERK_SECRET_KEY en .env.local");
  }
  return createClerkClient({ secretKey });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isSkipPasswordDisallowed(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("errors" in error)) {
    return false;
  }
  const errors = (error as { errors?: { code?: string }[] }).errors;
  return (
    errors?.some((item) => item.code === "form_conditional_param_disallowed") ??
    false
  );
}

export function makeDevClerkUserId(email: string): string {
  return `dev:${normalizeEmail(email)}`;
}

type EnsureClerkUserOptions = {
  /** Siempre sincroniza con Clerk (p. ej. setup:admin), sin mirar CONTROLX_DEV_BYPASS. */
  forceClerk?: boolean;
};

export async function ensureClerkUser(
  email: string,
  options: EnsureClerkUserOptions = {},
): Promise<string> {
  const normalized = normalizeEmail(email);

  if (!options.forceClerk && isDevBypassEnabled()) {
    return makeDevClerkUserId(normalized);
  }

  const clerk = getClerk();

  const existing = await clerk.users.getUserList({
    emailAddress: [normalized],
    limit: 1,
  });

  if (existing.data[0]) {
    return existing.data[0].id;
  }

  try {
    const created = await clerk.users.createUser({
      emailAddress: [normalized],
      skipPasswordRequirement: true,
      skipLegalChecks: true,
    });
    return created.id;
  } catch (error) {
    if (!isSkipPasswordDisallowed(error)) {
      throw error;
    }

    const created = await clerk.users.createUser({
      emailAddress: [normalized],
      password: randomBytes(24).toString("base64url"),
      skipLegalChecks: true,
    });
    return created.id;
  }
}

export function formatClerkError(error: unknown): string {
  if (error && typeof error === "object" && "errors" in error) {
    const errors = (
      error as { errors?: { longMessage?: string; message?: string }[] }
    ).errors;
    if (errors?.length) {
      return errors.map((item) => item.longMessage ?? item.message).join("; ");
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
