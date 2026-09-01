# Stripe — Activación del modo Producción (live)

> Estado verificado: **2026-09-01** — price IDs live comprobados contra la API en vivo.
> Modo activo actual: **test** (todo el tráfico de pagos sigue en modo prueba hasta que completes el checklist).

---

## Cómo funciona el modo dual (recordatorio)

El sistema guarda en la tabla `SystemSetting` (clave `stripe.mode`) si se opera en **test** o **live**.
El selector está en `/admin/settings` → **Stripe Mode** y no requiere redeploys ni variables de entorno.

- **Credenciales de test** — guardadas en la base vía el panel admin (con prioridad sobre env).
- **Credenciales live** — actualmente viven en **variables de entorno de Vercel**:
  `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM` (las variantes legacy sin sufijo se usan como live fallback;
  las variantes `_LIVE` también son válidas si prefieres separarlas).
  > Estas variables están **marcadas como sensibles** en Vercel: `vercel env pull` las devuelve como
  > `[SENSITIVE]` a propósito. Eso es correcto y esperado — no significa que falten.

---

## ✅ Estado verificado (no requiere acción)

Comprobado contra la API de Stripe desde el runtime de producción:

| Item | Live (producción) |
|---|---|
| Secret key | válida (retrieval del balance OK) |
| Publishable key | `pk_live_…` configurada |
| Webhook secret | configurado |
| Price PRO | `price_1UAc…cXo` — **19,00 €/mes**, activo, "Anytimebot Pro", livemode |
| Price TEAM | `price_1UAc…ioi` — **39,00 €/mes**, activo, "Anytimebot Team", livemode |

Los precios **coinciden con la oferta comercial** (Básico 29 € único vía checkout con `metadata.plan=BASIC`;
Pro 19 €/mes; Equipo 39 €/mes). **No hay que crear nada en Stripe ni cambiar price IDs.**

---

## 📋 Checklist de activación del modo live

### 1. Configurar el webhook live en Stripe (una sola vez)

En el Dashboard de Stripe (modo **Live** → Developers → Webhooks → Add endpoint):

```
https://anytimebot.app/api/stripe/webhook
```

Eventos que debe suscribir (idénticos a los de test):

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `charge.refunded`

Copia el **signing secret** (`whsec_live_…`) del endpoint. El sistema distingue test/live solo por la
firma (`whsec`), así que **no hace falta una URL distinta**: la misma URL sirve para ambos modos.

> ⚠️ El Básico de fundadores (29 €) es un **pago único** (one-time) que se activa con
> `checkout.session.completed` + `metadata.plan=BASIC`. Pro/Equipo son suscripciones mensuales
> (`customer.subscription.*`). Verifica que los 6 eventos estén activos; en el primer despliegue de
> pruebas faltaba `checkout.session.completed` y los planes no se activaban.

### 2. Comprobar las credenciales live en el panel admin

Entra en `/admin/settings` → **Stripe Mode** → apartado **Production (live)**:

- Debe mostrar los campos en verde / "SET" (secret, publishable, webhook secret, price PRO, price TEAM).
- Si prefieres gestionarlas desde la base (como en test), pulsa **Add credentials** en live e introdúcelas;
  mientras no lo hagas, el sistema usa las env vars de Vercel (actualmente correctas).

### 3. Activar el modo live

En `/admin/settings` → **Stripe Mode** → pulsa **Switch to Production (live)**.

El panel bloquea el cambio si falta configuración. Al activarse, *todos* los pagos del sistema
(checkouts de planes, pagos al reservar con Stripe) usan las claves y precios live.

### 4. Prueba real en baja escala

- Compra el **Básico (29 €)** con una tarjeta real desde `/pricing` → debe volver al dashboard con el
  banner "Pago recibido con éxito" y el plan **BASIC** (cuotas: 5 páginas, 1.000 clientes).
- Compra **Pro (19 €/mes)** → plan **PRO** activo con fecha de renovación.
- Haz **upgrade a Equipo (39 €)** → debe pedir confirmación y **cobrar solo la diferencia prorrateada**
  (Stripe aplica el crédito del periodo ya pagado).
- **Cancela** la suscripción desde el Stripe Customer Portal → el plan baja a **BASIC** conservando la
  compra de fundadores.
- **Reembolsa** la compra del Básico (si se requiere) → el plan baja a **FREE** y se revocan las cuotas.

### 5. Verificación post-activación

- `https://anytimebot.app/pricing` → 200 y botones de compra redirigen a `checkout.stripe.com` (live).
- Webhook: `POST /api/stripe/webhook` sin firma responde `{"error":"No signature"}` (400) — el endpoint
  está escuchando.
- Dashboard del usuario pagador muestra el plan correcto y su cuota aplicada.
- Registra la activación en `AdminLog` (el panel ya audita `SET_STRIPE_MODE`).

---

## 🛟 Rollback

Para volver a modo prueba sin desplegar: `/admin/settings` → **Switch to Test**. El modo es solo un
flag en `SystemSetting`, reversión instantánea.

---

## Notas de operación

- **No** pongas las claves live en `.env.local`, commits ni issues. Vercel ya las guarda como sensibles.
- Rota `whsec_live_…` si aparece en logs o tickets (Stripe permite regenerar el secret del endpoint).
- Si algún día cambias los precios (p. ej. 19 → 24 €), crea el precio nuevo en Stripe live y actualiza
  `STRIPE_PRICE_PRO`/`STRIPE_PRICE_TEAM` (o las credenciales guardadas en admin) **antes** de activarlo;
  los clientes nuevos verán el precio nuevo y los existentes conservan su suscripción.
- El Básico de fundadores se compra una sola vez por cuenta y solo desde plan `FREE`. Si necesitas
  permitir recompra o cambios de precio del Básico en el futuro, revisa `lib/founders-basic.ts`.