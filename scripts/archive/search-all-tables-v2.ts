import { PrismaClient } from '@prisma/client';

async function searchTables() {
  const prisma = new PrismaClient();
  const search = 'MNDT';

  try {
    // Get all table names using raw query
    const result = await prisma.$queryRaw<any[]>`SELECT name FROM sqlite_master WHERE type='table'`;
    const tables = result.map(r => r.name).filter(name => !name.startsWith('_'));

    console.log(`Searching for "${search}" in tables: ${tables.join(', ')}`);

    for (const table of tables) {
      try {
        // Try to query by symbol or ticker
        const records = await (prisma as any)[table.charAt(0).toLowerCase() + table.slice(1)].findMany({
          where: {
            OR: [
              { symbol: search },
              { ticker: search }
            ]
          },
          take: 5
        });
        if (records.length > 0) {
          console.log(`✅ Found "${search}" in table: ${table}`);
          console.log(JSON.stringify(records, null, 2));
        }
      } catch (e) {
        // Some tables might not have symbol/ticker fields
      }
    }
  } catch (e) {
    console.error('Error searching tables:', e);
  } finally {
    await prisma.$disconnect();
  }
}

searchTables();
