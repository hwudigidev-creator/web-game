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
    private titleBgm!: Phaser.Sound.BaseSound; // 標題背景音樂

    // RWD 格子大小設定
    private static readonly BASE_CELL_SIZE = 10; // 基準格子大小 (1920px 時)
    private static readonly MIN_CELL_SIZE = 4;   // 最小格子大小
    private static readonly BASE_WIDTH = 1920;   // 基準螢幕寬度

    constructor() {
        super('GridScene');
        this.textRenderer = new TextToGrid();
    }

    preload() {
        // 預載入背景圖（GridScene 自己用）
        this.load.image('background', 'background.png');

        // 預載入角色序列圖
        this.load.image('char_idle_1', 'sprites/character/IDEL01.png');
        this.load.image('char_idle_2', 'sprites/character/IDEL02.png');
        this.load.image('char_run_1', 'sprites/character/RUN01.png');
        this.load.image('char_run_2', 'sprites/character/RUN02.png');
        this.load.image('char_attack_1', 'sprites/character/ATTACK01.png');
        this.load.image('char_attack_2', 'sprites/character/ATTACK02.png');
        this.load.image('char_hurt', 'sprites/character/HURT01.png');

        // 預載入背景音樂
        this.load.audio('bgm_title', 'audio/BGM00.mp3');
        this.load.audio('bgm_game_01', 'audio/BGM01.mp3');
        this.load.audio('bgm_game_02', 'audio/BGM02.mp3');

        // 預載入技能特效紋理
        this.load.image('effect_circle', 'effects/circle.png');
        this.load.image('effect_line', 'effects/line.png');
        const sectorAngles = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
        for (const angle of sectorAngles) {
            this.load.image(`effect_sector_${angle}`, `effects/sector_${angle}.png`);
        }

        // 監聽載入進度
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
            if (!this.isReady || this.isAnimating) return;

            const col = Math.floor(pointer.x / (this.cellWidth + this.gap));
            const row = Math.floor(pointer.y / (this.cellHeight + this.gap));
            this.startExitAnimation(col, row);
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

        // 滿版背景圖，cover 模式
        this.backgroundImage = this.add.image(width / 2, height / 2, 'background');

        // 計算縮放比例讓圖片 cover 整個畫面
        const scaleX = width / this.backgroundImage.width;
        const scaleY = height / this.backgroundImage.height;
        const scale = Math.max(scaleX, scaleY);
        this.backgroundImage.setScale(scale);

        // 確保在最底層
        this.backgroundImage.setDepth(-1);
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

        // 顯示 LOADING XX%
        const text = `LOADING ${percent}%`;
        const pixels = this.textRenderer.textToPixels(
            {
                id: 'loading',
                text: text,
                letterSpacing: 2,
                position: { x: 0.5, y: 0.5 },
                color: '#ffffff'
            },
            this.cols,
            this.rows
        );

        // 套用到格子
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
    }

    private updateLoadingProgress(percent: number) {
        if (this.isLoading) {
            this.showLoadingText(percent);
        }
    }

    private preloadGameAssets() {
        // 模擬載入進度（如果有其他資源要載入可以在這裡加）
        // 目前用模擬的方式展示 Loading
        let progress = 0;
        const loadInterval = this.time.addEvent({
            delay: 50,
            callback: () => {
                progress += Math.random() * 15;
                if (progress >= 100) {
                    progress = 100;
                    loadInterval.destroy();
                    this.onLoadingComplete();
                }
                this.showLoadingText(Math.floor(progress));
            },
            loop: true
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

        console.log(`Grid: ${this.cols}x${this.rows}, cellSize: ${cellSize}, gameBounds: ${gameWidth.toFixed(0)}x${gameHeight.toFixed(0)}`);
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

        // 停止標題 BGM
        if (this.titleBgm && this.titleBgm.isPlaying) {
            this.titleBgm.stop();
        }

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

        // 隱藏 GridScene 的背景圖，讓燒開的格子露出 MainScene
        this.backgroundImage.setVisible(false);

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
