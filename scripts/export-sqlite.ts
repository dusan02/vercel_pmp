import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function exportData() {
  console.log('🔄 Exporting SQLite data...');
  const data: any = {};
  
  // Read all tables
  data.tickers = await prisma.ticker.findMany();
  data.sessionPrices = await prisma.sessionPrice.findMany();
  data.dailyRefs = await prisma.dailyRef.findMany();
  data.moverEvents = await prisma.moverEvent.findMany();
  data.users = await prisma.user.findMany();
  data.accounts = await prisma.account.findMany();
  data.sessions = await prisma.session.findMany();
  
  const outPath = path.join(process.cwd(), 'sqlite-export.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`✅ Exported to ${outPath}`);
}

exportData().catch(console.error).finally(() => prisma.$disconnect());
