import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { wholesalePriceCents, OFFICIAL_PRICE_CENTS, PAID_PLANS, type ResellerContext } from '@/lib/resellers';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (user?.role !== 'ADMIN') return null;
  return session;
}

interface ResellerWithMetrics {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  discountPercent: number;
  isActive: boolean;
  ownerEmail: string | null;
  customersCount: number;
  paidCustomersCount: number;
  estimatedRevenueCents: number; // sum of what customers paid (public prices)
  estimatedMarginCents: number; // reseller margin (public - wholesale)
  plans: Record<string, { public: number; wholesale: number }>;
}

// GET /api/admin/resellers
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const resellers = await prisma.reseller.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      ownerUser: { select: { email: true } },
      planPrices: { select: { plan: true, priceCents: true } },
      customers: {
        select: { id: true, plan: true },
      },
    },
  });

  const result: ResellerWithMetrics[] = resellers.map((r) => {
    const plans: Record<string, { public: number; wholesale: number }> = {};
    for (const plan of PAID_PLANS) {
      const configured = r.planPrices.find((p) => p.plan === plan)?.priceCents;
      plans[plan] = {
        public: configured ?? OFFICIAL_PRICE_CENTS[plan] ?? 0,
        wholesale: wholesalePriceCents(plan, r.discountPercent),
      };
    }

    const paidCustomers = r.customers.filter((c) => c.plan !== 'FREE');
    // Estimated revenue: paid customers count x their plan's public price
    // (one-time for BASIC, one month for PRO/TEAM — rough monthly estimate).
    let estimatedRevenueCents = 0;
    let estimatedMarginCents = 0;
    for (const customer of paidCustomers) {
      const plan = customer.plan as keyof typeof plans;
      if (!plans[plan]) continue;
      estimatedRevenueCents += plans[plan].public;
      estimatedMarginCents += Math.max(plans[plan].public - plans[plan].wholesale, 0);
    }

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      contactEmail: r.contactEmail,
      discountPercent: r.discountPercent,
      isActive: r.isActive,
      ownerEmail: r.ownerUser?.email ?? null,
      customersCount: r.customers.length,
      paidCustomersCount: paidCustomers.length,
      estimatedRevenueCents,
      estimatedMarginCents,
      plans,
    };
  });

  return NextResponse.json(result);
}

// POST /api/admin/resellers - create a reseller.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : '';
  const discountPercent = typeof body.discountPercent === 'number' ? Math.min(Math.max(Math.round(body.discountPercent), 0), 100) : 0;
  const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : '';

  if (!name || !slug) {
    return NextResponse.json({ error: 'Nombre y slug son obligatorios' }, { status: 400 });
  }

  const existing = await prisma.reseller.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: 'Ya existe un reseller con ese slug' }, { status: 409 });
  }

  // Optionally link the reseller panel to an existing user account.
  let ownerUserId: string | null = null;
  if (ownerEmail) {
    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (!owner) {
      return NextResponse.json({ error: 'No existe ningún usuario con ese email' }, { status: 400 });
    }
    const alreadyOwner = await prisma.reseller.findUnique({ where: { ownerUserId: owner.id } });
    if (alreadyOwner) {
      return NextResponse.json({ error: 'Ese usuario ya gestiona otro reseller' }, { status: 409 });
    }
    ownerUserId = owner.id;
  }

  const reseller = await prisma.reseller.create({
    data: { name, slug, contactEmail: contactEmail || null, discountPercent, ownerUserId },
  });

  return NextResponse.json({ ok: true, id: reseller.id });
}