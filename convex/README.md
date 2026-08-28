# Convex

Este directorio contiene la primera integración híbrida de Anytimebot.

## Configuración

1. Instala dependencias con Yarn.
2. Ejecuta `yarn convex dev` para crear o seleccionar el proyecto Convex.
3. Configura `CONVEX_INGEST_SECRET` como variable de entorno en Convex y Vercel.
4. Define `NEXT_PUBLIC_CONVEX_URL` en Vercel con la URL del deployment.

El endpoint `/events/bot-message` está protegido por `Authorization: Bearer <CONVEX_INGEST_SECRET>` y está pensado para ser llamado desde API Routes de Vercel, no desde el navegador.

Las reservas, usuarios, sesiones NextAuth, Stripe y tokens OAuth continúan en PostgreSQL/Prisma. Convex contiene datos reactivos derivados del bot.

Los archivos `_generated/` son generados por Convex y no deben editarse manualmente.
