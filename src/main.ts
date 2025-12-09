import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import MainScene from './scenes/MainScene';
import GridScene from './scenes/GridScene';

// 設定版本資訊（從 Vite 注入）
const versionInfo = document.getElementById('version-info');
if (versionInfo) {
    versionInfo.textContent = `v${__APP_VERSION__}`;
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
        scene: [GridScene, BootScene, MainScene]
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

// 初始檢查
checkOrientation();

// 監聽方向變化
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', () => {
    setTimeout(checkOrientation, 100);
});

// 監聽 visualViewport 變化（手機瀏覽器網址列顯示/隱藏）
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        if (game) {
            game.scale.resize(window.innerWidth, getViewportHeight());
        }
    });
}

// 監聽全螢幕變化
document.addEventListener('fullscreenchange', () => {
    if (game) {
        setTimeout(() => {
            game!.scale.resize(window.innerWidth, getViewportHeight());
        }, 100);
    }
});

// 監聽音量變化事件
window.addEventListener('volumechange', ((event: CustomEvent) => {
    if (game && game.sound) {
        game.sound.volume = event.detail.volume;
    }
}) as EventListener);
