# Manual de usuario — ControlX

**Versión:** 1.0 · **Fecha:** 2026-08-20  
**Audiencia:** ejecutores, aprobadores, Event Admins, Org Admins, SteerCo  
**Idioma de la UI:** español

---

## 1. ¿Qué es ControlX?

ControlX organiza **eventos operativos** (cambios, migraciones, cortes) en dos etapas:

1. **Preparar el evento** — se diseña una vez (plantilla).  
2. **Ejecutar** — se corre un **simulacro** o la **corrida real**.

En el día de la corrida hay pantallas para **mirar** (Panel, Mapa, Monitor) y una para **actuar** (Mi turno).

---

## 2. Perfiles y permisos

| Perfil | Qué hace en la práctica |
|--------|-------------------------|
| **SuperAdmin** | Administra organizaciones, todo lo demás, Forzar OK, novedades del producto |
| **OrgAdmin** | Crea y gestiona eventos de su organización; puede operar en contingencia |
| **EventAdmin** | Configura el evento (Setup → Diseño → Roles → Plan); Forzar OK; contingencia |
| **Ejecutor** | Inicia y cierra los pasos que le asignaron |
| **Aprobador** | Aprueba o rechaza pasos pendientes de su lista |
| **SteerCo** | Visión de gobierno; puede destrabar aprobaciones según configuración |

Una persona puede tener **varios roles**. Lo que importa en el día D es: *¿este paso me lo asignaron a mí?*

---

## 3. Entrar al sistema

1. Abrí la app → **Ingresar al sistema**.  
2. **Modo normal:** correo → código OTP de 6 dígitos → Entrar.  
3. El sistema te lleva según tu rol y si estás en móvil o PC:
   - Operadores suelen caer en **Ejecuciones**.  
   - Event Admins en la **preparación** del evento.  
   - SuperAdmin en el **dashboard** de organizaciones.

> Si el entorno tiene *bypass de desarrollo* activo, a veces alcanza con el correo (sin OTP). Eso lo define el equipo técnico; no es el flujo estándar de producción pensado para usuarios finales.

---

## 4. Preparar un evento (admins)

Ruta base: `/events/{evento}`

### Paso 1 — Setup
- Definí el **Día D** (ancla temporal de la corrida REAL).  
- Cargá **actores** (personas + roles).  
- Creá **workstreams** (líneas de trabajo) y **bloques** (apps, plataformas, ubicaciones).

### Paso 2 — Diseño
- Armá **actividades** (cruce workstream × bloque).  
- Dentro de cada actividad, los **pasos** (lo que se inicia y se cierra).  
- Marcá si el paso exige **evidencia** al cerrar en éxito.

### Paso 3 — Roles
- Asigná **ejecutor** a cada paso (obligatorio para estar listos).  
- Asigná **aprobadores** si el paso debe pasar por aprobación.

### Paso 4 — Planificador
- Definí horarios relativos al Día D / T0.  
- Encadená **dependencias** entre pasos.  
- Configurá **gates** (compuertas que abren territorios).

### Readiness (listos para correr)
En el hub del evento verás un checklist. Si está **desactualizado**, pulsá **Recalcular**.  
**Sin readiness en verde no se puede crear una ejecución.**

También existe **Carga masiva** (Excel) para diseño y actores.  
**Limpiar** es destructivo: borra diseño/plan/gates/ejecuciones; no toca Setup; pide confirmar escribiendo `LIMPIAR`.

---

## 5. Crear una ejecución

1. Andá a `/events/{evento}/executions`.  
2. **Nueva ejecución**:
   - **SIMULACRO** — elegís un T0 propio (ensayo; no cambia el Día D).  
   - **REAL** — el T0 es el Día D de Setup.  
3. Al crear, todos los pasos nacen **Planificado**.  
4. La ejecución arranca en **Preparado** y pasa a **En ejecución** cuando alguien opera el primer paso desde **Mi turno**.

---

## 6. Pantallas del día D

| Pantalla | URL (patrón) | Para qué |
|----------|--------------|----------|
| **Mi turno** | `/run/{ejecucion}` | Operar: iniciar, cerrar, rearrancar, aprobar |
| **Panel** | `/events/{e}/executions/{x}` | Observar el Gantt; Info; Forzar/aprobar si tenés permiso |
| **Mapa General** | `.../mapa` | Lista de líos, novedades y filtros |
| **Monitor de Umbral** | `.../umbral` | Desvío vs plan (holgura / ETA) |
| **Hub ejecuciones** | `/ejecuciones` | Entrar a tus corridas |

Navegación entre observación: **Monitor · Mapa · Panel**.

### Regla de oro
- **Mirar** en Panel / Mapa / Monitor.  
- **Actuar** en Mi turno.

---

## 7. Ciclo de vida de un paso (para humanos)

```text
Planificado → Iniciar → Iniciado → Exitoso  o  Fallido
                              │
                              └─(si hay aprobadores)→ Pendiente aprobación
                                                       ├─ Aprobar → Aprobado
                                                       └─ Rechazar → Rechazado → (se puede Iniciar de nuevo)

Fallido → Rearrancar (ejecutor)  o  Forzar OK (EventAdmin / SuperAdmin)
```

### Al iniciar o cerrar
Elegís la **hora del acto** (Ahora, ± minutos, hora planificada, etc.).  
Si el paso exige evidencia, adjuntá archivo(s) **al marcar Exitoso** (límite típico 10 MB por archivo).

### Dependencias
No podés iniciar un paso hasta que sus predecesores estén **Exitoso** o **Aprobado** (el Forzar OK también cuenta).  
Un paso **Fallido**, **Omitido** o **Simulado** **no** desbloquea a nadie.

### Piso de hora
La hora de inicio no puede ser anterior al **T0 de la ejecución** ni al **fin real más tardío** de las predecesoras.

---

## 8. Guía por rol — día a día

### Ejecutor
1. Entrar → **Ejecuciones** → **Mi turno**.  
2. Filtrá “Solo mías” / “Destacar mías” si hace falta.  
3. Cuando el paso esté desbloqueado: **Iniciar** → trabajar → **Exitoso** o **Fallido** (con evidencia si aplica).  
4. Si falló: **Rearrancar** o pedir **Forzar OK** al Event Admin.  
5. Si quedó pendiente de aprobación: esperá al aprobador.  
6. Usá Panel / Mapa para contexto; no operes desde ahí.

### Aprobador
1. Mi turno (o Panel si solo observás).  
2. Buscá pasos en **Pendiente aprobación**.  
3. Revisá Info / evidencias → **Aprobar** o **Rechazar** (el rechazo pide motivo y hora).  
4. En el Mapa podés filtrar estados / rechazadas para ver cuellos de botella.

### Event Admin / Org Admin (sala de crisis)
- Contingencia en Mi turno: actuás **en nombre de** el asignado (queda registro; **no** cambia la asignación).  
- Event Admin: **Forzar OK** en fallidos que bloquean la cadena (motivo obligatorio).  
- Observá en Panel / Mapa / Monitor; creá simulacros de ensayo antes de la REAL.

---

## 9. Mapa General — líos, novedades y estados

Ruta: `.../executions/{id}/mapa`

### Lío
Alerta operativa. Un paso es “lío” si, por ejemplo:
- está **Fallido** o **Rechazado**, o  
- debió haber arrancado y no lo hizo, o  
- está **Iniciado** / **Pendiente aprobación** pasado su fin planificado.

### Novedad (filtro del mapa)
Cambio de estado **reciente** (ventana 5 / 15 / 30 / 60 minutos).  

> No confundir con **Novedades** del menú (`/novedades`): eso es el changelog del producto ControlX.

### Filtro de estados
Botón **Estado** → panel flotante arrastrable con **multiselección** (Planificado, Iniciado, Pend. aprobación, Exitoso, Aprobado, Fallido, Rechazado, Omitido, Simulado).  
Los chips activos se pueden quitar uno a uno encima de la tabla.

Otros filtros: búsqueda, workstream, bloque, actividad, ejecutor, aprobador, “Solo líos”, “Solo novedades”.

---

## 10. Info del paso

Desde el Mapa o el Panel abrís **Info**:
- Ruta: workstream · bloque · actividad · paso · estado  
- Predecesores y dependientes  
- Horarios, comentarios, evidencias  
- Historial de **iteraciones** (intentos)

Si un cierre fue rechazado, la iteración se muestra como **Rechazada** (no como exitosa).

---

## 11. Acciones especiales

| Acción | Quién | Cuándo | Efecto |
|--------|-------|--------|--------|
| **Forzar OK** | EventAdmin / SuperAdmin | Paso **Fallido** | Cierra en éxito/aprobado y **desbloquea** dependientes |
| **Rearrancar** | Ejecutor (u admin en contingencia) | Paso **Fallido** | Nueva iteración en curso |
| **Rechazar** | Aprobador / contingencia | Pendiente aprobación | Motivo obligatorio; se puede volver a iniciar |
| **Omitir / Simular** | Solo simulacro (API) | — | Hoy **no hay botones** en la UI; no desbloquean deps |

---

## 12. Glosario rápido

| Término | En una frase |
|---------|--------------|
| **Organización** | Cliente / tenant |
| **Evento** | Diseño reutilizable de la operación |
| **Ejecución** | Corrida concreta (simulacro o real) |
| **T0 / Día D** | Ancla de tiempo de la corrida |
| **Dependencia** | Paso que debe cerrar bien antes de poder iniciar el siguiente |
| **Gate** | Compuerta que abre un territorio del plan |
| **Aprobación** | Segundo sello después del “Exitoso” del ejecutor |
| **Rechazo** | El sello no se da; el paso vuelve a poder iniciarse |
| **Lío** | Algo que necesita atención ya |
| **Novedad (mapa)** | Algo que cambió hace poco |

---

## 13. Preguntas frecuentes

**¿Puedo operar desde el Panel?**  
No las acciones de iniciar/cerrar. El Panel es para observar (y Forzar/aprobar si tenés permiso).

**¿Por qué no me deja iniciar?**  
Revisá dependencias, gates y la hora mínima (piso por T0 y fin de predecesoras).

**¿Falló un predecesor y estoy trabado?**  
Hay que rearrancar ese fallido o que un Event Admin lo **Force** a OK.

**¿Archivaron el evento?**  
Solo consulta: no se edita preparación ni se crean ejecuciones.

**¿Xavier (el asistente) puede operar por mí?**  
No. Solo guía y consulta; no inicia pasos ni crea ejecuciones.

**¿Sin evidencias en el servidor?**  
Si falta configurar el almacenamiento (Blob), los adjuntos no estarán disponibles: avisá a quien administra el entorno.

---

## 14. Mapa de URLs (referencia)

| URL | Pantalla |
|-----|----------|
| `/` | Ingreso |
| `/entrar` | Resolver post-login |
| `/dashboard` | Orgs (SuperAdmin) |
| `/organizations/{org}` | Workspace org |
| `/events/{evento}` | Hub preparación |
| `/events/{evento}/setup` · `/design` · `/roles` · `/plan` | Prep 1–4 |
| `/events/{evento}/executions` | Lista / crear |
| `/events/{evento}/executions/{id}` | Panel |
| `.../mapa` · `.../umbral` | Mapa · Monitor |
| `/run/{id}` | Mi turno |
| `/ejecuciones` | Hub operador |
| `/novedades` · `/feedback` | Producto |

---

*Si algo de la UI no coincide con este manual, prevalece la pantalla: el producto evoluciona. Pedí actualización del documento al equipo.*
