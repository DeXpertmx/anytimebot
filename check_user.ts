import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUser() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      bookingPages: {
        select: {
          id: true,
          title: true,
          slug: true,
          isActive: true,
        }
      }
    }
  });

  console.log('All users:');
  console.log(JSON.stringify(users, null, 2));
}

checkUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
