import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // 預留給未來資源載入
    }

    create() {
        // 跳轉到主場景
        this.scene.start('MainScene');
    }
}
