# Lanzamiento — Plan "Coach Fundador" (9 €/mes, 20 plazas)

Documento de comunicación para acompañar el cambio de oferta comercial. El producto ya
implementa esta estructura; aquí está el texto listo para usar.

---

## La oferta en una frase

> **Lanzamiento: solo 20 plazas de Coach Fundador a 9 €/mes para siempre.** Incluye todo el
> plan Pro (Asistente IA, WhatsApp, Salas de Video…). Cuando se agoten, el precio para nuevos
> clientes sube a 19 €/mes.

- **Precio:** 9 €/mes, bloqueado de por vida mientras la suscripción siga activa.
- **Incluye:** todo lo del plan Pro (10 páginas de reserva, Asistente IA 300/mes, 5 documentos,
  Salas de Video 100 min/mes, grabación y transcripción, integración con WhatsApp).
- **Límite:** 20 plazas. El cupo se aplica de verdad en el checkout (la plaza 21 no se vende).
- **A cambio:** feedback semanal durante el primer mes y un testimonio si el producto te funciona.

---

## Banner de la página de precios (ya publicado)

> Lanzamiento: solo 20 plazas de Coach Fundador a 9 €/mes para siempre. Cuando se agoten, el
> precio para nuevos clientes sube a 19 €/mes.

La tarjeta muestra además **"Quedan N plazas"** en tiempo real y pasa a **"Plazas agotadas"**
cuando se llenan (con el botón deshabilitado).

---

## Mensaje para tus 20 coaches (email / WhatsApp)

**Asunto:** Te reservo una plaza de Coach Fundador (9 €/mes, solo 20)

> Hola [nombre]:
>
> Estoy lanzando Anytimebot y quiero que los primeros 20 coaches entren con una condición
> especial que no volveré a ofrecer.
>
> **Coach Fundador — 9 €/mes, para siempre.** Incluye todo lo del plan Pro: páginas de reserva
> con tu marca, Asistente IA, integración con WhatsApp, Salas de Video con grabación y
> transcripción, y briefs antes de cada reunión. El precio para nuevos clientes será 19 €/mes
> cuando se agoten las 20 plazas.
>
> La condición es sencilla: durante el primer mes quiero tu **feedback semanal** (qué te
> funciona y qué no, por escrito o en una llamada de 15 minutos), y si el producto te sirve,
> un **testimonio** con tu nombre. Nada más.
>
> Solo hay 20 plazas y no se reabren. Si te interesa, entra aquí y reserva la tuya:
> [enlace a /pricing]
>
> Gracias por confiar en un producto tan joven. Tu opinión va a definir cómo se construye.
>
> [tu nombre]

**Versión corta (WhatsApp):**

> ¡Hola [nombre]! Estoy lanzando Anytimebot y reservo 20 plazas de **Coach Fundador: 9 €/mes
> para siempre** (plan Pro completo: IA, WhatsApp, video). A cambio te pido feedback semanal
> el primer mes y, si te funciona, un testimonio. Cuando se agoten, sube a 19 €/mes.
> ¿Te guardo una? [enlace]

---

## Nota de coherencia de precios

El brief menciona dos cifras para "cuando se agoten": **29 €/mes** al principio y **19 €/mes**
en la tabla de precios. Se implementó **19 €/mes**, porque es el ancla del plan Pro y coincide
con el resto de la estructura (Pro 19 €, Equipo 39 €, Empresa 79 €). Si la intención real era
subir a 29 €/mes al agotarse, hay que cambiar: el copy del banner (`pricing.founderBanner`,
`pricing.founderSoldOut`, `pricing.launchNote` y la tarjeta de Pro) y, si aplica, el precio del
Price ID de Pro.

---

## Antes de cobrar de verdad (Stripe)

1. Crear en Stripe los precios recurrentes **Coach Fundador 9 €/mes** y **Empresa 79 €/mes**.
2. Guardar sus `price_…` en `STRIPE_PRICE_FOUNDER` y `STRIPE_PRICE_ENTERPRISE`
   (por env o desde `/admin/settings` → Stripe Mode).
3. Probar una compra real con tarjeta y verificar el plan y las cuotas.
4. Detalle operativo completo en [STRIPE_PRODUCTION.md](./STRIPE_PRODUCTION.md).
