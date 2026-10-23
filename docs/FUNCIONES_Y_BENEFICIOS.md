# Anytimebot (MeetMind) — Funciones, Beneficios y Problemas que Resolvemos

> **Propósito:** documento maestro del producto. Inventario de lo que el sistema
> hace **hoy**, para quién es, qué problema concreto resuelve cada pieza y qué
> beneficios aporta.
>
> **Fecha:** 10 de octubre de 2026
> **Fuente:** inventario directo del código (rutas `app/api`, modelos
> `prisma/schema.prisma`, módulos del dashboard y librerías `lib/`). No es una
> lista de ideas futuras: refleja funcionalidad implementada.

---

## 1. Resumen ejecutivo

Anytimebot es una plataforma SaaS de **agenda, cobro y relación con el cliente**
para negocios que venden su tiempo: profesionales independientes (coaches,
psicólogos, consultores), clínicas y estética (barberías, dentistas, spa), y
empresas con varios profesionales y sedes.

Cubre el ciclo completo de una cita, no solo el hueco en el calendario:

1. **Captación** — páginas públicas de reserva, widget embebible, formularios de
   enrutamiento, campañas de email, cupones y programa de afiliados.
2. **Reserva** — disponibilidad real, recursos físicos, zonas horarias, reservas
   recurrentes (series), anticipo o pago completo.
3. **Preparación** — sincronización con Google Calendar, videollamada automática
   (propia, Zoom o Teams), recordatorios por email y WhatsApp, *briefing* previo
   generado con IA.
4. **Reunión** — sala de video propia con grabación y transcripción, o enlace
   externo.
5. **Cierre** — resumen automático de la reunión, cobro (online por Stripe, caja
   física, transferencia), factura con numeración secuencial, membresías.
6. **Seguimiento** — CRM de clientes, encuestas de satisfacción, analítica de
   ingresos y ocupación, API/webhooks para conectar el resto de su stack.

Todo ello multi-tenant, multi-idioma (EN/ES) y desplegado en serverless, con un
panel de administración de plataforma y un programa de **revendedores**.

---

## 2. Qué problema resolvemos

| Dolor real | Cómo lo resolvemos |
|---|---|
| “Pierdo horas cuadrando citas por WhatsApp.” | Página pública 24/7 + widget + asistente IA que reserva por el cliente. |
| “Dos citas en el mismo sillón/consultorio.” | Recursos físicos reservables con detección de solapes. |
| “Cada profesional y cada sede son un mundo.” | Sedes con dirección y zona horaria propias; equipos con asignación. |
| “La gente no aparece / se le olvida.” | Recordatorios automáticos por email y WhatsApp + confirmación. |
| “Cobro tarde o no cobro.” | Pago online al reservar (Stripe), caja con arqueo, factura automática. |
| “No sé qué me deja dinero.” | Analítica de ingresos, conversión, ocupación y reportes exportables. |
| “No tengo CRM ni histórico clientes.” | CRM automático ligado a cada reserva, con historial y etiquetas. |
| “Quiero vender cursos/membresías, no solo citas.” | Suscripciones/membresías anuales y mensuales con precio propio. |
| “Mi web/CRM no habla con la agenda.” | API pública REST + webhooks salientes firmados. |
| “Escribir a mano el resumen de cada reunión.” | Resumen automático con IA + transcripción. |
| “Quiero revender el servicio.” | Panel de revendedores con precios y atribución propios. |

---

## 3. Mapa del producto

### Panel del cliente (`/dashboard`)

| Bloque | Módulos |
|---|---|
| **Visión** | Resumen (overview), Analítica |
| **Agenda** | Calendario, Reservas, Encuestas de disponibilidad |
| **Oferta** | Páginas de reserva, Tipos de evento |
| **Clientes** | Clientes (CRM), Equipos, Feedback, Marketing |
| **Automatización** | Asistente IA (bot), Integraciones, API |
| **Dinero** | Pagos, Ingresos, Facturas, Membresías |
| **Cuenta** | Soporte, Ajustes, Panel de revendedor (si aplica) |

### Panel de plataforma (`/admin`)
Usuarios, Planes/suscripciones, Uso, Revendedores, Canales, WhatsApp,
Logs, Video, Soporte, Credenciales (Stripe/email/almacenamiento), Ajustes del
sistema, Estado del sistema.

---

## 4. Funciones en detalle

### A. Agenda y reservas

- **Tipos de evento**: duración, precio, ubicación (presencial / teléfono /
  video), preguntas de formulario personalizadas, período de pago
  (puntual/mensual/anual), capacidad y recursos permitidos.
- **Páginas de reserva** (`/dashboard/booking-pages`): varias por cuenta, con
  logo, slug público (`/{usuario}/{slug}`), idioma, moneda y campos de formulario.
- **Disponibilidad**: horarios semanales por página; motor de disponibilidad que
  respeta duración, zona horaria, antelación mínima, hueco entre citas y solapes.
- **Reservas** (`/dashboard/bookings`): crear, ver detalle, editar, cancelar y
  **reprogramar**; estados (pendiente, confirmada, cancelada, completada, no-show).
- **Series/recurrencia**: reservas que se repiten; cancelar o reprogramar toda la
  serie.
- **Reasignación y cancelación por el invitado** vía enlaces con token firmado
  (`/booking/cancel`, `/booking/reschedule`), sin cuenta.
- **Campos de formulario** por tipo de evento (texto, email, teléfono, selector,
  etc.) guardados con cada reserva.
- **Cupones** aplicables al reservar (validación server-side).
- **Antelación / ventana**: reglas de cuándo se puede reservar.

### B. Disponibilidad, sedes y recursos

- **Ubicaciones/sedes** (`Location`): nombre, dirección estructurada y **zona
  horaria propia**; multi-sede real.
- **Recursos** (`Resource`): sala, sillón, equipo o puesto; opcionalmente atados a
  una sede, con capacidad.
- **Horarios por recurso** y **ausencias por recurso**: una máquina en
  mantenimiento o una sala cerrada no bloquean el resto.
- **Asignación automática de recurso** al reservar + **doble-reserva por
  recurso** (dos citas no comparten sillón a la vez).
- **Ausencias del anfitrión** (`TimeOff`): días completos o ventanas parciales
  (“unas horas”), globales o por recurso.
- **Estabilidad histórica**: la reserva guarda una *foto* de recurso/ubicación
  (nombre + dirección) para que el historial siga legible aunque se renombre.

### C. Página pública, widget y encuestas de disponibilidad

- **Web pública** del negocio (`/{usuario}`) y por tipo de evento.
- **Widget embebible** (`/embed/{usuario}`) para incrustar en cualquier web.
- **Encuestas tipo Doodle** (`/dashboard/polls`): se proponen franjas, los
  participantes votan las que pueden atender y se ve el recuento por franja.
- **Página pública del asistente** (`/chat/{usuario}`) para conversar con el bot.
- **Landing de precios**, términos y privacidad.

### D. Calendario e integraciones

- **Google Calendar**: conexión OAuth, sincronización bidireccional, reparación
  de sincronización (cron `repair-gcal-sync`), descripción del evento con los
  datos de la reserva.
- **Estado de la integración** y reconexión desde el dashboard.
- **Integración CRM externa (Volkern)** con prueba de conexión.
- **Webhooks entrantes** de proveedores (Daily, Stripe, WhatsApp/Evolution).
- **Registro de logs** de reuniones y de integraciones.

### E. Videollamadas y reuniones

- **Sala de video propia** (Daily.co) creada automáticamente al reservar, con
  enlace de unión único por reserva.
- **Zoom y Microsoft Teams**: cada usuario conecta **su propia** cuenta por OAuth
  (la plataforma registra la app una sola vez; el cliente solo pulsa “Conectar”).
- **Enlaces externos** como alternativa (Google Meet, etc.).
- **Grabación y transcripción** de la reunión (según plan).
- **Consentimiento** de grabación registrado.
- **Resumen automático de la reunión con IA** al marcarla como completada (usa la
  transcripción si existe; nunca sobreescribe notas manuales del anfitrión).
- **Briefing previo a la reunión** generado con IA (contexto para anfitrión e
  invitado), enviado por cron.

### F. Asistente IA (bot) y conocimiento

- **Chatbot entrenable** (`/dashboard/bot`): personalidad/configuración, y
  **documentos** de entrenamiento (subida, borrado, RAG con *embeddings*).
- **Conversaciones** almacenadas; el bot reserva consultando disponibilidad real.
- **Chat público** para visitantes (`/bot`, `/chat/{usuario}`) y **chat interno**.
- **Cliente LLM compartido** (`OrcaRouter → DeepSeek`) con **medición de uso** por
  plan y protección ante exceso de consumo.

### G. Mensajería

- **WhatsApp con Evolution API** (instancia por usuario, QR de vinculación,
  estados, activar/desconectar) y **WhatsApp con Twilio** (config propia del
  usuario, pruebas de envío).
- **Recordatorios automáticos** por WhatsApp y email (cron), con **ventanas de
  recordatorio** configurables.
- **Encuestas de satisfacción** post-cita por WhatsApp y por email.
- **Bandeja de entrada** de mensajes y su historial por reserva.

### H. CRM y clientes

- **CRM automático**: cada reserva crea/actualiza el contacto del invitado.
- **Ficha de cliente** con historial de citas, etiquetas, notas, empresa, teléfono
  y foto.
- **Fusión de duplicados** inteligente (correos heredados con mayúsculas/espacios):
  se unen etiquetas y notas sin perder nada.
- **Búsqueda de duplicados**, **exportación** de clientes y datos de contacto.
- **Campos personalizados** del contacto.

### I. Equipos y reparto de trabajo

- **Equipos** con miembros y roles (admin/miembro).
- **Asignación automática** de la reserva a un miembro según reglas y disponibilidad.
- **Asignación por formulario de enrutamiento** y por pregunta del formulario.
- **Cuotas de equipo** según plan (número de miembros, agendamiento en equipo).

### J. Formularios de enrutamiento (routing)

- Formularios previos a la reserva que **dirigen al tipo de evento correcto**
  según las respuestas.
- **Persistencia de respuestas** (`RoutingFormResponse`) ligadas a la reserva.
- **Prueba del enrutamiento** y **panel de insights** por tipo de evento
  (`/routing-insights`) con métricas de decisión y **exportación**.

### K. Cobros, caja y facturación

- **Pago online con Stripe** al reservar (Checkout Sessions), con Stripe Connect
  (onboarding y estado de la cuenta del negocio) y portal de facturación.
- **Múltiples métodos de cobro**: online (tarjeta), efectivo, transferencia, datafono.
- **Órdenes y pagos** (modelo `Order`/`Payment`): registrar, anular y
  **reembolsar** (parcial o total) con importe de reembolso acumulado y auditoría.
- **Espejo de reembolsos de Stripe**: el webhook `charge.refunded` refleja
  automáticamente el reembolso en el historial del pago online (`refundCents`),
  idempotente ante reentregas.
- **Caja (drawer)**: apertura/cierre de turnos, movimientos
  (venta, reembolso, depósito, retiro, ajuste) y **arqueo** que congela el período.
- **Facturas** con numeración secuencial por año (`INV-2026-00001`) y **recibos**
  con serie propia; descarga en PDF.
- **Matriz de permisos** para el módulo de cobros (owner/admin/miembro).
- **Auditoría inmutable** de cada cambio de estado (`TenantAuditLog`).

### L. Membresías y planes del cliente

- **Membresías** de pago recurrente (mensual/anual) que habilitan reservas.
- **Cálculo de descuento anual** frente al precio mensual real.
- **Cancelación** de membresía y **expiración automática** (cron).
- **Página de precios** propia del negocio.

### M. Marketing

- **Campañas de email** a segmentos del CRM, con estados y destinatarios.
- **Cupones** (porcentaje o importe) con reglas de uso.
- **Plantillas de email** editables.
- **Baja de suscripción** con token firmado (cumplimiento).
- Resolución de segmentos sobre el CRM.

### N. Analítica e informes

- **Resumen (overview)** del negocio en el inicio del dashboard.
- **Analítica**: reservas, conversión, uso del bot.
- **Ingresos**: métricas de facturación y **exportación**.
- **Reportes de pagos** y **exportación de ingresos**.
- **Uso y cuotas** del plan en tiempo real.

### O. Encuestas de satisfacción (feedback)

- Encuesta automática tras la cita (email y WhatsApp) con **token firmado**.
- Registro de respuestas y su vista en el dashboard, también por cliente.

### P. API pública, webhooks y claves

- **API REST pública v1** (`/api/v1`): `GET /me`, `GET /event-types`,
  `GET /bookings` (paginado, filtros e `updated_since` para sync incremental) y
  `POST /bookings` (crea reservas con todos los efectos: calendario, email,
  WhatsApp).
- **Claves de API** por usuario (`atb_...`): solo se guarda el **hash SHA-256**,
  se muestran una vez y se pueden revocar.
- **Rate limiting** (100 req/min por clave) con cabeceras `X-RateLimit-*` y `429`.
- **Webhooks salientes** firmados (`X-Anytimebot-Signature` = HMAC-SHA256),
  entregas persistidas primero y **reintentos con backoff exponencial** (cron).
- **Gestión de endpoints**, historial de entregas y **prueba** manual.
- Documentación: `docs/PUBLIC_API.md` y `docs/API_ONBOARDING.md`.

### Q. Cuentas, planes y cuotas

- **Autenticación** con NextAuth (email/contraseña y proveedores), sesión y
  verificación.
- **Registro** (`/auth/signup`) y **onboarding** guiado.
- **Planes**: Free, Founders Basic, Pro, Team, Enterprise, con **cuotas** por
  plan (páginas de reserva, clientes, interacciones IA, documentos del bot,
  minutos de vídeo/grabación/transcripción, mensajes WhatsApp/Telegram, miembros
  de equipo, agendamiento en equipo).
- **Control de acceso por plan** (`canPerformAction`) y **reinicio de uso** por cron.
- **Suscripción de plataforma con Stripe** (checkout y portal), con **Founders
  Basic** y precios por plan.
- **Contraseña**, **plantillas de email** y **ajustes** de usuario.

### R. Panel de administración de plataforma

- **Usuarios**: listado, detalle, suspender/reactivar, cambiar plan, resetear uso,
  notas internas.
- **Suscripciones** de la plataforma y su seguimiento.
- **Uso** agregado por cuenta y **cuotas**.
- **Revendedores**: alta, precios mayoristas, atribución.
- **Canales** y mensajes; **WhatsApp** (activar, desconectar, teléfono, QR, estado).
- **Logs** de sistema, de video-reuniones y de auditoría.
- **Soporte**: tickets, mensajes y estados.
- **Credenciales**: Stripe (y modo test/live), email, almacenamiento.
- **Estado del sistema** y **migración** administrativa.

### S. Programa de revendedores

- Cada **revendedor** tiene un **descuento mayorista negociado** y fija **su propio
  precio público** por plan (mínimo = mayorista).
- **Atribución** por identificador (`?ref=` + cookie); los clientes que llegan por
  un revendedor **solo ven sus precios**, nunca los oficiales.
- **Panel de revendedor** propio.

### T. Seguridad, privacidad y cumplimiento

- **Aislamiento por tenant**: cada tenant es un `User`; el acceso a datos se
  filtra por `userId` y por borrados en cascada (ver §8).
- **RGPD**: **borrado de cuenta funcional** (limpia WhatsApp externo, conversaciones
  en Convex y borra al usuario en cascada), **registro de consentimientos**
  (`ConsentLog`), **exportación de datos** y **retención configurable** por cron
  (`data-retention`).
- **Consentimiento de grabación** de video.
- **Secretos** (Stripe, email, storage) guardados en el servidor / ajustes del
  sistema, no en el cliente.
- **Auditoría** inmutable de operaciones de negocio y de administración.

### U. Experiencia y plataforma

- **Multi-idioma** (inglés y español) con locale por usuario.
- **Diseño responsive** (Tailwind + shadcn/ui), navegación móvil dedicada.
- **Notificaciones push** (suscripción desde el navegador).
- **Modo offline** (página `/offline`).
- **Subida de archivos** (avatares, logos, fotos de cliente) con almacenamiento
  S3-compatible y control de acceso por clave.
- **Carga diferida** de componentes pesados.

---

## 5. Beneficios

### Para el profesional independiente
- Deja de perder tiempo cuadrando citas: el cliente reserva solo, 24/7.
- Cobra online y no persigue pagos; factura automáticamente.
- Aparece más profesional (página propia, confirmaciones, recordatorios).
- Menos ausencias por recordatorios automáticos.
- Prepara cada reunión con un briefing y cierra con un resumen automático.

### Para el negocio con equipo y varias sedes
- Varios profesionales, horarios, sedes y recursos conviven sin pisarse.
- Reparto automático de trabajo según reglas y disponibilidad.
- Control de caja y arqueo por sede; facturación consistente y auditable.
- Visión de ingresos, ocupación y conversión para decidir con datos.
- CRM unificado con historial completo del cliente.

### Para el ecosistema / desarrolladores
- Integración por API y webhooks firmados sin tocar la base de datos.
- Claves revocables y límites de uso predecibles.
- Arquitectura serverless, sin servidores que mantener.

### Para la plataforma (nosotros)
- Multi-tenant con planes y cuotas: monetización por consumo.
- Panel de administración y logs: operación y soporte centralizados.
- Programa de revendedores: canal de venta sin coste de adquisición directo.
- Cumplimiento RGPD (borrado, consentimiento, exportación, retención).

---

## 6. Diferenciadores frente al mercado

Según el análisis competitivo interno (`docs/competitive-analysis-roadmap.md`),
frente a herramientas como Calendly, SimplyBook.me, Fresha, Setmore, AgendaPro o
Doodle:

| Capacidad | Anytimebot |
|---|---|
| Reserva 24/7 + página pública | ✅ |
| Recordatorios email **y WhatsApp** | ✅ |
| Cobro online + **caja física con arqueo** | ✅ |
| **CRM con fusión de duplicados** | ✅ |
| **Recursos físicos** (sillones, salas, equipos) | ✅ |
| **Multi-sede con zona horaria propia** | ✅ |
| **Asistente IA entrenable que reserva** | ✅ |
| **Videollamada propia + grabación + transcripción + resumen IA** | ✅ |
| **Briefing previo con IA** | ✅ |
| **API pública + webhooks firmados** | ✅ |
| **Programa de revendedores con precios propios** | ✅ |
| Encuestas de disponibilidad (Doodle) | ✅ |

---

## 7. Planes y cuotas

Cinco niveles: **Free · Founders Basic · Pro · Team · Enterprise**.

Las cuotas gobiernan, entre otros: número de páginas de reserva, clientes,
interacciones de IA, documentos del bot, minutos de vídeo, grabación y
transcripción, mensajes de WhatsApp/Telegram, miembros de equipo y agendamiento
en equipo. El consumo se mide en tiempo real y se reinicia por cron; al superar el
límite se bloquea la acción correspondiente. La configuración exacta por plan vive
en [`lib/plans.ts`](../lib/plans.ts).

---

## 8. Estado y limitaciones conocidas

Transparencia sobre lo que **no** está cerrado (documentado en `docs/`):

- **Aislamiento por tenant lógico, no físico.** Hoy una sola base PostgreSQL se
  comparte entre tenants y el aislamiento es por filtros de `userId` + cascadas.
  El plan de base/schema por tenant está aprobado pero **pendiente de ejecución**
  (`docs/tenant-data-isolation.md`).
- **Datos del bot en infraestructura compartida** (Convex), aislados por clave de
  negocio (`externalBotId`).
- **Recursos y sedes**: fases A y B implementadas; quedan puntos abiertos
  (`docs/resources-locations-model.md`).
- **Reembolsos anteriores** al espejo de Stripe no se rellenan retroactivamente.
- El botón *reembolsar* del historial está disponible en filas de pago online;
  con el webhook el importe se autocorrige desde Stripe, pero la acción no mueve
  dinero por sí sola.
- **Rate limiting** en memoria: válido para una sola instancia; requiere
  Redis/Upstash si el despliegue crece a multi-región.

---

## 9. Stack técnico

- **Framework:** Next.js 14 (App Router, Server Components) desplegado en Vercel.
- **Datos:** PostgreSQL + Prisma (fuente de verdad) y **Convex** para tiempo real
  (chat, presencia, eventos del dashboard) — arquitectura híbrida.
- **Auth:** NextAuth.js.
- **UI:** Tailwind CSS + shadcn/ui.
- **Pagos:** Stripe (Checkout, Connect, portal, suscripciones, reembolsos).
- **Video:** Daily.co (sala propia) + Zoom + Microsoft Teams.
- **Email:** Resend.
- **WhatsApp:** Evolution API y Twilio.
- **Almacenamiento:** S3-compatible.
- **IA:** cliente LLM compartido (OrcaRouter → DeepSeek) con embeddings/RAG.

---

*Documento generado a partir del inventario del código. Para el detalle de un
módulo concreto, ver los documentos de `docs/` y el propio dashboard.*
