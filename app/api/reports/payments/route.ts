import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActor, requireCapability, errorResponse } from '@/lib/api-payments';
import { paymentMethodLabel } from '@/lib/payment-methods';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/payments?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=method|staff|location|day&format=json|csv
 *
 * Revenue over COMPLETED payments (gross − refunds = net), grouped as
 * requested. CSV output uses the same rows (Excel-friendly: BOM + ; separator).
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'reports');
    if (denied) return denied;

    const url = new URL(request.url);
    const from = parseDateOr(url.searchParams.get('from'), null);
    const to = parseDateOr(url.searchParams.get('to'), null);
    const groupBy = (url.searchParams.get('groupBy') ?? 'method') as 'method' | 'staff' | 'location' | 'day';
    const format = url.searchParams.get('format') ?? 'json';

    const payments = await prisma.payment.findMany({
      where: {
        userId: actor!.userId,
        status: 'COMPLETED',
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: {
        order: {
          select: {
            id: true,
            bookingId: true,
            locationId: true,
            location: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const groups = new Map<string, { key: string; label: string; grossCents: number; refundCents: number; count: number }>();
    for (const p of payments) {
      const { key, label } = groupKeyFor(groupBy, p);
      const g = groups.get(key) ?? { key, label, grossCents: 0, refundCents: 0, count: 0 };
      g.grossCents += p.amountCents;
      g.refundCents += p.refundCents ?? 0;
      g.count += 1;
      groups.set(key, g);
    }

    const rows = Array.from(groups.values()).map((g) => ({
      ...g,
      netCents: g.grossCents - g.refundCents,
    }));
    rows.sort((a, b) => b.netCents - a.netCents);

    const totals = rows.reduce(
      (acc, r) => ({
        grossCents: acc.grossCents + r.grossCents,
        refundCents: acc.refundCents + r.refundCents,
        netCents: acc.netCents + r.netCents,
        count: acc.count + r.count,
      }),
      { grossCents: 0, refundCents: 0, netCents: 0, count: 0 }
    );

    if (format === 'csv') {
      const csv = toCsv(rows, groupBy);
      return new NextResponse('\ufeff' + csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="pagos-${groupBy}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { groupBy, rows, totals, currency: await tenantCurrency(actor!.userId) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function groupKeyFor(
  groupBy: string,
  p: {
    method: string;
    createdById: string;
    createdByName: string;
    createdAt: Date;
    order: { locationId: string | null; location: { name: string } | null } | null;
  }
): { key: string; label: string } {
  switch (groupBy) {
    case 'staff':
      return { key: p.createdById, label: p.createdByName || '—' };
    case 'location': {
      const name = p.order?.location?.name ?? 'Sin sucursal';
      return { key: p.order?.locationId ?? 'none', label: name };
    }
    case 'day':
      return { key: p.createdAt.toISOString().slice(0, 10), label: p.createdAt.toISOString().slice(0, 10) };
    default:
      return { key: p.method, label: paymentMethodLabel(p.method) ?? p.method };
  }
}

async function tenantCurrency(userId: string): Promise<string> {
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { currency: true } });
  return owner?.currency || 'EUR';
}

function parseDateOr(value: string | null, fallback: Date | null): Date | null {
  if (!value) return fallback;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function toCsv(rows: Array<{ label: string; grossCents: number; refundCents: number; netCents: number; count: number }>, groupBy: string): string {
  const header = `${groupByLabel(groupBy)};Bruto;Reembolsos;Neto;Operaciones`;
  const lines = rows.map(
    (r) =>
      `${csvEscape(r.label)};${(r.grossCents / 100).toFixed(2)};${(r.refundCents / 100).toFixed(2)};${(r.netCents / 100).toFixed(2)};${r.count}`
  );
  return [header, ...lines].join('\r\n');
}

function groupByLabel(groupBy: string): string {
  switch (groupBy) {
    case 'staff':
      return 'Empleado';
    case 'location':
      return 'Sucursal';
    case 'day':
      return 'Fecha';
    default:
      return 'Método de pago';
  }
}

function csvEscape(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
