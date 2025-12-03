import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../public/icons');
const sourceIcon = join(iconsDir, 'icon.png');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  console.log('🎨 開始生成 PWA 圖示...\n');

  for (const size of sizes) {
    const outputPath = join(iconsDir, `icon-${size}x${size}.png`);

    await sharp(sourceIcon)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 17, g: 17, b: 17, alpha: 1 } // #111111
      })
      .png()
      .toFile(outputPath);

    console.log(`✓ icon-${size}x${size}.png`);
  }

  console.log('\n✅ 所有圖示已生成完成！');
}

generateIcons().catch(console.error);
