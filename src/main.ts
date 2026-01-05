import Phaser from 'phaser';
import MainScene from './scenes/MainScene';
import GridScene from './scenes/GridScene';

// 設定版本資訊（從 Vite 注入，加入 fallback 防止未定義）
const versionInfo = document.getElementById('version-info');
if (versionInfo) {
    const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
    versionInfo.textContent = `v${version}`;
}

let game: Phaser.Game | null = null;

function isLandscape(): boolean {
    return window.innerWidth > window.innerHeight;
}

function getViewportHeight(): number {
    // 優先使用 visualViewport（排除手機瀏覽器網址列）
    if (window.visualViewport) {
        return window.visualViewport.height;
    }
    return window.innerHeight;
}

function createGame() {
    if (game) return; // 已經存在就不重建

    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: window.innerWidth,
        height: getViewportHeight(),
        parent: 'app',
        backgroundColor: '#111111',
        antialias: true, // 啟用抗鋸齒，讓文字和圖形更清晰
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { x: 0, y: 0 },
                debug: false
            }
        },
        scene: [GridScene, MainScene]
    };

    game = new Phaser.Game(config);

    // 設定初始音量為 50%
    game.events.once('ready', () => {
        if (game && game.sound) {
            game.sound.volume = 0.5;
        }
    });
}

function checkOrientation() {
    // 桌面或橫向時啟動遊戲
    if (window.innerWidth > 900 || isLandscape()) {
        createGame();
    }
}

// 防抖動 resize 函數
let resizeTimeout: number | null = null;
function handleGameResize() {
    if (resizeTimeout) {
        clearTimeout(resizeTimeout);
    }
    resizeTimeout = window.setTimeout(() => {
        if (game) {
            const newWidth = window.innerWidth;
            const newHeight = getViewportHeight();
            game.scale.resize(newWidth, newHeight);
            // 強制更新 canvas 尺寸
            const canvas = game.canvas;
            if (canvas) {
                canvas.style.width = `${newWidth}px`;
                canvas.style.height = `${newHeight}px`;
            }
        }
        resizeTimeout = null;
    }, 50);
}

// 初始檢查
checkOrientation();

// 監聽方向變化 - 同時處理 resize
window.addEventListener('resize', () => {
    checkOrientation();
    handleGameResize();
});

// 手機旋轉事件
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        checkOrientation();
        handleGameResize();
    }, 150);
});

// 監聽 visualViewport 變化（手機瀏覽器網址列顯示/隱藏、PWA 模式切換）
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleGameResize);
    window.visualViewport.addEventListener('scroll', handleGameResize);
}

// 監聽全螢幕變化
document.addEventListener('fullscreenchange', () => {
    setTimeout(handleGameResize, 100);
});
document.addEventListener('webkitfullscreenchange', () => {
    setTimeout(handleGameResize, 100);
});

// PWA 顯示模式變化（從瀏覽器拖曳到視窗等）
if (window.matchMedia) {
    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    displayModeQuery.addEventListener('change', () => {
        setTimeout(handleGameResize, 200);
    });
}

// 視窗獲得焦點時重新檢查尺寸（處理 PWA 視窗拖曳後）
window.addEventListener('focus', () => {
    setTimeout(handleGameResize, 100);
});

// 防止頁面滾動（PWA 模式下可能因觸控而滾動）
document.addEventListener('touchmove', (e) => {
    // 只有在遊戲畫面上才阻止（彈窗內的捲動不阻止）
    if (!(e.target as HTMLElement).closest('.popup-overlay')) {
        e.preventDefault();
    }
}, { passive: false });

// 防止雙擊縮放
document.addEventListener('dblclick', (e) => {
    e.preventDefault();
}, { passive: false });

// 監聽音量變化事件
window.addEventListener('volumechange', ((event: CustomEvent) => {
    if (game && game.sound) {
        game.sound.volume = event.detail.volume;
    }
}) as EventListener);
