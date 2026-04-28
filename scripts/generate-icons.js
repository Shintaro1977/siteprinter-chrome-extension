import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'assets', 'icons');

// SVG icon template - simple printer icon
const createSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6"/>
      <stop offset="100%" style="stop-color:#1d4ed8"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <!-- Camera/Screenshot icon -->
  <g fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <!-- Camera body -->
    <rect x="24" y="44" width="80" height="60" rx="8"/>
    <!-- Lens -->
    <circle cx="64" cy="74" r="18"/>
    <!-- Flash -->
    <path d="M44 44 L48 32 L80 32 L84 44"/>
    <!-- Viewfinder dot -->
    <circle cx="92" cy="54" r="4" fill="white"/>
  </g>
  <!-- Document lines -->
  <g stroke="white" stroke-width="3" opacity="0.6">
    <line x1="40" y1="100" x2="88" y2="100"/>
    <line x1="46" y1="108" x2="82" y2="108"/>
  </g>
</svg>
`;

async function generateIcons() {
  await mkdir(ICONS_DIR, { recursive: true });

  const sizes = [16, 48, 128];

  for (const size of sizes) {
    const svg = createSvg(size);
    const outputPath = join(ICONS_DIR, `icon${size}.png`);

    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Generated: icon${size}.png`);
  }

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
