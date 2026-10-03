import sharp from 'sharp';
const D = '/Users/dusanbaran/Desktop/Projects/PMP';
const SIZE = 800, MARK_W = 600;

async function compose(bg: sharp.Sharp | string, markFile: string, out: string) {
  const mark = await sharp(`${D}/public/${markFile}`).resize(MARK_W, null).png().toBuffer();
  const m = await sharp(mark).metadata();
  const canvas = typeof bg === 'string'
    ? sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: bg } })
    : bg;
  await canvas.composite([{ input: mark, left: Math.round((SIZE - m.width!) / 2), top: Math.round((SIZE - m.height!) / 2) }])
    .png().toFile(`${D}/docs/brand/${out}`);
  console.log('wrote', out);
}

async function main() {
  // A: navy bull on white — matches OG card / favicon
  await compose('#ffffff', 'brand-mark.png', 'avatar-white.png');
  // B: white silhouette on flat navy — dark-mode aesthetic
  await compose('#0f172a', 'brand-mark-light.png', 'avatar-navy.png');
  // C: light mark on dark gradient (OG-card vibe)
  const grad = Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e293b"/><stop offset="0.5" stop-color="#0f172a"/><stop offset="1" stop-color="#020617"/>
    </linearGradient></defs><rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/></svg>`);
  await compose(sharp(grad), 'brand-mark-light.png', 'avatar-gradient.png');
}
main();
