# Arquitectura híbrida de Anytimebot

## Objetivo

Ejecutar la aplicación Next.js en Vercel, incorporar Convex para datos reactivos y mantener PostgreSQL/Prisma para las capacidades que actualmente dependen de NextAuth y consultas relacionales complejas.

La arquitectura propuesta es **incremental**: Convex no reemplaza inicialmente a PostgreSQL. Cada dominio tiene una única fuente de verdad para evitar inconsistencias.

## Componentes

```text
Usuarios
   |
   v
Vercel / Next.js
  - App Router y UI
  - Server Components
  - API Routes / Webhooks
  - Cron Jobs
   |                  \
   |                   \
   v                    v
PostgreSQL + Prisma    Convex
  - Identidad           - Tiempo real
  - Reservas            - Chat y presencia
  - Calendario          - Eventos del dashboard
  - Suscripciones       - Estado efímero
  - Configuración       - Notificaciones
   |                    |
   +---------+----------+
             |
             v
       Integraciones externas
```

## Responsabilidades

### Vercel / Next.js

Vercel aloja la aplicación y sus funciones serverless:

- renderizado de páginas y componentes;
- endpoints HTTP públicos y privados;
- recepción de webhooks;
- validación de autenticación y autorización;
- ejecución de cron jobs cortos y reintentables;
- llamadas a Stripe, Google, Daily, WhatsApp, S3 y Resend;
- publicación de variables de entorno y dominios.

Las API Routes deben actuar como una capa de aplicación. No se deben exponer credenciales de proveedores desde el cliente.

### PostgreSQL + Prisma

Durante la primera fase continúa siendo la fuente de verdad para:

- `User`, `Account`, `Session` y `VerificationToken` de NextAuth;
- `BookingPage`, `EventType`, `Availability` y `Booking`;
- `Subscription` y datos de Stripe;
- equipos, miembros y asignación de reservas;
- cuotas y uso facturable;
- sesiones y resultados persistentes de video;
- auditoría administrativa;
- datos que requieren joins, restricciones únicas o transacciones.

La lógica de disponibilidad, prevención de doble reserva, cambios de plan y procesamiento de pagos debe permanecer transaccional en PostgreSQL.

### Convex

Convex se incorpora como backend reactivo para datos que requieren actualizaciones inmediatas o colaboración:

- conversaciones del bot y mensajes en vivo;
- presencia y estado de agentes;
- notificaciones del dashboard;
- estado temporal de procesamiento de documentos;
- progreso de transcripción y generación de resúmenes;
- actividad reciente y eventos de interfaz;
- colas lógicas idempotentes para tareas que luego ejecuta Vercel;
- configuraciones que solo pertenezcan al bot, cuando dejen de ser necesarias para consultas transaccionales.

Convex no debe duplicar reservas o suscripciones en la primera fase. Si la UI necesita mostrar esos datos, Next.js los obtiene desde Prisma y Convex solo puede recibir eventos derivados no autoritativos.

## Integraciones que deben permanecer externas

### Stripe

Debe permanecer externo para:

- checkout y portal de facturación;
- creación y gestión de suscripciones;
- validación de firmas de webhooks;
- facturas y estados de pago.

El webhook de Stripe llega a Vercel, se valida allí y actualiza `User`/`Subscription` en PostgreSQL. Opcionalmente publica un evento derivado en Convex para refrescar la interfaz.

### Google Calendar

Debe permanecer externo porque Google es el proveedor de calendarios y OAuth:

- tokens OAuth se mantienen asociados a NextAuth/Prisma;
- Vercel ejecuta sincronización y llamadas a Google Calendar;
- Convex puede mostrar progreso o estado de sincronización, pero no guarda tokens OAuth.

### WhatsApp: Evolution API y Twilio

Deben permanecer externos:

- Evolution/Twilio son los transportes de mensajes;
- sus webhooks llegan a Vercel;
- Vercel valida el proveedor, persiste el registro durable en PostgreSQL si es necesario y publica el mensaje a Convex para la conversación en tiempo real;
- las credenciales permanecen únicamente en variables server-side o almacenamiento cifrado.

### Daily.co

Debe permanecer externo para:

- creación de salas;
- tokens de acceso;
- grabaciones y eventos de sala;
- streaming o videollamadas.

Vercel controla la API de Daily. Convex puede reflejar participantes, presencia y estado de procesamiento; PostgreSQL conserva la sesión final y sus metadatos importantes.

### AWS S3

Debe permanecer externo para archivos y documentos:

- Vercel genera URLs firmadas;
- el navegador sube directamente a S3;
- Convex almacena estado de procesamiento y referencias no sensibles;
- el contenido y las URLs permanentes siguen la política de almacenamiento de S3.

### Resend

Debe permanecer externo para el envío de correo. Vercel genera y envía los mensajes; Convex puede almacenar el estado visual de una notificación, pero no sustituye el proveedor de entrega.

### IA y embeddings

El proveedor LLM/embeddings debe permanecer externo. Las claves solo viven en Vercel. Convex puede almacenar mensajes, jobs y resultados pequeños; documentos grandes, archivos y vectores deben seguir una estrategia explícita de almacenamiento antes de migrar el RAG.

## Flujos principales

### Inicio de sesión

1. El usuario inicia sesión mediante NextAuth.
2. NextAuth lee/escribe usuarios, cuentas y sesiones en PostgreSQL.
3. La sesión JWT identifica al usuario en Vercel.
4. Las funciones de Vercel llaman a Convex usando una identidad de servidor o un token derivado, nunca con credenciales expuestas al cliente.
5. Convex mantiene un `externalUserId` igual al `User.id` de Prisma cuando necesite datos asociados al usuario.

No se deben mantener dos sistemas de autenticación activos sin una estrategia clara de identidad.

### Reserva

1. La página pública consulta disponibilidad desde PostgreSQL.
2. La API valida datos, zona horaria y conflictos.
3. PostgreSQL crea la reserva dentro de la transacción existente.
4. Vercel publica un evento `booking.created` en Convex.
5. Convex actualiza dashboard, chat o notificaciones en tiempo real.
6. Calendario, correo, WhatsApp y videollamada se ejecutan mediante integraciones externas.

PostgreSQL sigue siendo la fuente de verdad; Convex solo recibe eventos derivados.

### Mensaje del bot

1. El webhook de WhatsApp llega a Vercel.
2. Vercel valida la firma o secreto del proveedor.
3. Se normaliza el mensaje y se aplica idempotencia.
4. Convex guarda el mensaje y actualiza la conversación en tiempo real.
5. Vercel o un job procesa la respuesta LLM.
6. El mensaje saliente se envía a Evolution/Twilio.
7. El estado de entrega se refleja en Convex y, si es necesario para auditoría o facturación, en PostgreSQL.

### Stripe

1. Stripe llama al webhook de Vercel.
2. Vercel verifica la firma y la idempotencia del evento.
3. Prisma actualiza el plan y la suscripción.
4. Vercel publica `subscription.updated` en Convex.
5. El dashboard recibe la actualización en tiempo real.

## Reglas de consistencia

- Un dominio debe tener una sola fuente de verdad.
- Los eventos enviados a Convex deben ser idempotentes.
- Toda escritura crítica debe pasar por una función server-side autenticada.
- Nunca confiar en datos enviados desde el navegador para determinar usuario, plan o permisos.
- No guardar secretos OAuth, claves de Stripe o tokens de proveedores en Convex como texto plano.
- Para cada evento se recomienda guardar `eventId`, `type`, `aggregateId`, `occurredAt` y `source`.
- Las operaciones externas deben tolerar reintentos de Vercel.

## Variables de entorno

### Vercel

Mantener en Vercel:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `CONVEX_URL` o la variable pública equivalente para el cliente
- credenciales de Google, Stripe, Daily, Evolution/Twilio, AWS, Resend y LLM
- secretos de cron y webhooks

### Convex

Mantener en Convex únicamente secretos usados por funciones Convex. Preferir que las llamadas a proveedores externos se hagan desde Vercel mientras el dominio no se haya migrado completamente.

Nunca versionar `.env`, secretos, tokens ni exportaciones de base de datos.

## Plan de migración por fases

### Fase 0: base operativa

- Crear proyecto Convex de desarrollo y producción.
- Añadir `convex/` y variables de entorno.
- Definir identidad externa mediante `externalUserId`.
- Añadir logging y correlación de eventos.
- Configurar Vercel con el build existente.

### Fase 1: tiempo real sin riesgo transaccional

- Migrar conversaciones y mensajes del bot a Convex.
- Añadir suscripciones reactivas para el dashboard.
- Mantener reservas, usuarios y planes en Prisma.
- Publicar eventos derivados desde webhooks y APIs de Vercel.

### Fase 2: procesos asíncronos

- Representar jobs de documentos, transcripciones y briefings en Convex.
- Hacer workers de Vercel idempotentes.
- Mantener archivos en S3 y resultados durables importantes en PostgreSQL.

### Fase 3: evaluación de migraciones adicionales

Migrar dominios a Convex solo después de medir:

- volumen y patrón de consultas;
- necesidad real de transacciones;
- requisitos de auditoría;
- estrategia de backup/exportación;
- impacto sobre NextAuth y webhooks existentes.

Reservas, pagos y OAuth no deben migrarse solo por reducir el número de tecnologías.

## Decisión recomendada

La primera implementación debe añadir Convex para el módulo de conversaciones y eventos del bot, sin modificar NextAuth ni el flujo de reservas. Esto entrega tiempo real con un cambio acotado y mantiene PostgreSQL como respaldo de todos los datos críticos actuales.
