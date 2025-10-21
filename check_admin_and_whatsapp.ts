import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAdminAndWhatsApp() {
  try {
    // Check admin user
    const admin = await prisma.user.findUnique({
      where: { email: 'dexpertmx@gmail.com' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        whatsappEnabled: true,
        evolutionApiUrl: true,
        evolutionApiKey: true,
        evolutionInstanceName: true,
      },
    });

    console.log('Admin User:', JSON.stringify(admin, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminAndWhatsApp();
