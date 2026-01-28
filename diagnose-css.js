const http = require('http');

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ body: data, headers: res.headers, statusCode: res.statusCode }));
    }).on('error', reject);
  });
}

async function diagnose() {
  console.log('--- DIAGNOSING CSS ON LOCALHOST:3000 ---');
  try {
    const { body: html, statusCode } = await fetch('http://localhost:3000');
    console.log(`Fetched HTML. Status: ${statusCode}. Length: ${html.length}`);
    
    if (statusCode !== 200) {
      console.error('CRITICAL: Page returned status', statusCode);
    }

    // Extract CSS links
    const linkRegex = /<link[^>]+href="([^"]+\.css[^"]*)"[^>]*>/g;
    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push(match[1]);
    }
    
    console.log('Found CSS links:', links);
    
    if (links.length === 0) {
      console.error('CRITICAL: No CSS links found in HTML!');
    }

    let foundFlex = false;
    let foundPositive = false;
    let foundTable = false;

    for (const link of links) {
      const cssUrl = link.startsWith('http') ? link : `http://localhost:3000${link}`;
      console.log(`Checking CSS: ${cssUrl}`);
      try {
        const { body: css } = await fetch(cssUrl);
        console.log(`  Size: ${css.length} bytes`);
        
        // Checks
        // Simple check for presence of Tailwind utilities
        if (css.includes('display:flex') || css.includes('display: flex')) foundFlex = true;
        // Check for my custom classes
        if (css.includes('.positive')) foundPositive = true;
        
        // Check for table styles
        if (css.includes('table{') || css.includes('table {')) foundTable = true; 
        
        console.log(`  > Contains 'display:flex': ${css.includes('display:flex') || css.includes('display: flex')}`);
        console.log(`  > Contains '.positive': ${css.includes('.positive')}`);
      } catch (e) {
        console.error(`  Failed to fetch CSS: ${e.message}`);
      }
    }

    console.log('--- SUMMARY ---');
    console.log('Tailwind (flex):', foundFlex ? '✅ FOUND' : '❌ MISSING (Tailwind Broken)');
    console.log('Legacy (.positive):', foundPositive ? '✅ FOUND' : '❌ MISSING (Migration Failed)');
    console.log('Tables:', foundTable ? '✅ FOUND' : '⚠️ WARNING (Specific table styles might be missing)');

  } catch (e) {
    console.error('Failed to fetch localhost:3000:', e.message);
  }
}

diagnose();
