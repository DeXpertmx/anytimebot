
import { NextRequest, NextResponse } from 'next/server';
import bcryptjs from 'bcryptjs';
import { prisma } from '@/lib/db';
import { isValidEmail, generateSlug } from '@/lib/utils';
import { notifyAdminNewSignup } from '@/lib/system-whatsapp';
import { cookies } from 'next/headers';
import { RESELLER_REF_COOKIE } from '@/lib/resellers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, username } = body;

    // Validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'User already exists with this email' },
        { status: 409 }
      );
    }

    // Generate username if not provided
    let finalUsername = username || generateSlug(name);
    
    // Ensure username is unique
    let counter = 1;
    let originalUsername = finalUsername;
    while (await prisma.user.findUnique({ where: { username: finalUsername } })) {
      finalUsername = `${originalUsername}${counter}`;
      counter++;
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 12);

    // Reseller attribution: if the visitor arrived through a reseller link,
    // the atb_ref cookie is set; assign the reseller to the new account.
    const ref = cookies().get(RESELLER_REF_COOKIE)?.value || '';
    let resellerId: string | null = null;
    if (ref) {
      const reseller = await prisma.reseller.findUnique({
        where: { slug: ref },
        select: { id: true, isActive: true },
      });
      if (reseller?.isActive) resellerId = reseller.id;
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        username: finalUsername,
        password: hashedPassword,
        ...(resellerId ? { resellerId } : {}),
      },
    });

    // Notify the admin on the system WhatsApp number (best-effort, never blocks).
    notifyAdminNewSignup({ name, email, username: finalUsername }).catch((e) =>
      console.error('Failed to notify admin of new signup:', e),
    );

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
