/**
 * 生成技能特效 PNG 紋理
 * 執行: npm install canvas && node scripts/generate-effects.js
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/effects');
const SIZE = 256;
const HALF = SIZE / 2;

// 確保輸出目錄存在
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 生成圓形漸層紋理
function generateCircle() {
    const canvas = createCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');

    // 從中心向外的放射漸層
    const gradient = ctx.createRadialGradient(HALF, HALF, 0, HALF, HALF, HALF);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');    // 中心：低透明度
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.25)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.75)');    // 邊緣：高透明度

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(HALF, HALF, HALF, 0, Math.PI * 2);
    ctx.fill();

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'circle.png'), buffer);
    console.log('Generated: circle.png');
}

// 生成扇形漸層紋理
function generateSector(angleDegrees) {
    const canvas = createCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');

    const halfAngle = (angleDegrees / 2) * (Math.PI / 180);

    // 從中心向外的放射漸層
    const gradient = ctx.createRadialGradient(HALF, HALF, 0, HALF, HALF, HALF);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.25)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.75)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(HALF, HALF);
    ctx.arc(HALF, HALF, HALF, -halfAngle, halfAngle);
    ctx.closePath();
    ctx.fill();

    const filename = `sector_${angleDegrees}.png`;
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), buffer);
    console.log(`Generated: ${filename}`);
}

// 生成直線紋理（簡單水平線條，中心亮邊緣暗）
function generateLine() {
    const canvas = createCanvas(SIZE, 64); // 寬 256，高 64
    const ctx = canvas.getContext('2d');

    // 垂直漸層（中心亮，上下邊緣暗）
    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');     // 上邊緣
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');  // 中心最亮
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');     // 下邊緣

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE, 64);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'line.png'), buffer);
    console.log('Generated: line.png');
}

// 主程式
console.log('Generating skill effect textures...\n');

// 生成圓形
generateCircle();

// 生成各種角度的扇形
const sectorAngles = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
for (const angle of sectorAngles) {
    generateSector(angle);
}

// 生成直線
generateLine();

console.log('\nDone! Files saved to:', OUTPUT_DIR);
