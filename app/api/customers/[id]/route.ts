import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getOwnedCustomer(id: string, userId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { userId: true },
  });
  return customer && customer.userId === userId ? customer : null;
}

// PATCH /api/customers/[id] - update notes, tags, name, email, company or phone
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    if (!(await getOwnedCustomer(params.id, userId))) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: any = {};

    if (typeof body.name === 'string') data.name = body.name.trim() || null;
    if (typeof body.company === 'string') data.company = body.company.trim() || null;
    if (typeof body.phone === 'string') data.phone = body.phone.trim() || null;
    // Email change: validate format and uniqueness within this owner's CRM.
    // Email is the contact's identity anchor (booking stats, history), so it
    // cannot be emptied.
    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { success: false, error: 'Invalid email address' },
          { status: 400 }
        );
      }
      const clash = await prisma.customer.findFirst({
        where: { userId, email, id: { not: params.id } },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json(
          { success: false, error: 'A customer with this email already exists' },
          { status: 409 }
        );
      }
      data.email = email;
    }
    if (typeof body.notes === 'string') data.notes = body.notes.trim() || null;
    if (Array.isArray(body.tags)) {
      const tags = [
        ...new Set(
          body.tags
            .filter((tag: unknown) => typeof tag === 'string' && tag.trim())
            .map((tag: string) => tag.trim().toLowerCase())
            .slice(0, 20)
        ),
      ];
      data.tags = tags;
    }

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ success: true, data: customer });
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/customers/[id] - forget a contact (bookings are kept)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    if (!(await getOwnedCustomer(params.id, userId))) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    await prisma.customer.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
