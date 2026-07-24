import type { UIMessage } from "ai";

import {
  GUIDE_MAX_MESSAGE_CHARS,
  GUIDE_MAX_MESSAGES,
  GUIDE_MAX_TOTAL_USER_CHARS,
  truncateText,
} from "@/lib/ai/guide-limits";

export type GuideMessageValidation =
  | { ok: true; messages: UIMessage[]; lastUserText: string }
  | { ok: false; error: string };

function partText(part: UIMessage["parts"][number]): string {
  if (part.type === "text" && "text" in part && typeof part.text === "string") {
    return part.text;
  }
  return "";
}

export function getMessageText(message: UIMessage): string {
  return message.parts.map(partText).join("").trim();
}

export function validateGuideMessages(
  rawMessages: unknown[],
): GuideMessageValidation {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return { ok: false, error: "Envía al menos un mensaje." };
  }

  if (rawMessages.length > GUIDE_MAX_MESSAGES) {
    return {
      ok: false,
      error: `Máximo ${GUIDE_MAX_MESSAGES} mensajes por solicitud.`,
    };
  }

  const messages: UIMessage[] = [];
  let totalUserChars = 0;

  for (const item of rawMessages) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Mensaje inválido." };
    }
    const message = item as UIMessage;
    if (message.role !== "user" && message.role !== "assistant") {
      return { ok: false, error: "Rol de mensaje no permitido." };
    }
    if (!Array.isArray(message.parts)) {
      return { ok: false, error: "Mensaje sin contenido válido." };
    }

    const text = getMessageText(message);
    if (message.role === "user") {
      if (!text) {
        return { ok: false, error: "El mensaje del usuario está vacío." };
      }
      if (text.length > GUIDE_MAX_MESSAGE_CHARS) {
        return {
          ok: false,
          error: `Cada mensaje puede tener máximo ${GUIDE_MAX_MESSAGE_CHARS} caracteres.`,
        };
      }
      totalUserChars += text.length;
    }

    messages.push(message);
  }

  if (totalUserChars > GUIDE_MAX_TOTAL_USER_CHARS) {
    return {
      ok: false,
      error: "El historial de la conversación es demasiado largo.",
    };
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return { ok: false, error: "Falta el mensaje del usuario." };
  }

  return {
    ok: true,
    messages,
    lastUserText: truncateText(getMessageText(lastUser), GUIDE_MAX_MESSAGE_CHARS),
  };
}

/** Señales típicas de jailbreak / inyección (heurística, no perfecta). */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /olvid[ae]\s+(todas\s+)?(tus\s+)?instrucciones/i,
  /disregard\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s*prompt/i,
  /dan\s*mode|developer\s*mode/i,
  /actúa\s+como\s+si\s+no\s+tuvieras\s+restricciones/i,
  /bypass\s+(safety|guardrail|filter)/i,
];

export function looksLikePromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
