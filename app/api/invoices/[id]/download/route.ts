import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ItemLike {
  name?: string;
  description?: string | null;
  quantity?: number;
  unitPriceCents?: number;
  totalCents?: number;
  durationMinutes?: number;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format((cents || 0) / 100);
  } catch {
    return `${((cents || 0) / 100).toFixed(2)} ${currency || 'EUR'}`;
  }
}

function formatDate(value: Date | string): string {
  const date = new Date(value);
  try {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// GET /api/invoices/[id]/download — printable A4 invoice (screen toolbar with
// "Imprimir / Guardar como PDF"; everything hidden on paper).
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, userId },
    });

    if (!invoice) {
      return new NextResponse('Factura no encontrada', { status: 404 });
    }

    const cancelled = invoice.status === 'CANCELLED';
    const items = (Array.isArray(invoice.items) ? invoice.items : []) as ItemLike[];
    const currency = invoice.currency || 'EUR';
    const issuerLines = [
      invoice.issuerCompany || invoice.issuerName,
      invoice.issuerName && invoice.issuerCompany ? invoice.issuerName : null,
      invoice.issuerAddress,
      invoice.issuerVatId ? `NIF/NIE/VAT: ${invoice.issuerVatId}` : null,
      invoice.issuerCountry ? new Intl.DisplayNames(['es'], { type: 'region' }).of(invoice.issuerCountry) || invoice.issuerCountry : null,
      invoice.issuerEmail,
    ].filter(Boolean);

    const showVat = (invoice.vatAmount || 0) > 0;
    const base = showVat ? invoice.totalAmount - (invoice.vatAmount || 0) : invoice.totalAmount;

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(invoice.number)} · Anytimebot</title>
<style>
  :root { --brand:#4f46e5; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:#eef1f6; }
  .toolbar { position:sticky; top:0; z-index:10; display:flex; gap:10px; align-items:center; justify-content:flex-end; padding:14px 6%; background:#0f172a; color:#fff; }
  .toolbar .note { margin-right:auto; font-size:12px; color:#cbd5e1; }
  .toolbar button { border:0; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; }
  .btn-print { background:var(--brand); color:#fff; }
  .btn-close { background:#334155; color:#fff; }
  .page { width:210mm; min-height:297mm; margin:14px auto; padding:18mm 16mm; background:#fff; position:relative; }
  header { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; }
  .brand img { height:46px; width:auto; object-fit:contain; }
  .doc-title { text-align:right; }
  .doc-title h1 { font-size:26px; letter-spacing:.5px; color:var(--brand); font-weight:800; }
  .doc-title .number { font-size:15px; color:var(--muted); margin-top:4px; }
  .stamp { display:inline-block; margin-top:10px; border:3px solid #dc2626; color:#dc2626; font-weight:800; letter-spacing:3px; padding:4px 12px; border-radius:6px; font-size:13px; }
  .meta { display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px; margin-top:26px; }
  .meta h3 { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); margin-bottom:6px; }
  .meta .blk { font-size:13px; line-height:1.5; }
  .meta .dates { font-size:13px; line-height:1.9; }
  table.items { width:100%; border-collapse:collapse; margin-top:30px; }
  table.items th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); border-bottom:2px solid var(--line); padding:8px 10px; }
  table.items th.num, table.items td.num { text-align:right; }
  table.items td { padding:12px 10px; font-size:13px; border-bottom:1px solid var(--line); vertical-align:top; }
  table.items .sub { color:var(--muted); font-size:12px; margin-top:2px; }
  .totals { margin-top:22px; margin-left:auto; width:250px; }
  .totals .row { display:flex; justify-content:space-between; padding:6px 4px; font-size:13px; color:var(--muted); }
  .totals .row.grand { border-top:2px solid var(--ink); margin-top:8px; padding-top:10px; font-size:16px; font-weight:800; color:var(--ink); }
  footer { position:absolute; bottom:14mm; left:16mm; right:16mm; border-top:1px solid var(--line); padding-top:10px; font-size:11px; color:var(--muted); display:flex; justify-content:space-between; gap:20px; }
  @media print {
    body { background:#fff; }
    .toolbar { display:none; }
    .page { margin:0; box-shadow:none; min-height:auto; }
  }
  @page { size:A4; margin:0; }
</style>
</head>
<body>
  <div class="toolbar">
    <span class="note">${escapeHtml(invoice.number)} — vista para impresión</span>
    <button class="btn-close" onclick="window.close()">Cerrar</button>
    <button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <div class="page">
    <header>
      <div class="brand">
        <img src="https://anytimebot.app/anytimebot-logo.png" alt="ANYTIMEBOT" />
      </div>
      <div class="doc-title">
        <h1>FACTURA</h1>
        <div class="number">${escapeHtml(invoice.number)}</div>
        ${cancelled ? '<div class="stamp">ANULADA</div>' : ''}
      </div>
    </header>

    <div class="meta">
      <div>
        <h3>Emitida por</h3>
        <div class="blk">${issuerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('') || escapeHtml(invoice.issuerName || '')}</div>
      </div>
      <div>
        <h3>Cliente</h3>
        <div class="blk">
          <div>${escapeHtml(invoice.guestName)}</div>
          <div>${escapeHtml(invoice.guestEmail)}</div>
        </div>
      </div>
      <div>
        <h3>Detalles</h3>
        <div class="dates">
          <div><strong>Emitida:</strong> ${escapeHtml(formatDate(invoice.issueDate))}</div>
          <div><strong>Servicio:</strong> ${escapeHtml(formatDate(invoice.serviceDate))}</div>
          <div><strong>Moneda:</strong> ${escapeHtml(currency)}</div>
        </div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Concepto</th>
          <th class="num">Cant.</th>
          <th class="num">Precio</th>
          <th class="num">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
          <tr>
            <td>
              <div>${escapeHtml(item.name || 'Servicio')}</div>
              ${item.description ? `<div class="sub">${escapeHtml(item.description)}</div>` : ''}
            </td>
            <td class="num">${Number(item.quantity ?? 1)}</td>
            <td class="num">${formatMoney(item.unitPriceCents ?? 0, currency)}</td>
            <td class="num">${formatMoney(item.totalCents ?? (item.unitPriceCents ?? 0) * (item.quantity ?? 1), currency)}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>

    <div class="totals">
      ${showVat ? `<div class="row"><span>Base imponible</span><span>${formatMoney(base, currency)}</span></div>
      <div class="row"><span>IVA (${invoice.vatRate}%)</span><span>${formatMoney(invoice.vatAmount || 0, currency)}</span></div>` : ''}
      <div class="row grand"><span>Total</span><span>${formatMoney(invoice.totalAmount, currency)}</span></div>
      ${cancelled ? '<div class="row"><span style="color:#dc2626">Estado</span><span style="color:#dc2626">Anulada por reembolso</span></div>' : ''}
    </div>

    <footer>
      <span>Factura generada automáticamente por Anytimebot al completar la reserva pagada.</span>
      <span>anytimebot.app</span>
    </footer>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error rendering invoice:', error);
    return new NextResponse('Error interno', { status: 500 });
  }
}
