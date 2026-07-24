# ControlX — Arquitectura técnica

**Versión:** 0.1.0  
**Audiencia:** Arquitectura / Tech Lead  
**Tipo de sistema:** Aplicación web operativa para planificación y ejecución de eventos (simulacros y operaciones reales)

---

## 1. Resumen ejecutivo

ControlX es una aplicación **full-stack** construida sobre **Next.js 16 (App Router)**. La interfaz, la API y la lógica de negocio conviven en un único repositorio desplegable en **Vercel**.

La identidad se delega en **Clerk**, el estado de negocio en **MongoDB**, las evidencias (imagen/PDF) en **Vercel Blob**, y el asistente guía del sistema en **OpenAI** a través del **Vercel AI SDK**.

| Dimensión | Decisión |
|-----------|----------|
| Estilo de despliegue | Monolito modular (UI + API en Next.js) |
| Modelo de datos | Documental (MongoDB), sin ORM |
| Contratos de dominio | Esquemas Zod como fuente de verdad |
| Autenticación | Managed IdP (Clerk) |
| Hosting objetivo | Vercel (serverless / Fluid Compute) |

---

## 2. Vista de contexto

```text
┌─────────────────────────────────────────────────────────────┐
│                         Clientes                            │
│              Navegador (desktop / mobile)                   │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    ControlX (Next.js 16)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ App Router   │  │ Route        │  │ Proxy / Auth     │  │
│  │ (RSC + CSR)  │  │ Handlers API │  │ (Clerk / bypass) │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
   ┌─────────┐      ┌───────────┐      ┌────────────┐
   │  Clerk  │      │  MongoDB  │      │ Vercel Blob│
   │  (IdP)  │      │ Atlas/loc │      │ evidencias │
   └─────────┘      └───────────┘      └────────────┘
                             │
                             ▼
                      ┌────────────┐
                      │  OpenAI    │
                      │ (AI Guide) │
                      └────────────┘
```

---

## 3. Stack tecnológico

### 3.1 Plataforma de aplicación

| Componente | Tecnología | Notas |
|------------|------------|-------|
| Framework | **Next.js 16.2** | App Router, Route Handlers, Turbopack en desarrollo |
| Runtime UI | **React 19.2** | React Compiler habilitado |
| Lenguaje | **TypeScript 5** | Tipado estricto en dominio y APIs |
| Empaquetado | Turbopack (dev) / build de Next | Configuración en `next.config.ts` |

### 3.2 Experiencia de usuario

| Componente | Tecnología |
|------------|------------|
| Estilos | **Tailwind CSS 4** |
| Componentes | **shadcn/ui** sobre **Radix UI** |
| Iconografía | Lucide React |
| Formularios | react-hook-form + Zod resolvers |
| Utilidades UI | class-variance-authority, clsx, tailwind-merge |

### 3.3 Persistencia e integraciones

| Capacidad | Tecnología | Uso en ControlX |
|-----------|------------|-----------------|
| Base de datos | **MongoDB** (driver oficial) | Organizaciones, eventos, pasos, ejecuciones, timeline, membresías |
| Autenticación | **Clerk** | Sesión, usuarios, sign-in / sign-up |
| Almacenamiento de archivos | **Vercel Blob** | Evidencias de ejecución (imagen / PDF) |
| Inteligencia artificial | **Vercel AI SDK** + **OpenAI** | Asistente guía del sistema (servidor) |
| Validación | **Zod 4** | Dominio, payloads API, formularios |

### 3.4 Herramientas de desarrollo

| Herramienta | Rol |
|-------------|-----|
| ESLint + eslint-config-next | Calidad de código |
| tsx | Scripts operativos (p. ej. bootstrap de admin) |
| dotenv | Carga de entorno en scripts |

---

## 4. Organización del código

```text
src/
├── app/                 # Rutas UI + Route Handlers (/api/*)
├── components/          # UI de producto y primitivas shadcn
├── domain/              # Contratos de negocio (Zod + tipos)
├── lib/                 # Acceso a datos, auth, runtime, AI, utilidades
└── proxy.ts             # Protección de rutas (auth edge)
```

**Principios de diseño actuales:**

1. **Dominio primero** — los esquemas en `src/domain/` definen estados, roles y entidades.
2. **Sin ORM** — acceso directo al driver de MongoDB con índices declarados en dominio.
3. **API colocalizada** — endpoints REST bajo `src/app/api/` junto a las páginas que los consumen.
4. **Server-only donde corresponde** — conexión a Mongo y secretos no se exponen al cliente.

---

## 5. Modelo de negocio (alto nivel)

ControlX orquesta el ciclo de vida de **eventos** (simulacro o real) y su **ejecución** por roles.

### Roles

| Rol | Responsabilidad típica |
|-----|------------------------|
| `SUPER_ADMIN` | Administración global de la plataforma |
| `ORG_ADMIN` | Gestión de organización |
| `EVENT_ADMIN` | Diseño y operación del evento |
| `WORKSTREAM_ADMIN` | Coordinación de workstream |
| `EXECUTOR` | Ejecución de pasos |
| `APPROVER` | Aprobaciones de pasos |
| `STEERCO` | Gobernanza / aprobación de alto nivel |

### Entidades principales

- **Organización** → **Evento** → **Workstreams / Blocks / Activities / Design Steps / Gates**
- **Event Instance** (corrida) → **Steps** → **Iterations** + **Timeline**
- **Memberships** (usuario Clerk ↔ roles en organización/evento)
- **Evidencias** (URLs en Blob asociadas a iteraciones)

### Estados de evento (ejemplo)

`BORRADOR` → `PREPARADO` → `EN_EJECUCION` → `PAUSADO` / `FINALIZADO` / `CANCELADO`

### Condiciones de paso

Los pasos pueden depender de:

- resultado de otro paso (`STEP_RESULT`)
- ventana temporal (`MINIMUM_TIME`)
- aprobación formal (`APPROVAL`)

---

## 6. Seguridad y autenticación

| Aspecto | Enfoque |
|---------|---------|
| Identidad | Clerk (publishable + secret keys) |
| Protección de rutas | `src/proxy.ts` (middleware Next) |
| Rutas públicas | Landing, sign-in/up, health, assets de manifiesto |
| Desarrollo local | Bypass opcional (`CONTROLX_DEV_BYPASS`) — **nunca en producción** |
| Impersonación de actores | Flag de desarrollo para pruebas de roles |

Las claves sensibles viven solo en variables de entorno de servidor (`CLERK_SECRET_KEY`, `MONGODB_URI`, `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`).

---

## 7. Persistencia

- Cliente Mongo reutilizado por proceso (`src/lib/mongodb.ts`).
- Base configurable (`MONGODB_URI`, `MONGODB_DB_NAME`).
- Índices de colección documentados en `controlXIndexes` (unicidad de membresías, orden de workstreams, timeline por instancia, etc.).
- Compatible con **MongoDB local** o **Atlas**.

---

## 8. Capacidades transversales

| Capacidad | Descripción |
|-----------|-------------|
| Ejecución operativa | Consola / cockpit de ejecución de pasos con transiciones de estado |
| Evidencias | Carga a Vercel Blob desde la ejecución |
| Readiness | Evaluación de preparación del evento antes de correr |
| Novedades / Feedback | Canales internos de comunicación y reporte |
| AI Guide | Chat asistente con límites, tools y auditoría |
| Release notes | Notas de versión visibles en login / producto |

---

## 9. Despliegue y configuración

**Plataforma objetivo:** Vercel.

Variables de entorno relevantes (ver `.env.example`):

| Variable | Propósito |
|----------|-----------|
| `MONGODB_URI` / `MONGODB_DB_NAME` | Conexión a base de datos |
| `NEXT_PUBLIC_CLERK_*` / `CLERK_SECRET_KEY` | Auth Clerk |
| `BLOB_READ_WRITE_TOKEN` | Evidencias en Blob |
| `OPENAI_API_KEY` | Asistente guía |
| `CONTROLX_DEV_BYPASS` | Solo desarrollo local |

Scripts principales:

```bash
npm run dev          # entorno local
npm run build        # build de producción
npm run start        # servir build
npm run setup:admin  # bootstrap de super admin en Clerk
```

---

## 10. Diagrama de capas

```text
┌──────────────────────────────────────────┐
│  Presentación                            │
│  React 19 · shadcn · Tailwind 4          │
├──────────────────────────────────────────┤
│  Aplicación / API                        │
│  Next.js App Router · Route Handlers     │
├──────────────────────────────────────────┤
│  Dominio                                 │
│  Zod schemas · roles · estados · reglas  │
├──────────────────────────────────────────┤
│  Infraestructura                         │
│  MongoDB · Clerk · Blob · OpenAI         │
└──────────────────────────────────────────┘
```

---

## 11. Decisiones y trade-offs

| Decisión | Beneficio | Implicación |
|----------|-----------|-------------|
| Monolito Next.js | Velocidad de entrega, un solo deploy | Escala horizontal acoplada a Vercel |
| MongoDB sin ORM | Flexibilidad y control fino | Validación y migraciones son responsabilidad del equipo |
| Clerk managed | Menos superficie de auth propia | Dependencia de proveedor externo |
| AI solo en servidor | Secretos protegidos | Latencia y costo ligados a OpenAI |
| React Compiler | Menos memoización manual | Requiere disciplina con patrones React modernos |

---

## 12. Contacto de contexto técnico

| Ítem | Valor |
|------|-------|
| Nombre del proyecto | `controlx` |
| Paquete | npm / Next.js app privada |
| Documento | `docs/arquitectura-tecnica.md` |

---

*Documento orientado a revisión de arquitectura. No sustituye diagramas de secuencia por flujo (ejecución, aprobación, readiness); esos pueden anexarse por caso de uso.*
