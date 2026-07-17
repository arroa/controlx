import { getDevBootId } from "@/lib/dev-boot";
import { isDevBypassEnabled } from "@/lib/dev-flags";

export const DEV_SESSION_COOKIE = "cx_dev_session";

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function getSecret(): string {
  const secret = process.env.DEV_SESSION_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "Define DEV_SESSION_SECRET o CLERK_SECRET_KEY para CONTROLX_DEV_BYPASS",
    );
  }
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(payload: string): Promise<string> {
  const key = await importHmacKey(getSecret());
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createDevSessionToken(userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const bootId = getDevBootId();
  const encodedUserId = base64UrlEncode(new TextEncoder().encode(userId));
  const payload = `${encodedUserId}.${exp}.${bootId}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifyDevSessionToken(token: string): Promise<string | null> {
  if (!isDevBypassEnabled()) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const [encodedUserId, expStr, bootId, signature] = parts;
  if (bootId !== getDevBootId()) {
    return null;
  }

  const payload = `${encodedUserId}.${expStr}.${bootId}`;
  const expected = await sign(payload);

  try {
    const sigBytes = base64UrlDecode(signature);
    const expBytes = base64UrlDecode(expected);
    if (!timingSafeEqual(sigBytes, expBytes)) {
      return null;
    }
  } catch {
    return null;
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  try {
    return new TextDecoder().decode(base64UrlDecode(encodedUserId));
  } catch {
    return null;
  }
}

export function devSessionCookieOptions(token: string) {
  return {
    name: DEV_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function clearDevSessionCookieOptions() {
  return {
    name: DEV_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}
