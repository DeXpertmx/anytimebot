import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyMarketingToken } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

function htmlPage(title: string, text: string): Response {
  const body = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{background:#fff;padding:40px;border-radius:16px;max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(15,23,42,.06)}h1{font-size:18px;color:#0f172a}.ok{width:56px;height:56px;border-radius:50%;background:#dcfce7;color:#16a34a;display:inline-flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:8px}p{color:#475569;font-size:14px;line-height:1.6}</style></head>
<body><main><div class="ok">✓</div><h1>${title}</h1><p>${text}</p></main></body></html>`;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// GET /api/marketing/unsubscribe?userId=&email=&t=<token>
// Signed one-click opt-out; flips marketingOptOut on the matching CRM contact.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || '';
  const email = (searchParams.get('email') || '').trim().toLowerCase();
  const token = searchParams.get('t') || '';

  const parsed = verifyMarketingToken(token);
  if (!parsed || parsed.userId !== userId || parsed.email.toLowerCase() !== email) {
    return htmlPage('Enlace no válido', 'El enlace de baja no es válido o ya ha caducado.');
  }

  const customer = await prisma.customer.findFirst({ where: { userId, email } });
  if (!customer) {
    return htmlPage('Contacto no encontrado', 'No encontramos el contacto asociado a este correo.');
  }
  await prisma.customer.update({
    where: { id: customer.id },
    data: { marketingOptOut: true },
  });
  return htmlPage(
    'Has sido dado de baja',
    'Dejaremos de enviarte correos de marketing a este contacto. Puedes seguir gestionando tu cuenta cuando quieras.',
  );
}
