require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      evolutionApiUrl: true,
      evolutionInstanceName: true,
      whatsappEnabled: true,
      whatsappPhone: true,
    },
  });
  
  console.log('Users in database:');
  console.log(JSON.stringify(users, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
