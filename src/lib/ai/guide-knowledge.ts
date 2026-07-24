export type GuideKnowledgeArticle = {
  id: string;
  title: string;
  tags: string[];
  zones: Array<
    | "events"
    | "overview"
    | "setup"
    | "design"
    | "roles"
    | "plan"
    | "executions"
    | "all"
  >;
  summary: string;
  body: string;
};

/**
 * Base de conocimiento curada del producto.
 * Fuente de verdad para explicaciones repetibles (no inventar la rueda).
 * Ampliar aquí cuando cambie el modelo mental de ControlX.
 */
export const GUIDE_KNOWLEDGE_BASE: GuideKnowledgeArticle[] = [
  {
    id: "controlx-overview",
    title: "Qué es ControlX y cómo fluye",
    tags: ["controlx", "overview", "flujo", "jerarquia", "producto"],
    zones: ["all", "events", "overview"],
    summary:
      "ControlX coordina operaciones críticas: Organización → Evento → preparación → Ejecuciones.",
    body: `ControlX es la fuente de verdad para preparar y gobernar operaciones críticas.

Jerarquía:
1. Organización (tenant / cliente)
2. Evento (operación concreta a preparar)
3. Preparación en 4 pasos: Setup → Diseño → Roles → Planificador
4. Ejecuciones (simulacro o real) materializan el diseño

El diseño del evento es la plantilla. La ejecución es una corrida concreta de esa plantilla.
No confundas “editar el diseño” con “operar una ejecución en vivo”.`,
  },
  {
    id: "setup",
    title: "Setup: Día D, actores, workstreams y bloques",
    tags: ["setup", "dia d", "t0", "actores", "workstreams", "bloques"],
    zones: ["all", "setup", "overview"],
    summary:
      "El Setup define el origen temporal (Día D), el mapa de actores y los catálogos de workstreams/bloques.",
    body: `Setup es el paso 1 de 4.

- Día D (T0): origen absoluto de la timeline del evento. Sin Día D, muchas condiciones de arranque no tienen ancla.
- Actores: personas del mapa con roles (EventAdmin, Ejecutor, Aprobador, SteerCo).
- Workstreams: líneas/áreas de trabajo (ej. logística, comunicación).
- Bloques: cortes temporales o fases (ej. T-24h, Día D, T+2h).

Workstreams × bloques forman la grilla donde luego viven actividades y pasos.`,
  },
  {
    id: "design",
    title: "Diseño: actividades, pasos y gates",
    tags: ["diseno", "actividades", "pasos", "gates", "matriz"],
    zones: ["all", "design", "overview"],
    summary:
      "El Diseño arma actividades y pasos dentro de cada cruce workstream × bloque, más gates.",
    body: `Diseño es el paso 2 de 4.

- Actividad: agrupación de trabajo en un cruce workstream × bloque.
- Paso: unidad ejecutable (tiene ejecutor, aprobadores, deps, duración, etc.).
- Gate: hito que abre / libera workstreams o bloques según condiciones (hora, roles, cierres previos).

El diseño responde “qué hay que hacer”, no todavía “quién” (Roles) ni el detalle fino de timing/deps (Planificador), aunque parte de eso ya se puede ir dejando en el paso.`,
  },
  {
    id: "roles",
    title: "Roles: ejecutores y aprobadores",
    tags: ["roles", "ejecutor", "aprobador", "steerco", "asignacion", "ayuda"],
    zones: ["all", "roles", "overview"],
    summary:
      "En Roles se asigna quién ejecuta y quién aprueba cada paso del diseño. Explica el proceso, no listes personas.",
    body: `Roles es el paso 3 de 4. Pantalla: /events/{id}/roles

Cómo usar la pantalla:
1. Elige un actor del mapa (debe tener rol EXECUTOR y/o APPROVER/STEERCO en Setup).
2. Asígnarlo a un paso como ejecutor o como aprobador.
3. Repite hasta cubrir los pasos relevantes.

Conceptos:
- Ejecutor: un actor EXECUTOR por paso (hace el trabajo en la ejecución).
- Aprobadores: uno o varios APPROVER/STEERCO por paso.
- EventAdmin: configura el evento en Setup; NO es lo mismo que “roles de paso”. No hace falta listar quiénes son EventAdmin para explicar esta pantalla.

Si faltan ejecutores o aprobadores, el readiness lo marca (conteos / pasos sin cobertura).
Para “ayuda con roles”: explica este flujo. El asistente no lista personas ni admins.`,
  },
  {
    id: "plan",
    title: "Planificador: deps, gates y horarios",
    tags: ["plan", "planificador", "dependencias", "horarios", "arranque"],
    zones: ["all", "plan", "overview"],
    summary:
      "El Planificador define cómo y cuándo puede arrancar cada paso: deps, gates y horarios.",
    body: `Planificador es el paso 4 de 4.

Un paso puede arrancar si tiene condición de inicio, por ejemplo:
- dependencias de otros pasos,
- requiere gates,
- hora planificada (“no antes de”),
- o es raíz anclada al Día D.

Vista lista: editas deps/gates/aprobaciones/hora.
Vista panorámica: cronograma.`,
  },
  {
    id: "readiness",
    title: "Readiness: ¿puede arrancar el evento?",
    tags: ["readiness", "checklist", "blockers", "preparacion", "arrancar"],
    zones: ["all", "overview"],
    summary:
      "Readiness es el checklist de preparación (setup/diseño/roles/plan) y dice si se puede empezar.",
    body: `Readiness resume el estado de preparación del evento.

Revisa checks de:
- Setup (Día D, actores, workstreams, bloques)
- Diseño (actividades/pasos)
- Roles (ejecutores/aprobadores)
- Plan (condiciones de arranque)

Si hay blockers, canStart=false. Es la brújula antes de crear/arrancar ejecuciones.`,
  },
  {
    id: "executions",
    title: "Ejecuciones: simulacro vs real",
    tags: ["ejecucion", "simulacro", "real", "instancia", "corrida"],
    zones: ["all", "executions", "overview"],
    summary:
      "Una ejecución es una instancia en vivo del diseño (simulacro o real), no el diseño mismo.",
    body: `Ejecución = corrida concreta del diseño del evento.

- SIMULACRO: prueba con ancla simulada.
- REAL: operación con el Día D real.

Durante la ejecución se operan pasos, evidencias y aprobaciones.
El asistente guía explica el sistema; el copiloto de ejecución (futuro) es quien ayudaría en vivo.`,
  },
  {
    id: "actors-roles-map",
    title: "Mapa de roles de actor",
    tags: ["actor", "eventadmin", "executor", "approver", "steerco"],
    zones: ["all", "setup", "roles"],
    summary: "Roles posibles en el mapa de actores del evento.",
    body: `Roles del mapa (se definen en Setup → actores):
- EVENT_ADMIN: configura el evento.
- EXECUTOR: puede ejecutar pasos asignados.
- APPROVER: aprueba pasos puntuales.
- STEERCO: aprobación de nivel más global / gobierno.

Una persona puede tener varios roles. La asignación a pasos se hace en la pantalla Roles.

Importante: explicar estos roles ≠ enumerar quiénes los tienen. El asistente no tiene acceso al directorio de personas.`,
  },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function searchGuideKnowledge(input: {
  query: string;
  zone?: string;
  limit?: number;
}): Array<{
  id: string;
  title: string;
  summary: string;
  body: string;
  score: number;
}> {
  const query = normalize(input.query.trim());
  const limit = input.limit ?? 4;
  if (!query) {
    return GUIDE_KNOWLEDGE_BASE.slice(0, limit).map((article) => ({
      id: article.id,
      title: article.title,
      summary: article.summary,
      body: article.body,
      score: 0,
    }));
  }

  const terms = query.split(/\s+/).filter((term) => term.length > 1);
  const zone = input.zone;

  const scored = GUIDE_KNOWLEDGE_BASE.map((article) => {
    const haystack = normalize(
      [
        article.title,
        article.summary,
        article.body,
        article.tags.join(" "),
        article.id,
      ].join(" "),
    );

    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score += 2;
      if (article.tags.some((tag) => normalize(tag).includes(term))) score += 2;
      if (normalize(article.title).includes(term)) score += 3;
    }

    if (
      zone &&
      (article.zones.includes("all") ||
        article.zones.includes(zone as GuideKnowledgeArticle["zones"][number]))
    ) {
      score += 1;
    }

    return {
      id: article.id,
      title: article.title,
      summary: article.summary,
      body: article.body,
      score,
    };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // Fallback: artículos de la zona o overview
    return GUIDE_KNOWLEDGE_BASE.filter(
      (article) =>
        !zone ||
        article.zones.includes("all") ||
        article.zones.includes(zone as GuideKnowledgeArticle["zones"][number]),
    )
      .slice(0, limit)
      .map((article) => ({
        id: article.id,
        title: article.title,
        summary: article.summary,
        body: article.body,
        score: 0,
      }));
  }

  return scored.slice(0, limit);
}

export function listGuideKnowledgeIndex() {
  return GUIDE_KNOWLEDGE_BASE.map((article) => ({
    id: article.id,
    title: article.title,
    summary: article.summary,
    tags: article.tags,
    zones: article.zones,
  }));
}
