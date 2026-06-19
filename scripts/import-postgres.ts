import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function importData() {
  console.log('🔄 Importing JSON data to PostgreSQL...');
  const inPath = path.join(process.cwd(), 'sqlite-export.json');
  if (!fs.existsSync(inPath)) {
    console.error(`❌ Export file not found at ${inPath}`);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  
  try {
    // 1. Tickers
    if (data.tickers?.length) {
      console.log(`Importing ${data.tickers.length} Tickers...`);
      await prisma.ticker.createMany({ data: data.tickers, skipDuplicates: true });
    }

    // 2. Session Prices
    if (data.sessionPrices?.length) {
      console.log(`Importing ${data.sessionPrices.length} SessionPrices...`);
      await prisma.sessionPrice.createMany({ data: data.sessionPrices, skipDuplicates: true });
    }

    // 3. Daily Refs
    if (data.dailyRefs?.length) {
      console.log(`Importing ${data.dailyRefs.length} DailyRefs...`);
      await prisma.dailyRef.createMany({ data: data.dailyRefs, skipDuplicates: true });
    }

    // 4. Mover Events
    if (data.moverEvents?.length) {
      console.log(`Importing ${data.moverEvents.length} MoverEvents...`);
      await prisma.moverEvent.createMany({ data: data.moverEvents, skipDuplicates: true });
    }

    // 5. Auth related
    if (data.users?.length) {
      console.log(`Importing ${data.users.length} Users...`);
      await prisma.user.createMany({ data: data.users, skipDuplicates: true });
    }
    if (data.accounts?.length) {
      console.log(`Importing ${data.accounts.length} Accounts...`);
      await prisma.account.createMany({ data: data.accounts, skipDuplicates: true });
    }
    if (data.sessions?.length) {
      console.log(`Importing ${data.sessions.length} Sessions...`);
      await prisma.session.createMany({ data: data.sessions, skipDuplicates: true });
    }

    console.log('✅ Import finished successfully!');
  } catch (err) {
    console.error('❌ Error during import:', err);
  }
}

importData().catch(console.error).finally(() => prisma.$disconnect());
