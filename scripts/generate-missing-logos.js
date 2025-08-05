const fs = require("fs");
const path = require("path");

// Missing logos from console errors
const missingLogos = [
  "cpng-32.webp",
  "cpng-64.webp",
  "mplx-32.webp",
  "mplx-64.webp",
  "peg-32.webp",
  "peg-64.webp",
  "fis-32.webp",
  "fis-64.webp",
  "cmi-32.webp",
  "cmi-64.webp",
];

const logosDir = path.join(__dirname, "..", "public", "logos");

// Create a simple placeholder SVG that can be converted to WebP
const createPlaceholderSVG = (ticker) => {
  const upperTicker = ticker.toUpperCase();
  return `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" fill="#f3f4f6"/>
    <text x="16" y="20" font-family="Arial, sans-serif" font-size="10" font-weight="bold" text-anchor="middle" fill="#6b7280">${upperTicker}</text>
  </svg>`;
};

// Create a larger placeholder SVG for 64px
const createPlaceholderSVG64 = (ticker) => {
  const upperTicker = ticker.toUpperCase();
  return `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" fill="#f3f4f6"/>
    <text x="32" y="40" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#6b7280">${upperTicker}</text>
  </svg>`;
};

console.log("🔧 Generating missing logo placeholders...");

missingLogos.forEach((filename) => {
  const filepath = path.join(logosDir, filename);

  if (!fs.existsSync(filepath)) {
    const ticker = filename.split("-")[0];
    const is64px = filename.includes("-64");

    const svgContent = is64px
      ? createPlaceholderSVG64(ticker)
      : createPlaceholderSVG(ticker);

    // For now, we'll create a simple text file as placeholder
    // In a real implementation, you'd convert SVG to WebP
    const placeholderContent = `<!-- Placeholder for ${ticker} logo -->\n${svgContent}`;

    fs.writeFileSync(filepath, placeholderContent);
    console.log(`✅ Created placeholder for ${filename}`);
  } else {
    console.log(`ℹ️  ${filename} already exists`);
  }
});

console.log("🎉 Missing logo placeholders generated!");
console.log(
  "Note: These are SVG placeholders. For production, convert to WebP format."
);
