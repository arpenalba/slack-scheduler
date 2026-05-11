# Slack Status Scheduler
### Documento de diseño v1.2

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
5. Sin estado                                 ← se limpia el estado de Slack
```

Dentro del mismo nivel de prioridad, gana la **primera regla que aparece** en el array del `config.json` (first-match). *(TODO: implementar un mecanismo de desempate más sofisticado si se detecta ambigüedad en la práctica.)*

---

### 1.5 Comportamiento del servicio

- La configuración se carga en memoria **al arrancar** y permanece en memoria durante toda la ejecución.
- En modo interactivo (`node scheduler/index.js`), muestra un **menú de consola** con tres opciones: `1) Open editor`, `2) Reload config`, `3) Quit`. En modo headless (PM2 u otro proceso sin TTY), el menú no aparece y el servicio corre silenciosamente.
- Para aplicar cambios en el `config.json` en modo interactivo, usar la opción `2) Reload config` del menú. En modo headless (PM2), usar `pm2 restart`.
- Evalúa qué estado corresponde **cada 15 minutos** (en los minutos `:00`, `:15`, `:30`, `:45`).
- Si el estado activo es el mismo que el anterior, no hace ninguna llamada a la API (para no saturar).
- Al cambiar de estado, llama a la API de Slack con el nuevo emoji, texto y tiempo de expiración calculado.
- Si no hay ninguna regla activa, **limpia el estado** (lo deja vacío).
- Al arrancar por primera vez, aplica inmediatamente el estado que corresponda en ese momento.
- Registra en un log cada cambio de estado con hora y resultado.

---

### 1.6 Editor visual (HTML)

Interfaz de usuario para gestionar la programación sin tocar el JSON a mano.

**Sección de estados semanales:**
- Listado de reglas existentes
- Botón para añadir nueva regla
- Por cada regla: selector de días (píldoras clicables L/M/X/J/V/S/D), campo de emoji (formato `:code:`), campo de texto, toggle para activar franja horaria, campos de hora inicio/fin si se activa la franja (selector limitado a múltiplos de 15 minutos)
- Botón para eliminar cada regla

**Sección de estados puntuales:**
- Listado de fechas con estado asignado
- Botón para añadir nueva fecha
- Por cada entrada: selector de fecha, campo de emoji (formato `:code:`), campo de texto, toggle para franja horaria
- Botón para eliminar cada entrada
- Indicador visual de si la fecha ya pasó (estado expirado)

**Panel de exportación:**
- Vista previa del JSON generado, actualizada en tiempo real
- Botón para copiar el JSON al portapapeles
- Botón para descargar el archivo `config.json`
- Botón para cargar un `config.json` existente

> El editor también puede abrirse directamente desde el menú de consola del servicio (opción `1) Open editor`), que lo lanza en el navegador predeterminado.

**Vista previa del día:**
- Selector de día/hora para simular qué estado estaría activo en ese momento
- Muestra el estado resultante con su emoji y texto

---

### 1.7 Requisitos no funcionales

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
│   ├── slack.js          ← wrapper de la API de Slack
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
  "weekly": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "emoji": ":house:",
      "text": "WFH",
      "days": ["monday", "friday"]
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
      "to": "14:00"
    }
  ],
  "once": [
    {
      "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
      "emoji": ":beach_with_umbrella:",
      "text": "PTO",
      "date": "2026-05-15"
    },
    {
      "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
      "emoji": ":face_with_thermometer:",
      "text": "Sick Day",
      "date": "2026-05-20"
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

Solo se usa un endpoint:

```
POST https://slack.com/api/users.profile.set
```

Con el body:
```json
{
  "profile": {
    "status_text": "Lunch Time",
    "status_emoji": ":fork_and_knife:",
    "status_expiration": 1748786400
  }
}
```

**Cálculo de `status_expiration`:**

| Caso | Valor |
|---|---|
| Estado con campo `to` | Unix timestamp (UTC) correspondiente a la hora `to` del día actual en la zona horaria configurada |
| Estado sin campo `to` | `0` (nunca expira; el servicio gestiona el cambio en el siguiente ciclo) |

Para limpiar el estado (sin regla activa):
```json
{
  "profile": {
    "status_text": "",
    "status_emoji": "",
    "status_expiration": 0
  }
}
```

**Token necesario:** User Token (`xoxp-...`) con scope `users.profile:write`. Se obtiene creando una app en api.slack.com, instalándola en el workspace con tu propia cuenta, y copiando el User OAuth Token.

---

### 2.5 Lógica del evaluador (evaluator.js)

El evaluador recibe la fecha/hora actual y la configuración en memoria, y devuelve el estado que debe estar activo, respetando las reglas de prioridad definidas en el apartado 1.4.

**Comportamiento de las franjas horarias:**
- El límite `from` es **inclusivo**: a las 13:00 el estado ya está activo.
- El límite `to` es **exclusivo**: a las 14:00 el estado ya no está activo.
- No se soportan franjas que crucen la medianoche. *(TODO: evaluar soporte en el futuro si surge necesidad.)*

Pseudocódigo:

```
función floorTo15(horaHHMM):
  [h, m] = horaHHMM.split(":")
  m = floor(m / 15) * 15
  devolver h + ":" + m

función enFranja(horaActual, from, to):
  // from inclusivo, to exclusivo
  devolver horaActual >= from y horaActual < to

función evaluarEstado(ahora, config):

  fechaHoy    = ahora.formato("YYYY-MM-DD")
  diaHoy      = ahora.diaDeLaSemana()          // "monday", "tuesday"...
  horaActual  = floorTo15(ahora.formato("HH:mm"))

  // TODO: dentro de cada nivel, el desempate es first-match (primera regla en el array).
  //       Considerar mecanismo explícito de prioridad si surge ambigüedad.

  // 1. Buscar en once con franja horaria
  para cada regla en config.once:
    si regla.fecha == fechaHoy
    y regla.from existe
    y enFranja(horaActual, regla.from, regla.to):
      devolver regla

  // 2. Buscar en once sin franja horaria
  para cada regla en config.once:
    si regla.fecha == fechaHoy y regla.from no existe:
      devolver regla

  // 3. Buscar en weekly con franja horaria
  para cada regla en config.weekly:
    si diaHoy está en regla.days
    y regla.from existe
    y enFranja(horaActual, regla.from, regla.to):
      devolver regla

  // 4. Buscar en weekly sin franja horaria
  para cada regla en config.weekly:
    si diaHoy está en regla.days y regla.from no existe:
      devolver regla

  // 5. Sin estado activo
  devolver null
```

---

### 2.6 Flujo del servicio de consola (index.js)

```
Al arrancar:
  1. Cargar .env → salir si SLACK_USER_TOKEN no está definido
  2. Leer config.json desde disco y mantenerlo en memoria → salir si falta o es JSON inválido
  3. Evaluar estado actual y aplicarlo inmediatamente
  4. Guardar estado activo en memoria
  5. Si stdin es un TTY (modo interactivo): mostrar menú de consola

Cada 15 minutos (cron "0,15,30,45 * * * *"):
  1. Evaluar estado que corresponde ahora (usando la config en memoria)
  2. Si es distinto al estado en memoria (comparado por id):
     a. Llamar a la API de Slack
     b. Actualizar estado en memoria
     c. Escribir entrada en el log
  3. Si es el mismo: no hacer nada

Menú de consola (solo en modo interactivo / stdin TTY):
  1) Open editor   → abre editor/index.html en el navegador predeterminado
  2) Reload config → descarta la config en memoria, lee config.json desde disco,
                     evalúa y aplica el estado inmediatamente
  3) Quit          → termina el proceso
```

La configuración **no se relee automáticamente**. Para aplicar cambios en `config.json` en modo interactivo, usar la opción `2) Reload config`. En modo headless (PM2), usar `pm2 restart`. Esto evita lecturas de disco innecesarias y posibles lecturas de archivos parcialmente escritos.

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
El servicio aplica el estado actual y muestra el menú de consola. El proceso sigue corriendo hasta que el usuario elige `3) Quit`.

**Modo headless / segundo plano (PM2):**
```bash
pm2 start scheduler/index.js --name slack-scheduler
```
PM2 no conecta stdin a un TTY, por lo que el menú no aparece. El servicio corre silenciosamente en segundo plano.

**Aplicar cambios de configuración:**
- Modo interactivo: opción `2) Reload config` en el menú de consola.
- Modo PM2: `pm2 restart slack-scheduler`.

---

### 2.8 Portabilidad

El servicio (`index.js`) es **portable**: no depende del registro de Windows ni de binarios nativos de plataforma. Todas las dependencias son pure-JS o cross-platform.

Los módulos de lógica de negocio (`evaluator.js`, `slack.js`, `logger.js`) también son completamente portables y pueden usarse directamente en Linux/macOS gestionando el arranque automático con `systemd` o `launchd`.

---

### 2.9 Editor HTML — funcionamiento técnico

El editor es un único archivo `index.html` autocontenido (HTML + CSS + JS inline) que:

- Se abre directamente en el navegador con `File > Open` o doble clic, sin necesitar servidor web
- Carga un `config.json` existente mediante un `<input type="file">`
- Gestiona el estado de la programación en memoria (JavaScript puro)
- Genera y actualiza el JSON en tiempo real según los cambios del usuario
- Permite descargar el `config.json` resultante con un botón (usando la API `Blob` + `URL.createObjectURL`)
- El archivo descargado se coloca en la carpeta del proyecto, sustituyendo al anterior; a continuación el usuario elige `2) Reload config` en el menú de consola (o `pm2 restart` si corre con PM2) para aplicar los cambios
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
