/**
 * Regenerates all brand assets from docs/brand/logo-src.jpg (Gemini render).
 *   npx tsx scripts/generate-brand-assets.ts
 *
 * Outputs:
 *   public/brand-mark.png        — bull icon, transparent bg (light headers)
 *   public/brand-mark-light.png  — white silhouette variant (dark headers)
 *   public/icon-512.png / icon-192.png / apple-touch-icon.png — white bg
 *   public/favicon.png           — 64px icon
 *   public/og-image.png          — 1200x630 social card
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(DIR, '../docs/brand/logo-src.jpg');
const OUT = path.resolve(DIR, '../public');

// JPEG artifacts make "white" noisy — alpha = distance from white.
async function whiteToAlpha(img: sharp.Sharp): Promise<Buffer> {
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const l = Math.max(data[i], data[i + 1], data[i + 2]);
    if (l >= 242) data[i + 3] = 0;
    else if (l > 218) data[i + 3] = Math.round((242 - l) * 10.6);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

// Dark bull + light-blue bars → light silhouette for dark backgrounds.
async function toLightSilhouette(pngAlpha: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(pngAlpha).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3];
    if (a === 0) continue;
    const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (l < 90) { // dark navy bull → soft white
      data[i] = 232; data[i + 1] = 236; data[i + 2] = 245;
    } else { // blue bars → lighter blue
      data[i] = Math.min(255, Math.round(data[i] * 1.15 + 60));
      data[i + 1] = Math.min(255, Math.round(data[i + 1] * 1.15 + 60));
      data[i + 2] = 245;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

async function main() {
  const src = sharp(SRC).rotate();
  const meta = await src.metadata();
  const W = meta.width!, H = meta.height!;

  // Bull + bars occupy the upper ~65%; wordmark sits below. Cut it off,
  // then trim white margins for a tight mark.
  const cropped = await sharp(SRC)
    .rotate()
    .extract({ left: 0, top: Math.round(H * 0.05), width: W, height: Math.round(H * 0.575) })
    .png()
    .toBuffer();
  const markJpeg = await sharp(cropped).trim({ threshold: 30 }).png().toBuffer();

  const markAlpha = await whiteToAlpha(sharp(markJpeg));
  const m = await sharp(markAlpha).metadata();
  console.log('brand-mark', m.width, 'x', m.height);

  await sharp(markAlpha).resize(512, 512, { fit: 'inside' }).png().toFile(`${OUT}/brand-mark.png`);
  await sharp(await toLightSilhouette(markAlpha)).resize(512, 512, { fit: 'inside' }).png().toFile(`${OUT}/brand-mark-light.png`);
  await sharp(markAlpha).resize(64, 64, { fit: 'inside' }).png().toFile(`${OUT}/favicon.png`);

  // App icons: solid white background (iOS ignores alpha → would go black).
  for (const [file, px] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]] as const) {
    const icon = await sharp(markAlpha).resize(Math.round(px * 0.82), Math.round(px * 0.82), { fit: 'inside' }).png().toBuffer();
    await sharp({ create: { width: px, height: px, channels: 4, background: '#ffffff' } })
      .composite([{ input: icon, gravity: 'center' }]).png().toFile(`${OUT}/${file}`);
    console.log('wrote', file);
  }

  // OG image: full lockup (bull + wordmark) on clean white card.
  const lockup = await sharp(await sharp(SRC).rotate().png().toBuffer()).trim({ threshold: 30 }).resize({ height: 470 }).png().toBuffer();
  const lm = await sharp(lockup).metadata();
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#f8fafc' } })
    .composite([{ input: lockup, left: Math.round((1200 - lm.width!) / 2), top: Math.round((630 - lm.height!) / 2) }])
    .png().toFile(`${OUT}/og-image.png`);
  console.log('wrote og-image.png + favicon.png + brand-mark*.png');
}
main();
