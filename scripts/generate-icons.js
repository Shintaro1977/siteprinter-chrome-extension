import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'assets', 'icons');

// SVG icon template - document/pages icon
const createSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 640 640">
  <!-- Background with rounded corners -->
  <rect width="640" height="640" rx="120" fill="#0000FF"/>

  <!-- Left page (larger, taller) -->
  <rect x="145" y="96" width="145" height="448" rx="4" fill="white"/>

  <!-- Right page (smaller, shorter) -->
  <rect x="354" y="96" width="145" height="312" rx="4" fill="white"/>
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
