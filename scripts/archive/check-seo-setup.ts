/**
 * Skript na kontrolu SEO nastavení pre Google indexovanie
 */

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://premarketprice.com';

async function checkSEO() {
  console.log('🔍 Kontrola SEO nastavení pre Google indexovanie...\n');

  const checks = {
    sitemap: false,
    robots: false,
    sitemapAccessible: false,
    robotsAccessible: false,
  };

  try {
    // 1. Kontrola sitemap.ts
    console.log('1. Kontrola sitemap.ts...');
    const fs = require('fs');
    const path = require('path');
    const sitemapPath = path.join(process.cwd(), 'src/app/sitemap.ts');
    
    if (fs.existsSync(sitemapPath)) {
      const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');
      if (sitemapContent.includes('MetadataRoute.Sitemap')) {
        console.log('   ✅ sitemap.ts existuje a je správne nakonfigurovaný');
        checks.sitemap = true;
      } else {
        console.log('   ⚠️  sitemap.ts existuje, ale môže byť nesprávne nakonfigurovaný');
      }
    } else {
      console.log('   ❌ sitemap.ts neexistuje');
    }

    // 2. Kontrola robots.txt
    console.log('\n2. Kontrola robots.txt...');
    const robotsPath = path.join(process.cwd(), 'public/robots.txt');
    
    if (fs.existsSync(robotsPath)) {
      const robotsContent = fs.readFileSync(robotsPath, 'utf-8');
      if (robotsContent.includes('Sitemap:')) {
        console.log('   ✅ robots.txt existuje a obsahuje odkaz na sitemap');
        checks.robots = true;
      } else {
        console.log('   ⚠️  robots.txt existuje, ale neobsahuje odkaz na sitemap');
      }
    } else {
      console.log('   ❌ robots.txt neexistuje');
    }

    // 3. Kontrola dostupnosti sitemap (ak je server spustený)
    console.log('\n3. Kontrola dostupnosti sitemap.xml...');
    try {
      const response = await fetch(`${baseUrl}/sitemap.xml`);
      if (response.ok) {
        console.log(`   ✅ Sitemap je dostupný na ${baseUrl}/sitemap.xml`);
        checks.sitemapAccessible = true;
      } else {
        console.log(`   ⚠️  Sitemap nie je dostupný (HTTP ${response.status})`);
      }
    } catch (error) {
      console.log(`   ⚠️  Sitemap nie je dostupný (server možno nie je spustený)`);
    }

    // 4. Kontrola dostupnosti robots.txt
    console.log('\n4. Kontrola dostupnosti robots.txt...');
    try {
      const response = await fetch(`${baseUrl}/robots.txt`);
      if (response.ok) {
        console.log(`   ✅ robots.txt je dostupný na ${baseUrl}/robots.txt`);
        checks.robotsAccessible = true;
      } else {
        console.log(`   ⚠️  robots.txt nie je dostupný (HTTP ${response.status})`);
      }
    } catch (error) {
      console.log(`   ⚠️  robots.txt nie je dostupný (server možno nie je spustený)`);
    }

    // 5. Kontrola layout.tsx pre Google verification
    console.log('\n5. Kontrola Google verification v layout.tsx...');
    const layoutPath = path.join(process.cwd(), 'src/app/layout.tsx');
    
    if (fs.existsSync(layoutPath)) {
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
      if (layoutContent.includes('verification:') && !layoutContent.includes('// verification:')) {
        console.log('   ✅ Google verification je nakonfigurovaný');
      } else if (layoutContent.includes('// verification:')) {
        console.log('   ⚠️  Google verification je zakomentovaný - potrebujete ho odkomentovať a pridať kód');
      } else {
        console.log('   ⚠️  Google verification nie je nakonfigurovaný');
      }
    }

    // Zhrnutie
    console.log('\n' + '='.repeat(50));
    console.log('📊 ZHRNUTIE:');
    console.log('='.repeat(50));
    console.log(`Sitemap.ts: ${checks.sitemap ? '✅' : '❌'}`);
    console.log(`Robots.txt: ${checks.robots ? '✅' : '❌'}`);
    console.log(`Sitemap dostupný: ${checks.sitemapAccessible ? '✅' : '⚠️'}`);
    console.log(`Robots.txt dostupný: ${checks.robotsAccessible ? '✅' : '⚠️'}`);
    
    if (checks.sitemap && checks.robots) {
      console.log('\n✅ Základné SEO nastavenia sú v poriadku!');
      console.log('\n📋 Ďalšie kroky:');
      console.log('1. Pridajte Google verification kód do layout.tsx');
      console.log('2. Vytvorte Google Search Console účet');
      console.log('3. Overte vlastníctvo stránky');
      console.log('4. Odoslajte sitemap do Google Search Console');
    } else {
      console.log('\n⚠️  Niektoré SEO nastavenia potrebujú opravu');
    }

  } catch (error) {
    console.error('❌ Chyba pri kontrole:', error);
  }
}

checkSEO();
