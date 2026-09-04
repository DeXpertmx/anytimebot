# Anytimebot — Guía de onboarding para integraciones (API v1)

Esta guía lleva a una plataforma externa de cero a sincronizando reservas con
Anytimebot en menos de 15 minutos. Incluye ejemplos completos y ejecutables en
**Python** y **Node.js**.

> Referencia completa de endpoints: [`docs/PUBLIC_API.md`](./PUBLIC_API.md)

---

## Qué podrás hacer

| Capacidad | Endpoint / mecanismo |
|---|---|
| Verificar la cuenta asociada a tu clave | `GET /api/v1/me` |
| Descubrir tipos de evento y elegir cuáles sincronizar | `GET /api/v1/event-types` |
| Crear reservas desde tu plataforma | `POST /api/v1/bookings` |
| Leer reservas con filtros y sync incremental | `GET /api/v1/bookings` |
| **Recibir cambios de estado en tiempo real** | **Webhooks de salida** |

---

## Paso 0 — Requisitos previos

- Una cuenta activa en [anytimebot.app](https://anytimebot.app).
- Python 3.8+ con `requests` (`pip install requests`) **o** Node.js 18+
  (usa `fetch` nativo, sin dependencias).

## Paso 1 — Crear tu clave de API

1. Entra a **Dashboard → API** en anytimebot.app.
2. Pulsa **Crear clave** y dale un nombre descriptivo (p. ej. `integracion-mi-crm`).
3. **Copia la clave en ese momento**: se muestra una sola vez y después solo
   verás su prefijo (`atb_72b8c46…`).

> 🔐 **Buenas prácticas con la clave**
> - Guárdala en una variable de entorno, nunca en el código:
>   ```bash
>   export ANYTIMEBOT_API_KEY="atb_tu_clave_completa"
>   ```
> - Crea **una clave por integración** para poder auditar y revocar cada una por separado.
> - Si una clave se filtra, revócala desde el dashboard: el corte de acceso es inmediato.

Todas las peticiones usan el header:

```
Authorization: Bearer atb_tu_clave_completa
```

---

## Paso 2 — Verificar la conexión

Lo primero: confirmar que la clave funciona y conocer la cuenta (plan, zona
horaria, moneda).

**Python**

```python
import os, requests

BASE_URL = "https://anytimebot.app"
API_KEY = os.environ["ANYTIMEBOT_API_KEY"]

resp = requests.get(
    f"{BASE_URL}/api/v1/me",
    headers={"Authorization": f"Bearer {API_KEY}"},
    timeout=15,
)
resp.raise_for_status()
me = resp.json()["data"]
print(f"Conectado a la cuenta de {me['name']} ({me['plan']}) — tz: {me['timezone']}")
```

**Node.js**

```javascript
const BASE_URL = "https://anytimebot.app";
const API_KEY = process.env.ANYTIMEBOT_API_KEY;

const resp = await fetch(`${BASE_URL}/api/v1/me`, {
  headers: { Authorization: `Bearer ${API_KEY}` },
});
if (!resp.ok) throw new Error(`Auth falló: ${resp.status}`);
const me = (await resp.json()).data;
console.log(`Conectado a la cuenta de ${me.name} (${me.plan}) — tz: ${me.timezone}`);
```

Si recibes `401 unauthorized`: la clave está mal copiada, incompleta o revocada.

---

## Paso 3 — Descubrir los tipos de evento (el usuario elige qué sincronizar)

Cada cuenta organiza sus servicios como *tipos de evento* dentro de *páginas de
reserva*. Tu plataforma debe mostrar este catálogo y dejar que el usuario marque
cuáles quiere sincronizar. Guarda los `id` de los elegidos.

**Python**

```python
resp = requests.get(
    f"{BASE_URL}/api/v1/event-types",
    headers={"Authorization": f"Bearer {API_KEY}"},
    timeout=15,
)
event_types = resp.json()["data"]

for et in event_types:
    pago = (
        f" — {et['payment']['amount_cents'] / 100:.2f} {et['payment']['currency'].upper()}"
        if et["payment"] else ""
    )
    confirm = " (requiere confirmación)" if et["requires_confirmation"] else ""
    print(f"[{et['id']}] {et['name']} — {et['duration_minutes']} min{pago}{confirm}")
```

**Node.js**

```javascript
const { data: eventTypes } = await (
  await fetch(`${BASE_URL}/api/v1/event-types`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
).json();

for (const et of eventTypes) {
  const pago = et.payment
    ? ` — ${(et.payment.amount_cents / 100).toFixed(2)} ${et.payment.currency.toUpperCase()}`
    : "";
  const confirm = et.requires_confirmation ? " (requiere confirmación)" : "";
  console.log(`[${et.id}] ${et.name} — ${et.duration_minutes} min${pago}${confirm}`);
}
```

Campos útiles de cada tipo de evento:

| Campo | Uso en tu plataforma |
|---|---|
| `id` | Identificador para `POST /bookings` y filtros de sync |
| `duration_minutes` | Duración del bloque en tu calendario |
| `requires_confirmation` | Si `true`, las reservas nacen `PENDING` hasta que el anfitrión apruebe |
| `payment` | Precio en céntimos y moneda (`null` si es gratuito) |
| `booking_page.public_url` | Enlace para "reservar en Anytimebot" |
| `active` | Los inactivos no aceptan reservas nuevas |

---

## Paso 4 — Crear una reserva

El `POST` recorre exactamente el mismo pipeline que la página pública: valida el
formulario, comprueba disponibilidad (409 si el hueco está ocupado o el anfitrión
ausente), registra el consentimiento RGPD, crea el evento en Google Calendar del
anfitrión y envía email/WhatsApp al invitado.

**Python**

```python
from datetime import datetime, timedelta, timezone

reserva = {
    "event_type_id": "cuid_del_tipo_de_evento",
    "guest": {
        "name": "Ana García",
        "email": "ana@ejemplo.com",
        "phone": "+34600000000",  # opcional — habilita confirmación por WhatsApp
    },
    "start_time": "2026-09-10T09:00:00Z",  # ISO 8601 (UTC o con offset)
    "timezone": "Europe/Madrid",
    "form_data": {"motivo": "Primera consulta"},  # campos obligatorios del evento
}

resp = requests.post(
    f"{BASE_URL}/api/v1/bookings",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json=reserva,
    timeout=30,
)

if resp.status_code == 201:
    booking = resp.json()["data"]
    print(f"Reserva {booking['id']} creada: {booking['status']} "
          f"({booking['start_time']} → {booking['end_time']})")
elif resp.status_code == 409:
    print("Hueco no disponible — ofrecer otro horario al usuario")
else:
    print(f"Error {resp.status_code}: {resp.json()}")
```

**Node.js**

```javascript
const reserva = {
  event_type_id: "cuid_del_tipo_de_evento",
  guest: {
    name: "Ana García",
    email: "ana@ejemplo.com",
    phone: "+34600000000", // opcional — habilita confirmación por WhatsApp
  },
  start_time: "2026-09-10T09:00:00Z", // ISO 8601 (UTC o con offset)
  timezone: "Europe/Madrid",
  form_data: { motivo: "Primera consulta" }, // campos obligatorios del evento
};

const resp = await fetch(`${BASE_URL}/api/v1/bookings`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(reserva),
});

if (resp.status === 201) {
  const booking = (await resp.json()).data;
  console.log(`Reserva ${booking.id} creada: ${booking.status} (${booking.start_time})`);
} else if (resp.status === 409) {
  console.log("Hueco no disponible — ofrecer otro horario al usuario");
} else {
  console.error(`Error ${resp.status}:`, await resp.json());
}
```

### Interpretar la respuesta

- `status: "CONFIRMED"` — la reserva queda firme y el invitado ya recibió
  confirmación por email (y WhatsApp, si hay teléfono).
- `status: "PENDING"` — el tipo de evento requiere aprobación del anfitrión.
  Trátalo como *pendiente de aprobación* y sincroniza el cambio de estado más
  tarde (ver Paso 5).

### Errores del POST

| Código | Causa | Qué hacer |
|---|---|---|
| 400 | Falta un campo obligatorio, email inválido o formulario incompleto | Validar antes de enviar; el cuerpo detalla el campo |
| 404 | El tipo de evento no pertenece a esta cuenta | Refrescar el catálogo de event-types |
| 409 | Hueco ocupado, anfitrión ausente o sin miembro de equipo | Ofrecer otro horario |

---

## Paso 5 — Sincronización incremental (el patrón recomendado)

Para mantener tu plataforma al día (nuevas reservas, confirmaciones,
cancelaciones, notas…) **no consultes todo cada vez**: usa `updated_since`.

1. Guarda el `updated_at` más reciente que hayas visto.
2. En la siguiente sincronización, pide solo lo modificado desde esa fecha.
3. Aplica los cambios por `id` (upsert) y guarda el nuevo `updated_at` máximo.

**Python — sincronizador incremental**

```python
from datetime import datetime, timezone

def sincronizar(since: str | None) -> str | None:
    """Devuelve el nuevo cursor (updated_at más reciente)."""
    params = {"limit": 100, "page": 1}
    if since:
        params["updated_since"] = since

    cursor = since
    while True:
        resp = requests.get(
            f"{BASE_URL}/api/v1/bookings",
            headers={"Authorization": f"Bearer {API_KEY}"},
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()

        for b in body["data"]:
            upsert_en_tu_bd(b)  # tu lógica: crear/actualizar por b["id"]
            if not cursor or b["updated_at"] > cursor:
                cursor = b["updated_at"]

        pag = body["pagination"]
        if pag["page"] >= pag["pages"]:
            return cursor
        params["page"] += 1

# Primera ejecución: traes todo. Después, guarda el cursor devuelto.
nuevo_cursor = sincronizar(None)
print(f"Próximo sync desde: {nuevo_cursor}")
```

**Node.js — sincronizador incremental**

```javascript
async function sincronizar(since) {
  let cursor = since;
  let page = 1;

  while (true) {
    const url = new URL(`${BASE_URL}/api/v1/bookings`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));
    if (since) url.searchParams.set("updated_since", since);

    const body = await (
      await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } })
    ).json();

    for (const b of body.data) {
      await upsertEnTuBD(b); // tu lógica: crear/actualizar por b.id
      if (!cursor || b.updated_at > cursor) cursor = b.updated_at;
    }

    if (page >= body.pagination.pages) return cursor;
    page += 1;
  }
}

// Ejecuta en un cron (p. ej. cada 5 minutos) y persiste el cursor:
// const nuevoCursor = await sincronizar(cursorGuardado);
```

Filtros adicionales que puedes combinar:

| Parámetro | Ejemplo |
|---|---|
| `event_type_id` | Solo los eventos que el usuario marcó para sincronizar |
| `status` | `PENDING,CONFIRMED` — ignora cancelados/completados si no te interesan |
| `from` / `to` | Ventana de fechas de la cita |

---

## Paso 6 — Manejar el rate limiting (obligatorio en producción)

Cada clave tiene **100 peticiones/minuto**. Toda respuesta incluye:

| Cabecera | Significado |
|---|---|
| `X-RateLimit-Limit` | Límite por minuto de tu clave |
| `X-RateLimit-Remaining` | Peticiones restantes en la ventana actual |
| `Retry-After` | Segundos que esperar (solo cuando recibes `429`) |

Al superar el límite la API responde `429 rate_limited` **sin contar** esa
petición. Implementa reintento con espera — y en general, un pequeño backoff
para errores 5xx:

**Python — cliente con reintento**

```python
import time

def api_call(method: str, path: str, **kwargs) -> dict:
    """Llama a la API reintentando en 429/5xx según Retry-After."""
    for intento in range(5):
        resp = requests.request(
            method,
            f"{BASE_URL}{path}",
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=30,
            **kwargs,
        )
        if resp.status_code == 429:
            espera = int(resp.headers.get("Retry-After", "2")) + 1
            time.sleep(espera)
            continue
        if resp.status_code >= 500:
            time.sleep(2 ** intento)  # backoff exponencial: 1, 2, 4, 8…
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError("Reintentos agotados")

# Uso:
me = api_call("GET", "/api/v1/me")
```

**Node.js — cliente con reintento**

```javascript
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiCall(method, path, body) {
  for (let intento = 0; intento < 5; intento++) {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (resp.status === 429) {
      const espera = (Number(resp.headers.get("Retry-After")) || 2) + 1;
      await sleep(espera * 1000);
      continue;
    }
    if (resp.status >= 500) {
      await sleep(2 ** intento * 1000); // backoff exponencial: 1, 2, 4, 8…
      continue;
    }
    if (!resp.ok) throw new Error(`${resp.status}: ${JSON.stringify(await resp.json())}`);
    return resp.json();
  }
  throw new Error("Reintentos agotados");
}

// Uso:
const me = await apiCall("GET", "/api/v1/me");
```

> 💡 Si esperas alto volumen (p. ej. sincronizar cada minuto para muchos
> usuarios), espacia las llamadas: con 100 req/min basta para el patrón
> recomendado de *una* petición de sync por ciclo.

---

## Paso 7 — Webhooks de salida (notificaciones en tiempo real)

El sondeo con `updated_since` es el patrón básico, pero si quieres reaccionar al
instante (mostrar la reserva en tu CRM en cuanto ocurre), configura **webhooks
de salida** en **Dashboard → API → Webhooks de salida**.

Anytimebot enviará un `POST` JSON a tu URL cada vez que una reserva se cree,
confirme, cancele, finalice o reprograme. La petición incluye:

- `X-Anytimebot-Event` — tipo de evento (`booking.created`, `booking.cancelled`, …)
- `X-Anytimebot-Signature` — firma `sha256=<hmac>` del cuerpo con tu secreto
- `X-Anytimebot-Delivery-Id` — id único para deduplicar reintentos

Puedes suscribirte a todos los eventos o solo a los que te interesen.

**Python — receptor (FastAPI)**

```python
import hmac, hashlib
from fastapi import FastAPI, Request, Response

app = FastAPI()
WEBHOOK_SECRET = os.environ["ANYTIMEBOT_WEBHOOK_SECRET"]

@app.post("/webhooks/anytimebot")
async def anytimebot_webhook(request: Request):
    raw = await request.body()  # cuerpo CRUDO: verificar la firma antes de parsear
    signature = request.headers.get("x-anytimebot-signature", "")
    expected = "sha256=" + hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return Response(status_code=401)

    payload = json.loads(raw)
    event = payload["event"]        # p. ej. "booking.cancelled"
    booking = payload["data"]       # estado DESPUÉS del cambio

    if event == "booking.created":
        crear_en_mi_crm(booking)
    elif event == "booking.cancelled":
        liberar_hueco_en_mi_crm(booking["id"])
    elif event == "booking.rescheduled":
        mover_en_mi_crm(booking["id"], booking["start_time"])

    return Response(status_code=200)  # responder rápido, procesar después si es pesado
```

**Node.js — receptor (Express)**

```javascript
import crypto from 'crypto';
import express from 'express';

const app = express();
const WEBHOOK_SECRET = process.env.ANYTIMEBOT_WEBHOOK_SECRET;

// Importante: capturar el cuerpo CRUDO para verificar el HMAC
app.post('/webhooks/anytimebot', express.raw({ type: 'application/json' }), (req, res) => {
  const expected =
    'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(req.body).digest('hex');
  const received = req.headers['x-anytimebot-signature'] || '';
  if (received.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return res.status(401).end();
  }

  const { event, data } = JSON.parse(req.body.toString());
  switch (event) {
    case 'booking.created':
      crearEnMiCRM(data);          // data.status puede ser CONFIRMED o PENDING
      break;
    case 'booking.confirmed':
      confirmarEnMiCRM(data.id);
      break;
    case 'booking.cancelled':
      liberarHuecoEnMiCRM(data.id);
      break;
    case 'booking.rescheduled':
      moverEnMiCRM(data.id, data.start_time);
      break;
    case 'booking.completed':
      archivarEnMiCRM(data.id);
      break;
  }

  res.status(200).end(); // responde en <10s; procesa lo pesado en una cola
});
```

Reglas de oro:

- Responde **2xx en menos de 10 segundos**; si tu procesamiento es pesado,
  encola el evento y respóndelo inmediatamente.
- Los reintentos llegan con backoff (1, 2, 4, 8 min, máx. 5 intentos): deduplica
  con `X-Anytimebot-Delivery-Id`.
- El webhook **complementa** el sondeo, no lo sustituye: si tu receptor cae,
  el sync incremental del Paso 5 te permite recuperar lo perdido.

---

## Scripts completos listos para ejecutar

Copian la clave desde la variable de entorno `ANYTIMEBOT_API_KEY` y ejecutan el
flujo completo: verificar cuenta → listar eventos → crear reserva de prueba →
primera sincronización.

**Python — `onboarding.py`**

```python
#!/usr/bin/env python3
"""Onboarding Anytimebot: flujo completo de integración."""
import os
import requests

BASE_URL = "https://anytimebot.app"
API_KEY = os.environ["ANYTIMEBOT_API_KEY"]
H = {"Authorization": f"Bearer {API_KEY}"}


def main():
    # 1. Verificar conexión
    me = requests.get(f"{BASE_URL}/api/v1/me", headers=H, timeout=15).json()["data"]
    print(f"✅ Conectado: {me['name']} ({me['email']}) — plan {me['plan']}")

    # 2. Catálogo de eventos
    eventos = requests.get(f"{BASE_URL}/api/v1/event-types", headers=H, timeout=15).json()["data"]
    print(f"✅ {len(eventos)} tipos de evento disponibles:")
    for et in eventos:
        print(f"   [{et['id']}] {et['name']} ({et['duration_minutes']} min)")
    if not eventos:
        print("   Crea un tipo de evento en el dashboard y vuelve a ejecutar.")
        return

    # 3. Primera sincronización (lee todas las reservas existentes)
    reservas = requests.get(
        f"{BASE_URL}/api/v1/bookings",
        headers=H,
        params={"limit": 100},
        timeout=30,
    ).json()
    print(f"✅ {reservas['pagination']['total']} reservas encontradas en la cuenta")

    # 4. (Opcional) Crear una reserva de prueba en el primer evento, 3 días antes
    # et = eventos[0]
    # inicio = "2026-09-15T09:00:00Z"
    # r = requests.post(f"{BASE_URL}/api/v1/bookings", headers=H, timeout=30, json={
    #     "event_type_id": et["id"],
    #     "guest": {"name": "Prueba Integración", "email": "prueba@ejemplo.com"},
    #     "start_time": inicio,
    #     "timezone": me["timezone"],
    # })
    # print("Reserva de prueba:", r.status_code, r.json())


if __name__ == "__main__":
    main()
```

**Node.js — `onboarding.mjs`**

```javascript
#!/usr/bin/env node
// Onboarding Anytimebot: flujo completo de integración.
const BASE_URL = "https://anytimebot.app";
const API_KEY = process.env.ANYTIMEBOT_API_KEY;
const H = { Authorization: `Bearer ${API_KEY}` };

const get = async (path) => (await fetch(`${BASE_URL}${path}`, { headers: H })).json();

async function main() {
  // 1. Verificar conexión
  const me = (await get("/api/v1/me")).data;
  console.log(`✅ Conectado: ${me.name} (${me.email}) — plan ${me.plan}`);

  // 2. Catálogo de eventos
  const eventos = (await get("/api/v1/event-types")).data;
  console.log(`✅ ${eventos.length} tipos de evento disponibles:`);
  for (const et of eventos) console.log(`   [${et.id}] ${et.name} (${et.duration_minutes} min)`);
  if (eventos.length === 0) {
    console.log("   Crea un tipo de evento en el dashboard y vuelve a ejecutar.");
    return;
  }

  // 3. Primera sincronización (lee todas las reservas existentes)
  const reservas = await get("/api/v1/bookings?limit=100");
  console.log(`✅ ${reservas.pagination.total} reservas encontradas en la cuenta`);

  // 4. (Opcional) Crear una reserva de prueba en el primer evento:
  // const resp = await fetch(`${BASE_URL}/api/v1/bookings`, {
  //   method: "POST",
  //   headers: { ...H, "Content-Type": "application/json" },
  //   body: JSON.stringify({
  //     event_type_id: eventos[0].id,
  //     guest: { name: "Prueba Integración", email: "prueba@ejemplo.com" },
  //     start_time: "2026-09-15T09:00:00Z",
  //     timezone: me.timezone,
  //   }),
  // });
  // console.log("Reserva de prueba:", resp.status, await resp.json());
}

main();
```

Ejecución:

```bash
export ANYTIMEBOT_API_KEY="atb_tu_clave"
python3 onboarding.py     # o: node onboarding.mjs
```

---

## Checklist de puesta en marcha

- [ ] Clave creada en **Dashboard → API** y guardada como variable de entorno
- [ ] `GET /api/v1/me` responde 200 con los datos de la cuenta
- [ ] El usuario seleccionó los tipos de evento a sincronizar (guardaste sus `id`)
- [ ] El `POST /api/v1/bookings` gestiona 201/400/404/409 correctamente
- [ ] El `PENDING` se trata como "pendiente de aprobación del anfitrión"
- [ ] Sincronización incremental con `updated_since` + cursor persistido
- [ ] Reintentos para `429` (con `Retry-After`) y `5xx` (backoff exponencial)
- [ ] La clave nunca viaja en el código, logs ni URLs

## Recomendaciones finales

1. **Una clave por integración/cliente**: permite revocar de forma quirúrgica y
   auditar el consumo por clave (`requestCount` y `lastUsedAt` en el dashboard).
2. **Sincroniza cada 5–15 minutos** con `updated_since`; no necesitas más
   frecuencia y así nunca rozarás el rate limit.
3. **Muestra siempre el enlace de reserva** (`booking_page.public_url`) como
   alternativa para que el invitado gestione su cita.
4. Ante un `409`, consulta de nuevo el catálogo y ofrece otro hueco: la
   disponibilidad la gobierna siempre el anfitrión en Anytimebot.
