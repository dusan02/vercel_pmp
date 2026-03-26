import fs from 'fs';
import path from 'path';

function searchInFile(filepath: string, target: string) {
  if (!fs.existsSync(filepath)) return false;
  const stats = fs.statSync(filepath);
  if (stats.isDirectory()) return false;
  
  const buffer = fs.readFileSync(filepath);
  const index = buffer.indexOf(target);
  if (index !== -1) {
    console.log(`✅ Found "${target}" in ${filepath} at offset ${index}`);
    return true;
  }
  return false;
}

const target = 'MNDT';
const searchDirs = [
  'd:/Projects/Vercel_PMP/pmp_prod',
  'd:/Projects/Vercel_PMP/pmp_prod/prisma',
  'd:/Projects/Vercel_PMP/pmp_prod/prisma/data',
  'd:/Projects/Vercel_PMP/pmp_prod/data'
];

for (const dir of searchDirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.db')) {
      searchInFile(path.join(dir, file), target);
    }
  }
}
