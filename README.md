# 🚀 MeetMind (ANYTIMEBOT)

Next-generation scheduling SaaS built with Next.js, PostgreSQL, and modern integrations.

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

Consulta [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md) para la configuración completa de Vercel, Convex, variables de entorno, webhooks y cron jobs.


### Deploy to Vercel

1. Push to GitHub (already done!)
2. Go to [Vercel](https://vercel.com)
3. Import your GitHub repository
4. Set **Root Directory** to: `nextjs_space` (if applicable) or leave as root
5. Add environment variables from `.env.example`
6. Deploy!

See `README-DEPLOYMENT.md` for detailed deployment instructions.

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
