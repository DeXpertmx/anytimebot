# Anytimebot — Public API v1

REST API para que plataformas externas sincronicen reservas con cuentas de Anytimebot.
La autenticación usa claves de API por usuario, creadas en **Dashboard → API**.

## Autenticación

Todas las peticiones requieren el header:

```
Authorization: Bearer atb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Las claves se muestran **una sola vez** al crearlas (solo se guarda el hash SHA-256)
y pueden revocarse en cualquier momento desde el dashboard.

## Rate limiting

Cada clave tiene un límite de **100 peticiones por minuto** (ventana deslizante,
configurable con la variable `API_RATE_LIMIT_PER_MIN`). Todas las respuestas
incluyen cabeceras estándar:

| Cabecera               | Significado                                    |
| ---------------------- | ---------------------------------------------- |
| `X-RateLimit-Limit`    | Límite por minuto de la clave                  |
| `X-RateLimit-Remaining`| Peticiones restantes en la ventana actual      |
| `Retry-After`          | Segundos hasta reintentar (solo en error 429)  |

Al superar el límite la API responde `429 rate_limited` sin consumir la petición.

## Endpoints

### `GET /api/v1/me`

Información de la cuenta asociada a la clave.

```json
{
  "success": true,
  "data": {
    "id": "cuid",
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "username": "juanperez",
    "plan": "BASIC",
    "timezone": "Europe/Madrid",
    "currency": "EUR",
    "country": "ES"
  }
}
```

### `GET /api/v1/event-types`

Lista los tipos de evento reservables — las plataformas externas eligen cuáles
sincronizar.

| Parámetro        | Descripción                          |
| ---------------- | ------------------------------------ |
| `booking_page_id` | Filtrar por página de reserva (opcional) |

```json
{
  "success": true,
  "data": [
    {
      "id": "cuid",
      "name": "Consulta 30 min",
      "duration_minutes": 30,
      "buffer_minutes": 5,
      "location": "video",
      "video_link": null,
      "color": "#6366f1",
      "requires_confirmation": false,
      "active": true,
      "payment": { "amount_cents": 2500, "currency": "eur", "interval": "ONE_TIME" },
      "booking_page": { "id": "cuid", "title": "Mi página", "slug": "juanperez", "public_url": "/juanperez" }
    }
  ]
}
```

`payment` es `null` si el evento es gratuito.

### `POST /api/v1/bookings`

Crea una reserva en la cuenta dueña de la clave — equivalente a lo que ocurre
con el formulario público: valida el campo obligatorio del formulario, bloquea
ausencias y huecos ocupados (409), sincroniza Google Calendar, envía email y
WhatsApp al invitado si queda confirmada, o avisa al anfitrión si requiere
confirmación manual.

```json
{
  "event_type_id": "cuid",
  "guest": {
    "name": "Ana García",
    "email": "ana@ejemplo.com",
    "phone": "+34600000000"
  },
  "start_time": "2026-09-10T09:00:00Z",
  "timezone": "Europe/Madrid",
  "form_data": { "motivo": "Primera consulta" }
}
```

| Campo          | Obligatorio | Notas                                             |
| -------------- | ----------- | ------------------------------------------------- |
| `event_type_id`| Sí          | Debe pertenecer a la cuenta de la clave (404 si no) |
| `guest.name`   | Sí          |                                                   |
| `guest.email`  | Sí          | Formato válido (400 si no)                         |
| `guest.phone`  | No          | Habilita la confirmación por WhatsApp              |
| `start_time`   | Sí          | ISO 8601; el fin se calcula con la duración del evento |
| `timezone`     | No          | Por defecto `UTC`                                  |
| `form_data`    | No          | Respuestas a campos personalizados obligatorios    |

Respuesta **201** con la reserva creada:

```json
{
  "success": true,
  "data": {
    "id": "cuid",
    "event_type_id": "cuid",
    "guest": { "name": "Ana García", "email": "ana@ejemplo.com", "phone": "+34600000000" },
    "start_time": "2026-09-10T09:00:00.000Z",
    "end_time": "2026-09-10T09:30:00.000Z",
    "timezone": "Europe/Madrid",
    "status": "CONFIRMED",
    "created_at": "2026-09-04T10:00:00.000Z"
  }
}
```

`status` es `PENDING` cuando el tipo de evento requiere confirmación del
anfitrión — la plataforma externa debe tratarlo como "pendiente de aprobación".

Errores específicos de este endpoint:

| Código | Causa                                                    |
| ------ | -------------------------------------------------------- |
| 400    | Campos ausentes/inválidos o formulario incompleto         |
| 404    | El tipo de evento no pertenece a la cuenta de la clave    |
| 409    | Hueco ocupado, anfitrión ausente o sin miembro de equipo  |

### `GET /api/v1/bookings`

Lista paginada de reservas para sincronización incremental.

| Parámetro       | Descripción                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `event_type_id` | Solo reservas de ese tipo de evento                                       |
| `status`        | Estados separados por coma: `PENDING,CONFIRMED,CANCELLED,COMPLETED,...`   |
| `from` / `to`   | Rango de `start_time` (ISO 8601)                                          |
| `updated_since` | Solo reservas modificadas desde esta fecha — para sync incremental        |
| `page`/`limit`  | Paginación (límite máx. 100)                                              |

```json
{
  "success": true,
  "data": [
    {
      "id": "cuid",
      "event_type": { "id": "cuid", "name": "Consulta 30 min", "location": "video", "video_link": null },
      "guest": { "name": "Ana", "email": "ana@ejemplo.com", "phone": "+34600000000" },
      "start_time": "2026-09-10T09:00:00.000Z",
      "end_time": "2026-09-10T09:30:00.000Z",
      "timezone": "Europe/Madrid",
      "status": "CONFIRMED",
      "form_data": { "motivo": "Primera consulta" },
      "notes": null,
      "payment": { "status": "PAID", "amount_cents": 2500, "currency": "eur" },
      "created_at": "2026-09-01T10:00:00.000Z",
      "updated_at": "2026-09-01T10:05:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1, "pages": 1 }
}
```

## Patrones de uso

**Sincronización incremental**: guarda el `updated_at` más reciente y pásalo como
`updated_since` en la siguiente petición para recibir solo los cambios.

**Selección de eventos**: llama a `/api/v1/event-types` y deja que el usuario de la
plataforma externa marque qué tipos de evento quiere sincronizar; luego consulta
`/api/v1/bookings?event_type_id=...` por cada uno.

## Errores

| Código | Significado                          |
| ------ | ------------------------------------ |
| 401    | Clave ausente, inválida o revocada   |
| 400    | Fecha o parámetro inválido           |
| 404    | Recurso no encontrado                |

## Webhooks de salida

Además del sondeo con `GET /bookings`, Anytimebot puede **notificarte en tiempo
real** cuando una reserva se crea o cambia de estado. Configura los endpoints en
**Dashboard → API → Webhooks de salida** (máx. 5 por cuenta).

### Eventos

| Evento                | Se dispara cuando...                              |
| --------------------- | -------------------------------------------------- |
| `booking.created`     | Se crea una reserva (público o vía API)             |
| `booking.confirmed`   | El anfitrión confirma una reserva pendiente         |
| `booking.cancelled`   | La reserva se cancela (invitado o anfitrión)        |
| `booking.completed`   | El anfitrión marca la cita como finalizada          |
| `booking.rescheduled` | La reserva se mueve a otra franja horaria           |

### Formato de la petición

Cada evento llega como `POST` JSON a tu URL con estas cabeceras:

| Cabecera                     | Valor                                              |
| ---------------------------- | -------------------------------------------------- |
| `X-Anytimebot-Event`         | Tipo de evento, p. ej. `booking.confirmed`          |
| `X-Anytimebot-Signature`     | `sha256=<hmac-sha256 del cuerpo con tu secreto>`    |
| `X-Anytimebot-Delivery-Id`   | Identificador único de la entrega (para idempotencia) |
| `User-Agent`                 | `Anytimebot-Webhooks/1.0`                           |

```json
{
  "event": "booking.cancelled",
  "created_at": "2026-09-04T12:00:00.000Z",
  "data": {
    "id": "cuid",
    "event_type": { "id": "cuid", "name": "Consulta 30 min", "duration_minutes": 30, "location": "video", "video_link": null },
    "booking_page": { "id": "cuid", "title": "Mi página", "slug": "juanperez" },
    "guest": { "name": "Ana García", "email": "ana@ejemplo.com", "phone": "+34600000000" },
    "start_time": "2026-09-10T09:00:00.000Z",
    "end_time": "2026-09-10T09:30:00.000Z",
    "timezone": "Europe/Madrid",
    "status": "CANCELLED",
    "payment": null
  }
}
```

`status` en `data` refleja el estado **después** del cambio. `payment` sigue el
mismo formato que en `GET /bookings` (`null` si el evento es gratuito).

### Verificación de firma (obligatoria)

El secreto se muestra **una sola vez** al crear el webhook. Verifica siempre la
firma antes de procesar el evento:

**Node.js**

```javascript
import crypto from 'crypto';

export function verifyWebhook(req, rawBody) {
  const header = req.headers['x-anytimebot-signature'];
  const expected =
    'sha256=' + crypto.createHmac('sha256', process.env.ANYTIMEBOT_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
```

**Python**

```python
import hmac, hashlib

def verify_webhook(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

> El HMAC se calcula sobre el **cuerpo crudo** (raw bytes), no sobre el JSON
> reparseado. Cualquier endpoint que reciba el webhook debe exponer el cuerpo
> sin transformar (p. ej. `req.text()` / `request.body` sin parsear).

### Reintentos

- Tu endpoint debe responder **2xx** en menos de 10 segundos. Cualquier otra
  respuesta (o timeout) cuenta como fallo.
- Reintentamos con backoff exponencial: **1, 2, 4, 8 minutos** (máx. 5 intentos).
- Si 2 entregas llegan por reintento, usa `X-Anytimebot-Delivery-Id` como clave
  de idempotencia.
- Si un endpoint acumula fallos, puedes pausarlo desde el dashboard y las
  entregas dejarán de intentarse.

### Responder rápido

Procesa el evento **después** de responder: encola el payload y devuelve `200`
inmediatamente. Si tu procesamiento tarda más de 10s, marcaremos la entrega
como fallida y la reintentaremos (recibirás el evento duplicado).
