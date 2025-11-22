/**
 * Scheduler pre dennú kontrolu a opravu sector/industry údajov
 * Spúšťa sa raz denne o 02:00 UTC (vhodný čas pre databázové operácie)
 */

let schedulerInterval: NodeJS.Timeout | null = null;
let isSchedulerActive = false;
let lastRunDate: string | null = null;

/**
 * Spustí dennú kontrolu sector/industry údajov
 */
async function runSectorIndustryVerification(): Promise<void> {
  try {
    const today = (new Date().toISOString().split('T')[0] || '') as string;

    // Skontroluj, či už dnes bežal
    if (lastRunDate === today) {
      console.log('⏭️ Sector/industry verification already ran today, skipping...');
      return;
    }

    console.log('🔍 Starting daily sector/industry verification...');

    // Import dynamicky, aby sa Prisma načítal len keď je potrebné
    const { prisma } = await import('@/lib/db/prisma');

    // Known correct mappings
    const knownCorrectMappings: { [key: string]: { sector: string; industry: string } } = {
      'NVS': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'AZN': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'GSK': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'SNY': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'PFE': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'MRK': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'NVO': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'TAK': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
      'AMGN': { sector: 'Healthcare', industry: 'Biotechnology' },
      'GILD': { sector: 'Healthcare', industry: 'Biotechnology' },
      'REGN': { sector: 'Healthcare', industry: 'Biotechnology' },
      'VRTX': { sector: 'Healthcare', industry: 'Biotechnology' },
      'BIIB': { sector: 'Healthcare', industry: 'Biotechnology' },
      'MDT': { sector: 'Healthcare', industry: 'Medical Devices' },
      'ABT': { sector: 'Healthcare', industry: 'Medical Devices' },
      'BSX': { sector: 'Healthcare', industry: 'Medical Devices' },
      'ISRG': { sector: 'Healthcare', industry: 'Medical Devices' },
      'ZTS': { sector: 'Healthcare', industry: 'Medical Devices' },
      'TMO': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
      'DHR': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
      'UNH': { sector: 'Healthcare', industry: 'Healthcare Plans' },
      'CVS': { sector: 'Healthcare', industry: 'Healthcare Plans' },
      'CI': { sector: 'Healthcare', industry: 'Healthcare Plans' },
      'HUM': { sector: 'Healthcare', industry: 'Healthcare Plans' },
      'ELV': { sector: 'Healthcare', industry: 'Healthcare Plans' },
    };

    const incorrectPatterns = [
      {
        check: (ticker: string, sector: string | null) => {
          const pharmaTickers = ['NVS', 'AZN', 'GSK', 'SNY', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRK', 'BMY', 'NVO', 'TAK'];
          return pharmaTickers.includes(ticker) && sector === 'Financial Services';
        },
        fix: (ticker: string) => knownCorrectMappings[ticker] || { sector: 'Healthcare', industry: 'Drug Manufacturers' }
      },
      {
        check: (ticker: string, sector: string | null) => {
          const deviceTickers = ['MDT', 'ABT', 'BSX', 'ISRG', 'ZTS'];
          return deviceTickers.includes(ticker) && sector === 'Financial Services';
        },
        fix: (ticker: string) => knownCorrectMappings[ticker] || { sector: 'Healthcare', industry: 'Medical Devices' }
      }
    ];

    const allTickers = await prisma.ticker.findMany({
      where: {
        OR: [
          { sector: { not: null } },
          { industry: { not: null } }
        ]
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
      }
    });

    let fixed = 0;
    let verified = 0;

    for (const ticker of allTickers) {
      const symbol = ticker.symbol;
      const currentSector = ticker.sector;
      const currentIndustry = ticker.industry;

      if (knownCorrectMappings[symbol]) {
        const correct = knownCorrectMappings[symbol];

        if (currentSector !== correct.sector || currentIndustry !== correct.industry) {
          await prisma.ticker.update({
            where: { symbol },
            data: {
              sector: correct.sector,
              industry: correct.industry,
              updatedAt: new Date()
            }
          });
          fixed++;
        } else {
          verified++;
        }
      } else {
        let needsFix = false;
        let fixData: { sector: string; industry: string } | null = null;

        for (const pattern of incorrectPatterns) {
          if (pattern.check(symbol, currentSector)) {
            fixData = pattern.fix(symbol);
            needsFix = true;
            break;
          }
        }

        if (needsFix && fixData) {
          await prisma.ticker.update({
            where: { symbol },
            data: {
              sector: fixData.sector,
              industry: fixData.industry,
              updatedAt: new Date()
            }
          });
          fixed++;
        } else {
          verified++;
        }
      }
    }

    lastRunDate = today;

    console.log(`✅ Sector/industry verification completed: ${verified} verified, ${fixed} fixed`);

  } catch (error) {
    console.error('❌ Error in sector/industry verification:', error);
  }
}

/**
 * Vypočíta čas do ďalšieho spustenia (02:00 UTC)
 */
function getTimeUntilNextRun(): number {
  const now = new Date();
  const nextRun = new Date();
  nextRun.setUTCHours(2, 0, 0, 0); // 02:00 UTC

  // Ak už dnes prešlo 02:00, naplánuj na zajtra
  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  return nextRun.getTime() - now.getTime();
}

/**
 * Spustí scheduler pre dennú kontrolu
 */
export function startSectorIndustryScheduler(): void {
  if (isSchedulerActive) {
    console.log('⚠️ Sector/industry scheduler is already active');
    return;
  }

  console.log('🚀 Starting sector/industry scheduler...');
  isSchedulerActive = true;

  const scheduleNext = () => {
    const msUntilNext = getTimeUntilNextRun();
    const nextRunDate = new Date(Date.now() + msUntilNext);

    console.log(`📅 Next sector/industry verification scheduled for ${nextRunDate.toISOString()}`);

    schedulerInterval = setTimeout(async () => {
      await runSectorIndustryVerification();
      scheduleNext(); // Naplánuj ďalšie spustenie
    }, msUntilNext);
  };

  // Spustí prvý beh okamžite, ak ešte dnes nebežal
  const today = new Date().toISOString().split('T')[0];
  if (lastRunDate !== today) {
    runSectorIndustryVerification().then(() => {
      scheduleNext();
    });
  } else {
    scheduleNext();
  }

  console.log('✅ Sector/industry scheduler started successfully');
}

/**
 * Zastaví scheduler
 */
export function stopSectorIndustryScheduler(): void {
  if (schedulerInterval) {
    clearTimeout(schedulerInterval);
    schedulerInterval = null;
    isSchedulerActive = false;
    console.log('🛑 Sector/industry scheduler stopped');
  }
}

/**
 * Kontrola, či je scheduler aktívny
 */
export function isSectorIndustrySchedulerActive(): boolean {
  return isSchedulerActive;
}

/**
 * Manuálne spustenie kontroly
 */
export async function manualSectorIndustryCheck(): Promise<void> {
  console.log('🔍 Manual sector/industry check triggered');
  await runSectorIndustryVerification();
}

/**
 * Inicializácia scheduleru pri štarte aplikácie
 */
export function initializeSectorIndustryScheduler(): void {
  console.log('🔧 Initializing sector/industry scheduler...');

  startSectorIndustryScheduler();

  // Cleanup pri ukončení aplikácie
  process.on('SIGINT', () => {
    console.log('🛑 Shutting down sector/industry scheduler...');
    stopSectorIndustryScheduler();
  });

  process.on('SIGTERM', () => {
    console.log('🛑 Shutting down sector/industry scheduler...');
    stopSectorIndustryScheduler();
  });
}

