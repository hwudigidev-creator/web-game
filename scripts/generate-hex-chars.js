// 生成 hex 字元圖片 (0-9, A-F)
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const chars = '0123456789ABCDEF';
const size = 64;
const fontSize = 52;
const color = '#2a8a2a'; // 駭客綠

const outputDir = path.join(__dirname, '..', 'public', 'effects', 'hex');

// 確保目錄存在
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

for (const char of chars) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // 透明背景
    ctx.clearRect(0, 0, size, size);

    // 設定字型（使用等寬字體）
    ctx.font = `bold ${fontSize}px "Courier New", monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 繪製字元
    ctx.fillText(char, size / 2, size / 2);

    // 儲存 PNG
    const buffer = canvas.toBuffer('image/png');
    const filename = path.join(outputDir, `${char}.png`);
    fs.writeFileSync(filename, buffer);
    console.log(`Generated: ${filename}`);
}

console.log('Done! Generated 16 hex character images.');
