import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'fs';

// 從 package.json 讀取版本號
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// 生成帶版本號的 Service Worker
function generateServiceWorker() {
  const swTemplate = readFileSync('./public/sw.js', 'utf-8');
  // 替換版本號
  const swWithVersion = swTemplate.replace(
    /const CACHE_NAME = ['"].*['"];/,
    `const CACHE_NAME = 'digi-war-v${pkg.version}';`
  );
  return swWithVersion;
}

export default defineConfig({
  base: '/web-game/', // Base URL for GitHub Pages (repo name)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    assetsInlineLimit: 0, // Ensure assets are not inlined as base64
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser']
        }
      }
    }
  },
  server: {
    host: true
  },
  plugins: [
    {
      name: 'generate-sw',
      closeBundle() {
        // 構建完成後生成帶版本號的 sw.js
        const swContent = generateServiceWorker();
        writeFileSync('./dist/sw.js', swContent);
        console.log(`[SW] Generated sw.js with version ${pkg.version}`);
      }
    }
  ]
});
