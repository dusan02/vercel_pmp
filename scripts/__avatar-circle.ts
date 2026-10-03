import sharp from 'sharp';
const D = '/Users/dusanbaran/Desktop/Projects/PMP';
const SIZE = 800, R = 360, STROKE = 12;

async function toBlack(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] === 0) continue;
    data[i] = 17; data[i + 1] = 17; data[i + 2] = 20; // near-black
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

async function main() {
  const mark = await toBlack(await sharp(`${D}/public/brand-mark.png`).png().toBuffer());
  const sized = await sharp(mark).resize(560, null).png().toBuffer();
  const m = await sharp(sized).metadata();
  const ring = Buffer.from(`<svg width="${SIZE}" height="${SIZE}">
    <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="white" stroke="#111114" stroke-width="${STROKE}"/></svg>`);
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: '#ffffff' } })
    .composite([
      { input: Buffer.from(await sharp(ring).png().toBuffer()) },
      { input: sized, left: Math.round((SIZE - m.width!) / 2), top: Math.round((SIZE - m.height!) / 2) },
    ]).png().toFile(`${D}/docs/brand/avatar-circle.png`);
  console.log('wrote avatar-circle.png');
}
main();
