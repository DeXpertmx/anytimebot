import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { wholesalePriceCents, PAID_PLANS, type ResellerContext } from '@/lib/resellers';

export const dynamic = 'force-dynamic';

interface ResellerPanelData {
  reseller: ResellerContext;
  wholesale: Record<string, number>; // plan -> cents (what the reseller pays Anytimebot)
  prices: Record<string, number>; // plan -> public cents currently configured
  customersCount: number;
}

// GET /api/reseller/panel
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      ownedReseller: {
        select: { id: true, slug: true, name: true, discountPercent: true, isActive: true },
      },
    },
  });

  if (!user?.ownedReseller) {
    return NextResponse.json({ error: 'Esta cuenta no tiene un panel de reseller asignado' }, { status: 404 });
  }

  const reseller = user.ownedReseller;
  const rows = await prisma.resellerPlanPrice.findMany({
    where: { resellerId: reseller.id },
    select: { plan: true, priceCents: true },
  });
  const customersCount = await prisma.user.count({ where: { resellerId: reseller.id } });

  const wholesale: Record<string, number> = {};
  const prices: Record<string, number> = {};
  for (const plan of PAID_PLANS) {
    wholesale[plan] = wholesalePriceCents(plan, reseller.discountPercent);
    prices[plan] = wholesale[plan];
  }
  for (const row of rows) {
    prices[row.plan] = row.priceCents;
  }

  const data: ResellerPanelData = {
    reseller: { id: reseller.id, slug: reseller.slug, name: reseller.name, discountPercent: reseller.discountPercent },
    wholesale,
    prices,
    customersCount,
  };

  return NextResponse.json(data);
}

// PUT /api/reseller/panel - update public prices per plan.
// Prices must be >= wholesale (so the reseller never undercuts Anytimebot).
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { ownedReseller: { select: { id: true, slug: true, name: true, discountPercent: true, isActive: true } } },
  });

  if (!user?.ownedReseller?.isActive) {
    return NextResponse.json({ error: 'Panel no disponible' }, { status: 403 });
  }

  const reseller = user.ownedReseller;
  const body = await request.json().catch(() => ({}));
  const incoming = body.prices as Record<string, number> | undefined;
  if (!incoming || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'Faltan los precios' }, { status: 400 });
  }

  const updates: { plan: string; priceCents: number }[] = [];
  for (const plan of PAID_PLANS) {
    const raw = incoming[plan];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : NaN;
    const wholesale = wholesalePriceCents(plan, reseller.discountPercent);
    if (Number.isNaN(value) || value < wholesale) {
      return NextResponse.json({
        error: `El precio de ${plan} no puede ser menor que el precio mayorista (${(wholesale / 100).toFixed(2)} €)`,
      }, { status: 400 });
    }
    updates.push({ plan, priceCents: value });
  }

  for (const update of updates) {
    await prisma.resellerPlanPrice.upsert({
      where: { resellerId_plan: { resellerId: reseller.id, plan: update.plan as any } },
      create: { resellerId: reseller.id, plan: update.plan as any, priceCents: update.priceCents },
      update: { priceCents: update.priceCents },
    });
  }

  return NextResponse.json({ ok: true });
}