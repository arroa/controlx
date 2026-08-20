# Arquitectura técnica del sistema — ControlX

**Versión:** 1.0 · **Fecha:** 2026-08-20  
**Audiencia:** arquitectura, producto técnico, onboarding de ingeniería  
**Fuente de verdad:** código en `src/` (este documento refleja el sistema implementado)

---

## 1. Propósito del sistema

ControlX es una plataforma para **diseñar y ejecutar eventos operativos críticos** (cambios de corte, migraciones, go-lives, simulacros de crisis).

El ciclo de vida se separa en dos mundos:

| Mundo | Qué es | Persistencia |
|-------|--------|--------------|
| **Preparación** | Plantilla reutilizable del evento (diseño, roles, plan, gates) | Colecciones de diseño + `events` |
| **Ejecución** | Instancia concreta **SIMULACRO** o **REAL** | `eventInstances` + `executionSteps` materializados |

La UI refuerza otra separación clave:

- **Observar** → Panel (Gantt), Mapa General, Monitor de Umbral  
- **Operar** → Mi turno (`/run/[executionId]`)

---

## 2. Vista de alto nivel

```text
┌─────────────────────────────────────────────────────────────────┐
│                         Clientes                                 │
│   Browser (App Router RSC + Client Islands) · PWA (manifest/SW)  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────────┐
│                    Next.js 16 (App Router)                        │
│  proxy.ts (Clerk / bypass) · Pages RSC · Route Handlers /api/*   │
│  React 19 · React Compiler · Tailwind 4 · shadcn/ui              │
└──────┬───────────────┬──────────────────┬───────────────┬───────┘
       │               │                  │               │
       ▼               ▼                  ▼               ▼
  MongoDB          Clerk              Vercel Blob      OpenAI
  (controlx)    (OTP / sesión)      (evidencias)    (guía Xavier)
```

No hay Server Actions en el repositorio: **toda mutación de negocio pasa por Route Handlers** que delegan a módulos `server-only` en `src/lib/`.

---

## 3. Stack tecnológico

| Capa | Tecnología | Notas |
|------|------------|--------|
| Framework | Next.js `^16.2.12` | App Router; middleware en `src/proxy.ts` |
| UI | React 19.2.4, Tailwind 4, shadcn (radix-nova), Lucide | `components.json` |
| Validación | Zod 4 | Frontera API + dominio |
| DB | MongoDB driver `^7.5.0` | DB default `controlx` |
| Auth | Clerk (`@clerk/nextjs` 7.x) | Bypass de desarrollo opcional |
| Storage | `@vercel/blob` | Store **privado**; descarga vía proxy autenticado |
| IA | Vercel AI SDK + `@ai-sdk/openai` | Modelo `gpt-4o-mini`; solo lectura |
| Excel | exceljs | Carga masiva de diseño y actores |
| TZ | `@vvo/tzdb` | Catálogo de zonas horarias |
| Deploy | Vercel (implícito) | Blob + env; script sync token |

Scripts npm: `dev`, `build`, `start`, `lint`, `setup:admin`.

---

## 4. Estructura del repositorio

```text
ControlX/
├── src/
│   ├── app/                  # Rutas (pages) + api/*/route.ts
│   ├── components/           # UI de dominio + components/ui
│   ├── domain/controlx.ts    # Enums / schemas canónicos / índices
│   ├── lib/                  # Núcleo de negocio (server)
│   │   └── ai/               # Guía Xavier (prompt, tools, KB, audit)
│   └── proxy.ts              # Auth gate (Clerk o bypass)
├── scripts/                  # setup-admin, sync Blob → Vercel
├── public/                   # iconos, sw.js
├── Documentacion/            # Este paquete documental
└── package.json · next.config.ts · .env.example
```

### Módulos ancla (`src/lib`)

| Módulo | Responsabilidad |
|--------|-----------------|
| `admin-data.ts` | CRUD de organización, evento, diseño, creación de ejecuciones |
| `execution-runtime.ts` | Motor de estados, materialización, transiciones |
| `execution-types.ts` | Tipos runtime, labels, helpers de deps / piso de hora |
| `execution-auth.ts` | Quién puede ver / operar / forzar |
| `execution-schedule.ts` | Recálculo de plan vivo tras cierres |
| `gate-runtime.ts` | Evaluación y aprobación de gates |
| `event-readiness.ts` | Checklist que bloquea crear ejecuciones |
| `event-actors.ts` | Mapa de actores del evento |
| `mapa-general.ts` | Filas, líos, novedades, ordenación |
| `mongodb.ts` | Cliente y nombre de DB |
| `current-user.ts` / `api-auth.ts` | Identidad y guards de API |
| `evidence-blob.ts` | Upload / paths Blob |
| `ai/guide-*` | Asistente Xavier |

---

## 5. Modelo de dominio

### 5.1 Jerarquía

```text
Organización
 └── Evento (diseño / plantilla)
      ├── Setup: Día D (T0 REAL), actores, workstreams, bloques
      ├── Diseño: actividades (WS × bloque) + pasos
      ├── Roles: ejecutores / aprobadores por paso
      ├── Planificador: horarios, dependencias, gates
      └── Ejecuciones (instancias)
           ├── SIMULACRO (T0 propio)
           └── REAL (T0 = Día D)
                └── executionSteps (snapshot materializado)
```

### 5.2 Conceptos

| Concepto | Significado arquitectónico |
|----------|----------------------------|
| **Workstream** | Línea de trabajo en paralelo |
| **Bloque** | Objeto transversal (app, plataforma, ubicación); no es corte temporal |
| **Actividad** | Cruce workstream × bloque |
| **Paso de diseño** | Definición reutilizable |
| **Paso de runtime** | Copia materializada en una ejecución |
| **Gate** | Compuerta overlay: abre territorios; condiciones de tiempo / cierre / aprobación |
| **Readiness** | Snapshot cacheado en `events.readiness`; `stale` al tocar prep |
| **Iteración** | Intento embebido en el paso (`iterations[]`) |
| **Overlays** | `atrasado` / `forzado` — señales de UI, no estados de máquina |

### 5.3 Colecciones MongoDB

| Colección | Contenido |
|-----------|-----------|
| `organizations` | Tenants |
| `organizationMemberships` | OrgAdmins |
| `events` | Evento + readiness embebido |
| `eventMemberships` | Actores del mapa |
| `workstreams`, `blocks`, `activities`, `designSteps`, `gates` | Diseño |
| `eventInstances` | Ejecuciones (nombre histórico) |
| `executionSteps` | Pasos materializados + `iterations` embebidas |
| `timelineEntries` | Auditoría de actos |
| `feedback`, `novedades` | Feedback y changelog de producto |
| `aiGuideAudits` | Auditoría / rate-limit de Xavier |

Índices declarativos: `controlXIndexes` en `src/domain/controlx.ts`.  
**Nota:** el dominio menciona colección `iterations` suelta; en runtime las iteraciones viven **dentro** de `executionSteps`.

---

## 6. Máquina de estados (pasos)

### Estados

`PLANIFICADO` · `INICIADO` · `PENDIENTE_APROBACION` · `EXITOSO` · `APROBADO` · `FALLIDO` · `RECHAZADO` · `OMITIDO` · `SIMULADO`

### Acciones

`start` · `complete_success` · `complete_fail` · `approve` · `reject` · `restart` · `force_success` · `omit` · `simulate`

### Transiciones (resumen)

```text
PLANIFICADO ──start──► INICIADO ──complete_success──► EXITOSO
                              │                      (o PENDIENTE_APROBACION
                              │                       si hay aprobadores)
                              └──complete_fail──► FALLIDO
                                                    │
                              ┌─────────────────────┤
                              │ restart             │ force_success
                              ▼                     ▼
                           INICIADO            EXITOSO / APROBADO

PENDIENTE_APROBACION ──approve──► APROBADO
                     ──reject───► RECHAZADO ──start──► INICIADO

omit / simulate (solo SIMULACRO, API): PLANIFICADO|INICIADO → OMITIDO|SIMULADO
```

### Reglas estructurales

1. **Desbloqueo de dependientes:** solo `EXITOSO` o `APROBADO` (incluye forzado). Fallido / omitido / simulado **no** desbloquean.
2. **Inicio:** deps satisfechas + gates abiertos; `occurredAt` ≥ T0 y ≥ fin real más tardío de predecesoras.
3. **Evidencia:** puede ser obligatoria al marcar éxito; no bloquea iniciar/fallar.
4. **Omitir / Simular:** implementados en runtime; **sin botones en UI** hoy.
5. **Forzar OK:** solo desde `FALLIDO`; EventAdmin o SuperAdmin; motivo obligatorio.

Motor: `transitionRuntimeStep` en `execution-runtime.ts`.

---

## 7. Autenticación y autorización

### Capas de identidad

1. **Clerk** — OTP / sesión (producción normal).  
2. **Dev bypass** — `CONTROLX_DEV_BYPASS` + `isDevBypassEnabled()` → cookie `cx_dev_session`, userId `dev:{email}`.  
3. **SuperAdmin** — email = `SUPER_ADMIN_EMAIL` (sin fila Mongo).  
4. **Impersonación de actor** — flag `CONTROLX_DEV_ACTOR_IMPERSONATION` (SuperAdmin).

Gate de rutas: `src/proxy.ts` (Next 16; no hay `middleware.ts`).

### Roles

| Rol | Origen | Capacidad típica |
|-----|--------|------------------|
| SuperAdmin | Env | Todo |
| OrgAdmin | `organizationMemberships` | Org + eventos; contingencia en `/run` |
| EventAdmin | Mapa `EVENT_ADMIN` | Prep + Forzar OK + contingencia |
| EXECUTOR | Mapa + asignación a paso | Operar pasos propios |
| APPROVER | Mapa + `approverActorIds` | Aprobar / rechazar |
| STEERCO | Mapa | Gobierno / destrabar aprobaciones |

Helpers: `canViewExecution`, `canAccessEvent`, `canOperateExecutionStep` (`execution-auth.ts`).

---

## 8. Superficie de rutas

### Pages

| Patrón | Rol |
|--------|-----|
| `/`, `/sign-in`, `/entrar` | Acceso |
| `/dashboard` | SuperAdmin |
| `/organizations/[organizationId]` | Hub org |
| `/events/[eventId]` · `/setup` · `/design` · `/roles` · `/plan` | Preparación |
| `/events/[eventId]/executions` | Lista / crear |
| `.../executions/[executionId]` | Panel (observar) |
| `.../mapa` · `.../umbral` | Mapa · Monitor |
| `/run/[executionId]` | Mi turno (operar) |
| `/ejecuciones`, `/eventos` | Hubs operador |
| `/novedades`, `/feedback`, `/admin/ai-audit` | Producto / admin |

### APIs críticas

| Método | Ruta | Función |
|--------|------|---------|
| POST | `/api/executions` | Crear instancia |
| GET | `/api/executions/[id]` | Detalle (polling UI) |
| POST | `.../steps/[stepId]/transition` | **Núcleo de estado** |
| POST | `.../steps/[stepId]/evidence` | Evidencias |
| POST | `.../gates/[gateId]/approve` | Aprobar gate |
| POST | `/api/events/[id]/readiness/recompute` | Recalcular readiness |
| POST | `/api/ai/guide` | Stream Xavier |

---

## 9. Patrones de runtime / UI

1. **Materialización:** al crear ejecución, el diseño se copia a `executionSteps`.  
2. **Polling ~4 s:** Panel / Mapa / Umbral refrescan `GET /api/executions/{id}` mientras la pestaña está visible.  
3. **Reloj UI ~30 s:** ticks locales (atrasos, “hace N min”).  
4. **Dos relojes:** wall-clock (overdue/gates) vs `occurredAt` declarado del acto.  
5. **Readiness stale:** tocar prep marca snapshot desactualizado; crear ejecución exige fresco + `canStart`.  
6. **Contingencia admin:** EventAdmin / OrgAdmin / Super operan en `/run` “en nombre de” sin reasignar.  
7. **Evidencias privadas:** Blob + proxy `.../evidence/file`.  
8. **Xavier:** solo lectura; rate-limit y audit en Mongo.

---

## 10. Integraciones externas

| Sistema | Uso |
|---------|-----|
| Clerk | Identidad y OTP |
| MongoDB Atlas / local | Persistencia |
| Vercel Blob | Evidencias privadas |
| OpenAI (via AI SDK) | Guía in-app |
| Vercel | Hosting / Blob / env |

---

## 11. Variables de entorno (resumen)

Ver `.env.example`:

- `MONGODB_URI`, `MONGODB_DB_NAME`
- Clerk: `NEXT_PUBLIC_CLERK_*`, `CLERK_SECRET_KEY`
- `CONTROLX_DEV_BYPASS`, `DEV_SESSION_SECRET`, `SUPER_ADMIN_EMAIL`
- `CONTROLX_DEV_ACTOR_IMPERSONATION`
- `BLOB_READ_WRITE_TOKEN`
- `OPENAI_API_KEY`

---

## 12. Decisiones de diseño (por qué)

| Decisión | Motivo |
|----------|--------|
| Diseño ≠ ejecución | Reutilizar plantillas; no contaminar REAL con ensayos |
| Observar ≠ operar | Reduce errores en día D; pantallas distintas |
| Materializar pasos | Snapshot estable aunque el diseño cambie después |
| Transiciones por API | Un solo motor validado (`transitionRuntimeStep`) |
| Polling simple | Suficiente para sala de crisis; sin WebSocket aún |
| Blob privado | Evidencias no son URLs públicas filtrables |

---

## 13. Documentos relacionados

- [Manual de usuario](./manual-de-usuario.md)  
- [Diseño técnico detallado](./diseno-tecnico-detallado.md)  
- [Diseño de base de datos](./diseno-base-de-datos.md)  

---

*Documento generado a partir del código de ControlX. Ante divergencia, prevalece el código.*
