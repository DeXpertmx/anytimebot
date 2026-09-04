<a id="english"></a>

# 🚀 MeetMind (ANYTIMEBOT)

Next-generation scheduling SaaS built with Next.js, PostgreSQL, and modern integrations.

**Languages / Idiomas:** **English** · [Español](#espanol)

## 🌟 Features

- ✅ User authentication with NextAuth.js
- 📅 Event types and booking management
- 🤖 AI-powered WhatsApp bot integration
- 📊 Analytics and insights
- 💰 Stripe payment integration
- 📱 Twilio WhatsApp integration
- 🎥 Video meetings with Daily.co
- 📧 Email notifications with Resend
- 🌍 Multi-language support (English & Spanish)

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/DeXpertmx/anytimebot.git
cd anytimebot
```

2. Install dependencies:
```bash
yarn install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Update `.env` with your credentials

5. Run database migrations:
```bash
yarn prisma generate
yarn prisma migrate deploy
```

6. Run the development server:
```bash
yarn dev
```

## 📦 Deployment

See [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md) for the complete Vercel setup: Convex, environment variables, webhooks and cron jobs.

### Deploy to Vercel

1. Push to GitHub (already done!)
2. Go to [Vercel](https://vercel.com)
3. Import your GitHub repository
4. Set **Root Directory** to: `nextjs_space` (if applicable) or leave as root
5. Add environment variables from `.env.example`
6. Deploy!

See `README-DEPLOYMENT.md` for detailed deployment instructions.

## 🔌 External Integrations (Public API)

Anytimebot exposes a public REST API so external platforms (CRMs, Zapier-like
automations, partner apps) can sync booking data and even **create bookings**
on behalf of an account.

- **Authentication**: per-user API keys (`atb_...`) created in
  **Dashboard → API**. Only a SHA-256 hash is stored; keys are shown once and
  can be revoked at any time.
- **Endpoints**:
  - `GET /api/v1/me` — account info (plan, timezone, currency)
  - `GET /api/v1/event-types` — bookable event types to pick for syncing
  - `GET /api/v1/bookings` — paginated bookings with filters
    (`event_type_id`, `status`, `from`/`to`, `updated_since` for incremental sync)
  - `POST /api/v1/bookings` — create a booking (availability checked,
    calendar + email + WhatsApp side effects included)
- **Rate limiting**: 100 requests/minute per key with standard
  `X-RateLimit-*` headers and `429` + `Retry-After` when exceeded.

Full reference with request/response examples:
**[`docs/PUBLIC_API.md`](./docs/PUBLIC_API.md)**

```bash
curl https://anytimebot.app/api/v1/bookings \
  -H "Authorization: Bearer atb_your_key_here"
```

## 🛠️ Tech Stack

- **Framework:** Next.js 14
- **Database:** PostgreSQL with Prisma
- **Auth:** NextAuth.js
- **Styling:** Tailwind CSS + Shadcn UI
- **Payments:** Stripe
- **Video:** Daily.co
- **Email:** Resend
- **WhatsApp:** Evolution API + Twilio

## 📝 License

MIT

## 👥 Contact

For support, email: dexpertmx@gmail.com

---

<a id="espanol"></a>

# 🚀 MeetMind (ANYTIMEBOT) — Versión en español

**Languages / Idiomas:** [English](#english) · **Español**

SaaS de programación de citas de nueva generación construido con Next.js, PostgreSQL e integraciones modernas.

## 🌟 Características

- ✅ Autenticación de usuarios con NextAuth.js
- 📅 Tipos de evento y gestión de reservas
- 🤖 Bot de WhatsApp con inteligencia artificial
- 📊 Analíticas e informes
- 💰 Integración de pagos con Stripe
- 📱 Integración de WhatsApp con Twilio
- 🎥 Videollamadas con Daily.co
- 📧 Notificaciones por email con Resend
- 🌍 Soporte multi-idioma (inglés y español)

## 🚀 Inicio rápido

### Requisitos previos

- Node.js 20+
- Base de datos PostgreSQL
- Gestor de paquetes Yarn

### Instalación

1. Clona el repositorio:
```bash
git clone https://github.com/DeXpertmx/anytimebot.git
cd anytimebot
```

2. Instala las dependencias:
```bash
yarn install
```

3. Configura las variables de entorno:
```bash
cp .env.example .env
```

4. Actualiza `.env` con tus credenciales

5. Ejecuta las migraciones de la base de datos:
```bash
yarn prisma generate
yarn prisma migrate deploy
```

6. Arranca el servidor de desarrollo:
```bash
yarn dev
```

## 📦 Despliegue

Consulta [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md) para la configuración completa de Vercel: Convex, variables de entorno, webhooks y cron jobs.

### Desplegar en Vercel

1. Sube el código a GitHub (¡ya está hecho!)
2. Entra en [Vercel](https://vercel.com)
3. Importa tu repositorio de GitHub
4. Configura **Root Directory** en: `nextjs_space` (si aplica) o déjalo en la raíz
5. Añade las variables de entorno desde `.env.example`
6. ¡Despliega!

Consulta `README-DEPLOYMENT.md` para instrucciones de despliegue detalladas.

## 🔌 Integraciones externas (API pública)

Anytimebot expone una API REST pública para que plataformas externas (CRMs,
automatizaciones tipo Zapier, aplicaciones de partners) sincronicen datos de
reservas e incluso **creen reservas** en nombre de una cuenta.

- **Autenticación**: claves de API por usuario (`atb_...`) creadas en
  **Dashboard → API**. Solo se guarda un hash SHA-256; las claves se muestran
  una sola vez y pueden revocarse en cualquier momento.
- **Endpoints**:
  - `GET /api/v1/me` — información de la cuenta (plan, zona horaria, moneda)
  - `GET /api/v1/event-types` — tipos de evento reservables para elegir cuáles sincronizar
  - `GET /api/v1/bookings` — reservas paginadas con filtros
    (`event_type_id`, `status`, `from`/`to`, `updated_since` para sync incremental)
  - `POST /api/v1/bookings` — crear una reserva (con validación de disponibilidad
    y efectos incluidos: calendario + email + WhatsApp)
- **Rate limiting**: 100 peticiones/minuto por clave con cabeceras estándar
  `X-RateLimit-*` y `429` + `Retry-After` al superarlo.

Referencia completa con ejemplos de petición/respuesta:
**[`docs/PUBLIC_API.md`](./docs/PUBLIC_API.md)**

```bash
curl https://anytimebot.app/api/v1/bookings \
  -H "Authorization: Bearer atb_tu_clave_aqui"
```

## 🛠️ Stack tecnológico

- **Framework:** Next.js 14
- **Base de datos:** PostgreSQL con Prisma
- **Autenticación:** NextAuth.js
- **Estilos:** Tailwind CSS + Shadcn UI
- **Pagos:** Stripe
- **Vídeo:** Daily.co
- **Email:** Resend
- **WhatsApp:** Evolution API + Twilio

## 📝 Licencia

MIT

## 👥 Contacto

Para soporte, escribe a: dexpertmx@gmail.com
