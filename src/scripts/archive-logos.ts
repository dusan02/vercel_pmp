import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import https from 'https';

const prisma = new PrismaClient();
const LOGO_DIR = path.join(process.cwd(), 'public', 'logos');

/** Download image from URL and save to destination */
async function downloadImage(url: string, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(dest);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(true);
        });
      } else {
        // Clearbit sometimes returns 404 if it doesn't have the logo
        resolve(false);
      }
    }).on('error', (err) => {
      console.error(`Error downloading ${url}:`, err.message);
      resolve(false);
    });
  });
}

async function main() {
  console.log('--- Starting Logo Archiving Script ---');
  
  // Ensure logos directory exists
  if (!fs.existsSync(LOGO_DIR)) {
    console.log(`Creating directory: ${LOGO_DIR}`);
    fs.mkdirSync(LOGO_DIR, { recursive: true });
  }

  // Get all tickers that have a website URL
  const tickers = await prisma.ticker.findMany({
    where: { 
      websiteUrl: { not: null },
      // Optional: only fetch if logoUrl is null or not already a local path
      OR: [
        { logoUrl: null },
        { NOT: { logoUrl: { startsWith: '/logos/' } } }
      ]
    }
  });

  console.log(`Found ${tickers.length} tickers that need high-res logos.`);

  let successCount = 0;
  let failCount = 0;

  for (const ticker of tickers) {
    const url = ticker.websiteUrl;
    if (!url) continue;

    // Clean domain for Clearbit
    const domain = url
      .replace(/^https?:\/\/(www\.)?/, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0];

    if (!domain || domain.length < 3) continue;

    const clearbitUrl = `https://logo.clearbit.com/${domain}?size=512`;
    const fileName = `${ticker.symbol.toLowerCase()}.png`;
    const destPath = path.join(LOGO_DIR, fileName);

    console.log(`[${ticker.symbol}] Fetching: ${domain}...`);
    
    try {
      const success = await downloadImage(clearbitUrl, destPath);
      
      if (success) {
        // Update database to point to the local file
        await prisma.ticker.update({
          where: { symbol: ticker.symbol },
          data: { logoUrl: `/logos/${fileName}` }
        });
        console.log(`  ✓ Saved to /logos/${fileName}`);
        successCount++;
      } else {
        console.log(`  ✗ Clearbit logo not found for ${domain}`);
        failCount++;
      }
    } catch (err) {
      console.error(`  ! Error processing ${ticker.symbol}:`, err);
      failCount++;
    }
    
    // Tiny delay to be nice to the API
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n--- Archiving Completed ---');
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

main()
  .catch((e) => {
    console.error('Fatal error in script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
