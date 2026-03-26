import { PrismaClient } from '@prisma/client';

async function listAllTables() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$queryRaw<any[]>`SELECT name FROM sqlite_master WHERE type='table'`;
    console.log('All Tables in Database:');
    console.log(result.map(r => r.name).join(', '));
    
    for (const row of result) {
      const columns = await prisma.$queryRawUnsafe<any[]>(`PRAGMA table_info("${row.name}")`);
      console.log(`Table: ${row.name}`);
      console.log(`  Columns: ${columns.map(c => c.name).join(', ')}`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

listAllTables();
