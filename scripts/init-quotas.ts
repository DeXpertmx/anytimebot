
// Script to initialize quotas for existing users
// Run this once: yarn tsx scripts/init-quotas.ts

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PLAN_CONFIG } from '../lib/plans';

const prisma = new PrismaClient();

async function initializeQuotas() {
  console.log('🚀 Initializing quotas for existing users...');

  const users = await prisma.user.findMany({
    include: {
      quotas: true,
      usage: true,
    },
  });

  console.log(`📊 Found ${users.length} users`);

  let initialized = 0;
  let skipped = 0;

  for (const user of users) {
    if (user.quotas && user.usage) {
      console.log(`⏭️  Skipping ${user.email} - quotas already exist`);
      skipped++;
      continue;
    }

    const plan = user.plan as 'FREE' | 'BASIC' | 'PRO' | 'TEAM' | 'ENTERPRISE';
    const quotas = PLAN_CONFIG[plan]?.quotas;

    if (!quotas) {
      console.log(`⚠️  Unknown plan for ${user.email}: ${plan}`);
      continue;
    }

    // Create quotas
    if (!user.quotas) {
      await prisma.quotas.create({
        data: {
          userId: user.id,
          ...quotas,
        },
      });
    }

    // Create usage
    if (!user.usage) {
      await prisma.usage.create({
        data: {
          userId: user.id,
          aiInteractions: 0,
          videoMinutes: 0,
          whatsappMessages: 0,
          telegramMessages: 0,
          lastResetAt: new Date(),
        },
      });
    }

    console.log(`✅ Initialized ${user.email} (${plan})`);
    initialized++;
  }

  console.log('\n📊 Summary:');
  console.log(`✅ Initialized: ${initialized}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`📝 Total: ${users.length}`);
}

initializeQuotas()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
