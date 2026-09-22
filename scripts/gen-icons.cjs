const sharp = require('sharp');

// 64x64 grid logo — same cells/colors as src/app/icon.svg, centered on square
const svg = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="8"  y="16.5" width="14" height="14" rx="3" fill="#34d399"/>
  <rect x="25" y="16.5" width="14" height="14" rx="3" fill="#059669"/>
  <rect x="42" y="16.5" width="14" height="14" rx="3" fill="#f87171"/>
  <rect x="8"  y="33.5" width="14" height="14" rx="3" fill="#7f1d1d"/>
  <rect x="25" y="33.5" width="14" height="14" rx="3" fill="#047857"/>
  <rect x="42" y="33.5" width="14" height="14" rx="3" fill="#dc2626"/>
</svg>`;

const jobs = [
  ['public/icon-512.png', 512],
  ['public/icon-192.png', 192],
  ['public/apple-touch-icon.png', 180],
];

(async () => {
  for (const [out, size] of jobs) {
    await sharp(Buffer.from(svg), { density: 400 })
      .resize(size, size)
      .flatten({ background: '#ffffff' })
      .png()
      .toFile(out);
    console.log('done', out, size);
  }
})();
