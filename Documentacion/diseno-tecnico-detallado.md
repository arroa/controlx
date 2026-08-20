# Diseño técnico detallado — ControlX

**Versión:** 1.0 · **Fecha:** 2026-08-20  
**Audiencia:** developer full-stack avanzado  
**Companion docs:** [Arquitectura técnica](./arquitectura-tecnica.md) · [Manual de usuario](./manual-de-usuario.md) · [Diseño de base de datos](./diseno-base-de-datos.md)

Este documento es la **especificación de implementación**: contratos, módulos, invariantes, flujos de datos y guías para extender el sistema sin romper el runtime.

---

## 1. Principios de implementación

1. **Un motor de estado.** Toda transición de paso pasa por `transitionRuntimeStep` (`src/lib/execution-runtime.ts`). No mutar `executionSteps.status` desde otra ruta.
2. **Sin Server Actions.** Mutaciones = Route Handlers en `src/app/api/**/route.ts` + librerías `server-only`.
3. **Zod en la frontera.** Validar body/query en la API; tipos de dominio en `execution-types.ts` / `domain/controlx.ts`.
4. **Diseño ≠ runtime.** Cambios de diseño no reescriben ciegamente una REAL en curso; hay syncs controlados (`syncExecutionPlanFromDesign`, `refreshOpenExecutionsFromDesign`).
5. **Observar ≠ operar.** UI y permisos distintos; no “arreglar” esto unificando pantallas.
6. **Identidad resuelta una vez.** `getCurrentUser` / helpers de `api-auth` / `execution-auth`; no reimplementar checks ad-hoc en componentes.

---

## 2. Arranque local y entorno

```bash
npm install
cp .env.example .env.local
# completar MONGODB_URI, Clerk o CONTROLX_DEV_BYPASS=true + SUPER_ADMIN_EMAIL
npm run setup:admin   # opcional: sync SuperAdmin en Clerk
npm run dev
```

| Variable | Obligatoria | Efecto |
|----------|-------------|--------|
| `MONGODB_URI` | Sí | Conexión |
| `MONGODB_DB_NAME` | No | Default `controlx` |
| Clerk keys | Sí (prod) | Auth OTP |
| `CONTROLX_DEV_BYPASS` | Dev | Login sin OTP si `isDevBypassEnabled()` |
| `DEV_SESSION_SECRET` | Con bypass | Firma cookie `cx_dev_session` |
| `SUPER_ADMIN_EMAIL` | Sí | SuperAdmin sin fila Mongo |
| `BLOB_READ_WRITE_TOKEN` | Para evidencias | Upload privado |
| `OPENAI_API_KEY` | Para Xavier | Guía IA |
| `CONTROLX_DEV_ACTOR_IMPERSONATION` | Dev | Mock actor en header |

**Auth gate:** `src/proxy.ts` (Next 16). Rutas públicas: `/`, `/sign-in`, `/sign-up`, `/api/health`, auth dev, manifest, `sw.js`.

**Nota de producto:** `ALLOW_DEV_BYPASS_IN_PROD` en `src/lib/dev-flags.ts` controla si el bypass puede vivir en producción cuando la env está activa. Tratarlo como interruptor sensible.

---

## 3. Capas de código

```text
UI (RSC page)
  → auth + load detalle (lib)
  → Client component (poll / interact)
       → fetch('/api/...')
            → route.ts (Zod + auth)
                 → admin-data | execution-runtime | gate-runtime | …
                      → MongoDB / Blob / OpenAI
```

| Capa | Path | Regla |
|------|------|-------|
| Pages | `src/app/**/page.tsx` | Auth, redirect, data inicial; poco JSX de negocio |
| API | `src/app/api/**/route.ts` | Thin: parse, authorize, call lib, map errors → HTTP |
| Domain schemas | `src/domain/controlx.ts` | Enums canónicos + índices documentados |
| Runtime types | `src/lib/execution-types.ts` | Estados, acciones, helpers de deps/piso |
| Motor | `src/lib/execution-runtime.ts` | Materializar, transicionar, evidencia, gates approve |
| AuthZ | `src/lib/execution-auth.ts`, `api-auth.ts`, `current-user.ts` | Única fuente de permisos |
| UI dominio | `src/components/*` | Islands client; no escribir a Mongo directo |

---

## 4. Modelo de datos (contratos)

### 4.1 Colecciones y ownership

| Colección | Key conceptual | Escrito por |
|-----------|----------------|-------------|
| `organizations` | tenant | SuperAdmin |
| `organizationMemberships` | org ↔ OrgAdmin | SuperAdmin / admin APIs |
| `events` | diseño + `readiness` embebido | prep APIs |
| `eventMemberships` | actores del mapa | Setup / actors API |
| `workstreams` / `blocks` / `activities` / `designSteps` / `gates` | grafo de diseño | prep |
| `eventInstances` | ejecución | `createExecution` |
| `executionSteps` | paso runtime + `iterations[]` | materialize + transition |
| `timelineEntries` | auditoría | transition / actos |
| `aiGuideAudits` | Xavier | guide route |

### 4.2 Documento de ejecución (`eventInstances`)

Campos relevantes (ver `ExecutionDoc` en `execution-runtime.ts`):

- `eventId`, `organizationId`
- `type`: `SIMULACRO` | `REAL`
- `status`: `BORRADOR` | `PREPARADO` | `EN_EJECUCION` | `PAUSADO` | `FINALIZADO` | `CANCELADO`
- `anchorStartAt` — T0 de la instancia
- `timezone`, `name`, timestamps

### 4.3 Documento de paso runtime (`executionSteps`)

- Referencias: `eventInstanceId`, `designStepId`, workstream/block/activity ids + nombres denormalizados
- Plan: `plannedStartAt`, `plannedEndAt` (mutables bajo reglas de schedule)
- Asignación: `executorActorId(s)`, `approverActorIds`
- Estado: `status` (`RuntimeStepStatus`)
- Flags: `evidenceRequired`, evidencias (`evidence[]`), comentarios
- `iterations: StepIteration[]` — historial embebido
- Dependencias: ids de predecesores (design/runtime mapping)

### 4.4 Iteración (`StepIteration`)

```ts
type StepIteration = {
  n: number;
  status:
    | "EN_CURSO"
    | "EXITOSA"
    | "FALLIDA"
    | "FORZADA_OK"
    | "PENDIENTE_APROBACION"
    | "RECHAZADA";
  start: StepAct;
  end?: StepAct & { outcome: "success" | "fail" | "force" };
};
```

**Invariante de producto:** un cierre con aprobadores deja la iteración en `PENDIENTE_APROBACION`; `approve` → `EXITOSA`; `reject` → `RECHAZADA`. No dejar `EXITOSA` si luego hubo rechazo sin nueva iteración.

Helper de display: `iterationStatusForDisplay` en `execution-types.ts`.

### 4.5 Índices

Declarados en `controlXIndexes` (`domain/controlx.ts`). Aplicarlos en Atlas/local según entorno. Ojo: la clave `steps` / `iterations` del dominio es **histórica**; la colección real de runtime es `executionSteps` con iteraciones embebidas.

---

## 5. Máquina de estados — especificación formal

### 5.1 Enums

```ts
RuntimeStepStatus =
  PLANIFICADO | INICIADO | PENDIENTE_APROBACION | EXITOSO |
  APROBADO | FALLIDO | RECHAZADO | OMITIDO | SIMULADO

RuntimeStepAction =
  start | complete_success | complete_fail | omit | simulate |
  approve | reject | force_success | restart
```

### 5.2 Tabla `nextStatus` (código canónico)

| Acción | Precondición de estado | Resultado | Extra |
|--------|------------------------|-----------|-------|
| `start` | `PLANIFICADO` \| `RECHAZADO` | `INICIADO` | deps + gates; piso de hora |
| `complete_success` | `INICIADO` | `PENDIENTE_APROBACION` si hay aprobadores; else `EXITOSO` | evidencia si required |
| `complete_fail` | `INICIADO` | `FALLIDO` | |
| `approve` | `PENDIENTE_APROBACION` | `APROBADO` | |
| `reject` | `PENDIENTE_APROBACION` | `RECHAZADO` | comment + occurredAt |
| `restart` | `FALLIDO` | `INICIADO` | nueva iteración |
| `force_success` | debe ser `FALLIDO` (check extra) | `APROBADO` \| `EXITOSO` | solo EventAdmin/Super |
| `omit` / `simulate` | `PLANIFICADO` \| `INICIADO` | `OMITIDO` / `SIMULADO` | solo `execution.type === SIMULACRO` |

Fuente: función `nextStatus` en `execution-runtime.ts`.

### 5.3 Desbloqueo

```ts
stepUnlocksDependents(status) ≡ status ∈ { EXITOSO, APROBADO }
```

`unmetStepDependencies(step, steps)` falla el `start` si algún predecesor no desbloquea.

### 5.4 Piso temporal (`actTimeFloor` / `actTimeFloorForStep`)

Para acciones de inicio:

\[
occurredAt \ge \max(\text{T0 ejecución},\ \max_i endedAt(\text{predecesora}_i))
\]

Implementación: `execution-types.ts` + validación en `transitionRuntimeStep`.

### 5.5 Overlays (no son estados)

- **Atrasado (`overdue`):** comparación wall-clock vs plan.  
- **Forzado:** señal visual tras `force_success` / iteración `FORZADA_OK`.

No persistir overlays como `status`.

---

## 6. API de transición (contrato)

`POST /api/executions/[executionId]/steps/[stepId]/transition`

### Body (conceptual)

```json
{
  "action": "start",
  "comment": "opcional o requerido según acción",
  "occurredAt": "2026-08-20T15:30:00.000Z",
  "evidencePathnames": ["evidences/.../file.pdf"]
}
```

### Semántica HTTP

| Código | Cuándo |
|--------|--------|
| 200 | Transición OK; body con step(s) actualizados |
| 400 | Validación / regla de negocio (`Error` message) |
| 401/403 | Auth / AuthZ |
| 404 | Ejecución o paso inexistente / no pertenece |

### AuthZ (`canOperateExecutionStep`)

- Admin sin impersonar → contingencia (opera “en nombre de”).  
- Ejecutor → acciones de ejecución en pasos asignados.  
- Aprobador / SteerCo → approve/reject según reglas.  
- `force_success` → EventAdmin o SuperAdmin únicamente.

### Efectos colaterales esperados

1. Update atómico del documento de paso (status, iterations, comments).  
2. `timelineEntries` append.  
3. Posible promoción `PREPARADO` → `EN_EJECUCION`.  
4. Recálculo de `plannedStartAt` de pasos aún mutables (`execution-schedule.ts`).  
5. Invalidación implícita vía polling de clientes.

---

## 7. Materialización y sync

### Crear ejecución

1. `assertCanCreateExecution` — readiness fresco + `canStart`.  
2. Insert `eventInstances`.  
3. `materializeExecutionSteps` — copia design → runtime con ancla T0.  
4. Estado inicial instancia: `PREPARADO`.

### Sync desde diseño

| Función | Uso |
|---------|-----|
| `syncExecutionPlanFromDesign` | Ajustar plan |
| `syncMissingExecutionSteps` | Pasos nuevos del diseño |
| `refreshOpenExecutionsFromDesign` | Refresh acotado (roles/evidencia/plan) |

Al extender: **nunca** borrar historial de iteraciones de una REAL por un import Excel.

---

## 8. Readiness

Módulo: `src/lib/event-readiness.ts`.

Checks típicos: Día D, actores, workstreams, bloques, pasos, ejecutores (bloqueante), aprobadores (warn), condición de arranque.

- Snapshot en `events.readiness`.  
- Marcar `stale` al mutar prep.  
- Hub **no** recalcula solo por stale: exige `POST .../readiness/recompute`.  
- Crear ejecución → `assertCanCreateExecution`.

---

## 9. Gates

- Diseño: colección `gates` + vínculos en pasos.  
- Runtime: `gate-runtime.ts` — productor OK, hora mínima, `closesAfterTargets`, `approvalRoles`.  
- Aprobación: `POST /api/executions/[id]/gates/[gateId]/approve` → `approveExecutionGate`.

`WORKSTREAM_ADMIN` aparece en roles de aprobación de gate en dominio; **no** está en el enum del mapa de actores de Setup actual. Tenerlo en cuenta al extender UI de actores.

---

## 10. Evidencias (Blob)

1. Upload vía endpoint de evidence → `@vercel/blob` path `evidences/{executionId}/...`.  
2. Metadatos en el paso (`EvidenceMeta`).  
3. Descarga: `GET .../evidence/file` con auth (URLs no públicas).

Sin `BLOB_READ_WRITE_TOKEN`, el flujo de adjuntos falla de forma controlada.

`requireEvidenceIfNeeded` solo en acciones de éxito (`complete_success`), no en start/fail/force.

---

## 11. AuthN / AuthZ — matriz rápida

| Capacidad | Super | OrgAdmin | EventAdmin | Executor | Approver | SteerCo |
|-----------|:-----:|:--------:|:----------:|:--------:|:--------:|:-------:|
| Ver ejecución (miembro) | ✓ | ✓* | ✓ | ✓ | ✓ | ✓ |
| Prep evento | ✓ | ✓ | ✓ | | | |
| Crear ejecución | ✓ | ✓ | ✓ | | | |
| Operar paso asignado | cont. | cont. | cont. | ✓ | | |
| Aprobar/rechazar | cont. | cont. | cont. | | ✓ | ✓† |
| Forzar OK | ✓ | | ✓ | | | |
| Impersonar actor (dev) | ✓‡ | | | | | |

\* OrgAdmin de la org del evento.  
† Contingencia / gobierno según implementación.  
‡ + flag env.

`canViewExecution` abre Panel/Mapa/Monitor a quien puede ver; operar sigue restringido a `/run` + AuthZ de acción.

---

## 12. Superficie API (catálogo)

### Auth / sistema
- `GET /api/health`
- `POST /api/auth/dev-login` · `dev-logout`
- `POST /api/dev/impersonate`
- `POST /api/ai/guide`

### Organización / evento / prep
- CRUD `organizations`, admins
- CRUD `events`, workstreams, blocks, activities, design-steps, gates
- Actors (+ import/export/clear)
- step-executors · step-approvers · step-roles · roles-board
- design-bulk: template, validate, import, export, clear
- `POST .../readiness/recompute`
- `POST .../executions/purge-simulacros`

### Runtime
- `POST /api/executions`
- `GET|PATCH /api/executions/[executionId]`
- `POST .../start`
- `POST .../steps/[stepId]/transition` ← **crítico**
- `POST .../steps/[stepId]/evidence` · `comments`
- `GET .../evidence/file`
- `POST .../gates/[gateId]/approve`

### Producto
- `feedback`, `novedades`

Al agregar endpoints: reutilizar `requireApiUser` / guards existentes; mapear `Error` de dominio a 400 con mensaje usable en UI.

---

## 13. Capas de UI relevantes

| Componente | Rol |
|------------|-----|
| `execution-times-panel(-2).tsx` | Panel Gantt observación |
| `executor-cockpit.tsx` / consolas | Mi turno |
| `mapa-general.tsx` | Lista líos/novedades + filtros |
| `mapa-status-filter-panel.tsx` | Panel flotante arrastrable (patrón Xpaces) |
| `threshold-monitor.tsx` | Umbral / burndown |
| `execution-step-info-dialog.tsx` | Info + iteraciones |
| `execution-act-dialog.tsx` | Modal de acto (hora, motivo) |
| `step-action-flower.tsx` | Acciones contextuales en Gantt |
| `controlx-guide-chat.tsx` | Xavier |
| `event-setup` · `event-design` · `event-roles` · `event-planner` | Prep |

### Polling

Patrón típico:

```ts
useEffect(() => {
  const id = setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    const res = await fetch(`/api/executions/${executionId}`, { cache: "no-store" });
    // merge state
  }, 4000);
  return () => clearInterval(id);
}, [executionId]);
```

No introducir WebSockets sin diseño de backpressure y auth.

### Líos / novedades (Mapa)

Lógica en `src/lib/mapa-general.ts` — mantener definición alineada con el Manual de usuario al cambiar reglas.

---

## 14. Guía IA (Xavier)

| Pieza | Path |
|-------|------|
| Route stream | `src/app/api/ai/guide/route.ts` |
| Knowledge base | `src/lib/ai/guide-knowledge.ts` |
| Tools | `src/lib/ai/guide-tools.ts` |
| Audit / rate limit | colección `aiGuideAudits` |

**Contrato de producto:** solo lectura. Prohibido operar pasos o crear ejecuciones desde tools. Al ampliar tools, revalidar que no filtren PII innecesaria.

---

## 15. Extensiones frecuentes — cómo hacerlo bien

### Agregar un estado de paso
1. Extender `runtimeStepStatusSchema` + labels UI + colores (`execution-focus`, leyendas).  
2. Actualizar `nextStatus` y tests mentales de deps.  
3. Actualizar Mapa chips, Manual y este documento.  
4. Decidir si desbloquea dependientes.

### Agregar una acción
1. `runtimeStepActionSchema` + `nextStatus` + `requireComment` / evidence / occurredAt helpers.  
2. AuthZ en `canOperateExecutionStep`.  
3. UI solo en Mi turno (salvo Forzar/aprobar).  
4. Timeline `commentKind`.

### Exponer Omitir / Simular en UI
Ya existen en runtime. Añadir botones **solo** si `execution.type === "SIMULACRO"` y documentar que **no** desbloquean deps.

### Cambiar regla de lío
Único lugar: `mapa-general.ts` (+ textos del Manual). Evitar divergencia Panel vs Mapa.

---

## 16. Errores y observabilidad

- Preferir `throw new Error("mensaje en español usable")` en lib → API 400.  
- 404 en IDs inválidos / docs faltantes (común tras borrar simulacros o pasos viejos en cliente).  
- Xavier: auditar prompts/respuestas según política.  
- No loguear tokens Clerk ni secrets Blob.

Clientes deben tolerar 404 en poll tras purge y limpiar estado local.

---

## 17. Testing / verificación manual (checklist avanzado)

1. Crear evento → completar readiness → crear SIMULACRO.  
2. Cadena A→B: fallar A → B no inicia → rearrancar A o Forzar → B inicia.  
3. Paso con aprobadores: éxito → pendiente → rechazo → reinicio → éxito → aprueba.  
4. Piso de hora: intentar iniciar B antes del fin de A → rechazo API.  
5. Evidencia required: éxito sin archivo → 400; con archivo → OK.  
6. REAL: omit/simulate → 400.  
7. OrgAdmin contingencia en `/run` sin cambiar asignación.  
8. Panel: no iniciar; Mapa filtro estados arrastrable; Umbral carga.  
9. Blob off: mensaje claro al adjuntar.  
10. Bypass off + Clerk: OTP end-to-end.

Automatización E2E aún no es el estándar del repo; este checklist es la red de seguridad.

---

## 18. Deuda conocida / trampas

| Tema | Detalle |
|------|---------|
| Dominio vs runtime | `iterations` colección vs embebidas |
| `WORKSTREAM_ADMIN` | En gates/dominio; no en mapa Setup |
| Omit/Simular | Backend sí, UI no |
| README raíz | Template create-next-app; no documenta producto |
| Polling | Suficiente hoy; escala limitada en salas enormes |
| Bypass en prod | Posible según `dev-flags`; riesgo operativo |

---

## 19. Mapa mental de archivos (absolutos útiles)

```text
src/proxy.ts
src/domain/controlx.ts
src/lib/mongodb.ts
src/lib/current-user.ts
src/lib/api-auth.ts
src/lib/dev-flags.ts
src/lib/admin-data.ts
src/lib/execution-types.ts
src/lib/execution-runtime.ts
src/lib/execution-auth.ts
src/lib/execution-schedule.ts
src/lib/gate-runtime.ts
src/lib/event-readiness.ts
src/lib/event-actors.ts
src/lib/mapa-general.ts
src/lib/evidence-blob.ts
src/lib/ai/guide-knowledge.ts
src/app/api/executions/[executionId]/steps/[stepId]/transition/route.ts
```

---

## 20. Criterio de “done” para un PR de runtime

- [ ] Transición solo vía `transitionRuntimeStep`  
- [ ] Zod + AuthZ en route  
- [ ] Iteraciones coherentes con approve/reject  
- [ ] Deps / overlays no rotos  
- [ ] UI observa vs opera respetada  
- [ ] Labels ES actualizados  
- [ ] Docs de `Documentacion/` tocadas si cambia contrato de producto  

---

*Especificación alineada al código de ControlX al 2026-08-20. Si el código diverge, actualizar este documento en el mismo PR.*
