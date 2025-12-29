import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // 載入技能特效紋理
        this.load.image('effect_circle', 'effects/circle.png');
        this.load.image('effect_circle_line', 'effects/circle_line.png');
        this.load.image('effect_line', 'effects/line.png');

        // 載入各角度扇形紋理
        const sectorAngles = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 360];
        for (const angle of sectorAngles) {
            this.load.image(`effect_sector_${angle}`, `effects/sector_${angle}.png`);
        }

        // 載入衝擊波紋理（靈魂渲染穿透用）
        this.load.image('effect_soulwave', 'effects/soulwave.png');

        // 載入護盾紋理（靈魂統領及相關組合技用）
        this.load.image('effect_shield', 'effects/shield.png');

        // 載入地板 hex 字元紋理（0-9, A-F）
        const hexChars = '0123456789ABCDEF';
        for (const char of hexChars) {
            this.load.image(`hex_${char}`, `effects/hex/${char}.png`);
        }
    }

    create() {
        // 跳轉到主場景
        this.scene.start('MainScene');
    }
}
