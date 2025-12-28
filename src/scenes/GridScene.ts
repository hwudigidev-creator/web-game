import Phaser from 'phaser';
import { TextToGrid, GridTextConfig, PixelData } from '../utils/TextToGrid';
import gridTextConfig from '../config/gridText.json';

interface Cell {
    x: number;
    y: number;
    graphics: Phaser.GameObjects.Rectangle;
    delay: number;
    originalColor: number;
    isText: boolean; // 是否為文字格子
}


export default class GridScene extends Phaser.Scene {
    private cells: Cell[] = [];
    private cols: number = 0;
    private rows: number = 0;
    private cellWidth: number = 10;
    private cellHeight: number = 10;
    private gap: number = 1;
    private isAnimating: boolean = false;
    private isReady: boolean = false; // 進場動畫完成後才能操作
    private textRenderer: TextToGrid;
    private textPixels: Map<string, PixelData[]> = new Map();
    private cursorGlowRadius: number = 4; // 游標光暈半徑（格子數）
    private glowPhase: number = 0; // 游標呼吸動畫相位
    private textBreathPhase: number = 0; // 文字呼吸動畫相位
    private isLoading: boolean = true; // 是否正在載入
    private loadingCells: Set<number> = new Set(); // Loading 文字的格子
    private backgroundImage!: Phaser.GameObjects.Image; // 背景圖參考
    private cubeImage!: Phaser.GameObjects.Image; // 左下角 cube 圖片
    private neroSImage!: Phaser.GameObjects.Image; // 右上角 NeroS 圖片
    private glowImage!: Phaser.GameObjects.Image; // 紫色光暈圖片
    private cubeBaseScale: number = 1; // cube 基礎縮放
    private cubeBaseY: number = 0; // cube 基礎 Y 位置
    private titleBgm!: Phaser.Sound.BaseSound; // 標題背景音樂
    private pendingClickOrigin: { x: number; y: number } | null = null; // 等待載入完成後轉場的點擊位置
    private isPreloadingMain: boolean = false; // 是否正在預載 MainScene 資源

    // RWD 格子大小設定
    private static readonly BASE_CELL_SIZE = 10; // 基準格子大小 (1920px 時)
    private static readonly MIN_CELL_SIZE = 4;   // 最小格子大小
    private static readonly BASE_WIDTH = 1920;   // 基準螢幕寬度

    constructor() {
        super('GridScene');
        this.textRenderer = new TextToGrid();
    }

    preload() {
        // 只預載入 GridScene 自己需要的資源（背景圖和標題 BGM）
        this.load.image('background', 'background.png');
        this.load.image('cube', 'cube.png');
        this.load.image('neros', 'NeroS.png');
        this.load.image('glow', 'glow.png');
        this.load.audio('bgm_title', 'audio/BGM00.mp3');

        // 監聯初始載入進度
        this.load.on('progress', (value: number) => {
            this.updateLoadingProgress(Math.floor(value * 100));
        });
    }

    create() {
        // 設定透明背景，讓 MainScene 可以從消失的格子中露出
        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

        // 先顯示滿版背景圖（在最底層）
        this.createBackground();

        this.calculateGridSize();
        this.createGrid();

        // 先顯示 LOADING 0%
        this.showLoadingText(0);
        this.startEntryAnimation();

        // 開始預載 MainScene 的資源
        this.preloadGameAssets();

        // Click handler - 只有 isReady 時才能觸發
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (!this.isReady || this.isAnimating || this.isPreloadingMain) return;

            // 停止標題 BGM
            if (this.titleBgm && this.titleBgm.isPlaying) {
                this.titleBgm.stop();
            }

            // 開始預載 MainScene 資源，完成後從點擊位置轉場
            this.startMainScenePreload(pointer.x, pointer.y);
        });

        // 滑鼠移動追蹤
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!this.isReady || this.isAnimating) return;
            this.updateCursorGlow(pointer.x, pointer.y);
        });
    }

    update(_time: number, delta: number) {
        if (!this.isReady || this.isAnimating) return;

        // 呼吸動畫 - 緩慢變化光暈強度
        this.glowPhase += delta * 0.002; // 約 3 秒一個週期
        this.textBreathPhase += delta * 0.004; // 文字呼吸約 1.5 秒一個週期

        // 持續更新游標位置的光暈
        const pointer = this.input.activePointer;
        if (pointer) {
            this.updateCursorGlow(pointer.x, pointer.y);
        }

        // 更新文字格子的呼吸效果
        this.updateTextBreath();
    }

    private updateTextBreath() {
        // 呼吸強度 0 ~ 1
        const breathValue = 0.5 + 0.5 * Math.sin(this.textBreathPhase);

        // 文字格子顏色：白色 ~ 淺灰色 (0xffffff ~ 0xcccccc)
        const colorValue = Math.floor(204 + (255 - 204) * breathValue); // 204(0xcc) ~ 255(0xff)
        const textColor = (colorValue << 16) | (colorValue << 8) | colorValue;

        // 陰影高速閃爍（用更快的頻率）
        const flashValue = 0.5 + 0.5 * Math.sin(this.textBreathPhase * 3); // 3倍速閃爍
        const shadowAlpha = breathValue > 0.6 ? flashValue * 0.8 : 0; // 更早觸發，最大 0.8

        // 建立文字格子座標集合，用於檢查陰影是否重疊
        const textCells = new Set<string>();
        this.cells.forEach(cell => {
            if (cell.isText) {
                textCells.add(`${cell.x},${cell.y}`);
            }
        });

        this.cells.forEach(cell => {
            if (cell.isText) {
                // 文字格子：不透明，顏色呼吸（白~淺灰）
                cell.graphics.setFillStyle(textColor);
                cell.graphics.setAlpha(0.95);
            } else {
                // 檢查是否為文字的陰影位置（左上方有文字格子）
                const shadowKey = `${cell.x - 1},${cell.y - 1}`;
                if (textCells.has(shadowKey) && shadowAlpha > 0) {
                    // 藍紫色陰影
                    cell.graphics.setFillStyle(0x8866ff);
                    cell.graphics.setAlpha(shadowAlpha);
                }
            }
        });
    }

    private updateCursorGlow(pointerX: number, pointerY: number) {
        const cursorCol = Math.floor(pointerX / (this.cellWidth + this.gap));
        const cursorRow = Math.floor(pointerY / (this.cellHeight + this.gap));

        // 呼吸效果強度 (0.3 ~ 1.0)
        const breathIntensity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(this.glowPhase));

        // 遍歷所有 cell，計算與游標的距離
        this.cells.forEach(cell => {
            const dx = cell.x - cursorCol;
            const dy = cell.y - cursorRow;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= this.cursorGlowRadius) {
                // 在光暈範圍內 - 混合白色
                const falloff = 1 - (distance / this.cursorGlowRadius);
                const glowStrength = falloff * breathIntensity;

                // 混合原始顏色與白色
                const origR = (cell.originalColor >> 16) & 0xff;
                const origG = (cell.originalColor >> 8) & 0xff;
                const origB = cell.originalColor & 0xff;

                const newR = Math.min(255, Math.floor(origR + (255 - origR) * glowStrength));
                const newG = Math.min(255, Math.floor(origG + (255 - origG) * glowStrength));
                const newB = Math.min(255, Math.floor(origB + (255 - origB) * glowStrength));

                const newColor = (newR << 16) | (newG << 8) | newB;
                cell.graphics.setFillStyle(newColor);
            } else {
                // 不在光暈範圍 - 恢復原色
                cell.graphics.setFillStyle(cell.originalColor);
            }
        });
    }

    private createBackground() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // 時間軸：紫光閃爍 0.5 秒 → 背景變亮 1 秒 → 角色進場 1 秒
        const glowFlashDuration = 500;   // 紫光閃爍
        const bgFadeDuration = 1000;     // 背景變亮
        const characterEntranceDuration = 1000; // 角色進場

        // 滿版背景圖，cover 模式
        this.backgroundImage = this.add.image(width / 2, height / 2, 'background');

        // 計算縮放比例讓圖片 cover 整個畫面
        const scaleX = width / this.backgroundImage.width;
        const scaleY = height / this.backgroundImage.height;
        const scale = Math.max(scaleX, scaleY);
        this.backgroundImage.setScale(scale);

        // 確保在最底層
        this.backgroundImage.setDepth(-2);
        // 背景初始為全黑（亮度 0%）
        this.backgroundImage.setTint(0x000000);

        // 右邊 30% 中間加入紫色漸層光暈圖片（在 NeroS 之後，背景之前）
        const glowX = width * 0.7;
        const glowY = height / 2;
        const glowSize = height * 2;

        this.glowImage = this.add.image(glowX, glowY, 'glow');
        this.glowImage.setDepth(-1.6);
        const glowScale = glowSize / this.glowImage.height;
        // 光暈初始很小且透明
        this.glowImage.setScale(0.1);
        this.glowImage.setAlpha(0);

        // === 階段 1：紫光閃爍（0.5 秒，由小到大） ===
        this.tweens.add({
            targets: this.glowImage,
            scaleX: glowScale,
            scaleY: glowScale,
            alpha: 1,
            duration: glowFlashDuration,
            ease: 'Sine.easeOut',
            onComplete: () => {
                // === 階段 2：背景從全黑漸變到 50% 亮度（1 秒） ===
                this.tweens.addCounter({
                    from: 0,
                    to: 128,
                    duration: bgFadeDuration,
                    ease: 'Sine.easeOut',
                    onUpdate: (tween) => {
                        const value = Math.floor(tween.getValue() ?? 0);
                        const tint = (value << 16) | (value << 8) | value;
                        this.backgroundImage.setTint(tint);
                    },
                    onComplete: () => {
                        // === 階段 3：角色進場（1 秒） ===
                        this.startCharacterEntrance(width, height, characterEntranceDuration, glowScale);
                    }
                });
            }
        });

        // NeroS 圖片 - 先建立但隱藏
        const nerosScale = (height * 1.5) / this.textures.get('neros').getSourceImage().height;
        const nerosStartX = width + (height * 1.5 * 0.5);

        this.neroSImage = this.add.image(nerosStartX, height / 2, 'neros');
        this.neroSImage.setOrigin(1, 0.5);
        this.neroSImage.setDepth(-1.5);
        this.neroSImage.setScale(nerosScale);
        this.neroSImage.setTint(0xbfbfbf);
        this.neroSImage.setAlpha(0);

        // cube 圖片 - 先建立但隱藏
        const cubeScale = (height * 0.7) / this.textures.get('cube').getSourceImage().height;
        const cubeStartX = -height * 0.7 * 0.5;

        this.cubeImage = this.add.image(cubeStartX, height, 'cube');
        this.cubeImage.setOrigin(0, 1);
        this.cubeImage.setDepth(-1);
        this.cubeImage.setScale(cubeScale);
        this.cubeImage.setAlpha(0);

        this.cubeBaseScale = cubeScale;
        this.cubeBaseY = height;
    }

    private startCharacterEntrance(width: number, height: number, duration: number, glowScale: number) {
        const nerosScale = (height * 1.5) / this.textures.get('neros').getSourceImage().height;
        const nerosTargetX = width;

        // NeroS 從右側滑入並淡入
        this.tweens.add({
            targets: this.neroSImage,
            x: nerosTargetX,
            alpha: 1,
            duration: duration,
            ease: 'Sine.easeOut',
            onComplete: () => {
                // 進場完成後開始呼吸縮放動畫
                this.tweens.add({
                    targets: this.neroSImage,
                    scaleX: nerosScale * 1.015,
                    scaleY: nerosScale * 1.015,
                    duration: 2000,
                    ease: 'Sine.easeInOut',
                    yoyo: true,
                    repeat: -1
                });
            }
        });

        const cubeScale = (height * 0.7) / this.textures.get('cube').getSourceImage().height;
        const cubeTargetX = width * 0.1;

        // cube 從左側滑入並淡入
        this.tweens.add({
            targets: this.cubeImage,
            x: cubeTargetX,
            alpha: 1,
            duration: duration,
            ease: 'Sine.easeOut',
            onComplete: () => {
                // 進場完成後開始呼吸縮放動畫
                this.tweens.add({
                    targets: this.cubeImage,
                    scaleX: cubeScale * 1.03,
                    scaleY: cubeScale * 1.03,
                    duration: 2000,
                    ease: 'Sine.easeInOut',
                    yoyo: true,
                    repeat: -1
                });

                // 進場完成後開始上下飄動動畫
                this.tweens.add({
                    targets: this.cubeImage,
                    y: height - (height * 0.02),
                    duration: 2500,
                    ease: 'Sine.easeInOut',
                    yoyo: true,
                    repeat: -1
                });

                // 光暈開始不規則電流閃爍
                const flicker = () => {
                    const randomScale = glowScale * (1 + Math.random() * 0.15);
                    const randomAlpha = 0.6 + Math.random() * 0.4;
                    const randomDuration = 30 + Math.random() * 120;

                    this.tweens.add({
                        targets: this.glowImage,
                        scaleX: randomScale,
                        scaleY: randomScale,
                        alpha: randomAlpha,
                        duration: randomDuration,
                        ease: 'Sine.easeInOut',
                        onComplete: flicker
                    });
                };
                flicker();
            }
        });
    }

    private showLoadingText(percent: number) {
        // 清除之前的文字格子 - 恢復成普通格子
        this.loadingCells.forEach(idx => {
            if (this.cells[idx]) {
                this.cells[idx].originalColor = 0x222222;
                this.cells[idx].isText = false;
                this.cells[idx].graphics.setFillStyle(0x222222);
                this.cells[idx].graphics.setAlpha(0.2);
            }
        });
        this.loadingCells.clear();

        // 顯示 LOADING XX%（位置稍微往上）
        const text = `LOADING ${percent}%`;
        const pixels = this.textRenderer.textToPixels(
            {
                id: 'loading',
                text: text,
                letterSpacing: 2,
                position: { x: 0.5, y: 0.45 },
                color: '#ffffff'
            },
            this.cols,
            this.rows
        );

        // 套用文字到格子
        pixels.forEach(pixel => {
            const idx = pixel.gridY * this.cols + pixel.gridX;
            if (this.cells[idx]) {
                this.cells[idx].originalColor = pixel.color;
                this.cells[idx].isText = true;
                this.cells[idx].graphics.setFillStyle(pixel.color);
                this.cells[idx].graphics.setAlpha(0.95);
                this.loadingCells.add(idx);
            }
        });

        // 計算進度條位置（LOADING 文字下方 3 格，3 行高）
        const charHeight = 7; // 字體高度
        const centerY = Math.floor(this.rows * 0.45);
        const progressBarStartY = centerY + Math.floor(charHeight / 2) + 3; // 文字底部 + 3 格
        const progressBarHeight = 3; // 3 行高

        // 進度條左右各留 2 格
        const barStartX = 2;
        const barEndX = this.cols - 2;
        const barWidth = barEndX - barStartX;

        // 計算進度條填充的格子數（barWidth = 100%）
        const filledCols = Math.floor((percent / 100) * barWidth);

        // 繪製進度條
        for (let row = 0; row < progressBarHeight; row++) {
            const y = progressBarStartY + row;
            if (y >= this.rows) continue;

            for (let i = 0; i < filledCols; i++) {
                const x = barStartX + i;
                const idx = y * this.cols + x;
                if (this.cells[idx]) {
                    this.cells[idx].originalColor = 0xffffff;
                    this.cells[idx].isText = true;
                    this.cells[idx].graphics.setFillStyle(0xffffff);
                    this.cells[idx].graphics.setAlpha(0.95);
                    this.loadingCells.add(idx);
                }
            }
        }
    }

    private updateLoadingProgress(percent: number) {
        if (this.isLoading) {
            this.showLoadingText(percent);
        }
    }

    private preloadGameAssets() {
        // 初始載入只是為了顯示啟動畫面，直接完成
        this.onLoadingComplete();
    }

    private startMainScenePreload(clickX: number, clickY: number) {
        // 記錄點擊位置，載入完成後從這裡開始轉場
        this.pendingClickOrigin = { x: clickX, y: clickY };
        this.isPreloadingMain = true;
        this.isReady = false; // 載入中不能再點擊

        // 先清除「PRESS TO START」的文字格子
        this.textPixels.forEach((pixels) => {
            pixels.forEach(pixel => {
                const idx = pixel.gridY * this.cols + pixel.gridX;
                if (this.cells[idx]) {
                    this.cells[idx].originalColor = 0x222222;
                    this.cells[idx].isText = false;
                    this.cells[idx].graphics.setFillStyle(0x222222);
                    this.cells[idx].graphics.setAlpha(0.2);
                }
            });
        });
        this.textPixels.clear();

        // 顯示 Loading 0%
        this.showLoadingText(0);

        // 移除舊的進度監聽器，加入新的
        this.load.off('progress');
        this.load.on('progress', (value: number) => {
            this.showLoadingText(Math.floor(value * 100));
        });

        this.load.on('complete', () => {
            this.onMainScenePreloadComplete();
        });

        // 預載入角色序列圖
        this.load.image('char_idle_1', 'sprites/character/IDEL01.png');
        this.load.image('char_idle_2', 'sprites/character/IDEL02.png');
        this.load.image('char_run_1', 'sprites/character/RUN01.png');
        this.load.image('char_run_2', 'sprites/character/RUN02.png');
        this.load.image('char_attack_1', 'sprites/character/ATTACK01.png');
        this.load.image('char_attack_2', 'sprites/character/ATTACK02.png');
        this.load.image('char_hurt', 'sprites/character/HURT01.png');

        // 預載入背景音樂
        this.load.audio('bgm_game_01', 'audio/BGM01.mp3');
        this.load.audio('bgm_game_02', 'audio/BGM02.mp3');

        // 預載入技能特效紋理
        this.load.image('effect_circle', 'effects/circle.png');
        this.load.image('effect_circle_line', 'effects/circle_line.png');
        this.load.image('effect_line', 'effects/line.png');
        this.load.image('effect_soulwave', 'effects/soulwave.png');
        this.load.image('effect_shield', 'effects/shield.png');
        const sectorAngles = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 360];
        for (const angle of sectorAngles) {
            this.load.image(`effect_sector_${angle}`, `effects/sector_${angle}.png`);
        }

        // 預載入技能圖示
        const skillIconPrefixes = ['A', 'B', 'C'];
        for (const prefix of skillIconPrefixes) {
            for (let i = 0; i <= 5; i++) {
                this.load.image(`skill_icon_${prefix}${i.toString().padStart(2, '0')}`, `icons/skills/${prefix}${i.toString().padStart(2, '0')}.png`);
            }
        }
        // P 系列（被動技能）
        for (let i = 1; i <= 4; i++) {
            this.load.image(`skill_icon_P${i.toString().padStart(2, '0')}`, `icons/skills/P${i.toString().padStart(2, '0')}.png`);
        }

        // 開始載入
        this.load.start();
    }

    private onMainScenePreloadComplete() {
        this.isPreloadingMain = false;

        // 停頓 500ms 顯示 100%
        this.time.delayedCall(500, () => {
            // 畫面漸變到全黑（1 秒）
            const fadeOutDuration = 1000;

            // 背景漸變到全黑
            this.tweens.addCounter({
                from: 128, // 當前 50% 亮度
                to: 0,
                duration: fadeOutDuration,
                ease: 'Sine.easeIn',
                onUpdate: (tween) => {
                    const value = Math.floor(tween.getValue() ?? 0);
                    const tint = (value << 16) | (value << 8) | value;
                    this.backgroundImage.setTint(tint);
                }
            });

            // NeroS 漸變消失
            this.tweens.add({
                targets: this.neroSImage,
                alpha: 0,
                duration: fadeOutDuration,
                ease: 'Sine.easeIn'
            });

            // Cube 漸變消失
            this.tweens.add({
                targets: this.cubeImage,
                alpha: 0,
                duration: fadeOutDuration,
                ease: 'Sine.easeIn'
            });

            // 光暈漸變消失
            this.tweens.add({
                targets: this.glowImage,
                alpha: 0,
                duration: fadeOutDuration,
                ease: 'Sine.easeIn'
            });

            // 漸變完成後開始轉場
            this.time.delayedCall(fadeOutDuration, () => {
                if (this.pendingClickOrigin) {
                    const col = Math.floor(this.pendingClickOrigin.x / (this.cellWidth + this.gap));
                    const row = Math.floor(this.pendingClickOrigin.y / (this.cellHeight + this.gap));
                    this.startExitAnimation(col, row);
                    this.pendingClickOrigin = null;
                }
            });
        });
    }

    private onLoadingComplete() {
        this.isLoading = false;

        // 停頓 500ms 顯示 100%
        this.time.delayedCall(500, () => {
            // 清除所有格子的文字狀態，恢復乾淨
            this.cells.forEach(cell => {
                cell.originalColor = 0x222222;
                cell.isText = false;
                cell.graphics.setFillStyle(0x222222);
                cell.graphics.setAlpha(0.2);
            });
            this.loadingCells.clear();

            // 再停頓 300ms 讓畫面空白
            this.time.delayedCall(300, () => {
                // 顯示 PRESS TO START
                this.processTextConfig();

                // 套用文字格子的樣式
                this.textPixels.forEach((pixels) => {
                    pixels.forEach(pixel => {
                        const idx = pixel.gridY * this.cols + pixel.gridX;
                        if (this.cells[idx]) {
                            this.cells[idx].graphics.setFillStyle(pixel.color);
                            this.cells[idx].graphics.setAlpha(0.95);
                        }
                    });
                });

                // 如果進場動畫已完成，設定 isReady
                if (!this.isAnimating) {
                    this.isReady = true;
                }

                // 播放標題 BGM（50% 音量，循環）
                if (this.cache.audio.exists('bgm_title')) {
                    this.titleBgm = this.sound.add('bgm_title', {
                        volume: 0.5,
                        loop: true
                    });
                    this.titleBgm.play();
                }
            });
        });
    }

    private calculateGridSize() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // RWD 計算格子大小
        const scale = Math.min(1, width / GridScene.BASE_WIDTH);
        const cellSize = Math.max(
            GridScene.MIN_CELL_SIZE,
            Math.floor(GridScene.BASE_CELL_SIZE * scale)
        );

        // gap 固定為 1px
        this.gap = 1;

        // 使用正方形格子
        this.cellWidth = cellSize;
        this.cellHeight = cellSize;

        // 根據格子大小計算需要多少格子來填滿螢幕
        this.cols = Math.ceil((width + this.gap) / (cellSize + this.gap));
        this.rows = Math.ceil((height + this.gap) / (cellSize + this.gap));

        // 計算遊戲區域（16:9 比例，置中，保留至少 5% padding）
        const padding = 0.05;
        const availableWidth = width * (1 - padding * 2);
        const availableHeight = height * (1 - padding * 2);

        const gameAspect = 16 / 9;
        const availableAspect = availableWidth / availableHeight;

        let gameWidth: number;
        let gameHeight: number;

        if (availableAspect > gameAspect) {
            // 可用區域較寬，以高度為準
            gameHeight = availableHeight;
            gameWidth = availableHeight * gameAspect;
        } else {
            // 可用區域較高，以寬度為準
            gameWidth = availableWidth;
            gameHeight = availableWidth / gameAspect;
        }

        const gameX = (width - gameWidth) / 2;
        const gameY = (height - gameHeight) / 2;

        // 將遊戲區域邊界存入 registry，供 MainScene 使用
        this.registry.set('gameBounds', {
            x: gameX,
            y: gameY,
            width: gameWidth,
            height: gameHeight
        });
    }

    private createGrid() {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const x = col * (this.cellWidth + this.gap) + this.cellWidth / 2;
                const y = row * (this.cellHeight + this.gap) + this.cellHeight / 2;

                const rect = this.add.rectangle(x, y, this.cellWidth, this.cellHeight, 0x222222);
                rect.setAlpha(0);

                this.cells.push({
                    x: col,
                    y: row,
                    graphics: rect,
                    delay: 0,
                    originalColor: 0x222222,
                    isText: false
                });
            }
        }
    }

    private processTextConfig() {
        // 處理 JSON 設定檔中的所有文字
        this.textPixels = this.textRenderer.processConfig(
            gridTextConfig as GridTextConfig,
            this.cols,
            this.rows
        );

        // 將文字像素套用到對應的 cell
        this.textPixels.forEach((pixels) => {
            pixels.forEach(pixel => {
                const idx = pixel.gridY * this.cols + pixel.gridX;
                if (this.cells[idx]) {
                    this.cells[idx].originalColor = pixel.color;
                    this.cells[idx].isText = true; // 標記為文字格子
                }
            });
        });
    }

    private startEntryAnimation() {
        this.isAnimating = true;

        // Track unvisited cells
        const remaining = new Set<number>();
        for (let i = 0; i < this.cells.length; i++) {
            remaining.add(i);
        }

        const newSeedsPerWave = 20;
        const waveInterval = 50;
        const floodInterval = 10; // 洪水填充每層間隔
        const floodDuration = 200; // 每個種子點洪水填充持續時間
        const floodLayers = Math.floor(floodDuration / floodInterval);
        const timeout = 3000;
        let elapsed = 0;
        let finished = false;

        const getIndex = (x: number, y: number) => y * this.cols + x;
        const getCoord = (idx: number) => ({ x: idx % this.cols, y: Math.floor(idx / this.cols) });

        const animateCell = (idx: number) => {
            const cell = this.cells[idx];
            cell.graphics.setAlpha(1);
            cell.graphics.setFillStyle(0xffffff);
            this.tweens.add({
                targets: cell.graphics,
                fillColor: { from: 0xffffff, to: cell.originalColor },
                alpha: { from: 1, to: 0.2 }, // 80% 透明
                duration: 80,
                ease: 'Linear'
            });
        };

        // 從一個種子點開始圓形填充
        const startFlood = (seedIdx: number) => {
            const { x: seedX, y: seedY } = getCoord(seedIdx);

            // 預計算所有在範圍內的點按距離分組
            const maxRadius = floodLayers;
            const rings: number[][] = [];

            for (let r = 0; r <= maxRadius; r++) {
                rings[r] = [];
            }

            // 檢查周圍所有點，按歐幾里得距離分組
            for (let dy = -maxRadius; dy <= maxRadius; dy++) {
                for (let dx = -maxRadius; dx <= maxRadius; dx++) {
                    const nx = seedX + dx;
                    const ny = seedY + dy;
                    if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const ringIdx = Math.floor(dist);
                        if (ringIdx <= maxRadius) {
                            const nIdx = getIndex(nx, ny);
                            rings[ringIdx].push(nIdx);
                        }
                    }
                }
            }

            // 依序處理每個環
            let layer = 0;
            const processRing = () => {
                if (layer > maxRadius) return;

                rings[layer].forEach(idx => {
                    if (remaining.has(idx)) {
                        remaining.delete(idx);
                        animateCell(idx);
                    }
                });

                layer++;
                if (layer <= maxRadius) {
                    this.time.delayedCall(floodInterval, processRing);
                }
            };

            processRing();
        };

        const processWave = () => {
            if (finished) return;

            if (elapsed >= timeout || remaining.size === 0) {
                this.finishEntry(remaining);
                finished = true;
                return;
            }

            // 挑 50 個新種子點，每個開始洪水填充
            const remainingArr = Array.from(remaining);
            const pickCount = Math.min(newSeedsPerWave, remainingArr.length);

            for (let i = 0; i < pickCount; i++) {
                if (remainingArr.length === 0) break;
                const randIdx = Math.floor(Math.random() * remainingArr.length);
                const cellIdx = remainingArr[randIdx];
                remainingArr.splice(randIdx, 1);

                if (remaining.has(cellIdx)) {
                    startFlood(cellIdx);
                }
            }

            elapsed += waveInterval;

            if (remaining.size > 0 && elapsed < timeout) {
                this.time.delayedCall(waveInterval, processWave);
            } else if (!finished) {
                this.finishEntry(remaining);
                finished = true;
            }
        };

        processWave();
    }

    private finishEntry(remaining: Set<number>) {
        // Instantly show all remaining cells with 80% transparency
        remaining.forEach(idx => {
            const cell = this.cells[idx];
            cell.graphics.setAlpha(0.2); // 80% 透明
            cell.graphics.setFillStyle(cell.originalColor);
        });

        this.time.delayedCall(100, () => {
            this.isAnimating = false;
            // isReady 要等 Loading 完成才設定
            if (!this.isLoading) {
                this.isReady = true;
            }
        });
    }

    private startExitAnimation(originX: number, originY: number) {
        this.isAnimating = true;

        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // 先在背景啟動 MainScene
        this.scene.launch('MainScene');
        this.scene.bringToTop('GridScene');

        // 計算點擊位置的像素座標
        const clickX = originX * (this.cellWidth + this.gap) + this.cellWidth / 2;
        const clickY = originY * (this.cellHeight + this.gap) + this.cellHeight / 2;

        // 發送初始遮罩事件（半徑 0），讓 MainScene 初始隱藏
        this.registry.events.emit('reveal-update', { x: clickX, y: clickY, radius: 0 });

        // 先讓所有格子變成不透明，擋住下方場景
        // 使用黑色作為基底，燃燒效果會從白色開始
        this.cells.forEach(cell => {
            cell.graphics.setFillStyle(0x000000);
            cell.graphics.setAlpha(1);
        });

        // 隱藏 GridScene 的背景圖和角色圖，讓燒開的格子露出 MainScene
        this.backgroundImage.setVisible(false);
        this.cubeImage.setVisible(false);
        this.neroSImage.setVisible(false);
        this.glowImage.setVisible(false);

        // Calculate delay based on actual distance (Euclidean) for true circle
        const timePerUnit = 5;
        let maxDelay = 0;

        this.cells.forEach(cell => {
            const dx = cell.x - originX;
            const dy = cell.y - originY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            cell.delay = Math.floor(distance * timePerUnit);
            if (cell.delay > maxDelay) maxDelay = cell.delay;
        });

        // 計算最大半徑
        const maxRadius = Math.sqrt(
            Math.max(clickX, width - clickX) ** 2 +
            Math.max(clickY, height - clickY) ** 2
        ) + 50;

        // 同步更新 MainScene 的揭露遮罩
        const totalDuration = maxDelay + 150;
        this.tweens.addCounter({
            from: 0,
            to: maxRadius,
            duration: totalDuration,
            ease: 'Linear',
            onUpdate: (tween) => {
                const radius = tween.getValue() ?? 0;
                this.registry.events.emit('reveal-update', { x: clickX, y: clickY, radius });
            }
        });

        // Animate each cell with burning effect
        // 格子燃燒消失後，下方的 MainScene 自然露出
        this.cells.forEach(cell => {
            this.time.delayedCall(cell.delay, () => {
                // 燃燒開始時先設為白色且完全不透明
                cell.graphics.setFillStyle(0xffffff);
                cell.graphics.setAlpha(1);

                // Burning sequence: white -> yellow -> orange -> red -> fade out
                this.tweens.addCounter({
                    from: 0,
                    to: 100,
                    duration: 200,
                    ease: 'Linear',
                    onUpdate: (tween) => {
                        const v = tween.getValue() ?? 0;
                        let color: number;
                        let alpha: number;

                        if (v < 15) {
                            // 白色階段
                            color = 0xffffff;
                            alpha = 1;
                        } else if (v < 30) {
                            // 黃色階段
                            color = 0xffff00;
                            alpha = 1;
                        } else if (v < 50) {
                            // 橘色階段
                            color = 0xff8800;
                            alpha = 1;
                        } else if (v < 70) {
                            // 紅色階段
                            color = 0xff2200;
                            alpha = 1 - ((v - 50) / 50);
                        } else {
                            // 暗紅色階段，淡出
                            color = 0x660000;
                            alpha = 1 - ((v - 50) / 50);
                        }

                        cell.graphics.setFillStyle(color);
                        cell.graphics.setAlpha(Math.max(0, alpha));
                    },
                    onComplete: () => {
                        cell.graphics.setVisible(false);
                    }
                });
            });
        });

        this.time.delayedCall(maxDelay + 200, () => {
            // 通知 MainScene 揭露完成
            this.registry.events.emit('reveal-complete');
            // 動畫結束後停止 GridScene
            this.scene.stop('GridScene');
        });
    }
}
