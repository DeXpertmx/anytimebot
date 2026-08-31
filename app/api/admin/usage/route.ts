
import { NextResponse } from 'next/server';
import { requireAdmin, estimateCosts } from '@/lib/admin';
import { prisma } from '@/lib/db';
export const dynamic = 'force-dynamic';


export async function GET() {
  try {
    await requireAdmin();
    
    const users = await prisma.user.findMany({
      include: {
        usage: true,
      },
      orderBy: {
        usage: {
          aiInteractions: 'desc',
        },
      },
    });
    
    const usage = users.map((user) => {
      const aiInteractions = user.usage?.aiInteractions || 0;
      const videoMinutes = user.usage?.videoMinutes || 0;
      const whatsappMessages = user.usage?.whatsappMessages || 0;
      
      const costs = estimateCosts({ aiInteractions, videoMinutes });
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        aiInteractions,
        videoMinutes,
        whatsappMessages,
        estimatedCost: costs.total,
        isAbnormal: aiInteractions >= 1000 || videoMinutes >= 500 || whatsappMessages >= 2000,
      };
    });
    
    return NextResponse.json({ usage });
  } catch (error: any) {
    console.error('Admin usage API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch usage' },
      { status: error.message === 'Unauthorized: Admin access required' ? 403 : 500 }
    );
  }
}
