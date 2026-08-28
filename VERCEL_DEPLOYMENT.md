# Despliegue en Vercel

## Arquitectura

- Vercel ejecuta Next.js, API Routes, webhooks y cron jobs.
- PostgreSQL/Prisma conserva usuarios, NextAuth, reservas, disponibilidad, equipos y suscripciones.
- Convex conserva datos reactivos del bot y eventos derivados.
- Stripe, Google Calendar, WhatsApp, Daily, AWS S3, Resend y el proveedor LLM permanecen externos.

## Requisitos

- Node.js 20 o superior.
- Un proyecto PostgreSQL accesible desde Vercel.
- Un proyecto Convex enlazado a producción.
- Una cuenta Vercel con el repositorio conectado.

## Configuración del proyecto Vercel

1. Importa el repositorio en Vercel.
2. Si el repositorio contiene el proyecto dentro de una subcarpeta, establece esa carpeta como `Root Directory`.
3. Usa Node.js 20 en `Settings > Environment Variables`/Project Settings, o conserva `.nvmrc` y `engines.node`.
4. Usa estos comandos:
   - Install: `npm install --legacy-peer-deps` (solo mientras exista el conflicto de peers actual).
   - Build: `npm run build`.
   - Output: el valor predeterminado de Next.js.
5. Configura las variables para `Production`, `Preview` y `Development` según corresponda.

## Variables requeridas en Vercel

### Base de datos y autenticación

- `DATABASE_URL`: URL de PostgreSQL de producción.
- `NEXTAUTH_SECRET`: secreto aleatorio largo.
- `NEXTAUTH_URL`: URL pública de la aplicación.
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: OAuth de Google.

Actualiza el callback de Google para incluir:

```text
https://TU_DOMINIO/api/auth/callback/google
```

### Convex

- `NEXT_PUBLIC_CONVEX_URL`: URL pública del deployment Convex de producción.
- `CONVEX_URL`: misma URL, usada por Vercel server-side.
- `CONVEX_INGEST_SECRET`: secreto compartido entre Vercel y Convex para publicar mensajes.
- `CONVEX_DEPLOY_KEY`: deploy key de producción. Con ella, el build de Vercel ejecuta `npx convex deploy` automáticamente y crea/actualiza las tablas y funciones en Convex en cada despliegue.

En Convex configura también `CONVEX_INGEST_SECRET` como variable del deployment. No uses el deployment local en producción.

Para generar la deploy key: dashboard de Convex → **Settings → Deploy Keys → Create deploy key** (elige el deployment de producción). Se muestra una sola vez; configúrala directamente en Vercel como `CONVEX_DEPLOY_KEY` y no la compartas en chats o logs.

### Pagos

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_TEAM`

Configura en Stripe:

```text
https://TU_DOMINIO/api/stripe/webhook
```

y, si se utiliza el endpoint alternativo:

```text
https://TU_DOMINIO/api/webhooks/stripe
```

### Integraciones externas

Añade solo las que se vayan a activar:

- `AWS_PROFILE`, `AWS_REGION`, `AWS_BUCKET_NAME`, `AWS_FOLDER_PREFIX`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- `ABACUSAI_API_KEY`.
- `RESEND_API_KEY`.
- `DAILY_API_KEY`.
- `CRON_SECRET`.

Las credenciales específicas de Evolution API/Twilio se almacenan actualmente por usuario en PostgreSQL y se administran desde el dashboard.

## Cron jobs

`vercel.json` configura:

| Endpoint | Frecuencia | Propósito |
|---|---:|---|
| `/api/cron/send-briefings` | cada 15 minutos | Generar y enviar briefings previos |
| `/api/cron/send-reminders` | cada hora | Enviar recordatorios aproximadamente 24 horas antes |
| `/api/cron/reset-usage` | primer día del mes a medianoche UTC | Reiniciar cuotas mensuales |

Vercel Cron envía el header `Authorization: Bearer <CRON_SECRET>` cuando `CRON_SECRET` está configurado. Las rutas validan ese header.

Recomendaciones:

- Configura `CRON_SECRET` en Production y Preview si se prueban cron jobs en Preview.
- Mantén los jobs idempotentes: Vercel puede reintentarlos.
- El código actual de recordatorios no tiene un campo persistente `reminderSent`; puede enviar duplicados si se ejecuta varias veces dentro de la ventana. Añade ese campo antes de activar recordatorios en producción.
- El cron de briefings ya comprueba la existencia y el estado del briefing, aunque el envío de correo debe considerarse reintentable.

## Convex: primera configuración

Desde el directorio del proyecto, usando Node 20:

```bash
npx convex login
npx convex dev
```

Para producción:

```bash
npx convex deploy
```

Convex generará `convex/_generated`. Esos archivos no se editan manualmente y están ignorados por Git. El deployment de producción debe tener las funciones de `convex/` publicadas antes de desplegar Vercel.

## Base de datos

Antes del primer despliegue:

```bash
npx prisma generate
npx prisma migrate deploy
```

`npm run build` ya ejecuta `prisma generate` automáticamente. Las migraciones deben ejecutarse como paso controlado contra la base de datos de producción, no en cada request de Vercel.

## Webhooks

Configura URLs públicas para:

- Evolution API: `/api/webhooks/evolution`.
- WhatsApp Evolution alternativo: `/api/whatsapp/webhook`.
- Twilio WhatsApp: `/api/integrations/twilio/webhook`.
- Stripe: `/api/stripe/webhook`.
- Daily: `/api/webhooks/daily`.

Verifica la firma/secreto de cada proveedor cuando el proveedor lo soporte. Los webhooks deben responder rápido y delegar trabajos largos a procesos reintentables.

## Verificación posterior al despliegue

1. Abre `/api/webhooks/evolution` y comprueba la respuesta GET.
2. Comprueba el acceso a `/auth/signin`.
3. Inicia sesión con Google en Preview antes de Production.
4. Crea una página de reservas y prueba una reserva real de prueba.
5. Envía un mensaje de WhatsApp de prueba.
6. Revisa que el mensaje exista en PostgreSQL y Convex.
7. Ejecuta manualmente cada endpoint cron desde una terminal autenticada:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://TU_DOMINIO/api/cron/send-briefings
curl -H "Authorization: Bearer $CRON_SECRET" https://TU_DOMINIO/api/cron/send-reminders
curl -H "Authorization: Bearer $CRON_SECRET" https://TU_DOMINIO/api/cron/reset-usage
```

8. Revisa Vercel Logs, Convex Logs y los logs de los proveedores externos.

## Seguridad y operación

- No incluyas `.env`, `.env.local`, tokens ni secretos en Git.
- Usa variables separadas para Preview y Production.
- Rota `CRON_SECRET` y `CONVEX_INGEST_SECRET` si aparecen en logs o tickets.
- Configura límites y alertas de gasto en Stripe, Convex, Vercel y el proveedor LLM.
- No uses credenciales de prueba en Production.
- Mantén PostgreSQL con backups y prueba restauraciones periódicamente.
- Antes de activar nuevos módulos Convex, define cuál sistema es la fuente de verdad.
