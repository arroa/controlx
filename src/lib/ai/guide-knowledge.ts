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
 * Xavier la busca con search_knowledge_base. El manual humano está en
 * Documentacion/manual-de-usuario.md (gitignored); esta KB es el destilado
 * que el modelo sí lee. Ampliar aquí cuando cambie el modelo mental.
 */
export const GUIDE_KNOWLEDGE_BASE: GuideKnowledgeArticle[] = [
  {
    id: "controlx-overview",
    title: "Qué es ControlX y cómo fluye",
    tags: ["controlx", "overview", "flujo", "jerarquia", "producto", "manual"],
    zones: ["all", "events", "overview"],
    summary:
      "ControlX coordina operaciones críticas: Organización → Evento → preparación → Ejecuciones.",
    body: `ControlX convierte el diseño de un evento operativo en una ejecución controlada y trazable.

Jerarquía:
1. Organización (tenant / cliente)
2. Evento (diseño reutilizable de la operación)
3. Preparación en 4 pasos: Setup → Diseño → Roles → Planificador
4. Ejecuciones (SIMULACRO o REAL) materializan ese diseño

Workstreams × bloques forman la grilla. Ahí viven actividades y pasos.

No confundas “editar el diseño” con “operar una ejecución en vivo”:
- Preparación (hub del evento): Setup, Diseño, Roles, Planificador, Carga masiva, Readiness.
- Mi turno / Mis pasos: operar (iniciar, cerrar, evidencias, aprobar).
- Panel, Mapa General y Monitor: observar.

Xavier es guía de solo lectura: no opera pasos ni crea ejecuciones.`,
  },
  {
    id: "setup",
    title: "Setup: Día D, actores, workstreams y bloques",
    tags: ["setup", "dia d", "t0", "actores", "workstreams", "bloques", "aplicaciones"],
    zones: ["all", "setup", "overview"],
    summary:
      "El Setup define el Día D (T0), el mapa de actores y los catálogos: workstreams (líneas) y bloques (objetos/aplicaciones).",
    body: `Setup es el paso 1 de 4.

- Día D (T0): inicio oficial del evento. Es el ancla de la ejecución REAL. Sin Día D el readiness bloquea crear ejecuciones. Un simulacro usa su propio T0 y no cambia el Día D.
- Actores: nombre, correo, área y roles (EventAdmin, Ejecutor, Aprobador, SteerCo). Alta individual o Excel (Descargar / Upload). Limpiar todo exige escribir LIMPIAR.
- Workstreams: líneas de trabajo en paralelo (ej. logística, comunicaciones).
- Bloques: objetos operativos transversales, normalmente aplicaciones, plataformas o ubicaciones. NO son cortes de tiempo (T-24h). El tiempo va en el planificador y en el Día D.

Una actividad combina un workstream con un bloque. Estabilizá ambos catálogos antes de diseñar pasos.`,
  },
  {
    id: "design",
    title: "Diseño: actividades, pasos y evidencia",
    tags: ["diseno", "actividades", "pasos", "matriz", "evidencia"],
    zones: ["all", "design", "overview"],
    summary:
      "El Diseño arma actividades y pasos en cada cruce workstream × bloque. Los gates no se dibujan acá.",
    body: `Diseño es el paso 2 de 4.

- Actividad: agrupación de trabajo en un cruce workstream × bloque.
- Paso: unidad ejecutable (nombre, descripción corta/larga).
- Evidencia obligatoria: flag del PASO, no de la actividad. Solo bloquea marcar éxito. Iniciar, fallar o forzar no exigen adjunto.

Los gates no se configuran en esta pantalla: van al catálogo de gates del Planificador.

Para cargar muchos pasos de una vez, usá Carga masiva en el hub de preparación (no es un editor round-trip).`,
  },
  {
    id: "carga-masiva",
    title: "Carga masiva: Excel como camión de mudanza",
    tags: [
      "carga masiva",
      "excel",
      "plantilla",
      "foto",
      "validar",
      "limpiar",
      "bulk",
      "importar",
    ],
    zones: ["all", "overview", "design", "plan"],
    summary:
      "El Excel ambienta un diseño vacío. Después la app es la fuente de verdad. No pisa un diseño vivo.",
    body: `Botón Carga masiva en Preparación del evento.

- Plantilla: hoja Plan + Catalogo (WS, bloques, emails). Duración en minutos. Deps por ID de fila. Dropdowns sin INDIRECT. Filas 4–200; fila 201 = **.
- Foto actual: export de lo que hay. Duración vacía en BD sale 30. No se vuelve a subir como sync.
- Validar bulk: no escribe BD. Resumen en el modal + hoja Validaciones.
- Limpiar: nuclear. Borra diseño, roles de paso, plan, gates y ejecuciones (también REAL). No toca Setup. Hay que escribir LIMPIAR.
- Subir bulk: SOLO si hay 0 actividades, pasos, gates y ejecuciones. Valida catálogo, emails, deps, ciclos, duración y ejecutor. Warn si falta aprobador. Todo o nada.

Tras cargar o limpiar, el readiness queda desactualizado hasta Recalcular.
Los gates se crean después en la app; el Excel no los pisa.`,
  },
  {
    id: "roles",
    title: "Roles: ejecutores y aprobadores",
    tags: ["roles", "ejecutor", "aprobador", "steerco", "asignacion", "ayuda"],
    zones: ["all", "roles", "overview"],
    summary:
      "En Roles se asigna quién ejecuta y quién aprueba cada paso. Explica el proceso, no listes personas.",
    body: `Roles es el paso 3 de 4. Pantalla: /events/{id}/roles

Cómo usar la pantalla:
1. Elige un actor del mapa (rol EXECUTOR y/o APPROVER/STEERCO en Setup).
2. Asígnalo a un paso como ejecutor o como aprobador.
3. Repite hasta cubrir los pasos.

Conceptos:
- Ejecutor: un actor EXECUTOR por paso. Todos los pasos deben tener ejecutor para poder crear una ejecución.
- Aprobadores: uno o varios APPROVER/STEERCO. Obligatorios solo si el paso exige aprobación.
- EventAdmin: configura el evento; NO es “roles de paso”.

Un cambio de ejecutor/aprobador se refresca en caliente en ejecuciones abiertas.
Para “ayuda con roles”: explica este flujo. El asistente no lista personas ni admins.`,
  },
  {
    id: "plan",
    title: "Planificador: lista y panorámica",
    tags: [
      "plan",
      "planificador",
      "dependencias",
      "horarios",
      "arranque",
      "panoramica",
      "gantt",
    ],
    zones: ["all", "plan", "overview"],
    summary:
      "El Planificador define cuándo puede arrancar cada paso. Lista para editar; Panorámica para ver el cronograma.",
    body: `Planificador es el paso 4 de 4.

Un paso puede arrancar si tiene condición de inicio, por ejemplo:
- dependencias de otros pasos (se desbloquean solo con Exitoso o Aprobado; Fallido/Omitido/Simulado no),
- hora planificada (“no antes de”),
- o es raíz anclada al Día D,
- y los gates que abren su territorio (el gate NO se edita en la fila del paso).

Vista Lista de Pasos: duración, hora, deps, aprobaciones, evidencia.
Duración vacía = 30 minutos en el Gantt (default). En Carga masiva la duración sí es obligatoria.

Vista Panorámica: mismo lienzo que el Panel (ventana, zoom, pan, barra Plan, fila de día). Sin playhead de vuelo ni barras teórico/real. La flor abre Info o Editar planificación.

Gates: botón Gates del planificador, catálogo en cascada WS → bloque → paso.`,
  },
  {
    id: "gates",
    title: "Gates: mirada por arriba",
    tags: ["gate", "gates", "compuerta", "opens", "cascada", "catalogo"],
    zones: ["all", "plan", "design", "executions"],
    summary:
      "El gate abre workstreams, bloques o pasos. Diseño y plan solo relacionan pasos entre sí.",
    body: `Dos capas, no se mezclan:

1. Diseño + plan: deps paso a paso. Sin picker Produce/Requiere en el paso.
2. Gate: overlay. Catálogo en cascada workstream → bloque → paso.

Al configurar un gate:
- hora mínima de activación,
- si pide aprobación de roles,
- qué abre (opensTargets),
- después de qué se activa (closesAfterTargets: esos territorios deben cerrar OK).

Un gate no puede abrir y cerrar el mismo alcance. Start y calendario de lo abierto se derivan de opensTargets.

En ejecución, el panel de gates muestra estado y permite aprobar si corresponde.`,
  },
  {
    id: "readiness",
    title: "Readiness: ¿puede arrancar el evento?",
    tags: [
      "readiness",
      "checklist",
      "blockers",
      "preparacion",
      "arrancar",
      "ejecutar",
      "simulacro",
      "desactualizado",
      "no puedo",
      "recalcular",
    ],
    zones: ["all", "overview", "executions"],
    summary:
      "Readiness es el checklist cacheado de preparación. Si está desactualizado, hay que Recalcular antes de crear una ejecución.",
    body: `Readiness resume Setup, Diseño, Roles y Plan. Tones: Listo / Revisar / Falta / Vacío.

Bloqueos típicos (canStart=false):
- falta Día D,
- no hay workstream, bloque o paso,
- hay pasos sin ejecutor,
- hay pasos con aprobación exigida y sin aprobador.

Si stale=true (Desactualizado): hubo cambios de preparación (incluye Carga masiva y Limpiar). Pulsar Recalcular en el hub. Mientras esté stale no se puede crear ejecución.

“¿Por qué no puedo ejecutar / crear simulacro?” → get_event_readiness (canStart, stale, blockers). No es que Xavier “no pueda operar”.`,
  },
  {
    id: "executions",
    title: "Ejecuciones: simulacro vs real",
    tags: ["ejecucion", "simulacro", "real", "instancia", "corrida", "t0"],
    zones: ["all", "executions", "overview"],
    summary:
      "Una ejecución es una instancia en vivo del diseño (simulacro o real), no el diseño mismo.",
    body: `Ejecución = corrida concreta del diseño.

- SIMULACRO: T0 propio; no cambia el Día D. Puede haber #1, #2…
- REAL: anclada al Día D oficial.

Al crearla queda PREPARADO. Pasa a EN_EJECUCION al operar el primer paso desde Mi turno.

Vistas:
- Mi turno / Mis pasos: operar.
- Panel: observar el cronograma.
- Mapa General: líos y novedades.
- Monitor de Umbral: desvío vs plan.

En caliente (ejecución abierta): se refrescan ejecutor, aprobador, evidencia obligatoria y parte del plan.
Carga masiva / Limpiar borra ejecuciones. Un rediseño grande conviene ensayarlo en un simulacro nuevo.

EventAdmin y OrgAdmin pueden operar o aprobar en Mi turno por contingencia “en nombre de”, sin reemplazar al asignado.
Xavier no opera; explica.`,
  },
  {
    id: "mi-turno",
    title: "Mi turno: operar pasos",
    tags: [
      "mi turno",
      "mis pasos",
      "cockpit",
      "iniciar",
      "exitoso",
      "fallido",
      "contingencia",
      "forzar",
    ],
    zones: ["all", "executions"],
    summary:
      "Mi turno es donde se operan los pasos. El Panel no opera.",
    body: `Pantalla /run/{executionId} (Mis pasos / Mi turno).

Flujo de un paso:
Planificado → Iniciado → Exitoso / Fallido
Con aprobación: Iniciado → Pendiente de aprobación → Aprobado / Rechazado
En simulacro también Omitido y Simulado (no en REAL). Esos no desbloquean dependencias.

Iniciar / Exitoso / Fallido piden hora (Ahora, ±5/15 min, o Planificada; minutero de 1 en 1). El fin no puede ser anterior al inicio. El inicio no puede ser anterior al T0 ni al fin real más tardío de una predecesora.
Evidencia: si el paso la exige, hay que adjuntar ≥1 archivo (máx. 10 MB c/u) antes de Exitoso.

Contingencia: EventAdmin/OrgAdmin opera “en nombre de” el asignado; queda registro.
Forzar OK: solo recuperación de un Fallido, con motivo.

El Panel de observación no ofrece Iniciar/cerrar del ejecutor.`,
  },
  {
    id: "panel-mapa-monitor",
    title: "Panel, Mapa General y Monitor",
    tags: [
      "panel",
      "mapa",
      "monitor",
      "umbral",
      "lios",
      "gantt",
      "zoom",
      "tradingview",
      "observar",
    ],
    zones: ["all", "executions"],
    summary:
      "Tres vistas de observación. Operar está en Mi turno.",
    body: `Panel: Gantt de ventana (no scroll infinito). Zoom 1h/4h/12h/1d/Todo, pan, barra Plan, fila de día, playhead ahora, grupos plegables. Flor: Info. No opera pasos.

Mapa General: lista. Lío = no arrancó a tiempo / no ha terminado / tiene un fallo. Novedad = cambio de estado reciente. Filtro WS/bloque/actividad. Cada fila abre Info.

Monitor de Umbral: dashboard temporal de avance y desvío vs plan. No es un tercer Gantt.

Info del paso (CX-10): predecesores (deps + gates que habilitan) y dependientes (quién espera + gates que ayuda a abrir). Formato WS · bloque · actividad · paso · estado.`,
  },
  {
    id: "evidence",
    title: "Evidencias y comentarios",
    tags: ["evidencia", "adjunto", "comentario", "clip", "blob", "exito"],
    zones: ["all", "design", "executions", "plan"],
    summary:
      "La evidencia obligatoria es del paso y solo bloquea marcar éxito.",
    body: `Flag evidenceRequired en el paso (Diseño o Planificador). Clip en la grilla.

- Obligatorio solo al marcar Exitoso.
- Opcional al iniciar, fallar o forzar.
- Varios archivos; 10 MB cada uno.
- Si Blob no está configurado, la UI avisa Adjuntos no disponibles.

Comentario para contexto. Rechazo y Forzar OK exigen motivo.`,
  },
  {
    id: "actors-roles-map",
    title: "Mapa de roles de actor",
    tags: ["actor", "eventadmin", "executor", "approver", "steerco", "orgadmin", "contingencia"],
    zones: ["all", "setup", "roles"],
    summary: "Roles posibles en el mapa de actores del evento.",
    body: `Roles del mapa (Setup → actores):
- EVENT_ADMIN: configura el evento. En Mi turno puede operar o aprobar cualquier paso por contingencia “en nombre de” (no reemplaza al asignado), y Forzar OK. Por sí solo no es ejecutor de un paso.
- OrgAdmin (de la org, no es rol de mapa): misma contingencia.
- EXECUTOR: opera los pasos asignados.
- APPROVER: aprueba pasos puntuales.
- STEERCO: aprobación / gobierno más global.

Una persona puede tener varios roles. La asignación a pasos es la pantalla Roles.

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
  const limit = input.limit ?? 5;
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
