
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('❌ Debes proporcionar un email');
    console.log('Uso: yarn tsx --require dotenv/config scripts/make-admin.ts <email>');
    process.exit(1);
  }
  
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true }
  });
  
  if (!user) {
    console.error(`❌ No se encontró usuario con email: ${email}`);
    process.exit(1);
  }
  
  if (user.role === 'ADMIN') {
    console.log(`✅ ${email} ya es ADMIN`);
    return;
  }
  
  await prisma.user.update({
    where: { email },
    data: { role: 'ADMIN' }
  });
  
  console.log(`\n✅ Usuario actualizado a ADMIN:`);
  console.log(`   Email: ${email}`);
  console.log(`   Nombre: ${user.name || 'Sin nombre'}`);
  console.log(`\n🎯 Ahora puedes acceder al panel de admin en: https://anytimebot.app/admin`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
