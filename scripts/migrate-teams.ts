/**
 * Migration script to add TEAMS to VideoProvider enum
 * 
 * Usage:
 *   DATABASE_URL="your_database_url" npx tsx scripts/migrate-teams.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting migration: Add TEAMS to VideoProvider enum...\n');

  try {
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL environment variable is not set');
      console.log('\nUsage:');
      console.log('  DATABASE_URL="your_database_url" npx tsx scripts/migrate-teams.ts');
      process.exit(1);
    }

    // Execute raw SQL to add TEAMS to the enum
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum 
          WHERE enumlabel = 'TEAMS' 
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'VideoProvider')
        ) THEN
          ALTER TYPE "VideoProvider" ADD VALUE 'TEAMS';
          RAISE NOTICE 'Added TEAMS to VideoProvider enum';
        ELSE
          RAISE NOTICE 'TEAMS already exists in VideoProvider enum';
        END IF;
      END $$;
    `;

    console.log('✅ Successfully added TEAMS to VideoProvider enum\n');

    // Verify the enum values
    const result = await prisma.$queryRaw`
      SELECT enumlabel FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'VideoProvider')
      ORDER BY enumsortorder;
    `;

    console.log('📋 Current VideoProvider enum values:');
    (result as any[]).forEach((row: any) => {
      console.log(`   - ${row.enumlabel}`);
    });

    console.log('\n✨ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();