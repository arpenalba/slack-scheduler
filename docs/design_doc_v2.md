# Slack Status Scheduler
### Documento de diseño v2.0

> **Cambios respecto a v1.2:**
> - §1.3 — dos nuevos campos opcionales por regla: `presence` y `dnd`
> - §1.7 — nuevo concepto: **estado por defecto** (`default_status`) como fallback al limpiar
> - §2.2 — esquema de `config.json` actualizado con los nuevos campos
> - §2.4 — tres nuevos endpoints de la API de Slack (`users.setPresence`, `dnd.setSnooze`, `dnd.endSnooze`) y nuevos scopes de token
> - §2.12 — nueva sección: lógica de presencia, DND y estado por defecto en el servicio
> - §2.13 — nueva sección: controles de presencia, DND y estado por defecto en el editor

---

## Parte 1 — Características y requisitos

### 1.1 Descripción general

Herramienta personal que cambia automáticamente el estado de una cuenta de Slack según una programación definida por el usuario. Consta de dos piezas independientes: un **editor visual** (HTML) para gestionar la programación, y un **servicio de consola** (Node.js) que ejecuta los cambios de estado en el momento adecuado.

---

### 1.2 Tipos de estado

#### Estados semanales (weekly)
Se repiten cada semana según el día y, opcionalmente, una franja horaria.

- Asociados a uno o varios días de la semana (lunes a domingo)
- Con o sin franja horaria (ej. solo de 13:00 a 14:00)
- Si no tienen franja horaria, están activos todo el día
- Múltiples reglas pueden aplicar al mismo día (ej. "WFH todo el lunes" + "Lunch de 13:00 a 14:00 el lunes")

#### Estados puntuales (once)
Se aplican en una fecha concreta y no se repiten.

- Asociados a una fecha específica (YYYY-MM-DD)
- Con o sin franja horaria
- Casos de uso: días de vacaciones, bajas por enfermedad, días especiales
- Tienen **mayor prioridad** que los estados semanales

---

### 1.3 Estructura de un estado

Cada estado (semanal o puntual) tiene los siguientes campos:

| Campo | Obligatorio | Descripción |
|---|---|---|
| `id` | Sí | Identificador único en formato GUID (ej. `"a1b2c3d4-..."`) |
| `emoji` | Sí | Emoji en formato de código Slack (ej. `":house:"`, `":fork_and_knife:"`). El usuario puede escribirlo directamente. |
| `text` | Sí | Texto del estado (ej. "Working from home") |
| `from` | No | Hora de inicio en formato HH:MM, múltiplo de 15 minutos. Inclusivo. |
| `to` | No | Hora de fin en formato HH:MM, múltiplo de 15 minutos. Exclusivo. |
| `days` | Solo weekly | Lista de días de la semana |
| `date` | Solo once | Fecha en formato YYYY-MM-DD |
| `presence` | No | `"away"` o `"auto"`. Si se especifica, el servicio llama a `users.setPresence` al activar esta regla. Si se omite, la presencia no se modifica. |
| `dnd` | No | `true`. Si está presente, inicia un snooze de notificaciones al activar la regla y lo termina cuando la regla finaliza. |

**Restricciones de franja horaria:**
- Las horas deben ser múltiplos de 15 minutos: `00`, `15`, `30`, `45`.
- Cualquier hora introducida que no sea múltiplo de 15 se redondea hacia abajo al múltiplo anterior (ej. `14:03` → `14:00`, `15:47` → `15:45`).
- No se permiten franjas que crucen la medianoche (ej. `22:00` a `02:00`). *(TODO: evaluar soporte en el futuro si surge necesidad.)*

---

### 1.4 Reglas de prioridad

Cuando varias reglas pueden aplicar al mismo momento, el sistema usa esta jerarquía:

```
1. Estado puntual (once) con franja horaria  ← máxima prioridad
2. Estado puntual (once) sin franja horaria
3. Estado semanal con franja horaria
4. Estado semanal sin franja horaria          ← menor prioridad
5. Estado por defecto (default_status)        ← si no hay regla activa y está configurado
6. Limpiar estado de Slack                    ← solo si no hay default_status
```

Dentro del mismo nivel de prioridad (1–4), gana la **primera regla que aparece** en el array del `config.json` (first-match). *(TODO: implementar un mecanismo de desempate más sofisticado si se detecta ambigüedad en la práctica.)*

---

### 1.5 Comportamiento del servicio

- La configuración se carga en memoria **al arrancar** y permanece en memoria durante toda la ejecución.
- En modo interactivo (`node scheduler/index.js`), muestra un **menú de consola** con tres opciones: `1) Open editor`, `2) Reload config`, `3) Quit`. En modo headless (PM2 u otro proceso sin TTY), el menú no aparece y el servicio corre silenciosamente.
- Para aplicar cambios en el `config.json` en modo interactivo, usar la opción `2) Reload config` del menú. En modo headless (PM2), usar `pm2 restart`.
- Evalúa qué estado corresponde **cada 15 minutos** (en los minutos `:00`, `:15`, `:30`, `:45`).
- Si el estado activo es el mismo que el anterior, no hace ninguna llamada a la API (para no saturar).
- Al cambiar de estado, llama a la API de Slack con el nuevo emoji, texto y tiempo de expiración calculado. Si el nuevo estado tiene `presence` o `dnd`, también llama a los endpoints correspondientes.
- Al desactivar un estado (porque empieza otro o porque ya no hay regla activa), si ese estado tenía `presence` o `dnd`, deshace los efectos secundarios (restaura presencia a `"auto"`, termina el snooze DND).
- Si no hay ninguna regla activa y `config.default_status` está definido, **aplica el estado por defecto** en lugar de limpiar.
- Si no hay ninguna regla activa y `config.default_status` no está definido, **limpia el estado** (lo deja vacío).
- Al arrancar por primera vez, aplica inmediatamente el estado que corresponda en ese momento.
- Registra en un log cada cambio de estado con hora y resultado.

---

### 1.6 Editor visual (HTML)

Interfaz de usuario para gestionar la programación sin tocar el JSON a mano.

**Sección de estado por defecto:**
- Toggle para activar/desactivar el estado por defecto
- Campo de emoji (formato `:code:`), campo de texto
- Selector de presencia y toggle de DND (igual que en las reglas)

**Sección de estados semanales:**
- Listado de reglas existentes
- Botón para añadir nueva regla
- Por cada regla: selector de días (píldoras clicables L/M/X/J/V/S/D), campo de emoji (formato `:code:`), campo de texto, toggle para activar franja horaria, campos de hora inicio/fin si se activa la franja (selector limitado a múltiplos de 15 minutos), selector de presencia, toggle de DND
- Botón para eliminar cada regla

**Sección de estados puntuales:**
- Listado de fechas con estado asignado
- Botón para añadir nueva fecha
- Por cada entrada: selector de fecha, campo de emoji (formato `:code:`), campo de texto, toggle para franja horaria, selector de presencia, toggle de DND
- Botón para eliminar cada entrada
- Indicador visual de si la fecha ya pasó (estado expirado)

**Panel de exportación:**
- Vista previa del JSON generado, actualizada en tiempo real
- Botón para copiar el JSON al portapapeles
- Botón para descargar el archivo `config.json`
- Botón para cargar un `config.json` existente

**Vista previa del día:**
- Selector de día/hora para simular qué estado estaría activo en ese momento
- Muestra el estado resultante con su emoji y texto
- No simula presencia ni DND (son efectos secundarios de transiciones, no estado en un momento puntual)

---

### 1.7 Estado por defecto (default_status)

Cuando el evaluador no encuentra ninguna regla activa (`evaluate()` devuelve `null`), en lugar de limpiar el estado de Slack se puede aplicar un **estado por defecto** definido en `config.default_status`.

**Campos del estado por defecto:**

| Campo | Obligatorio | Descripción |
|---|---|---|
| `emoji` | Sí | Emoji en formato de código Slack |
| `text` | Sí | Texto del estado |
| `presence` | No | `"away"` o `"auto"` — igual que en las reglas |
| `dnd` | No | `true` — igual que en las reglas |

El estado por defecto **no tiene** `id`, `from`, `to`, `days`, ni `date`. Internamente, el servicio usa el identificador sintético `"__default__"` para la comparación de deduplicación en memoria (evitar re-aplicarlo en cada tick si ya está activo).

Su `status_expiration` es siempre `0` (Slack no lo borra automáticamente; el servicio gestiona la transición al arrancar la siguiente regla programada).

---

### 1.8 Requisitos no funcionales

- La aplicación no requiere conexión a internet más allá de las llamadas a la API de Slack
- El editor HTML es un archivo estático que se abre en el navegador, sin servidor web propio
- La configuración se almacena en un único archivo `config.json` en disco
- La aplicación es **portable** (no depende del registro de Windows ni de binarios nativos de plataforma)

---

## Parte 2 — Implementación técnica

### 2.1 Estructura de archivos

```
slack-status-scheduler/
│
├── config.json           ← programación definida por el usuario
├── .env                  ← token de Slack (nunca se sube a git)
├── .gitignore
│
├── scheduler/
│   ├── index.js          ← servicio de consola: valida config, arranca el cron, menú interactivo
│   ├── evaluator.js      ← lógica de prioridad y selección de estado activo
│   ├── slack.js          ← wrapper de la API de Slack (status, presencia, DND)
│   └── logger.js         ← escritura de logs en archivo
│
├── editor/
│   └── index.html        ← editor visual, archivo estático autocontenido
│
└── logs/
    └── status.log        ← log de cambios (generado automáticamente)
```

---

### 2.2 Formato del archivo config.json

```json
{
  "timezone": "Europe/Madrid",
  "default_status": {
    "emoji": ":technologist:",
    "text": "Available",
    "presence": "auto"
  },
  "weekly": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "emoji": ":house:",
      "text": "WFH",
      "days": ["monday", "friday"],
      "presence": "auto"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "emoji": ":office:",
      "text": "In Office",
      "days": ["tuesday", "wednesday", "thursday"]
    },
    {
      "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "emoji": ":fork_and_knife:",
      "text": "Lunch Time",
      "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "from": "13:00",
      "to": "14:00",
      "dnd": true
    }
  ],
  "once": [
    {
      "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
      "emoji": ":beach_with_umbrella:",
      "text": "PTO",
      "date": "2026-05-15",
      "presence": "away",
      "dnd": true
    }
  ]
}
```

---

### 2.3 Dependencias Node.js

```json
{
  "dependencies": {
    "node-cron": "^3.0.0",
    "axios": "^1.6.0",
    "dotenv": "^16.0.0",
    "dayjs": "^1.11.0",
    "open": "^8.4.2"
  }
}
```

| Paquete | Uso |
|---|---|
| `node-cron` | Ejecutar la evaluación cada 15 minutos |
| `axios` | Llamadas HTTP a la API de Slack |
| `dotenv` | Cargar el token desde `.env` sin exponerlo |
| `dayjs` | Manejo de fechas, horas y zonas horarias (con plugins `utc` y `timezone`) |
| `open` | Abrir `editor/index.html` en el navegador predeterminado desde el menú de consola |

El editor HTML usa `crypto.randomUUID()` (nativo en navegadores modernos) para generar los GUIDs de los nuevos estados, sin necesidad de ninguna dependencia externa.

---

### 2.4 API de Slack utilizada

#### Endpoint existente — estado del perfil

```
POST https://slack.com/api/users.profile.set
```

Body:
```json
{
  "profile": {
    "status_text": "Lunch Time",
    "status_emoji": ":fork_and_knife:",
    "status_expiration": 1748786400
  }
}
```

Para limpiar el estado:
```json
{
  "profile": {
    "status_text": "",
    "status_emoji": "",
    "status_expiration": 0
  }
}
```

**Cálculo de `status_expiration`:**

| Caso | Valor |
|---|---|
| Estado con campo `to` | Unix timestamp (UTC) correspondiente a la hora `to` del día actual en la zona horaria configurada |
| Estado sin campo `to` (incluyendo `default_status`) | `0` (nunca expira; el servicio gestiona el cambio en el siguiente ciclo) |

#### Nuevo — presencia del usuario

```
POST https://slack.com/api/users.setPresence
```

Body:
```json
{ "presence": "away" }
```

Valores válidos: `"auto"` (Slack decide según actividad) o `"away"` (forzar ausente). No existe un valor "force online".

#### Nuevo — activar snooze DND

```
POST https://slack.com/api/dnd.setSnooze
```

Body:
```json
{ "num_minutes": 60 }
```

Slack requiere un mínimo de **20 minutos**. Si la duración calculada es inferior, se omite la llamada (se registra en el log).

#### Nuevo — terminar snooze DND

```
POST https://slack.com/api/dnd.endSnooze
```

Sin body.

#### Scopes de token requeridos

| Scope | Funcionalidad |
|---|---|
| `users.profile:write` | Cambiar emoji, texto y expiración del estado (existente) |
| `users:write` | **Nuevo** — llamar a `users.setPresence` |
| `dnd:write` | **Nuevo** — llamar a `dnd.setSnooze` y `dnd.endSnooze` |

Los tres scopes se añaden en la configuración de la app en api.slack.com y requieren reinstalar la app en el workspace para obtener un token actualizado.

**Token necesario:** User Token (`xoxp-...`). Se obtiene creando una app en api.slack.com, instalándola en el workspace con tu propia cuenta, y copiando el User OAuth Token. Se configura en `.env` como `SLACK_USER_TOKEN`.

---

### 2.5 Lógica del evaluador (evaluator.js)

Sin cambios respecto a v1. El evaluador devuelve la regla activa o `null`. No conoce `default_status` ni los campos `presence`/`dnd` — esa lógica reside en `index.js` y `slack.js`.

Pseudocódigo (sin cambios):

```
función floorTo15(horaHHMM):
  [h, m] = horaHHMM.split(":")
  m = floor(m / 15) * 15
  devolver h + ":" + m

función enFranja(horaActual, from, to):
  devolver horaActual >= from y horaActual < to

función evaluarEstado(ahora, config):
  fechaHoy    = ahora.formato("YYYY-MM-DD")
  diaHoy      = ahora.diaDeLaSemana()
  horaActual  = floorTo15(ahora.formato("HH:mm"))

  // 1. once con franja
  para cada regla en config.once:
    si regla.fecha == fechaHoy y regla.from y enFranja(horaActual, regla.from, regla.to):
      devolver regla

  // 2. once sin franja
  para cada regla en config.once:
    si regla.fecha == fechaHoy y no regla.from:
      devolver regla

  // 3. weekly con franja
  para cada regla en config.weekly:
    si diaHoy en regla.days y regla.from y enFranja(horaActual, regla.from, regla.to):
      devolver regla

  // 4. weekly sin franja
  para cada regla en config.weekly:
    si diaHoy en regla.days y no regla.from:
      devolver regla

  // 5. sin regla activa
  devolver null
```

---

### 2.6 Flujo del servicio de consola (index.js)

```
Al arrancar:
  1. Cargar .env → salir si SLACK_USER_TOKEN no está definido
  2. Leer config.json desde disco y mantenerlo en memoria → salir si falta o es JSON inválido
  3. Evaluar estado actual y aplicarlo inmediatamente (con lógica de presencia/DND/default)
  4. Guardar estado activo en memoria
  5. Si stdin es un TTY (modo interactivo): mostrar menú de consola

Cada 15 minutos (cron "0,15,30,45 * * * *"):
  1. Evaluar estado que corresponde ahora (usando la config en memoria)
  2. Resolver la regla efectiva: si evaluate() devuelve null y hay default_status, usar default_status
  3. Si la regla efectiva es distinta a la activa (comparada por id o "__default__"):
     a. Llamar a la API de Slack (setStatus o clearStatus)
     b. Actualizar estado en memoria
     c. Escribir entrada en el log
  4. Si es la misma: no hacer nada

Menú de consola (solo en modo interactivo / stdin TTY):
  1) Open editor   → abre editor/index.html en el navegador predeterminado
  2) Reload config → descarta la config en memoria, lee config.json desde disco,
                     evalúa y aplica el estado inmediatamente
  3) Quit          → termina el proceso
```

---

### 2.7 Ejecución

**Instalación:**
```bash
npm install
```

**Archivo .env:**
```
SLACK_USER_TOKEN=xoxp-tu-token-aqui
```

**Modo interactivo (desarrollo / uso directo):**
```bash
node scheduler/index.js
```

**Modo headless / segundo plano (PM2):**
```bash
pm2 start scheduler/index.js --name slack-scheduler
```

**Aplicar cambios de configuración:**
- Modo interactivo: opción `2) Reload config` en el menú de consola.
- Modo PM2: `pm2 restart slack-scheduler`.

---

### 2.8 Portabilidad

El servicio es **portable**: no depende del registro de Windows ni de binarios nativos de plataforma. Todas las dependencias son pure-JS o cross-platform.

Los módulos de lógica de negocio (`evaluator.js`, `slack.js`, `logger.js`) son completamente portables y pueden usarse directamente en Linux/macOS gestionando el arranque automático con `systemd` o `launchd`.

---

### 2.9 Editor HTML — funcionamiento técnico

El editor es un único archivo `index.html` autocontenido (HTML + CSS + JS inline) que:

- Se abre directamente en el navegador con `File > Open` o doble clic, sin necesitar servidor web
- Carga un `config.json` existente mediante un `<input type="file">`
- Gestiona el estado de la programación en memoria (JavaScript puro)
- Genera y actualiza el JSON en tiempo real según los cambios del usuario
- Permite descargar el `config.json` resultante con un botón (usando la API `Blob` + `URL.createObjectURL`)
- Genera GUIDs para nuevas entradas usando `crypto.randomUUID()` (nativo en navegadores modernos, sin dependencias externas)
- Los selectores de hora están limitados a múltiplos de 15 minutos
- No necesita ninguna dependencia externa ni conexión a internet

---

### 2.10 Comunicación editor ↔ servicio

La comunicación es indirecta a través del sistema de archivos:

```
Editor HTML                    Servicio de consola
────────────────────────────────────────────────────
Abre config.json    →  lee el archivo
Edita la config
Descarga config.json →  sobreescribe el archivo
                       ↓
                    El usuario elige "2) Reload config" en el menú de consola
                    (o pm2 restart en modo headless)
                    El servicio carga la nueva config en memoria
                    y aplica el estado actual
```

No hay API, no hay websocket, no hay comunicación directa. El archivo `config.json` es el contrato entre ambas partes.

---

### 2.11 Consideraciones de seguridad

- El token de Slack **nunca** se incluye en `config.json` ni en el editor HTML
- El archivo `.env` se añade a `.gitignore` desde el primer momento
- El editor HTML no tiene acceso al token en ningún momento (no lo necesita)
- Si se usa un repositorio git para sincronizar entre Windows y el servidor, el token se configura manualmente en cada máquina mediante el archivo `.env`

---

### 2.12 Lógica de presencia, DND y estado por defecto (slack.js + index.js)

#### Funciones nuevas en slack.js

```
setPresence(presence)
  POST users.setPresence con body { presence }
  Devuelve Promise; el llamador gestiona errores.

setDnd(minutes)
  POST dnd.setSnooze con body { num_minutes: minutes }
  Precondición: minutes >= 20 (el llamador debe verificar antes de llamar).
  Devuelve Promise.

endDnd()
  POST dnd.endSnooze sin body.
  Devuelve Promise.
```

#### Firma ampliada de setStatus y clearStatus

```
setStatus(rule, config, prevRule = null)
  1. POST users.profile.set (igual que v1)
  2. Si rule.presence está definido:
       llamar setPresence(rule.presence)
     Si no, pero prevRule.presence estaba definido:
       llamar setPresence("auto")   ← restaurar presencia
  3. Si rule.dnd es true:
       calcular minutes = minutesUntilTo(rule, config)
       si minutes >= 20: llamar setDnd(minutes)
       si no: registrar en log que se omite por duración insuficiente
     Si no, pero prevRule.dnd era true:
       llamar endDnd()

clearStatus(prevRule = null)
  1. POST users.profile.set con campos vacíos (igual que v1)
  2. Si prevRule.presence estaba definido:
       llamar setPresence("auto")
  3. Si prevRule.dnd era true:
       llamar endDnd()
```

Las llamadas a `setPresence`, `setDnd` y `endDnd` son **independientes** de la llamada principal al estado: un fallo en cualquiera de ellas se captura y registra por separado, sin impedir el resto de operaciones.

#### Cálculo de duración DND

```
minutesUntilTo(rule, config):
  si rule.to existe:
    toTimestamp = dayjs.tz(hoy + " " + rule.to, config.timezone).unix()
    return Math.floor((toTimestamp - Date.now() / 1000) / 60)
  si no:
    midnightTimestamp = dayjs.tz(hoy + " 23:59", config.timezone).add(1, "minute").unix()
    return Math.floor((midnightTimestamp - Date.now() / 1000) / 60)
```

Si el valor calculado es negativo (la hora `to` ya pasó en este tick — situación de arranque tardío), se omite la llamada a `setDnd` y se registra en el log.

#### Estado por defecto en index.js

```
función resolveRule(evaluatedRule, config):
  si evaluatedRule != null: devolver evaluatedRule
  si config.default_status existe:
    devolver { ...config.default_status, id: "__default__", status_expiration: 0 }
  devolver null
```

`applyRule` usa `resolveRule` para obtener la regla efectiva. La comparación de deduplicación sigue usando `id` (incluyendo `"__default__"`).

#### Tipos de log ampliados

| Acción | Cuándo |
|---|---|
| `SET` | Nuevo estado aplicado |
| `CLEAR` | Estado limpiado |
| `PRESENCE` | Llamada a `users.setPresence` (éxito o error) |
| `DND_START` | Snooze DND iniciado |
| `DND_END` | Snooze DND terminado |
| `DND_SKIP` | Snooze omitido por duración < 20 min |

---

### 2.13 Controles de presencia, DND y estado por defecto en el editor

#### Controles por regla (weekly y once)

Cada tarjeta de regla añade dos controles compactos a continuación de los campos existentes:

- **Selector de presencia** (`<select>`): opciones `— (sin cambio)`, `Away`, `Auto`. Almacenado como `"away"` / `"auto"` / omitido (sin propiedad en el JSON).
- **Toggle de DND** (checkbox): etiqueta "Snooze notificaciones". Almacenado como `true` / omitido.

Si el toggle DND está marcado en una regla con rango horario de menos de 20 minutos, se muestra un icono de advertencia informativo (no bloquea la exportación).

#### Sección de estado por defecto

Nueva sección "Estado por defecto" en la parte superior del editor (antes de "Weekly Rules"):

- Toggle para activar/desactivar el estado por defecto. Si está desactivado, `default_status` se omite del JSON.
- Cuando está activo: campo de emoji, campo de texto, selector de presencia, toggle de DND.
- La validación cubre estos campos: emoji y texto son obligatorios si la sección está activa.

---

## Decisiones no obvias

1. **`presence` omitido significa "no tocar"** — el servicio no llama a `users.setPresence` en transiciones donde ninguna de las dos reglas tiene `presence`. Solo restaura a `"auto"` si la regla anterior lo había modificado explícitamente.

2. **DND por duración calculada, no por timestamp** — `dnd.setSnooze` recibe `num_minutes`, no un timestamp. La duración se calcula en el momento de activación, por lo que un reinicio durante una regla activa recalcula correctamente el tiempo restante.

3. **Mínimo de 20 minutos para DND** — limitación de la API de Slack. Si la duración calculada es inferior (ej. regla de 15 min, o arranque tardío), se omite `setSnooze` silenciosamente y se registra `DND_SKIP` en el log.

4. **`endDnd` siempre en la transición de salida** — aunque el snooze de Slack podría haber expirado por sí solo, siempre se llama a `endDnd` cuando termina una regla DND. Esto garantiza consistencia en reinicios manuales y sobreescrituras de config.

5. **`default_status` usa id sintético `"__default__"`** — el estado por defecto no es una regla programada y no tiene GUID. El id sintético permite usar la misma lógica de deduplicación (comparación por `id`) que las reglas normales.

6. **`default_status` con `status_expiration: 0`** — nunca expira automáticamente. El servicio es quien gestiona la transición cuando una regla programada toma el relevo.

7. **`default_status` puede tener `presence` y `dnd`** — se comporta exactamente como una regla normal para estos efectos secundarios. Esto permite, por ejemplo, asegurar que la presencia vuelva a `"auto"` y las notificaciones estén activas cuando no hay ningún estado programado.

8. **El simulador del editor no muestra presencia ni DND** — son efectos de transición (se aplican al activar/desactivar una regla), no propiedades del estado en un instante dado. El simulador muestra solo el emoji y el texto resultante.

9. **No hay `from`/`to`, `days`, ni `date` en `default_status`** — estos campos no tienen sentido para un fallback. Si se incluyeran en el JSON, el servicio los ignoraría.

10. **Todas las nuevas llamadas API son fallos tolerados** — un error en `setPresence`, `setDnd` o `endDnd` se captura y registra individualmente. No cancela la llamada principal al estado del perfil ni el estado en memoria.
