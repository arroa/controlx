import { z } from "zod";

/** Roles operativos/config del mapa de actores (por evento). */
export const eventActorRoleSchema = z.enum([
  "EVENT_ADMIN",
  "EXECUTOR",
  "APPROVER",
  "STEERCO",
]);

export const EVENT_ACTOR_ROLE_OPTIONS = [
  {
    value: "EVENT_ADMIN" as const,
    label: "EventAdmin",
    description: "Configura el evento (no ejecuta por este rol).",
  },
  {
    value: "EXECUTOR" as const,
    label: "Ejecutor",
    description: "Puede ejecutar pasos asignados.",
  },
  {
    value: "APPROVER" as const,
    label: "Aprobador",
    description: "Aprueba pasos puntuales.",
  },
  {
    value: "STEERCO" as const,
    label: "SteerCo",
    description: "Aprobación global del evento.",
  },
] as const;

export const eventActorInputSchema = z.object({
  name: z.string().trim().min(1, "Indica el nombre.").max(120),
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  area: z.string().trim().min(1, "Indica el área.").max(120),
  roles: z.array(eventActorRoleSchema).min(1, "Elige al menos un rol."),
});

export type EventActorRole = z.infer<typeof eventActorRoleSchema>;

export type EventActorSummary = {
  id: string;
  name: string;
  email: string;
  area: string;
  roles: EventActorRole[];
  createdAt: string;
};

export function emailLocalPart(email: string): string {
  const local = email.split("@")[0]?.trim();
  return local || email;
}
