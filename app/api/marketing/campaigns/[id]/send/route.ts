import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendSystemWhatsAppMessage } from '@/lib/system-whatsapp';
import {
  resolveAudienceCustomers,
  selectWhatsAppRecipients,
  renderCampaignContent,
  signMarketingToken,
} from '@/lib/marketing';

export const dynamic = 'force-dynamic';

const MAX_ERROR_LEN = 500;

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'https://anytimebot.app'
  );
}

function firstName(name: string | null | undefined): string {
  return (name || '').split(/\s+/)[0] || '';
}

function unsubscribeHtml(userId: string, email: string): string {
  const token = signMarketingToken(userId, email);
  const url = `${baseUrl()}/api/marketing/unsubscribe?userId=${encodeURIComponent(
    userId,
  )}&email=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;
  return (
    `<p style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">` +
    `Recibes este correo por ser cliente o haber reservado con nosotros. ` +
    `<a href="${url}" style="color:#94a3b8;">Darse de baja de estos avisos</a>.</p>`
  );
}

// POST /api/marketing/campaigns/[id]/send
// Sends the campaign to its segment. Resume-safe: recipients already marked
// SENT are never re-emailed, and a partially-sent campaign keeps going.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, userId },
    });
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.status === 'SENT') {
      return NextResponse.json(
        { success: false, error: 'This campaign was already sent' },
        { status: 409 },
      );
    }

    // Resolve the audience (opt-outs excluded) and ensure recipient rows.
    const allCustomers = await resolveAudienceCustomers(userId, campaign.audience as any);
    const code = campaign.couponCode || '';
    const isWhatsApp = (campaign.channel as string) === 'WHATSAPP';

    // WhatsApp campaigns only address contacts with a usable phone; contacts
    // without one are skipped (never silently converted to email).
    const customers = isWhatsApp ? selectWhatsAppRecipients(allCustomers) : allCustomers;
    const skippedNoPhone = isWhatsApp ? allCustomers.length - customers.length : 0;

    if (campaign.status === 'DRAFT') {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'SENDING', sentAt: null },
      });
    }

    if (customers.length > 0) {
      await prisma.campaignRecipient.createMany({
        data: customers.map((c) => ({
          campaignId: campaign.id,
          email: c.email,
          phone: isWhatsApp ? c.phone : null,
          customerId: c.id,
        })),
        skipDuplicates: true,
      });
    }

    const pending = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id, status: { not: 'SENT' } },
      orderBy: { createdAt: 'asc' },
    });

    let sent = 0;
    let failed = 0;
    for (const recipient of pending) {
      const customer = customers.find(
        (c) => c.email.toLowerCase() === recipient.email.toLowerCase(),
      );
      const vars = {
        nombre: firstName(customer?.name || recipient.email.split('@')[0]),
        email: recipient.email,
        codigo: code,
        codigo_cupon: code,
      };

      let ok = false;
      if (isWhatsApp) {
        // Plain-text WhatsApp message (HTML stripped, no unsubscribe link —
        // the reply STOP flow is handled at the WhatsApp level).
        const text = renderCampaignContent(campaign.htmlBody, vars)
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        ok = await sendSystemWhatsAppMessage(recipient.phone || '', text);
      } else {
        const subject = renderCampaignContent(campaign.subject, vars);
        const body =
          renderCampaignContent(campaign.htmlBody, vars) + unsubscribeHtml(userId, recipient.email);
        ok = await sendEmail({ to: recipient.email, subject, html: body });
      }
      if (ok) {
        sent++;
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'SENT', sentAt: new Date(), error: null },
        });
      } else {
        failed++;
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'FAILED',
            error: isWhatsApp
              ? 'WhatsApp delivery failed (system number not connected or provider rejected)'
              : 'Mail provider rejected the message',
          },
        });
      }
      // Persist progress on every email so a serverless timeout never loses it.
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          sentCount: { increment: ok ? 1 : 0 },
          failedCount: { increment: ok ? 0 : 1 },
        },
      });
    }

    const total = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } });
    const remainingFailed = await prisma.campaignRecipient.count({
      where: { campaignId: campaign.id, status: { not: 'SENT' } },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        recipientsTotal: total,
        sentCount: total - remainingFailed,
        failedCount: remainingFailed,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        status: 'SENT',
        recipients: total,
        sent: total - remainingFailed,
        failed: remainingFailed,
        skippedNoPhone,
      },
    });
  } catch (error) {
    console.error('Error sending campaign:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
