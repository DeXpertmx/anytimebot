
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Buscar usuarios admin
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, email: true, name: true, role: true }
  });
  
  console.log('\n📋 Usuarios con rol ADMIN:');
  if (admins.length === 0) {
    console.log('❌ No hay usuarios con rol ADMIN');
  } else {
    admins.forEach(admin => {
      console.log(`✅ ${admin.email} (${admin.name || 'Sin nombre'})`);
    });
  }
  
  // Listar todos los usuarios
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  
  console.log('\n📋 Últimos 10 usuarios registrados:');
  allUsers.forEach(user => {
    console.log(`${user.role === 'ADMIN' ? '👑' : '👤'} ${user.email} - Rol: ${user.role}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
