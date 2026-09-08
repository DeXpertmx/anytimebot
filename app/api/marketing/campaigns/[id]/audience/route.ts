import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveAudienceCustomers, selectWhatsAppRecipients } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

// GET /api/marketing/campaigns/[id]/audience — live estimate of the campaign
// audience (opt-outs excluded) split per delivery channel so the owner sees
// exactly how many will actually receive it by email vs WhatsApp.
export async function GET(_request: any, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;
    const campaign = await prisma.campaign.findFirst({ where: { id: params.id, userId } });
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    const customers = await resolveAudienceCustomers(userId, campaign.audience as any);
    const whatsappCustomers = selectWhatsAppRecipients(customers);
    return NextResponse.json({
      success: true,
      data: {
        total: customers.length,
        email: customers.length,
        whatsapp: whatsappCustomers.length,
        skippedNoPhone: customers.length - whatsappCustomers.length,
        sample: customers.slice(0, 5).map((c) => c.name || c.email),
      },
    });
  } catch (error) {
    console.error('Error estimating campaign audience:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
