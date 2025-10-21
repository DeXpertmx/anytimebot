const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const testUser = await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      name: 'John Doe',
      username: 'johndoe',
      timezone: 'America/New_York',
    },
  });

  console.log('✅ Test user created:', testUser);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
