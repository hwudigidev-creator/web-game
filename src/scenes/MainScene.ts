import Phaser from 'phaser';
import { SkillManager, SkillDefinition, PlayerSkill, SKILL_LIBRARY, AdvancedSkillDefinition, PlayerAdvancedSkill, SparkColors } from '../systems/SkillSystem';
import { MonsterManager, Monster } from '../systems/MonsterSystem';

interface GameBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

// 角色動畫狀態
type CharacterState = 'idle' | 'run' | 'attack' | 'hurt';

export default class MainScene extends Phaser.Scene {
    private character!: Phaser.GameObjects.Sprite;
    private characterState: CharacterState = 'idle';
    private facingRight: boolean = true; // 角色面向右邊
    private skillIcons: Phaser.GameObjects.Rectangle[] = [];
    private skillIconGridGraphics: Phaser.GameObjects.Graphics[] = []; // 技能框網格邊框
    private skillIconGridData: { startX: number; startY: number; gridSize: number }[] = []; // 技能框位置資料
    private gameBounds!: GameBounds;
    private boundsBorder!: Phaser.GameObjects.Rectangle;
    private background!: Phaser.GameObjects.Image;
    private gameAreaContainer!: Phaser.GameObjects.Container; // 遊戲區域容器
    private revealMask!: Phaser.GameObjects.Graphics; // 揭露遮罩

    // 大地圖相關
    private mapWidth!: number;  // 地圖總寬度
    private mapHeight!: number; // 地圖總高度
    private characterX!: number; // 角色在地圖上的 X 座標
    private characterY!: number; // 角色在地圖上的 Y 座標
    private characterSize!: number; // 角色大小
    private isPointerDown: boolean = false; // 是否按住滑鼠/觸控
    private moveDirX: number = 0; // 移動方向 X（-1, 0, 1 或連續值）
    private moveDirY: number = 0; // 移動方向 Y（-1, 0, 1 或連續值）

    // 虛擬搖桿系統
    private joystickContainer!: Phaser.GameObjects.Container;
    private joystickBase!: Phaser.GameObjects.Graphics;
    private joystickKnob!: Phaser.GameObjects.Graphics;
    private joystickOriginX: number = 0;  // 搖桿起點 X（螢幕座標）
    private joystickOriginY: number = 0;  // 搖桿起點 Y（螢幕座標）
    private static readonly JOYSTICK_RADIUS = 60;      // 搖桿基座半徑
    private static readonly JOYSTICK_KNOB_RADIUS = 25; // 搖桿旋鈕半徑
    private baseMoveSpeed: number = 0; // 基礎移動速度（像素/秒），在 create 中根據畫面大小初始化
    private moveSpeed: number = 0; // 實際移動速度（套用加成後）

    // 地圖倍率（相對於可視區域的倍數）
    private static readonly MAP_SCALE = 10;

    // 技能欄設定
    private static readonly ACTIVE_SKILLS = 4;
    private static readonly PASSIVE_SKILLS = 3;

    // 地板格子
    private floorGrid!: Phaser.GameObjects.Graphics;
    private floorRT!: Phaser.GameObjects.RenderTexture; // 灰色地板（用於挖洞）
    private floorHexContainer!: Phaser.GameObjects.Container; // 地板字元容器（在 floorGrid 之上）

    // 地板隨機字元（空間定位用）
    private floorHexChars: {
        sprite: Phaser.GameObjects.Sprite;
        gridKey: string;
        spawnTime: number;
        fadeInDuration: number;  // 淡入時間（1-3秒隨機）
        lifetime: number;        // 完全顯現後的存活時間（2-5秒隨機）
        fullyVisible: boolean;   // 是否已完全顯現
        visibleStartTime: number; // 完全顯現的時間點
    }[] = [];
    private floorHexUsedPositions: Set<string> = new Set();
    private floorHexPool: Phaser.GameObjects.Sprite[] = []; // 物件池
    private static readonly FLOOR_HEX_MAX = 500; // 最多 500 個字（加密）
    private static readonly FLOOR_HEX_GRID_SIZE = 0.025; // 格子大小：2.5% 畫面高度
    private static readonly HEX_CHARS = '0123456789ABCDEF';
    private static readonly BINARY_CHARS = '01';
    private static readonly HEX_CHANCE = 0.3; // 30% 機率用 16 進制，70% 用二進制
    private static readonly HEX_TINT_NORMAL = 0x1a5a1a;  // 暗駭客綠
    private static readonly HEX_TINT_HIGHLIGHT = 0xffffff; // 高亮白色

    // 地板障礙物系統（水坑）
    private floorObstacles: {
        sprite: Phaser.GameObjects.Sprite;
        x: number;          // 世界座標
        y: number;          // 世界座標
        halfWidth: number;  // 碰撞半寬（實際顯示寬度的 70%）
        halfHeight: number; // 碰撞半高（實際顯示高度的 70%）
        imageRadius: number; // 圖片顯示半徑（用於生成時避免重疊）
    }[] = [];
    private floorObstacleContainer!: Phaser.GameObjects.Container;

    // 視差背景系統
    private parallaxBackground!: Phaser.GameObjects.Sprite;
    private static readonly PARALLAX_BG_SCALE = 4;

    private static readonly FLOOR_OBSTACLE_COUNT_MIN = 15;
    private static readonly FLOOR_OBSTACLE_COUNT_MAX = 20;
    private static readonly FLOOR_OBSTACLE_SIZE_MIN = 3;   // 障礙物最小大小（單位）
    private static readonly FLOOR_OBSTACLE_SIZE_MAX = 8;   // 障礙物最大大小（單位）

    // 邊緣波浪脈衝系統（紅到橘漸層）
    private edgeWavePulses: {
        x: number;           // 起點 X（地圖座標）
        y: number;           // 起點 Y（地圖座標）
        edge: 'left' | 'right' | 'top' | 'bottom';
        startTime: number;   // 開始時間
        length: number;      // 波浪長度（3-5格）
        duration: number;    // 持續時間（ms）
    }[] = [];
    private lastEdgePulseTime: number = 0;

    // 分身技能專用暗紫色
    private static readonly PHANTOM_COLOR = 0x5522aa;       // 主色：暗紫
    private static readonly PHANTOM_COLOR_LIGHT = 0x7744cc; // 輔色：稍亮暗紫

    // 橫向掃光系統
    private scanLineX: number = -1;           // 掃光當前 X 位置（-1 表示未啟動）
    private scanLineActive: boolean = false;
    private lastScanTime: number = -25000;    // 初始值讓第一次掃光5秒後發生
    private static readonly SCAN_INTERVAL = 30000;    // 每30秒觸發
    private static readonly SCAN_WIDTH = 0.15;        // 掃光寬度（畫面寬度比例）
    private static readonly SCAN_SPEED = 0.3;         // 掃光速度（畫面寬度/秒）
    private static readonly SCAN_BRIGHTNESS = 1.0;    // 掃光最高亮度

    // 圓形擴散掃光系統（從角色位置）
    private circularScanRadius: number = 0;
    private circularScanActive: boolean = false;
    private lastCircularScanTime: number = -5000;     // 初始值讓第一次5秒後發生
    private static readonly CIRCULAR_SCAN_INTERVAL = 10000;  // 每10秒觸發
    private static readonly CIRCULAR_SCAN_WIDTH = 0.1;       // 掃光環寬度（畫面高度比例）
    private static readonly CIRCULAR_SCAN_SPEED = 0.8;       // 擴散速度（畫面高度/秒）
    private static readonly CIRCULAR_SCAN_MAX = 1.5;         // 最大半徑（畫面高度比例）

    // 受傷紅色掃光系統（兩圈同時擴散）
    private damageScanRings: {
        radius: number;      // 當前半徑
        active: boolean;     // 是否啟動
    }[] = [];
    private static readonly DAMAGE_SCAN_COLOR = 0xff4444;    // 紅色
    private static readonly DAMAGE_SCAN_WIDTH = 0.08;        // 掃光環寬度
    private static readonly DAMAGE_SCAN_SPEED = 1.2;         // 擴散速度
    private static readonly DAMAGE_SCAN_MAX = 0.6;           // 最大半徑（6 單位）

    // 護盾金色呼吸掃光系統（擴散→收縮→爆發）
    private shieldBreathScan: {
        phase: 'expand' | 'contract' | 'burst' | 'idle';  // 階段
        radius: number;                                     // 當前半徑
        targetRadius: number;                               // 目標半徑
    } = { phase: 'idle', radius: 0, targetRadius: 0 };
    private static readonly SHIELD_SCAN_COLOR = 0xffcc00;    // 金色
    private static readonly SHIELD_SCAN_WIDTH = 0.1;         // 掃光環寬度
    private static readonly SHIELD_SCAN_EXPAND_SPEED = 1.0;  // 擴散速度
    private static readonly SHIELD_SCAN_CONTRACT_SPEED = 2.5; // 收縮速度（快）
    private static readonly SHIELD_SCAN_BURST_SPEED = 3.0;   // 爆發速度（更快）
    private static readonly SHIELD_SCAN_EXPAND_MAX = 0.35;   // 擴散最大（3.5 單位）
    private static readonly SHIELD_SCAN_BURST_MAX = 0.8;     // 爆發最大（8 單位）

    // 升級藍色呼吸掃光系統（與護盾類似）
    private levelUpBreathScan: {
        phase: 'expand' | 'contract' | 'burst' | 'idle';
        radius: number;
        targetRadius: number;
    } = { phase: 'idle', radius: 0, targetRadius: 0 };
    private static readonly LEVELUP_SCAN_COLOR = 0x4488ff;   // 藍色
    private static readonly LEVELUP_SCAN_WIDTH = 0.1;        // 掃光環寬度
    private static readonly LEVELUP_SCAN_EXPAND_SPEED = 1.2; // 擴散速度（稍快）
    private static readonly LEVELUP_SCAN_CONTRACT_SPEED = 3.0; // 收縮速度
    private static readonly LEVELUP_SCAN_BURST_SPEED = 3.5;  // 爆發速度
    private static readonly LEVELUP_SCAN_EXPAND_MAX = 0.4;   // 擴散最大（4 單位）
    private static readonly LEVELUP_SCAN_BURST_MAX = 1.0;    // 爆發最大（10 單位）

    // 圓形擴散系統（半徑擴散）
    private radiusWaves: {
        centerCol: number;          // 圓心格子列
        centerRow: number;          // 圓心格子行
        rings: string[][];          // 按距離分組的格子
        currentRing: number;        // 當前擴散到的環
        lastExpandTime: number;     // 上次擴散時間
        expandSpeed: number;        // 此波的擴散速度
    }[] = [];
    private lastRadiusWaveTime = 0;
    private static readonly RADIUS_WAVE_INTERVAL = 5000; // 每5秒觸發
    private static readonly RADIUS_WAVE_POINTS = 5;      // 每次5個起點

    // GAME OVER 點陣字系統
    private gameOverActive: boolean = false;
    private gameOverSprites: Phaser.GameObjects.Sprite[] = [];
    // GAME OVER 紅色呼吸掃光
    private gameOverBreathScan: {
        phase: 'expand' | 'contract' | 'burst' | 'idle';
        radius: number;
        targetRadius: number;
    } = { phase: 'idle', radius: 0, targetRadius: 0 };
    private static readonly GAMEOVER_SCAN_COLOR = 0xff4444;    // 紅色
    private static readonly GAMEOVER_SCAN_WIDTH = 0.12;        // 掃光環寬度
    private static readonly GAMEOVER_SCAN_EXPAND_SPEED = 0.8;  // 擴散速度（慢）
    private static readonly GAMEOVER_SCAN_CONTRACT_SPEED = 2.0; // 收縮速度
    private static readonly GAMEOVER_SCAN_BURST_SPEED = 2.5;   // 爆發速度
    private static readonly GAMEOVER_SCAN_EXPAND_MAX = 0.5;    // 擴散最大（5 單位）
    private static readonly GAMEOVER_SCAN_BURST_MAX = 1.2;     // 爆發最大（12 單位）
    // 7x9 點陣字模板（2格粗筆畫，1=有點，0=無點）
    private static readonly DOT_MATRIX_FONT: { [key: string]: number[][] } = {
        'G': [
            [0,0,1,1,1,1,0],
            [0,1,1,1,1,1,1],
            [1,1,0,0,0,0,0],
            [1,1,0,0,0,0,0],
            [1,1,0,0,1,1,1],
            [1,1,0,0,1,1,1],
            [1,1,0,0,0,1,1],
            [0,1,1,1,1,1,1],
            [0,0,1,1,1,1,0]
        ],
        'A': [
            [0,0,1,1,1,0,0],
            [0,1,1,1,1,1,0],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1]
        ],
        'M': [
            [1,1,0,0,0,1,1],
            [1,1,1,0,1,1,1],
            [1,1,1,1,1,1,1],
            [1,1,0,1,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1]
        ],
        'E': [
            [1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1],
            [1,1,0,0,0,0,0],
            [1,1,0,0,0,0,0],
            [1,1,1,1,1,1,0],
            [1,1,1,1,1,1,0],
            [1,1,0,0,0,0,0],
            [1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1]
        ],
        'O': [
            [0,0,1,1,1,0,0],
            [0,1,1,1,1,1,0],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [0,1,1,1,1,1,0],
            [0,0,1,1,1,0,0]
        ],
        'V': [
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [0,1,1,0,1,1,0],
            [0,1,1,0,1,1,0],
            [0,0,1,1,1,0,0],
            [0,0,1,1,1,0,0],
            [0,0,0,1,0,0,0]
        ],
        'R': [
            [1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1],
            [1,1,0,0,0,1,1],
            [1,1,0,0,0,1,1],
            [1,1,1,1,1,1,0],
            [1,1,1,1,1,0,0],
            [1,1,0,1,1,0,0],
            [1,1,0,0,1,1,0],
            [1,1,0,0,0,1,1]
        ]
    };

    // 遊戲世界容器（會隨鏡頭移動的內容）
    private worldContainer!: Phaser.GameObjects.Container;

    // 角色容器（獨立於網格之上）
    private characterContainer!: Phaser.GameObjects.Container;

    // UI 層（不隨鏡頭移動）
    private uiContainer!: Phaser.GameObjects.Container;

    // 鏡頭偏移量（用於在遊戲區域內移動視角）
    private cameraOffsetX: number = 0;
    private cameraOffsetY: number = 0;

    // 鏡頭安全區域（中間 30% 不移動鏡頭）
    private static readonly CAMERA_DEAD_ZONE = 0.3;

    // WASD + 方向鍵 鍵盤控制
    private cursors!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
        UP: Phaser.Input.Keyboard.Key;
        DOWN: Phaser.Input.Keyboard.Key;
        LEFT: Phaser.Input.Keyboard.Key;
        RIGHT: Phaser.Input.Keyboard.Key;
    };
    private isKeyboardMoving: boolean = false;

    // 技能選擇面板
    private skillPanelContainer!: Phaser.GameObjects.Container;
    private isPaused: boolean = false;
    private popupPaused: boolean = false; // UI 彈出視窗暫停
    private popupPauseStartTime: number = 0; // 暫停開始時間（用於調整冷卻）
    private isSkillSelecting: boolean = false; // 防止重複點擊
    private pendingSkillPoints: number = 0; // 待分配的技能點數

    // DEBUG 模式
    private debugMode: boolean = false;
    private debugText!: Phaser.GameObjects.Text;
    private debugKey!: Phaser.Input.Keyboard.Key;
    private skillOptions: Phaser.GameObjects.Container[] = [];
    // 技能選擇按鍵 (1, 2, 3)
    private keyOne!: Phaser.Input.Keyboard.Key;
    private keyTwo!: Phaser.Input.Keyboard.Key;
    private keyThree!: Phaser.Input.Keyboard.Key;
    private skillCardBgs: Phaser.GameObjects.Rectangle[] = [];

    // 遊戲計時器
    private gameTimer: number = 0; // 遊戲進行時間（毫秒）
    private totalDamageReceived: number = 0; // 累計受到的傷害
    private timerText!: Phaser.GameObjects.Text;
    private selectedSkillIndex: number = 0; // 當前選中的技能索引
    private currentSkillChoices: SkillDefinition[] = []; // 當前可選的技能

    // 技能升級 CUT IN
    private skillCutInContainer!: Phaser.GameObjects.Container;

    // 技能系統
    private skillManager: SkillManager = new SkillManager();
    private skillIconContainers: Phaser.GameObjects.Container[] = []; // 技能欄圖示容器
    private skillLevelTexts: Phaser.GameObjects.Text[] = []; // 技能等級文字
    private skillIconSprites: (Phaser.GameObjects.Sprite | null)[] = []; // 技能圖示 Sprite

    // 進階技能系統
    private advancedSkillContainer!: Phaser.GameObjects.Container; // 進階技能欄位容器
    private advancedSkillSlotVisible: boolean = false; // 進階技能欄位是否可見
    private advancedSkillIconSprite: Phaser.GameObjects.Sprite | null = null; // 進階技能圖示
    private advancedSkillLevelText!: Phaser.GameObjects.Text; // 進階技能等級文字
    private advancedSkillGridGraphics!: Phaser.GameObjects.Graphics; // 進階技能邊框圖形
    private advancedSkillGridData!: { startX: number; startY: number; gridSize: number }; // 進階技能網格資料
    private advancedSkillHue: number = 0; // 彩虹邊框色相
    private advancedSkillCooldownTime: number = 0; // 進階技能上次發動時間
    private isSelectingAdvancedSkill: boolean = false; // 是否正在選擇進階技能
    private currentAdvancedSkillChoices: AdvancedSkillDefinition[] = []; // 當前可選的進階技能
    private mixedSkillTypes: ('normal' | 'advanced')[] = []; // 混合選項中每個卡片的類型
    private mixedNormalIndices: number[] = []; // 混合選項中一般技能在 currentSkillChoices 的索引
    private mixedAdvancedIndices: number[] = []; // 混合選項中進階技能在 currentAdvancedSkillChoices 的索引

    // 絕對邏輯防禦：輪鋸系統
    private sawBladeAngle: number = 0; // 輪鋸公轉角度（繞角色）
    private sawBladeSpinAngle: number = 0; // 輪鋸自轉角度（鋸齒旋轉）
    private sawBladeSprites: { outer: Phaser.GameObjects.Sprite; inner: Phaser.GameObjects.Sprite }[] = []; // 輪鋸護盾圖（雙層）
    private sawBladeLastHitTime: Map<number, number> = new Map(); // 每個怪物上次被輪鋸擊中的時間
    private currentSawBladePositions: { x: number; y: number }[] = []; // 當前輪鋸位置（世界座標）
    private sawBladeRadius: number = 0; // 輪鋸半徑

    // 完美像素審判：井字線系統
    private perfectPixelLineSprites: Phaser.GameObjects.Sprite[] = []; // 井字線 sprites
    private perfectPixelFocusIndex: number = 0; // 當前爆炸的焦點索引 (0-3)
    private perfectPixelLineAlpha: number = 0; // 井字線透明度（用於淡入淡出）

    // 零信任防禦協定：8 個光點跟著領域的 8 角
    private zeroTrustActive: boolean = false; // 是否啟用
    private zeroTrustSprite?: Phaser.GameObjects.Sprite; // 八角矩陣護盾圖
    private zeroTrustTrackedMonsters: Set<number> = new Set(); // 已追蹤的怪物（避免重複鎖定）
    private zeroTrustPoints: {
        targetMonsterId: number | null; // 鎖定的怪物 ID（null = 待機在角落）
        currentX: number;               // 當前位置 X（世界座標）
        currentY: number;               // 當前位置 Y（世界座標）
        homeAngle: number;              // 初始角度（8 角之一）
        lastDamageTime: number;         // 上次造成傷害的時間
        pointSprite: Phaser.GameObjects.Sprite; // 光點（sector_360）
        beamSprite: Phaser.GameObjects.Sprite;  // 向上射線（裝飾）
        flickerPhase: number;           // 閃爍相位
        lockStartTime: number;          // 開始鎖定此目標的時間
        beamMultiplier: number;         // 光束倍率（每秒+1，從1開始）
    }[] = []; // 8 個光點

    // 幻影迭代模式：影分身系統（支援多個幻影，最多 3 個）
    private phantoms: {
        id: number;
        x: number;
        y: number;
        targetX: number;
        targetY: number;
        moving: boolean;
        sprite: Phaser.GameObjects.Sprite;
        flashTimer: Phaser.Time.TimerEvent; // 白紅閃爍計時器
        skillTimer: Phaser.Time.TimerEvent; // 技能施放計時器
        tauntTimer: Phaser.Time.TimerEvent; // 嘲諷週期計時器
        isTaunting: boolean; // 是否正在嘲諷
        sectorIndex: number; // 負責的扇區索引
        lastAfterimageTime: number; // 上次殘影時間
    }[] = [];
    private nextPhantomId: number = 0;
    private static readonly PHANTOM_MAX_COUNT = 3; // 最大分身數量

    // 技能資訊窗格
    private skillInfoPanel!: Phaser.GameObjects.Container;
    private skillInfoBg!: Phaser.GameObjects.Rectangle;
    private skillInfoText!: Phaser.GameObjects.Text;
    private skillInfoHideTimer?: Phaser.Time.TimerEvent;

    // 經驗值和等級系統
    private currentExp: number = 0;
    private maxExp: number = 100;
    private currentLevel: number = 0;
    private expBarContainer!: Phaser.GameObjects.Container;
    private expBarFlowOffset: number = 0; // 流動效果偏移
    private levelText!: Phaser.GameObjects.Text;

    // HP 系統
    private currentHp: number = 200;
    private maxHp: number = 200;
    private hpBarContainer!: Phaser.GameObjects.Container;
    private hpBarFlowOffset: number = 0; // HP 流動效果偏移
    private hpText!: Phaser.GameObjects.Text;

    // 護盾系統
    private currentShield: number = 0;
    private maxShield: number = 0; // 護盾最大值（用於計算護盾比例）
    private shieldBarFlowOffset: number = 0; // 護盾流動效果偏移
    private shieldReflectDamage: number = 0; // 護盾反傷傷害值
    private architectSkillLevel: number = 0; // 架構師技能等級（用於判斷 MAX 擊退）
    private shieldText!: Phaser.GameObjects.Text;
    private shieldAuraGraphics!: Phaser.GameObjects.Graphics; // 護盾光環圖形
    private shieldSparkleTimer: number = 0; // 金光閃點計時器
    private shieldGroundSprite: Phaser.GameObjects.Sprite | null = null; // 護盾腳底橢圓 sprite

    // HP 自動回復計時器（鈦金肝被動技能）
    private hpRegenTimer: number = 0;

    // 不死復活（鈦金肝 MAX 後）
    private reviveUsed: boolean = false;

    // HP 損傷顯示（白色區塊延遲靠攏）
    private displayedHp: number = 200; // 顯示的 HP（延遲跟隨實際 HP）
    private hpDamageDelay: number = 0; // 損傷延遲計時器（毫秒）
    private static readonly HP_DAMAGE_DELAY = 1000; // 1 秒延遲
    private static readonly HP_DAMAGE_LERP_SPEED = 3; // 靠攏速度（每秒倍率）

    // RWD 最小字級（手機可讀性）
    private static readonly MIN_FONT_SIZE_LARGE = 16; // 大字（標題、等級）
    private static readonly MIN_FONT_SIZE_MEDIUM = 14; // 中字（HP、描述）
    private static readonly MIN_FONT_SIZE_SMALL = 12; // 小字（副標、數值）

    // 卡片文字 padding（避免文字超出卡片邊界）
    private static readonly CARD_TEXT_PADDING = 0.12; // 卡片寬度的 12% 作為左右 padding

    // 手機判斷
    private isMobile: boolean = false;

    // 成長曲線常數
    private static readonly BASE_HP = 200; // 初始 HP
    private static readonly HP_PER_LEVEL = 50; // 每級增加的 HP
    private static readonly BASE_EXP = 100; // 初始升級所需經驗
    private static readonly EXP_GROWTH_RATE = 1.2; // 經驗成長倍率

    // 基礎攻擊單位（1 單位 = 10 傷害）
    private static readonly DAMAGE_UNIT = 10;

    // 測試用按鍵
    private keyPlus!: Phaser.Input.Keyboard.Key;
    private keyMinus!: Phaser.Input.Keyboard.Key;
    private keyShift!: Phaser.Input.Keyboard.Key;
    private keyCtrl!: Phaser.Input.Keyboard.Key;
    private keyZero!: Phaser.Input.Keyboard.Key;
    private keyBackspace!: Phaser.Input.Keyboard.Key;
    private keyF5!: Phaser.Input.Keyboard.Key;
    private keyF6!: Phaser.Input.Keyboard.Key;
    private keyF7!: Phaser.Input.Keyboard.Key;
    private keyF8!: Phaser.Input.Keyboard.Key;
    private keyF9!: Phaser.Input.Keyboard.Key;
    private keyF10!: Phaser.Input.Keyboard.Key;
    private keyF11!: Phaser.Input.Keyboard.Key;
    private keyF12!: Phaser.Input.Keyboard.Key;

    // 測試用：顯示網格技能特效（SHIFT+BACKSPACE 切換，預設關閉以提升效能）
    private showGridSkillEffects: boolean = false;

    // 怪物系統
    private monsterManager!: MonsterManager;

    // 受傷硬直
    private isHurt: boolean = false;
    private hurtEndTime: number = 0;
    private static readonly HURT_DURATION = 200; // 受傷硬直時間（毫秒）

    // 低血量紅暈效果（使用畫面邊緣的技能網格）
    private lowHpBreathTimer: number = 0; // 呼吸動畫計時器
    private isLowHp: boolean = false; // 是否處於低血量狀態
    private vignetteEdgeCells: Set<number> = new Set(); // 邊緣格子的索引

    // 技能冷卻系統
    private skillCooldowns: Map<string, number> = new Map(); // skillId -> 上次發動時間
    private isAttacking: boolean = false;
    private attackEndTime: number = 0;
    private static readonly ATTACK_DURATION = 150; // 攻擊動畫時間（毫秒）

    // 遊戲 BGM 系統
    private gameBgm!: Phaser.Sound.BaseSound;
    private currentBgmKey: string = '';

    // Window 事件處理器（用於場景重啟時清理）
    private gridScaleHandler?: EventListener;
    private popupStateHandler?: EventListener;
    private suicideHandler?: EventListener;
    private restartHandler?: EventListener;

    // 回血物品掉落系統（菁英怪死亡時掉落，永久存在直到拾取）
    private healingItems: {
        id: number;
        x: number;           // 世界座標 X
        y: number;           // 世界座標 Y
        sprite: Phaser.GameObjects.Sprite;
        floatPhase: number;  // 浮動動畫相位
    }[] = [];
    private nextHealingItemId: number = 0;
    private healingItemContainer!: Phaser.GameObjects.Container;
    private static readonly HEALING_ITEM_HEAL_PERCENT = 0.1;   // 每個回復 10% HP
    private static readonly HEALING_ITEM_DROP_COUNT_MIN = 2;   // 最少掉落 2 個
    private static readonly HEALING_ITEM_DROP_COUNT_MAX = 3;   // 最多掉落 3 個
    private static readonly HEALING_ITEM_SCATTER_RADIUS = 0.5; // 散落半徑（單位）
    private static readonly HEALING_ITEM_SIZE = 0.05;          // 物品大小（畫面高度比例）
    // 拾取範圍（單位，1 單位 = 畫面高度 10%）
    private basePickupRange: number = 1;    // 基礎拾取範圍（技能加成從 skillManager 取得）

    // 技能範圍格子系統（只覆蓋遊玩區域）
    private skillGridContainer!: Phaser.GameObjects.Container;
    private skillGridCells: Phaser.GameObjects.Rectangle[] = [];
    private skillGridCols: number = 0;
    private skillGridRows: number = 0;
    private skillGridCellSize: number = 10;
    private static readonly SKILL_GRID_GAP = 1;
    private gridScaleMultiplier: number = 3; // 網格倍率（1X 粗，2X 中，3X 細）預設會由 isMobile 覆蓋
    private activeSkillGridCells: Set<number> = new Set(); // 追蹤已啟用的格子索引，優化清除效能

    // 技能特效物件池系統（使用 Sprite 取代 Rectangle 以提升效能）
    private skillEffectPool: Phaser.GameObjects.Sprite[] = []; // 可用的 Sprite 池
    private activeSkillEffects: Phaser.GameObjects.Sprite[] = []; // 正在使用的 Sprite
    private static readonly SKILL_EFFECT_POOL_SIZE = 50; // 物件池初始大小
    private static readonly MAX_ACTIVE_SKILL_EFFECTS = 80; // 最大同時活躍數（防止卡頓）
    // LINE 紋理物件池（用於打擊火花效果）
    private lineEffectPool: Phaser.GameObjects.Sprite[] = [];
    private activeLineEffects: Phaser.GameObjects.Sprite[] = [];
    private static readonly LINE_EFFECT_POOL_SIZE = 80; // LINE 物件池大小
    private static readonly MAX_ACTIVE_LINE_EFFECTS = 120; // 最大同時活躍數（防止卡頓）
    // CIRCLE_LINE 紋理物件池（用於圓形邊緣線效果）
    private circleLineEffectPool: Phaser.GameObjects.Sprite[] = [];
    private activeCircleLineEffects: Phaser.GameObjects.Sprite[] = [];
    private static readonly CIRCLE_LINE_EFFECT_POOL_SIZE = 20; // CIRCLE_LINE 物件池大小
    // 紋理 key（對應 BootScene 載入的圖片）
    private static readonly TEXTURE_SECTOR_PREFIX = 'effect_sector_'; // 扇形紋理前綴 (後綴為角度)
    private static readonly TEXTURE_SECTOR_360 = 'effect_sector_360'; // 360度扇形（爆炸內圈用）
    private static readonly TEXTURE_CIRCLE = 'effect_circle'; // 圓形紋理
    private static readonly TEXTURE_CIRCLE_LINE = 'effect_circle_line'; // 圓形線條紋理（爆炸外圈用）
    private static readonly TEXTURE_LINE = 'effect_line'; // 直線紋理
    private static readonly TEXTURE_SOULWAVE = 'effect_soulwave'; // 衝擊波紋理
    private static readonly TEXTURE_SHIELD = 'effect_shield'; // 護盾紋理
    private static readonly TEXTURE_SLASH = 'effect_slash'; // 斬擊紋理
    // 紋理尺寸
    private static readonly EFFECT_TEXTURE_SIZE = 256; // 圓形、扇形
    private static readonly EFFECT_LINE_HEIGHT = 64;   // 直線高度

    constructor() {
        super('MainScene');
    }

    create() {
        // MainScene 的背景色
        this.cameras.main.setBackgroundColor('#111111');

        // 判斷是否為手機裝置（觸控為主或螢幕較小）
        this.isMobile = this.sys.game.device.input.touch && window.innerWidth < 1024;

        // 網格倍率統一預設 3X
        this.gridScaleMultiplier = 3;

        const screenWidth = this.cameras.main.width;
        const screenHeight = this.cameras.main.height;

        // 從 registry 取得遊戲區域邊界
        this.gameBounds = this.registry.get('gameBounds') as GameBounds;

        // 如果沒有（直接啟動 MainScene），則使用整個螢幕
        if (!this.gameBounds) {
            // 計算 16:9 的遊戲區域
            const padding = 0.05;
            const availableWidth = screenWidth * (1 - padding * 2);
            const availableHeight = screenHeight * (1 - padding * 2);
            const gameAspect = 16 / 9;
            const availableAspect = availableWidth / availableHeight;

            let gameWidth: number, gameHeight: number;
            if (availableAspect > gameAspect) {
                gameHeight = availableHeight;
                gameWidth = availableHeight * gameAspect;
            } else {
                gameWidth = availableWidth;
                gameHeight = availableWidth / gameAspect;
            }

            this.gameBounds = {
                x: (screenWidth - gameWidth) / 2,
                y: (screenHeight - gameHeight) / 2,
                width: gameWidth,
                height: gameHeight
            };
        }

        // 計算大地圖尺寸（可視區域的 10 倍）
        this.mapWidth = this.gameBounds.width * MainScene.MAP_SCALE;
        this.mapHeight = this.gameBounds.height * MainScene.MAP_SCALE;

        // 角色大小為遊玩區域高度的 15%
        this.characterSize = this.gameBounds.height * 0.15;

        // 基礎移動速度：每秒 3 單位（1 單位 = 畫面高度 10%）
        this.baseMoveSpeed = this.gameBounds.height * 0.3;
        this.moveSpeed = this.baseMoveSpeed;

        // 角色初始位置在地圖正中央
        this.characterX = this.mapWidth / 2;
        this.characterY = this.mapHeight / 2;

        // 滿版背景圖（在最底層，不在遊戲區域內）
        this.createFullscreenBackground(screenWidth, screenHeight);

        // 建立遊戲區域容器（用於套用遮罩）
        this.gameAreaContainer = this.add.container(0, 0);
        this.gameAreaContainer.setDepth(0); // 最底層

        // 繪製遊戲區域邊界（黑色背景 + 邊框）
        this.drawGameBorder();

        // 建立世界容器（會隨鏡頭移動的內容）
        this.worldContainer = this.add.container(this.gameBounds.x, this.gameBounds.y);

        // 1. 視差背景（最底層）
        this.createParallaxBackground();

        // 2. 灰色地板（使用 RenderTexture 以便挖洞）
        // 先建立一個灰色填充的 Graphics
        const grayFloorGraphics = this.make.graphics({ x: 0, y: 0 });
        grayFloorGraphics.fillStyle(0x1a1a1a, 1);
        grayFloorGraphics.fillRect(0, 0, this.mapWidth, this.mapHeight);
        grayFloorGraphics.lineStyle(4, 0xff4444, 1);
        grayFloorGraphics.strokeRect(0, 0, this.mapWidth, this.mapHeight);

        // 建立 RenderTexture 並把灰色 Graphics 畫上去
        this.floorRT = this.add.renderTexture(0, 0, this.mapWidth, this.mapHeight);
        this.floorRT.setOrigin(0, 0);
        this.floorRT.draw(grayFloorGraphics, 0, 0);
        grayFloorGraphics.destroy(); // 畫完後銷毀臨時 Graphics
        this.worldContainer.add(this.floorRT);

        // 保留 floorGrid 引用（用於相容性，但實際使用 floorRT）
        this.floorGrid = this.add.graphics();
        this.floorGrid.setVisible(false);

        // 3. 建立地板字元容器
        this.floorHexContainer = this.add.container(0, 0);
        this.worldContainer.add(this.floorHexContainer);

        // 4. 建立地板障礙物容器（水坑）
        this.floorObstacleContainer = this.add.container(0, 0);
        this.worldContainer.add(this.floorObstacleContainer);

        // 生成隨機障礙物
        this.generateFloorObstacles();

        // 建立角色動畫
        this.createCharacterAnimations();

        // 建立角色容器（會隨鏡頭移動，但獨立於 worldContainer 以便設定深度）
        this.characterContainer = this.add.container(this.gameBounds.x, this.gameBounds.y);

        // 建立回血物品容器（隨鏡頭移動，深度在角色下方、怪物上方）
        this.healingItemContainer = this.add.container(this.gameBounds.x, this.gameBounds.y);
        this.healingItemContainer.setDepth(52); // 在角色(60)之下、怪物網格(50)之上

        // 建立護盾光環圖形（在角色下方）
        this.shieldAuraGraphics = this.add.graphics();
        this.characterContainer.add(this.shieldAuraGraphics);

        // 建立角色 Sprite
        this.character = this.add.sprite(this.characterX, this.characterY, 'char_idle_1');
        this.character.setScale(this.characterSize / this.character.height);
        this.character.setOrigin(0.5, 1); // 底部中央為錨點
        this.character.play('char_idle');
        this.characterContainer.add(this.character);

        // 把世界容器加入遊戲區域容器
        this.gameAreaContainer.add([this.boundsBorder, this.worldContainer]);

        // 建立遊戲區域的裁切遮罩
        const clipMask = this.make.graphics({ x: 0, y: 0 });
        clipMask.fillStyle(0xffffff);
        clipMask.fillRect(
            this.gameBounds.x,
            this.gameBounds.y,
            this.gameBounds.width,
            this.gameBounds.height
        );
        const geometryMask = clipMask.createGeometryMask();
        this.worldContainer.setMask(geometryMask);
        this.healingItemContainer.setMask(geometryMask); // 回血物品也套用遮罩

        // 建立 UI 容器（固定在螢幕上，不隨鏡頭移動）
        this.uiContainer = this.add.container(0, 0);
        this.uiContainer.setDepth(100); // 在遊戲區域之上，確保絕對在怪物和技能網格之上

        // 建立怪物管理系統
        this.monsterManager = new MonsterManager(
            this,
            this.gameBounds,
            this.mapWidth,
            this.mapHeight
        );
        // 設定初始網格倍率（與技能特效同步）
        this.monsterManager.setGridScaleMultiplier(this.gridScaleMultiplier);
        // 套用遮罩到怪物網格
        this.monsterManager.setClipMask(geometryMask);
        // 設定怪物死亡回調（處理掉落物）
        this.monsterManager.setOnMonsterKilled((monster) => {
            this.handleMonsterDeath(monster);
        });

        // 建立技能範圍格子覆蓋層（放在 UI 層）
        this.createSkillGrid();

        // 初始化技能特效物件池（紋理由 BootScene 預載）
        this.initSkillEffectPool();
        this.initLineEffectPool(); // LINE 紋理池（打擊火花用）
        this.initCircleLineEffectPool(); // CIRCLE_LINE 紋理池（圓形邊緣線用）

        // 清理舊的事件監聽器（場景重啟時）
        if (this.gridScaleHandler) {
            window.removeEventListener('gridscalechange', this.gridScaleHandler);
        }
        if (this.popupStateHandler) {
            window.removeEventListener('popupStateChange', this.popupStateHandler);
        }
        if (this.suicideHandler) {
            window.removeEventListener('playerSuicide', this.suicideHandler);
        }
        if (this.restartHandler) {
            window.removeEventListener('gameRestart', this.restartHandler);
        }

        // 監聯網格倍率變更事件
        this.gridScaleHandler = ((e: CustomEvent) => {
            this.gridScaleMultiplier = e.detail.scale;
            this.recreateSkillGrid();
            // 同步更新怪物網格倍率
            this.monsterManager.setGridScaleMultiplier(e.detail.scale);
        }) as EventListener;
        window.addEventListener('gridscalechange', this.gridScaleHandler);

        // 監聯 UI 彈出視窗狀態變更（暫停/恢復遊戲）
        this.popupStateHandler = ((e: CustomEvent) => {
            const wasPopupPaused = this.popupPaused;
            this.popupPaused = e.detail.open;

            if (e.detail.open && !wasPopupPaused) {
                // 開始暫停：記錄暫停開始時間
                this.popupPauseStartTime = this.time.now;
            } else if (!e.detail.open && wasPopupPaused) {
                // 結束暫停：調整所有技能冷卻時間
                const pausedDuration = this.time.now - this.popupPauseStartTime;
                if (pausedDuration > 0) {
                    // 調整主動技能冷卻
                    this.skillCooldowns.forEach((lastActivation, skillId) => {
                        this.skillCooldowns.set(skillId, lastActivation + pausedDuration);
                    });
                    // 調整進階技能冷卻
                    this.advancedSkillCooldownTime += pausedDuration;
                }
            }
        }) as EventListener;
        window.addEventListener('popupStateChange', this.popupStateHandler);

        // 監聯自殺事件（快速結束遊戲登入排行榜）
        this.suicideHandler = (() => {
            if (!this.gameOverActive) {
                this.triggerGameOver();
            }
        }) as EventListener;
        window.addEventListener('playerSuicide', this.suicideHandler);

        // 監聯重新開始事件（直接重啟遊戲，不回標題畫面）
        this.restartHandler = (() => {
            this.cleanupBeforeRestart();
            // 設置標誌，讓重啟後的場景跳過 reveal 動畫
            this.registry.set('skipReveal', true);
            this.scene.restart();
        }) as EventListener;
        window.addEventListener('gameRestart', this.restartHandler);

        // 把角色容器加入 UI 層，深度高於網格（50）
        this.characterContainer.setDepth(60);
        this.characterContainer.setMask(geometryMask); // 套用遊戲區域遮罩
        this.uiContainer.add(this.characterContainer);

        // 建立技能欄（加入 UI 容器）
        this.createSkillBar();

        // 建立揭露遮罩（初始為空，等 GridScene 傳入座標）
        this.revealMask = this.make.graphics({ x: 0, y: 0 });
        const revealGeometryMask = this.revealMask.createGeometryMask();
        this.gameAreaContainer.setMask(revealGeometryMask);
        this.uiContainer.setMask(revealGeometryMask);

        // 監聽來自 GridScene 的揭露事件
        this.registry.events.on('reveal-update', this.updateRevealMask, this);
        this.registry.events.on('reveal-complete', this.onRevealComplete, this);

        // 檢查是否需要跳過 reveal 動畫（重啟時）
        if (this.registry.get('skipReveal')) {
            this.registry.set('skipReveal', false); // 清除標誌
            // 延遲一幀後直接啟動（確保場景完全初始化）
            this.time.delayedCall(100, () => {
                this.onRevealComplete();
            });
        }

        // 監聽點擊/觸控事件（按住持續移動）
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);

        // 設定 WASD + 方向鍵 鍵盤控制
        if (this.input.keyboard) {
            this.cursors = {
                W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
                A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
                S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
                D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
                UP: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
                DOWN: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
                LEFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
                RIGHT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT)
            };

            // 技能選擇按鍵 (1, 2, 3)
            this.keyOne = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
            this.keyTwo = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
            this.keyThree = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);

            // 測試用 +/- 按鍵
            this.keyPlus = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS);
            this.keyMinus = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS);
            this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
            this.keyCtrl = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
            this.keyZero = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO);
            this.keyBackspace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE);
            // 測試用 Ctrl+Shift+F5~F12（個別技能滿等）
            this.keyF5 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F5);
            this.keyF6 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F6);
            this.keyF7 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F7);
            this.keyF8 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F8);
            this.keyF9 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F9);
            this.keyF10 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F10);
            this.keyF11 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F11);
            this.keyF12 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F12);

            // DEBUG 模式按鍵（~ 反引號）
            this.debugKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
        }

        // 建立 DEBUG 顯示文字（左下角）
        this.createDebugDisplay();

        // 初始化鏡頭位置
        this.updateCamera(true); // 強制更新鏡頭

        // 建立 HP 條
        this.createHpBar();

        // 建立護盾條
        this.createShieldBar();

        // 建立經驗條
        this.createExpBar();

        // 建立技能選擇面板
        this.createSkillPanel();

        // 建立技能升級 CUT IN
        this.createSkillCutIn();

        // 建立低血量紅暈效果
        this.createLowHpVignette();

        // 建立虛擬搖桿
        this.createVirtualJoystick();

        // 注意：技能面板會在轉場完成後自動顯示（見 onRevealComplete）
    }

    // 建立虛擬搖桿 UI
    private createVirtualJoystick() {
        const baseRadius = MainScene.JOYSTICK_RADIUS;
        const knobRadius = MainScene.JOYSTICK_KNOB_RADIUS;

        // 建立容器（固定在螢幕座標，不隨鏡頭移動）
        this.joystickContainer = this.add.container(0, 0);
        this.joystickContainer.setScrollFactor(0);
        this.joystickContainer.setDepth(1000);
        this.joystickContainer.setVisible(false);

        // 基座（半透明圓形）
        this.joystickBase = this.add.graphics();
        this.joystickBase.fillStyle(0x000000, 0.3);
        this.joystickBase.fillCircle(0, 0, baseRadius);
        this.joystickBase.lineStyle(2, 0xffffff, 0.5);
        this.joystickBase.strokeCircle(0, 0, baseRadius);
        this.joystickContainer.add(this.joystickBase);

        // 旋鈕（較小的實心圓）
        this.joystickKnob = this.add.graphics();
        this.joystickKnob.fillStyle(0xffffff, 0.6);
        this.joystickKnob.fillCircle(0, 0, knobRadius);
        this.joystickKnob.lineStyle(2, 0xffffff, 0.8);
        this.joystickKnob.strokeCircle(0, 0, knobRadius);
        this.joystickContainer.add(this.joystickKnob);
    }

    update(_time: number, delta: number) {
        // DEBUG 模式切換（Ctrl + ~）
        if (this.debugKey && this.keyCtrl &&
            Phaser.Input.Keyboard.JustDown(this.debugKey) && this.keyCtrl.isDown) {
            this.toggleDebugMode();
        }

        // 更新 DEBUG 顯示
        this.updateDebugDisplay();

        // 如果遊戲暫停或彈出視窗開啟，只處理必要的 UI 更新
        if (this.isPaused || this.popupPaused) {
            // 純視覺效果可以繼續（UI 流動動畫）
            this.updateHpBarFlow(delta);
            this.updateShieldBarFlow(delta);
            this.updateExpBarFlow(delta);
            this.updateShieldAura(delta);
            this.updateLowHpVignetteBreathing(delta);
            this.updateSkillCooldownDisplay();
            this.handleSkillPanelInput();
            return;
        }

        // 更新 HP 條、護盾條和經驗條流動效果
        this.updateHpBarFlow(delta);
        this.updateShieldBarFlow(delta);
        this.updateExpBarFlow(delta);
        this.updateShieldAura(delta);
        this.updateHpRegen(delta);
        this.updateLowHpVignetteBreathing(delta);
        this.updateSkillCooldownDisplay();
        this.updateAdvancedSkillCooldown(delta);
        this.updatePhantomVisual(delta);
        this.updateZeroTrustVisual(delta);
        this.updateFloorHexChars();
        this.updateBurningMonsters();

        // 更新遊戲計時器（只在非暫停時累加）
        this.gameTimer += delta;
        this.updateTimerDisplay();

        // 處理測試用 +/- 按鍵
        this.handleExpTestInput();

        // 檢查受傷硬直狀態
        const now = this.time.now;
        if (this.isHurt && now >= this.hurtEndTime) {
            this.isHurt = false;
            // 硬直結束，根據輸入狀態恢復動畫
            if (this.isPointerDown || this.isKeyboardMoving) {
                this.setCharacterState('run');
            } else {
                this.setCharacterState('idle');
            }
            this.updateCharacterSprite();
        }

        // 檢查攻擊動畫狀態
        if (this.isAttacking && now >= this.attackEndTime) {
            this.isAttacking = false;
            this.character.clearTint();
            // 攻擊結束，恢復之前的動畫
            if (this.isPointerDown || this.isKeyboardMoving) {
                this.setCharacterState('run', true);
            } else {
                this.setCharacterState('idle', true);
            }
        }

        // 受傷硬直中不能移動
        if (!this.isHurt) {
            // 處理鍵盤移動
            this.handleKeyboardInput(delta);

            // 處理點擊移動（只有按住時才移動）
            if (this.isPointerDown && !this.isKeyboardMoving) {
                this.moveCharacter(delta);
            }
        }

        // 更新怪物系統
        const monsterResult = this.monsterManager.update(
            delta,
            this.characterX,
            this.characterY,
            this.cameraOffsetX,
            this.cameraOffsetY
        );

        // 處理怪物造成的傷害
        if (monsterResult.damage > 0) {
            this.takeDamage(monsterResult.damage, monsterResult.hitMonsters);
        }

        // 更新回血物品（浮動動畫、過期移除、拾取檢測）
        this.updateHealingItems(delta);

        // 嘗試發動技能攻擊
        this.tryActivateSkills(now);
    }


    // 嘗試發動可用的技能
    private tryActivateSkills(now: number) {
        // 如果正在受傷硬直或遊戲結束或彈出視窗暫停，不能發動技能
        if (this.isHurt) return;
        if (this.gameOverActive) return;
        if (this.popupPaused) return;

        // 取得玩家擁有的主動技能
        const activeSkills = this.skillManager.getPlayerActiveSkills();

        for (const skill of activeSkills) {
            if (!skill) continue;

            const def = skill.definition;
            // 計算基礎冷卻（架構師每級減少 0.5 秒）
            let baseCooldown = def.cooldown || 1000;
            if (def.id === 'active_architect') {
                // 架構師：10秒 - 每級 0.5 秒（Lv.0=10秒，Lv.5=7.5秒）
                baseCooldown = baseCooldown - skill.level * 500;
            }
            const cooldown = this.skillManager.calculateFinalCooldown(baseCooldown);
            const lastActivation = this.skillCooldowns.get(def.id) || 0;

            // 檢查冷卻是否結束
            if (now - lastActivation >= cooldown) {
                // 發動技能
                this.activateSkill(skill, now);
                // 更新冷卻時間
                this.skillCooldowns.set(def.id, now);
            }
        }
    }

    // 發動技能
    private activateSkill(skill: PlayerSkill, now: number) {
        const def = skill.definition;

        // 設定攻擊狀態
        this.isAttacking = true;
        this.attackEndTime = now + MainScene.ATTACK_DURATION;

        // 播放攻擊動畫
        this.setCharacterState('attack', true);

        // 角色閃光效果（使用技能的閃光顏色，50% 混合）
        if (def.flashColor) {
            this.character.setTint(def.flashColor);
        }

        // 根據技能類型執行效果
        switch (def.id) {
            case 'active_soul_render':
                this.activateSoulRender(skill);
                break;
            case 'active_coder':
                this.activateCoder(skill);
                break;
            case 'active_vfx':
                this.activateVfx(skill);
                break;
            case 'active_architect':
                this.activateArchitect(skill);
                break;
            default:
                break;
        }
    }

    // 靈魂渲染：朝最近敵人方向打出 60 度扇形傷害
    // MAX：改為三向衝擊波（0°/120°/240°）、10 傷害、10 單位射程
    private activateSoulRender(skill: PlayerSkill) {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // MAX 等級：三向衝擊波
        if (skill.level >= skill.definition.maxLevel) {
            this.triggerSoulRenderTripleWave(skill);
            return;
        }

        // 找最近的怪物
        let nearestMonster = monsters[0];
        let nearestDist = Infinity;

        for (const monster of monsters) {
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestMonster = monster;
            }
        }

        // 計算朝向最近怪物的角度
        const targetAngle = Math.atan2(
            nearestMonster.y - this.characterY,
            nearestMonster.x - this.characterX
        );

        // 更新角色面向
        this.facingRight = Math.cos(targetAngle) >= 0;
        this.updateCharacterSprite();

        // 扇形參數
        const range = this.gameBounds.height * 0.3; // 3 個單位（畫面高度 10% * 3）
        // 扇形角度：60 度 + 每級 10 度（Lv.0=60度，Lv.4=100度）
        const sectorAngle = 60 + skill.level * 10;
        const halfAngle = (sectorAngle / 2) * (Math.PI / 180);

        // 傷害：2 單位 + 每級 1 單位（Lv.0=2單位，Lv.4=6單位）
        const damageUnits = 2 + skill.level;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        // 檢查哪些怪物在扇形範圍內
        const hitMonsters: number[] = [];
        for (const monster of monsters) {
            // 計算怪物碰撞半徑（體型的一半）
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 檢查距離（扣除怪物半徑，讓邊緣碰到就算命中）
            if (dist - monsterRadius > range) continue;

            // 計算怪物相對於玩家的角度
            const monsterAngle = Math.atan2(dy, dx);

            // 計算角度差（處理角度環繞）
            let angleDiff = monsterAngle - targetAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // 檢查是否在扇形內（考慮怪物體型的角度偏移）
            const angleOffset = dist > 0 ? Math.atan2(monsterRadius, dist) : Math.PI;
            if (Math.abs(angleDiff) <= halfAngle + angleOffset) {
                hitMonsters.push(monster.id);
            }
        }

        // 繪製扇形邊緣線（60% 透明度）
        this.drawSectorEdge(targetAngle, range, halfAngle, skill.definition.color);

        // 繪製打擊區特效（預設使用物件池版本，SHIFT+BACKSPACE 切換為網格版）
        const flashColor = skill.definition.flashColor || skill.definition.color;
        if (this.showGridSkillEffects) {
            this.flashSkillAreaSector(this.characterX, this.characterY, range, targetAngle, halfAngle, flashColor);
        } else {
            // 物件池版本（GPU 渲染，效能好）
            const halfAngleDeg = halfAngle * (180 / Math.PI);
            this.flashSkillEffectSector(this.characterX, this.characterY, range, targetAngle, halfAngleDeg, flashColor);
        }

        // 對命中的怪物造成傷害
        if (hitMonsters.length > 0) {
            // 取得命中怪物的位置（在造成傷害前）
            const hitMonstersData = monsters.filter(m => hitMonsters.includes(m.id));

            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }
            // 菁英怪掉落回血物品

            // 擊中 10 隻以上觸發畫面震動
            this.shakeScreen(hitMonsters.length);

            // 打擊火花（藍色，暴擊更亮，4 條，方向性反彈）
            for (const m of hitMonstersData) {
                const hitDir = Math.atan2(m.y - this.characterY, m.x - this.characterX);
                this.showHitSparkEffect(m.x, m.y, isCrit ? SparkColors.SOUL_RENDER_CRIT : SparkColors.SOUL_RENDER, hitDir, 4);
            }
        }
    }

    // 繪製扇形邊緣線（白色，與網格特效同時顯示）
    private drawSectorEdge(angle: number, radius: number, halfAngle: number, _color: number) {
        const startAngle = angle - halfAngle;
        const endAngle = angle + halfAngle;
        // 記錄世界座標
        const worldOriginX = this.characterX;
        const worldOriginY = this.characterY;

        const duration = 500; // 與網格特效同步
        const holdTime = 300;

        // radius 已經是螢幕像素單位（gameBounds.height * 0.3）
        const lineLength = radius;
        const lineWidth = 24; // LINE 紋理寬度

        // 創建兩條 LINE sprite
        const createEdgeLine = (lineAngle: number): Phaser.GameObjects.Sprite => {
            const screen = this.worldToScreen(worldOriginX, worldOriginY);
            // 線的中心點（從原點沿角度延伸半徑的一半）
            const centerX = screen.x + Math.cos(lineAngle) * (lineLength / 2);
            const centerY = screen.y + Math.sin(lineAngle) * (lineLength / 2);

            const lineSprite = this.add.sprite(centerX, centerY, MainScene.TEXTURE_LINE);
            this.skillGridContainer.add(lineSprite);
            lineSprite.setDepth(55);
            lineSprite.setTint(0xffffff);
            lineSprite.setRotation(lineAngle);
            lineSprite.setScale(
                lineLength / MainScene.EFFECT_TEXTURE_SIZE,
                lineWidth / MainScene.EFFECT_LINE_HEIGHT
            );
            lineSprite.setAlpha(0.9);
            return lineSprite;
        };

        const line1 = createEdgeLine(startAngle);
        const line2 = createEdgeLine(endAngle);

        // 保持後淡出 tween
        this.tweens.add({
            targets: [line1, line2],
            alpha: 0,
            delay: holdTime,
            duration: duration - holdTime,
            ease: 'Power2',
            onUpdate: () => {
                // 每幀更新位置以跟隨鏡頭
                const screen = this.worldToScreen(worldOriginX, worldOriginY);
                const center1X = screen.x + Math.cos(startAngle) * (lineLength / 2);
                const center1Y = screen.y + Math.sin(startAngle) * (lineLength / 2);
                const center2X = screen.x + Math.cos(endAngle) * (lineLength / 2);
                const center2Y = screen.y + Math.sin(endAngle) * (lineLength / 2);
                line1.setPosition(center1X, center1Y);
                line2.setPosition(center2X, center2Y);
            },
            onComplete: () => {
                line1.destroy();
                line2.destroy();
            }
        });

        // 初始位置更新 timer（在 holdTime 期間保持位置跟隨）
        const updateTimer = this.time.addEvent({
            delay: 16,
            callback: () => {
                if (!line1.active || !line2.active) return;
                const screen = this.worldToScreen(worldOriginX, worldOriginY);
                const center1X = screen.x + Math.cos(startAngle) * (lineLength / 2);
                const center1Y = screen.y + Math.sin(startAngle) * (lineLength / 2);
                const center2X = screen.x + Math.cos(endAngle) * (lineLength / 2);
                const center2Y = screen.y + Math.sin(endAngle) * (lineLength / 2);
                line1.setPosition(center1X, center1Y);
                line2.setPosition(center2X, center2Y);
            },
            callbackScope: this,
            repeat: Math.ceil(holdTime / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            updateTimer.remove();
            if (line1.active) line1.destroy();
            if (line2.active) line2.destroy();
        });
    }

    // 繪製圓形邊緣線（使用 circle_line 物件池）
    private drawCircleEdge(radius: number, _color: number, customOriginX?: number, customOriginY?: number) {
        // 記錄世界座標
        const worldOriginX = customOriginX ?? this.characterX;
        const worldOriginY = customOriginY ?? this.characterY;

        const duration = 500;
        const holdTime = 300;

        // 從物件池取得 sprite
        const circleSprite = this.getCircleLineEffectSprite();

        // 計算縮放（circle_line 紋理是 256x256，需要縮放到正確半徑）
        // 紋理是線條圓環，直徑約等於紋理尺寸，所以半徑 = radius 時，直徑 = radius * 2
        const scale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        circleSprite.setScale(scale);
        circleSprite.setTint(0xffffff);
        circleSprite.setAlpha(1);
        circleSprite.setRotation(0);

        // 每幀更新位置和旋轉
        const startTime = this.time.now;
        const baseRotationSpeed = Math.PI * 2; // 每秒 1 圈

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 每幀重新計算螢幕座標以跟隨鏡頭
            const screen = this.worldToScreen(worldOriginX, worldOriginY);
            circleSprite.setPosition(screen.x, screen.y);

            // 計算透明度
            let alpha = 1.0;
            if (elapsed > holdTime) {
                const fadeProgress = (elapsed - holdTime) / (duration - holdTime);
                alpha = 1.0 - fadeProgress;
            }
            circleSprite.setAlpha(alpha);

            // 旋轉動畫（最後 20% 加速）
            let rotationAngle: number;
            if (progress < 0.8) {
                rotationAngle = progress * duration / 1000 * baseRotationSpeed;
            } else {
                const normalPart = 0.8 * duration / 1000 * baseRotationSpeed;
                const acceleratedProgress = (progress - 0.8) / 0.2;
                const acceleratedPart = acceleratedProgress * 0.2 * duration / 1000 * baseRotationSpeed * 3;
                rotationAngle = normalPart + acceleratedPart;
            }
            circleSprite.setRotation(rotationAngle);

            if (progress >= 1) {
                this.releaseCircleLineEffectSprite(circleSprite);
            }
        };

        updateEffect();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            timerEvent.remove();
            if (circleSprite.active && circleSprite.visible) {
                this.releaseCircleLineEffectSprite(circleSprite);
            }
        });
    }

    // 繪製光束邊緣線（60% 透明度，與網格特效同時顯示）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private drawBeamEdge(angle: number, length: number, _width: number, _color: number, customOriginX?: number, customOriginY?: number) {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        const originX = customOriginX ?? this.characterX;
        const originY = customOriginY ?? this.characterY;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const duration = 800; // 與光束網格特效同步
        const holdTime = 380;
        const startTime = this.time.now;

        // 分段數量
        const segments = 20;

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            graphics.clear();

            let fadeProgress = 0;
            if (elapsed > holdTime) {
                fadeProgress = (elapsed - holdTime) / (duration - holdTime);
            }

            const baseAlpha = 0.6 * (1 - fadeProgress * 0.5); // 淡出但不完全消失

            if (baseAlpha > 0.01) {
                // 用多段線模擬頭尾漸淡
                for (let i = 0; i < segments; i++) {
                    const t1 = i / segments;
                    const t2 = (i + 1) / segments;

                    // 頭尾漸淡（前 15% 和後 15% 幾近透明）
                    const midT = (t1 + t2) / 2;
                    const headFade = Math.min(1, midT / 0.15);
                    const tailFade = Math.min(1, (1 - midT) / 0.15);
                    const segmentFade = Math.min(headFade, tailFade);
                    const segmentAlpha = baseAlpha * segmentFade * segmentFade;

                    if (segmentAlpha > 0.01) {
                        const x1 = originX + cosA * length * t1;
                        const y1 = originY + sinA * length * t1;
                        const x2 = originX + cosA * length * t2;
                        const y2 = originY + sinA * length * t2;

                        graphics.lineStyle(2, 0xffffff, segmentAlpha);
                        graphics.beginPath();
                        graphics.moveTo(x1, y1);
                        graphics.lineTo(x2, y2);
                        graphics.strokePath();
                    }
                }
            }

            if (progress >= 1) {
                graphics.destroy();
            }
        };

        updateEffect();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            if (graphics.active) graphics.destroy();
            timerEvent.remove();
        });
    }

    // 編碼者：對周圍敵人造成傷害
    // 起始範圍 3 單位，每級 +0.5 單位（Lv.0=3單位，Lv.5=5.5單位）
    // 起始傷害 2 單位，每級 +2 單位（Lv.0=2單位，Lv.5=12單位）- 傷害 x2、冷卻 2 秒
    private activateCoder(skill: PlayerSkill) {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 1 單位 = 畫面高度 10%
        const unitSize = this.gameBounds.height * 0.1;

        // 範圍：3 單位 + 每級 0.5 單位（Lv.0=3單位，Lv.5=5.5單位）
        const rangeUnits = 3 + skill.level * 0.5;
        const range = unitSize * rangeUnits;

        // 傷害：2 單位 + 每級 2 單位（Lv.0=2單位，Lv.5=12單位）
        const damageUnits = (1 + skill.level) * 2;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        // 檢查哪些怪物在範圍內
        const hitMonsters: number[] = [];
        for (const monster of monsters) {
            // 計算怪物碰撞半徑（體型的一半）
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 扣除怪物半徑，讓邊緣碰到就算命中
            if (dist - monsterRadius <= range) {
                hitMonsters.push(monster.id);
            }
        }

        // 繪製圓形邊緣線（60% 透明度）
        this.drawCircleEdge(range, skill.definition.color);

        // 繪製打擊區特效（預設使用物件池版本，SHIFT+BACKSPACE 切換為網格版）
        const flashColor = skill.definition.flashColor || skill.definition.color;
        if (this.showGridSkillEffects) {
            this.flashSkillAreaCircle(this.characterX, this.characterY, range, flashColor);
        } else {
            this.flashSkillEffectCircle(this.characterX, this.characterY, range, flashColor);
        }

        // 對命中的怪物造成傷害
        if (hitMonsters.length > 0) {
            // 取得命中怪物的位置（在造成傷害前）
            const hitMonstersData = monsters.filter(m => hitMonsters.includes(m.id));

            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }
            // 菁英怪掉落回血物品

            // 擊中 10 隻以上觸發畫面震動
            this.shakeScreen(hitMonsters.length);

            // 爆炸火花（紫色，圓形擴散效果）
            for (const m of hitMonstersData) {
                const screenPos = this.worldToScreen(m.x, m.y);
                this.showExplosionSparkEffect(screenPos.x, screenPos.y, 0xaa66ff, 0.8);
            }

            // MAX 後額外能力：爆發（從擊殺位置再次發動）
            const burstChance = this.skillManager.getCoderBurstChance(this.currentLevel);
            if (burstChance > 0 && result.killedPositions.length > 0) {
                this.triggerCoderBurst(result.killedPositions, range, finalDamage, skill, burstChance);
            }
        }
    }

    // 靈魂渲染穿透效果：整片扇形往外推移 5 單位，速度減半，每 0.5 秒造成一次經過區域傷害
    private triggerSoulRenderWave(
        angle: number,
        startRange: number,
        halfAngle: number,
        damage: number,
        skill: PlayerSkill
    ) {
        const unitSize = this.gameBounds.height * 0.1; // 1 單位 = 畫面高度 10%
        const travelDistance = unitSize * 5; // 移動 5 單位
        const arcLength = startRange * halfAngle * 2; // 原本弧長
        const flashColor = skill.definition.flashColor || skill.definition.color;

        // 記錄起始位置（玩家位置）
        const originX = this.characterX;
        const originY = this.characterY;

        // 繪製移動中的扇形特效（預設使用物件池版本，SHIFT+BACKSPACE 切換為網格版）
        // 速度減半：duration 從 500ms 改為 1000ms
        if (this.showGridSkillEffects) {
            this.flashSkillAreaSectorMoving(originX, originY, startRange, angle, halfAngle, flashColor, travelDistance);
        } else {
            this.flashSkillEffectSectorMoving(originX, originY, startRange, angle, halfAngle, flashColor, travelDistance);
        }

        // 傷害檢測：每 0.3 秒造成一次經過區域傷害（共 3-4 次）
        const duration = 1000; // 總持續時間 1 秒
        const damageInterval = 300; // 每 0.3 秒傷害一次
        const hitThickness = unitSize * 1.0; // 檢測範圍

        const dealDamageAtProgress = (progress: number) => {
            // 當前弧線的半徑位置
            const currentRadius = startRange + travelDistance * progress;
            // 保持弧長不變，計算新的半角
            const currentHalfAngle = arcLength / (2 * currentRadius);

            // 檢測弧線範圍內的怪物
            const monsters = this.monsterManager.getMonsters();
            const hitMonsters: number[] = [];

            for (const monster of monsters) {
                const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;
                const dx = monster.x - originX;
                const dy = monster.y - originY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // 檢查是否在弧線厚度範圍內
                if (Math.abs(dist - currentRadius) > hitThickness + monsterRadius) continue;

                // 檢查角度
                const monsterAngle = Math.atan2(dy, dx);
                let angleDiff = monsterAngle - angle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                const angleOffset = dist > 0 ? Math.atan2(monsterRadius, dist) : Math.PI;
                if (Math.abs(angleDiff) <= currentHalfAngle + angleOffset) {
                    hitMonsters.push(monster.id);
                }
            }

            // 對命中的怪物造成傷害
            if (hitMonsters.length > 0) {
                // 取得命中怪物的資料（在造成傷害前）
                const hitMonstersData = monsters.filter(m => hitMonsters.includes(m.id));

                const result = this.monsterManager.damageMonsters(hitMonsters, damage);
                if (result.totalExp > 0) {
                    this.addExp(result.totalExp);
                }
    
                // 擊中多隻觸發畫面震動
                this.shakeScreen(hitMonsters.length);

                // 打擊火花（藍色，方向性反彈）
                for (const m of hitMonstersData) {
                    const hitDir = Math.atan2(m.y - originY, m.x - originX);
                    this.showHitSparkEffect(m.x, m.y, SparkColors.SOUL_RENDER, hitDir, 3);
                }
            }
        };

        // 每 0.3 秒傷害一次（0.3s, 0.6s, 0.9s, 1.0s）
        for (let t = damageInterval; t <= duration; t += damageInterval) {
            const progress = t / duration;
            this.time.delayedCall(t, () => {
                dealDamageAtProgress(progress);
            });
        }
    }

    // 靈魂渲染 MAX：三向衝擊波（以最近敵人為基準 +0°/+120°/+240°）
    private triggerSoulRenderTripleWave(skill: PlayerSkill) {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 找最近的怪物
        let nearestMonster = monsters[0];
        let nearestDist = Infinity;
        for (const monster of monsters) {
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestMonster = monster;
            }
        }

        // 計算朝向最近怪物的角度（作為基準角度）
        const baseAngle = Math.atan2(
            nearestMonster.y - this.characterY,
            nearestMonster.x - this.characterX
        );

        // 更新角色面向
        this.facingRight = Math.cos(baseAngle) >= 0;
        this.updateCharacterSprite();

        const unitSize = this.gameBounds.height * 0.1;
        const startRange = this.gameBounds.height * 0.3; // 3 單位起始半徑（與原本相同）
        const travelDistance = unitSize * 10; // 10 單位射程
        // 使用 MAX 等級的扇形角度：110°（與原本 Lv.5 相同）
        const sectorAngle = 110;
        const halfAngle = (sectorAngle / 2) * (Math.PI / 180);
        const arcLength = startRange * halfAngle * 2; // 保持弧長不變
        const flashColor = skill.definition.flashColor || skill.definition.color;

        // 10 單位傷害
        const baseDamage = MainScene.DAMAGE_UNIT * 10;
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        // 記錄起始位置（玩家位置）
        const originX = this.characterX;
        const originY = this.characterY;

        // 三個方向：以最近敵人為基準 +0°, +120°, +240°
        const angles = [
            baseAngle,
            baseAngle + (Math.PI * 2) / 3,  // +120°
            baseAngle + (Math.PI * 4) / 3   // +240°
        ];

        for (const angle of angles) {
            // 繪製移動中的扇形特效（與原本衝擊波相同）
            if (this.showGridSkillEffects) {
                this.flashSkillAreaSectorMoving(originX, originY, startRange, angle, halfAngle, flashColor, travelDistance);
            } else {
                this.flashSkillEffectSectorMoving(originX, originY, startRange, angle, halfAngle, flashColor, travelDistance);
            }

            // 傷害檢測：從身邊到遠處，每 0.1 秒判定一次
            const duration = 1000;
            const damageInterval = 100; // 0.1 秒判定一次
            const hitThickness = unitSize * 1.5; // 加厚判定區域
            const totalDistance = startRange + travelDistance; // 總移動距離（從 0 到 13 單位）

            // 記錄已經被這波衝擊波打過的怪物（避免重複傷害）
            const hitMonsterSet = new Set<number>();

            const dealDamageAtProgress = (progress: number) => {
                // 從 0 開始到 totalDistance
                const currentRadius = totalDistance * progress;
                // 計算半角（距離越遠角度越小，保持弧長）
                const currentHalfAngle = currentRadius > 0 ? arcLength / (2 * currentRadius) : Math.PI;

                const monsters = this.monsterManager.getMonsters();
                const hitMonsters: number[] = [];

                for (const monster of monsters) {
                    // 跳過已經被打過的怪物
                    if (hitMonsterSet.has(monster.id)) continue;

                    const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;
                    const dx = monster.x - originX;
                    const dy = monster.y - originY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // 檢查是否在衝擊波範圍內（從 0 到 currentRadius + hitThickness）
                    if (dist > currentRadius + hitThickness + monsterRadius) continue;
                    // 跳過已經通過的區域（衝擊波前緣 - hitThickness）
                    if (dist < currentRadius - hitThickness - monsterRadius && currentRadius > hitThickness) continue;

                    const monsterAngle = Math.atan2(dy, dx);
                    let angleDiff = monsterAngle - angle;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                    const angleOffset = dist > 0 ? Math.atan2(monsterRadius, dist) : Math.PI;
                    if (Math.abs(angleDiff) <= currentHalfAngle + angleOffset) {
                        hitMonsters.push(monster.id);
                        hitMonsterSet.add(monster.id); // 標記為已打擊
                    }
                }

                if (hitMonsters.length > 0) {
                    const hitMonstersData = monsters.filter(m => hitMonsters.includes(m.id));

                    const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                    if (result.totalExp > 0) {
                        this.addExp(result.totalExp);
                    }

                    this.shakeScreen(hitMonsters.length);

                    for (const m of hitMonstersData) {
                        const hitDir = Math.atan2(m.y - originY, m.x - originX);
                        this.showHitSparkEffect(m.x, m.y, isCrit ? SparkColors.SOUL_RENDER_CRIT : SparkColors.SOUL_RENDER, hitDir, 3);
                    }
                }
            };

            // 從 0 開始，每 0.1 秒判定一次
            for (let t = 0; t <= duration; t += damageInterval) {
                const progress = t / duration;
                this.time.delayedCall(t, () => {
                    dealDamageAtProgress(progress);
                });
            }
        }
    }

    // 繪製移動中的扇形網格特效（整片扇形往外推）
    private flashSkillAreaSectorMoving(
        centerX: number, centerY: number,
        startRadius: number, angle: number, halfAngle: number,
        color: number, travelDistance: number
    ) {
        const screen = this.worldToScreen(centerX, centerY);
        const screenCenterX = screen.x;
        const screenCenterY = screen.y;

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const duration = 1000; // 速度減半
        const startTime = this.time.now;

        // 扇形的虛擬圓心會沿著 angle 方向移動
        // 計算移動的方向向量
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);

        // 收集所有可能涉及的格子（擴大範圍以涵蓋移動路徑）
        const maxRange = startRadius + travelDistance + startRadius;
        const cellsData: { col: number; row: number; screenX: number; screenY: number }[] = [];

        const minCol = Math.max(0, Math.floor((screenCenterX - maxRange) / cellTotal));
        const maxCol = Math.min(this.skillGridCols - 1, Math.ceil((screenCenterX + maxRange) / cellTotal));
        const minRow = Math.max(0, Math.floor((screenCenterY - maxRange) / cellTotal));
        const maxRow = Math.min(this.skillGridRows - 1, Math.ceil((screenCenterY + maxRange) / cellTotal));

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellCenterX = col * cellTotal + this.skillGridCellSize / 2;
                const cellCenterY = row * cellTotal + this.skillGridCellSize / 2;
                cellsData.push({ col, row, screenX: cellCenterX, screenY: cellCenterY });
            }
        }

        if (cellsData.length === 0) return;

        const flashCells: Phaser.GameObjects.Rectangle[] = [];
        for (const { col, row } of cellsData) {
            const x = col * cellTotal + this.skillGridCellSize / 2;
            const y = row * cellTotal + this.skillGridCellSize / 2;
            const cell = this.add.rectangle(x, y, this.skillGridCellSize, this.skillGridCellSize, color, 0);
            cell.setVisible(false);
            this.skillGridContainer.add(cell);
            flashCells.push(cell);
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 虛擬圓心的當前位置（沿著攻擊方向移動）
            const offset = travelDistance * progress;
            const virtualCenterX = screenCenterX + dirX * offset;
            const virtualCenterY = screenCenterY + dirY * offset;

            // 淡出（後半段開始淡出）
            const fadeStart = 0.5;
            const fadeProgress = progress > fadeStart ? (progress - fadeStart) / (1 - fadeStart) : 0;

            let i = 0;
            for (const { screenX, screenY } of cellsData) {
                const cell = flashCells[i++];
                if (!cell) continue;

                // 計算格子相對於虛擬圓心的距離和角度
                const dx = screenX - virtualCenterX;
                const dy = screenY - virtualCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // 檢查是否在扇形範圍內（只顯示外半部分，50%~100% 半徑）
                const innerRadius = startRadius * 0.5;
                if (dist >= innerRadius && dist <= startRadius) {
                    const cellAngle = Math.atan2(dy, dx);
                    let angleDiff = cellAngle - angle;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                    if (Math.abs(angleDiff) <= halfAngle) {
                        // 使用與原本扇形相同的樣式，但基於外半部分計算
                        // distRatio: 0 = 內緣(50%), 1 = 外緣(100%)
                        const distRatio = (dist - innerRadius) / (startRadius - innerRadius);
                        const angleRatio = Math.abs(angleDiff) / halfAngle;

                        // 綜合邊緣值（取較大者，越接近邊緣值越高）
                        const edgeness = Math.max(distRatio, angleRatio);

                        // 使用平滑的 S 曲線（smoothstep）讓過渡更自然
                        const t = Math.max(0, Math.min(1, (edgeness - 0.3) / 0.7));
                        const smoothT = t * t * (3 - 2 * t);

                        // 透明度：內緣 15%，外緣 75%
                        const baseAlpha = 0.15 + smoothT * 0.60;
                        const currentAlpha = baseAlpha * (1 - fadeProgress);

                        if (currentAlpha > 0.01) {
                            // 明度：中心壓暗，邊緣保持原色
                            const brightnessMult = 0.5 + smoothT * 0.5;

                            const r = ((color >> 16) & 0xff);
                            const g = ((color >> 8) & 0xff);
                            const b = (color & 0xff);

                            const finalR = Math.floor(r * brightnessMult);
                            const finalG = Math.floor(g * brightnessMult);
                            const finalB = Math.floor(b * brightnessMult);
                            const finalColor = (finalR << 16) | (finalG << 8) | finalB;

                            cell.setFillStyle(finalColor, currentAlpha);
                            cell.setVisible(true);
                        } else {
                            cell.setVisible(false);
                        }
                    } else {
                        cell.setVisible(false);
                    }
                } else {
                    cell.setVisible(false);
                }
            }

            if (progress >= 1) {
                for (const cell of flashCells) {
                    cell.destroy();
                }
            } else {
                this.time.delayedCall(16, updateEffect);
            }
        };

        updateEffect();
    }

    // 遊戲先知爆發效果：從擊殺位置再次發動圓形攻擊（範圍 50%）
    private triggerCoderBurst(
        killedPositions: { x: number; y: number }[],
        range: number,
        damage: number,
        skill: PlayerSkill,
        burstChance: number
    ) {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 爆發範圍為原範圍的 50%
        const burstRange = range * 0.5;

        for (const pos of killedPositions) {
            // 每個擊殺位置獨立判定機率
            if (Math.random() >= burstChance) continue;
            // 收集這次爆發命中的怪物
            const burstHitMonsters: number[] = [];
            for (const monster of monsters) {
                const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;
                const dx = monster.x - pos.x;
                const dy = monster.y - pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist - monsterRadius <= burstRange) {
                    burstHitMonsters.push(monster.id);
                }
            }

            // 繪製圓形邊緣線
            this.drawCircleEdge(burstRange, skill.definition.color, pos.x, pos.y);

            // 繪製打擊區特效（預設使用物件池版本，SHIFT+BACKSPACE 切換為網格版）
            const burstFlashColor = skill.definition.flashColor || skill.definition.color;
            if (this.showGridSkillEffects) {
                this.flashSkillAreaCircle(pos.x, pos.y, burstRange, burstFlashColor);
            } else {
                this.flashSkillEffectCircle(pos.x, pos.y, burstRange, burstFlashColor);
            }

            // 對爆發命中的怪物造成傷害
            if (burstHitMonsters.length > 0) {
                const burstHitPositions = monsters
                    .filter(m => burstHitMonsters.includes(m.id))
                    .map(m => ({ x: m.x, y: m.y }));

                const burstResult = this.monsterManager.damageMonsters(burstHitMonsters, damage);
                if (burstResult.totalExp > 0) {
                    this.addExp(burstResult.totalExp);
                }
            }
        }
    }

    // 視效師：投射貫穿光束，對直線 10 單位範圍敵人造成傷害
    // 每級多發射一道隨機方向的光束（Lv.0=1道，Lv.5=6道）
    // 傷害：1 單位 + 每級 1 單位（Lv.0=1單位，Lv.5=6單位）
    private activateVfx(skill: PlayerSkill) {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 檢查是否 MAX 等級
        const isMax = skill.level >= skill.definition.maxLevel;

        // MAX 時：3 條精準鎖定射線，10 倍粗
        // 非 MAX：光束數量 = 技能等級 + 1（Lv.0=1道，Lv.4=5道）
        const beamCount = isMax ? 3 : skill.level + 1;

        // 光束參數
        const range = isMax
            ? this.gameBounds.height * 1.5  // MAX：15 單位射程
            : this.gameBounds.height * 1.0; // 普通：10 單位
        const beamWidth = isMax
            ? this.gameBounds.height * 0.5  // MAX：5 單位寬（10 倍粗）
            : this.gameBounds.height * 0.05; // 普通：0.5 單位

        // 傷害：1 單位 + 每級 1 單位（Lv.0=1單位，Lv.5=6單位）
        const damageUnits = 1 + skill.level;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        // 收集所有被命中的怪物（使用 Set 避免重複）
        const allHitMonsters = new Set<number>();
        const targetAngles: number[] = [];

        if (isMax) {
            // MAX 模式：精準鎖定最近的 3 隻怪物
            const monstersWithDist = monsters.map(monster => {
                const dx = monster.x - this.characterX;
                const dy = monster.y - this.characterY;
                return { monster, dist: Math.sqrt(dx * dx + dy * dy) };
            });
            monstersWithDist.sort((a, b) => a.dist - b.dist);

            const targetCount = Math.min(beamCount, monstersWithDist.length);
            for (let i = 0; i < targetCount; i++) {
                const target = monstersWithDist[i].monster;
                const targetAngle = Math.atan2(
                    target.y - this.characterY,
                    target.x - this.characterX
                );
                targetAngles.push(targetAngle);
            }
        } else {
            // 普通模式：隨機選擇不重複的目標怪物
            const availableIndices = monsters.map((_, i) => i);
            for (let beam = 0; beam < beamCount; beam++) {
                let targetAngle: number;
                if (availableIndices.length > 0) {
                    const pickIndex = Math.floor(Math.random() * availableIndices.length);
                    const monsterIndex = availableIndices[pickIndex];
                    availableIndices.splice(pickIndex, 1);
                    const targetMonster = monsters[monsterIndex];
                    targetAngle = Math.atan2(
                        targetMonster.y - this.characterY,
                        targetMonster.x - this.characterX
                    );
                } else {
                    targetAngle = Math.random() * Math.PI * 2;
                }
                targetAngles.push(targetAngle);
            }
        }

        // 發射光束
        for (const targetAngle of targetAngles) {
            // 檢查哪些怪物在這道光束範圍內
            for (const monster of monsters) {
                const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;
                const dx = monster.x - this.characterX;
                const dy = monster.y - this.characterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist - monsterRadius > range) continue;

                const dirX = Math.cos(targetAngle);
                const dirY = Math.sin(targetAngle);
                const projLength = dx * dirX + dy * dirY;

                if (projLength < -monsterRadius) continue;

                const perpDist = Math.abs(dx * dirY - dy * dirX);
                if (perpDist <= beamWidth / 2 + monsterRadius) {
                    allHitMonsters.add(monster.id);
                }
            }

            // 繪製光束邊緣線
            this.drawBeamEdge(targetAngle, range, beamWidth, skill.definition.color);

            // 繪製光束特效
            const endX = this.characterX + Math.cos(targetAngle) * range;
            const endY = this.characterY + Math.sin(targetAngle) * range;
            const beamFlashColor = skill.definition.flashColor || skill.definition.color;
            if (this.showGridSkillEffects) {
                this.flashSkillAreaLine(this.characterX, this.characterY, endX, endY, beamWidth, beamFlashColor);
            } else {
                this.flashSkillEffectLine(this.characterX, this.characterY, endX, endY, beamWidth, beamFlashColor);
            }
        }

        // 更新角色面向（朝第一道光束方向）
        if (targetAngles.length > 0) {
            this.facingRight = Math.cos(targetAngles[0]) >= 0;
            this.updateCharacterSprite();
        }

        // 對命中的怪物造成傷害
        const hitMonsterIds = Array.from(allHitMonsters);
        if (hitMonsterIds.length > 0) {
            const hitMonstersData = monsters.filter(m => hitMonsterIds.includes(m.id));
            const hitPositions = hitMonstersData.map(m => ({ x: m.x, y: m.y }));

            const result = this.monsterManager.damageMonsters(hitMonsterIds, finalDamage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }

            this.shakeScreen(hitMonsterIds.length);

            // 打擊火花（綠色，爆擊更亮，5 條，光束方向）
            for (const m of hitMonstersData) {
                const hitDir = Math.atan2(m.y - this.characterY, m.x - this.characterX);
                this.showHitSparkEffect(m.x, m.y, isCrit ? SparkColors.VFX_SNIPE_CRIT : SparkColors.VFX_SNIPE, hitDir, 5);
            }

            // MAX 後額外能力：連鎖（再發射一次）
            const chainChance = this.skillManager.getVfxChainChance(this.currentLevel);
            if (chainChance > 0 && hitPositions.length > 0) {
                this.triggerVfxChain(hitPositions, finalDamage, chainChance, skill, isCrit);
            }
        }
    }

    // 疾光狙擊 MAX 連鎖效果：3 條鎖定最近敵人的超粗射線
    private triggerVfxChain(
        _hitPositions: { x: number; y: number }[],
        damage: number,
        chainChance: number,
        skill: PlayerSkill,
        isCrit: boolean
    ) {
        // 機率判定（只判定一次）
        if (Math.random() >= chainChance) return;

        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        const range = this.gameBounds.height * 1.5; // 加長射程（15 單位）
        const beamWidth = this.gameBounds.height * 0.5; // 10 倍粗（5 單位寬）
        const chainFlashColor = skill.definition.flashColor || skill.definition.color;

        // 找出最近的 3 隻怪物
        const monstersWithDist = monsters.map(monster => {
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            return { monster, dist: Math.sqrt(dx * dx + dy * dy) };
        });
        monstersWithDist.sort((a, b) => a.dist - b.dist);

        const targetCount = Math.min(3, monstersWithDist.length);
        const chainHitMonsters: Set<number> = new Set();

        // 對最近的 3 隻怪物各發射一條超粗射線
        for (let i = 0; i < targetCount; i++) {
            const target = monstersWithDist[i].monster;

            // 計算射線角度（精準鎖定目標）
            const angle = Math.atan2(
                target.y - this.characterY,
                target.x - this.characterX
            );

            // 檢測這條超粗射線命中的所有怪物
            for (const monster of monsters) {
                const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;
                const dx = monster.x - this.characterX;
                const dy = monster.y - this.characterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist - monsterRadius > range) continue;

                const dirX = Math.cos(angle);
                const dirY = Math.sin(angle);
                const projLength = dx * dirX + dy * dirY;

                // 只檢測射線方向
                if (projLength < -monsterRadius) continue;

                const perpDist = Math.abs(dx * dirY - dy * dirX);
                if (perpDist <= beamWidth / 2 + monsterRadius) {
                    chainHitMonsters.add(monster.id);
                }
            }

            // 繪製超粗光束邊緣線
            this.drawBeamEdge(angle, range, beamWidth, skill.definition.color);

            // 繪製超粗光束特效
            const endX = this.characterX + Math.cos(angle) * range;
            const endY = this.characterY + Math.sin(angle) * range;
            if (this.showGridSkillEffects) {
                this.flashSkillAreaLine(this.characterX, this.characterY, endX, endY, beamWidth, chainFlashColor);
            } else {
                this.flashSkillEffectLine(this.characterX, this.characterY, endX, endY, beamWidth, chainFlashColor);
            }
        }

        // 對連鎖命中的怪物造成傷害
        const hitMonsterIds = Array.from(chainHitMonsters);
        if (hitMonsterIds.length > 0) {
            const hitMonstersData = monsters.filter(m => chainHitMonsters.has(m.id));

            const chainResult = this.monsterManager.damageMonsters(hitMonsterIds, damage);
            if (chainResult.totalExp > 0) {
                this.addExp(chainResult.totalExp);
            }

            // 擊中震動
            this.shakeScreen(hitMonsterIds.length);

            // 打擊火花（綠色，爆擊更亮）
            for (const m of hitMonstersData) {
                const hitDir = Math.atan2(m.y - this.characterY, m.x - this.characterX);
                this.showHitSparkEffect(m.x, m.y, isCrit ? SparkColors.VFX_SNIPE_CRIT : SparkColors.VFX_SNIPE, hitDir, 5);
            }
        }
    }

    // 繪製光束特效（從發射點漸漸淡出到外圍，帶高亮漸層）
    private _drawBeamEffect(angle: number, length: number, width: number, color: number) {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        // 記錄發射點位置
        const originX = this.characterX;
        const originY = this.characterY;

        // 計算光束的終點
        const endX = originX + Math.cos(angle) * length;
        const endY = originY + Math.sin(angle) * length;

        // 計算垂直方向（用於光束寬度）- 增加寬度
        const actualWidth = width * 1.5;
        const perpX = Math.sin(angle) * actualWidth / 2;
        const perpY = -Math.cos(angle) * actualWidth / 2;

        // 高亮中心線的垂直方向（較窄）
        const highlightPerpX = Math.sin(angle) * actualWidth * 0.4 / 2;
        const highlightPerpY = -Math.cos(angle) * actualWidth * 0.4 / 2;

        // 從發射點漸漸淡出到外圍的動畫
        const segments = 15;
        const duration = 1000;
        const startTime = this.time.now;

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            graphics.clear();

            // 前 30% 保持高亮，後 70% 淡出
            const holdPhase = 0.3;
            const fadeProgress = progress < holdPhase ? 0 : (progress - holdPhase) / (1 - holdPhase);

            // 繪製多段光束，從起點到終點透明度遞減
            for (let i = 0; i < segments; i++) {
                const t1 = i / segments;
                const t2 = (i + 1) / segments;

                const x1 = originX + (endX - originX) * t1;
                const y1 = originY + (endY - originY) * t1;
                const x2 = originX + (endX - originX) * t2;
                const y2 = originY + (endY - originY) * t2;

                const baseAlpha = 0.85 * (1 - t1 * 0.6);
                const alpha = baseAlpha * (1 - fadeProgress);

                if (alpha > 0.01) {
                    graphics.fillStyle(color, alpha);
                    graphics.beginPath();
                    graphics.moveTo(x1 - perpX, y1 - perpY);
                    graphics.lineTo(x2 - perpX, y2 - perpY);
                    graphics.lineTo(x2 + perpX, y2 + perpY);
                    graphics.lineTo(x1 + perpX, y1 + perpY);
                    graphics.closePath();
                    graphics.fillPath();
                }
            }

            // 繪製高亮中心帶（白色漸層）
            for (let i = 0; i < segments; i++) {
                const t1 = i / segments;
                const t2 = (i + 1) / segments;

                const x1 = originX + (endX - originX) * t1;
                const y1 = originY + (endY - originY) * t1;
                const x2 = originX + (endX - originX) * t2;
                const y2 = originY + (endY - originY) * t2;

                const highlightAlpha = 0.98 * (1 - t1 * 0.5) * (1 - fadeProgress);
                if (highlightAlpha > 0.01) {
                    graphics.fillStyle(0xffffff, highlightAlpha);
                    graphics.beginPath();
                    graphics.moveTo(x1 - highlightPerpX, y1 - highlightPerpY);
                    graphics.lineTo(x2 - highlightPerpX, y2 - highlightPerpY);
                    graphics.lineTo(x2 + highlightPerpX, y2 + highlightPerpY);
                    graphics.lineTo(x1 + highlightPerpX, y1 + highlightPerpY);
                    graphics.closePath();
                    graphics.fillPath();
                }
            }

            // 繪製中心高亮線
            const centerAlpha = 1.0 * (1 - fadeProgress);
            if (centerAlpha > 0.01) {
                graphics.lineStyle(6, 0xffffff, centerAlpha);
                graphics.beginPath();
                graphics.moveTo(originX, originY);
                graphics.lineTo(endX, endY);
                graphics.strokePath();
            }

            // 繪製邊框
            const borderAlpha = 1.0 * (1 - fadeProgress);
            if (borderAlpha > 0.01) {
                graphics.lineStyle(4, color, borderAlpha);
                graphics.beginPath();
                graphics.moveTo(originX - perpX, originY - perpY);
                graphics.lineTo(endX - perpX, endY - perpY);
                graphics.lineTo(endX + perpX, endY + perpY);
                graphics.lineTo(originX + perpX, originY + perpY);
                graphics.closePath();
                graphics.strokePath();

                // 白色外框
                graphics.lineStyle(2, 0xffffff, borderAlpha * 0.6);
                graphics.beginPath();
                graphics.moveTo(originX - perpX * 1.1, originY - perpY * 1.1);
                graphics.lineTo(endX - perpX * 1.1, endY - perpY * 1.1);
                graphics.lineTo(endX + perpX * 1.1, endY + perpY * 1.1);
                graphics.lineTo(originX + perpX * 1.1, originY + perpY * 1.1);
                graphics.closePath();
                graphics.strokePath();
            }

            if (progress >= 1) {
                graphics.destroy();
            }
        };

        // 使用 time event 持續更新
        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            if (graphics.active) graphics.destroy();
            timerEvent.remove();
        });
    }

    // 繪製十字星芒擊中效果
    private _drawCrossStarBurst(positions: { x: number; y: number }[], color: number) {
        // 1 單位 = 畫面高度 10%
        const unitSize = this.gameBounds.height * 0.1;
        const starSize = unitSize * 1; // 1 單位大小
        const duration = 600; // 600ms

        for (const pos of positions) {
            const graphics = this.add.graphics();
            this.worldContainer.add(graphics);

            const startTime = this.time.now;

            const updateStar = () => {
                const elapsed = this.time.now - startTime;
                const progress = Math.min(elapsed / duration, 1);

                graphics.clear();

                // 前 20% 放大，中間 20% 保持，後 60% 淡出
                const scaleProgress = progress < 0.2 ? progress / 0.2 : 1;
                const fadeProgress = progress < 0.4 ? 0 : (progress - 0.4) / 0.6;

                const currentSize = starSize * scaleProgress;
                const alpha = 1 - fadeProgress;

                if (alpha > 0.01 && currentSize > 0) {
                    // 繪製十字星芒（4個方向的光芒）- 更粗
                    const armWidth = currentSize * 0.2;
                    const armLength = currentSize;

                    // 中心高亮 - 更大更亮
                    const centerSize = currentSize * 0.4;
                    graphics.fillStyle(0xffffff, alpha);
                    graphics.fillCircle(pos.x, pos.y, centerSize);

                    // 四個方向的光芒（上下左右）
                    for (let i = 0; i < 4; i++) {
                        const angle = (i * Math.PI) / 2; // 0, 90, 180, 270 度

                        // 計算光芒的方向
                        const dirX = Math.cos(angle);
                        const dirY = Math.sin(angle);
                        const perpX = -dirY;
                        const perpY = dirX;

                        // 繪製漸層光芒
                        const segments = 6;
                        for (let j = 0; j < segments; j++) {
                            const t1 = j / segments;
                            const t2 = (j + 1) / segments;

                            // 從中心向外漸細
                            const width1 = armWidth * (1 - t1 * 0.8);
                            const width2 = armWidth * (1 - t2 * 0.8);

                            const x1 = pos.x + dirX * armLength * t1;
                            const y1 = pos.y + dirY * armLength * t1;
                            const x2 = pos.x + dirX * armLength * t2;
                            const y2 = pos.y + dirY * armLength * t2;

                            // 透明度從中心向外遞減
                            const segmentAlpha = alpha * (1 - t1 * 0.7);

                            // 繪製主色光芒
                            graphics.fillStyle(color, segmentAlpha * 0.8);
                            graphics.beginPath();
                            graphics.moveTo(x1 + perpX * width1, y1 + perpY * width1);
                            graphics.lineTo(x2 + perpX * width2, y2 + perpY * width2);
                            graphics.lineTo(x2 - perpX * width2, y2 - perpY * width2);
                            graphics.lineTo(x1 - perpX * width1, y1 - perpY * width1);
                            graphics.closePath();
                            graphics.fillPath();

                            // 繪製白色高亮核心
                            const highlightWidth1 = width1 * 0.5;
                            const highlightWidth2 = width2 * 0.5;
                            graphics.fillStyle(0xffffff, segmentAlpha * 0.9);
                            graphics.beginPath();
                            graphics.moveTo(x1 + perpX * highlightWidth1, y1 + perpY * highlightWidth1);
                            graphics.lineTo(x2 + perpX * highlightWidth2, y2 + perpY * highlightWidth2);
                            graphics.lineTo(x2 - perpX * highlightWidth2, y2 - perpY * highlightWidth2);
                            graphics.lineTo(x1 - perpX * highlightWidth1, y1 - perpY * highlightWidth1);
                            graphics.closePath();
                            graphics.fillPath();
                        }
                    }

                    // 對角線小光芒（45度方向，較短）
                    const diagonalLength = armLength * 0.5;
                    const diagonalWidth = armWidth * 0.6;
                    for (let i = 0; i < 4; i++) {
                        const angle = (i * Math.PI) / 2 + Math.PI / 4; // 45, 135, 225, 315 度

                        const dirX = Math.cos(angle);
                        const dirY = Math.sin(angle);
                        const perpX = -dirY;
                        const perpY = dirX;

                        const segments = 4;
                        for (let j = 0; j < segments; j++) {
                            const t1 = j / segments;
                            const t2 = (j + 1) / segments;

                            const width1 = diagonalWidth * (1 - t1 * 0.9);
                            const width2 = diagonalWidth * (1 - t2 * 0.9);

                            const x1 = pos.x + dirX * diagonalLength * t1;
                            const y1 = pos.y + dirY * diagonalLength * t1;
                            const x2 = pos.x + dirX * diagonalLength * t2;
                            const y2 = pos.y + dirY * diagonalLength * t2;

                            const segmentAlpha = alpha * (1 - t1 * 0.8) * 0.7;

                            graphics.fillStyle(color, segmentAlpha);
                            graphics.beginPath();
                            graphics.moveTo(x1 + perpX * width1, y1 + perpY * width1);
                            graphics.lineTo(x2 + perpX * width2, y2 + perpY * width2);
                            graphics.lineTo(x2 - perpX * width2, y2 - perpY * width2);
                            graphics.lineTo(x1 - perpX * width1, y1 - perpY * width1);
                            graphics.closePath();
                            graphics.fillPath();
                        }
                    }
                }

                if (progress >= 1) {
                    graphics.destroy();
                }
            };

            // 初始繪製
            updateStar();

            // 使用 time event 持續更新
            const timerEvent = this.time.addEvent({
                delay: 16,
                callback: updateStar,
                callbackScope: this,
                repeat: Math.ceil(duration / 16)
            });

            // 確保清理
            this.time.delayedCall(duration + 50, () => {
                if (graphics.active) graphics.destroy();
                timerEvent.remove();
            });
        }
    }

    // 架構師：產生護盾，護盾吸收傷害並反傷給攻擊者
    // 反傷傷害：2/4/6/8/10/20（Lv.0~5），擊退只有 MAX 才有
    // MAX 額外能力：八角爆盾 - 護盾殘值×10 傷害、4 單位範圍爆炸並擊退
    private activateArchitect(skill: PlayerSkill) {
        // 記錄技能等級（用於反傷擊退判斷）
        this.architectSkillLevel = skill.level;

        // MAX 後額外能力：八角爆盾 - 護盾有殘值時觸發爆炸
        // 只要技能達到 MAX（explosionChance > 0），就 100% 觸發
        const explosionChance = this.skillManager.getArchitectExplosionChance(this.currentLevel);
        if (explosionChance > 0 && this.currentShield > 0) {
            this.triggerShieldExplosion(skill);
        }

        // 絕對邏輯防禦：護盾重新填充時，剩餘輪鋸向外飛出
        if (this.currentSawBladePositions.length > 0) {
            this.launchSawBladesOutward();
        }

        // 護盾值為最大 HP 的 30%
        const shieldAmount = Math.floor(this.maxHp * 0.3);

        // 設定護盾值（不疊加，直接設定）
        this.currentShield = shieldAmount;
        this.maxShield = shieldAmount; // 記錄護盾最大值用於護盾比例計算

        // 反傷傷害：2/4/6/8/10/20（Lv.0=2, Lv.5=20）
        const reflectDamageTable = [2, 4, 6, 8, 10, 20];
        const reflectUnits = reflectDamageTable[skill.level] || 2;
        this.shieldReflectDamage = MainScene.DAMAGE_UNIT * reflectUnits;

        // 繪製護盾條
        this.drawShieldBarFill();

        // 繪製護盾特效（使用護盾圖片）
        const shieldRadius = this.gameBounds.height * 0.18;
        const shieldFlashColor = skill.definition.flashColor || skill.definition.color;
        this.flashShieldEffect(this.characterX, this.characterY, shieldRadius, shieldFlashColor);

        // 地面文字金色呼吸掃光
        this.triggerShieldBreathScan();
    }

    // 八角爆盾：護盾殘值×10 傷害、4 單位範圍金色八角盾爆炸並擊退
    private triggerShieldExplosion(skill: PlayerSkill) {
        const unitSize = this.gameBounds.height * 0.1;
        const explosionRadius = unitSize * 4; // 4 單位範圍
        const flashColor = skill.definition.flashColor || skill.definition.color;

        // 傷害：護盾殘值（currentShield）乘以 10 倍
        const damage = this.currentShield * 10;

        // 繪製八角盾爆炸特效
        this.flashOctagonShieldExplosion(this.characterX, this.characterY, explosionRadius, flashColor);

        // 檢測範圍內的怪物
        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];

        for (const monster of monsters) {
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist - monsterRadius <= explosionRadius) {
                hitMonsters.push(monster.id);
            }
        }

        // 對命中的怪物造成傷害並擊退
        if (hitMonsters.length > 0) {
            const hitMonstersData = monsters.filter(m => hitMonsters.includes(m.id));

            const result = this.monsterManager.damageMonsters(hitMonsters, damage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }

            // 擊退命中的怪物 1 單位距離
            const knockbackDistance = this.gameBounds.height * 0.1; // 1 單位
            this.monsterManager.knockbackMonsters(hitMonsters, this.characterX, this.characterY, knockbackDistance);

            this.shakeScreen(hitMonsters.length);

            // 打擊火花（金色，類似輪鋸效果）
            for (const m of hitMonstersData) {
                this.showHitSparkEffect(m.x, m.y, SparkColors.SAWBLADE);
            }
        }
    }

    private handleExpTestInput() {
        if (!this.keyPlus || !this.keyMinus || !this.keyShift) return;

        // Shift + Backspace：切換網格技能特效顯示（預設關閉以提升效能）
        if (this.keyShift.isDown && Phaser.Input.Keyboard.JustDown(this.keyBackspace)) {
            this.showGridSkillEffects = !this.showGridSkillEffects;
            return;
        }

        // Shift + 0：直接跳到 24 級並填滿所有主動技能（單次觸發）
        if (this.keyShift.isDown && Phaser.Input.Keyboard.JustDown(this.keyZero)) {
            this.maxOutAllSkills();
            return;
        }
        // Ctrl + Shift + F5~F12：個別技能滿等
        if (this.keyCtrl.isDown && this.keyShift.isDown) {
            const skillKeys = [
                { key: this.keyF5, skillId: 'active_soul_render' },
                { key: this.keyF6, skillId: 'active_coder' },
                { key: this.keyF7, skillId: 'active_vfx' },
                { key: this.keyF8, skillId: 'active_architect' },
                { key: this.keyF9, skillId: 'passive_titanium_liver' },
                { key: this.keyF10, skillId: 'passive_sync_rate' },
                { key: this.keyF11, skillId: 'passive_retina_module' },
                { key: this.keyF12, skillId: 'passive_ai_enhancement' }
            ];
            for (const { key, skillId } of skillKeys) {
                if (key && Phaser.Input.Keyboard.JustDown(key)) {
                    this.maxOutSingleSkill(skillId);
                    return;
                }
            }
        }
        // Shift + 加號：直接升一級（單次觸發）
        if (this.keyShift.isDown && Phaser.Input.Keyboard.JustDown(this.keyPlus)) {
            this.levelUp();
            return; // 避免同時觸發 addExp
        }
        // + 鍵增加經驗（按住連續觸發）
        if (this.keyPlus.isDown && !this.keyShift.isDown) {
            this.addExp(10);
        }
        // - 鍵減少經驗（按住連續觸發）
        if (this.keyMinus.isDown) {
            this.addExp(-10);
        }
    }

    // 測試用：單一技能滿等
    private maxOutSingleSkill(skillId: string) {
        const def = SKILL_LIBRARY.find(s => s.id === skillId);
        if (!def) return;

        const currentSkillLevel = this.skillManager.getSkillLevel(skillId);
        const isPassive = def.type === 'passive';

        // 檢查是否已滿級
        if (currentSkillLevel >= def.maxLevel) {
            return;
        }

        // 被動技能：檢查欄位是否已滿（未擁有時）
        if (isPassive && currentSkillLevel < 0 && this.skillManager.isPassiveSlotsFull()) {
            return;
        }

        // 計算需要升級的次數
        const currentLevel = currentSkillLevel < 0 ? -1 : currentSkillLevel;
        const upgradesNeeded = def.maxLevel - currentLevel; // 從當前等級升到 MAX

        // 增加對應等級
        this.currentLevel += upgradesNeeded;
        this.monsterManager.setPlayerLevel(this.currentLevel);

        // 升級技能到滿等
        for (let i = 0; i < upgradesNeeded; i++) {
            this.skillManager.learnOrUpgradeSkill(skillId);
        }

        // 重新計算屬性
        this.recalculateMaxHp();
        this.recalculateMoveSpeed();
        this.currentHp = this.maxHp;
        this.displayedHp = this.maxHp; // 同步顯示 HP

        // 更新經驗需求
        this.currentExp = 0;
        this.maxExp = Math.floor(MainScene.BASE_EXP * Math.pow(MainScene.EXP_GROWTH_RATE, this.currentLevel));

        // 更新 UI
        this.drawHpBarFill();
        this.updateHpText();
        this.drawExpBarFill();
        this.levelText.setText(`Lv.${this.currentLevel}`);
        this.updateSkillBarDisplay();

    }

    // 測試用：直接跳到 24 級並填滿所有主動技能
    private maxOutAllSkills() {
        // 4 主動技能 × 6 階段（Lv.0 到 Lv.5）= 24 次選擇 = 24 級
        const targetLevel = 24;

        // 設定等級
        this.currentLevel = targetLevel;

        // 填滿所有主動技能到 MAX (Lv.5)
        const activeSkills = this.skillManager.getActiveSkillDefinitions();
        for (const def of activeSkills) {
            // 學習技能並升級到 MAX
            for (let i = 0; i <= def.maxLevel; i++) {
                this.skillManager.learnOrUpgradeSkill(def.id);
            }
        }

        // 更新怪物系統的玩家等級
        this.monsterManager.setPlayerLevel(this.currentLevel);

        // 重新計算 HP 和移動速度
        this.recalculateMaxHp();
        this.recalculateMoveSpeed();

        // 回滿 HP
        this.currentHp = this.maxHp;
        this.displayedHp = this.maxHp; // 同步顯示 HP

        // 重置經驗並計算下一級所需
        this.currentExp = 0;
        this.maxExp = Math.floor(MainScene.BASE_EXP * Math.pow(MainScene.EXP_GROWTH_RATE, this.currentLevel));

        // 更新 UI
        this.drawHpBarFill();
        this.updateHpText();
        this.drawExpBarFill();
        this.levelText.setText(`Lv.${this.currentLevel}`);
        this.updateSkillBarDisplay();

    }

    private addExp(amount: number) {
        // 正數經驗套用加成，負數（測試用）不套用
        if (amount > 0) {
            amount = this.skillManager.calculateFinalExp(amount);
        }

        this.currentExp += amount;

        // 限制最小為 0
        if (this.currentExp < 0) {
            this.currentExp = 0;
        }

        // 檢查是否升級
        if (this.currentExp >= this.maxExp) {
            this.levelUp();
        }

        // 更新經驗條顯示
        this.drawExpBarFill();
    }

    private levelUp() {
        this.currentLevel++;
        this.currentExp = 0; // 重置經驗值

        // 計算新的最大經驗值（成長曲線）
        this.maxExp = Math.floor(MainScene.BASE_EXP * Math.pow(MainScene.EXP_GROWTH_RATE, this.currentLevel));

        // 計算新的最大 HP（套用被動技能加成），並增加多出來的 HP
        this.recalculateMaxHp();
        // 同步顯示 HP（不再回滿，只加增量）
        this.displayedHp = this.currentHp;

        // 更新怪物管理器的玩家等級（影響新生成怪物的血量）
        const shouldSpawnElite = this.monsterManager.setPlayerLevel(this.currentLevel);
        if (shouldSpawnElite) {
            // 每 10 級生成菁英怪
            this.monsterManager.spawnElite(this.cameraOffsetX, this.cameraOffsetY);
        }

        // 更新等級顯示
        this.levelText.setText(`Lv.${this.currentLevel}`);

        // 更新 HP 條
        this.drawHpBarFill();
        this.updateHpText();

        // 更新低血量紅暈效果
        this.updateLowHpVignette();

        // 累加待分配技能點數，並嘗試顯示面板（如果面板未顯示）
        this.pendingSkillPoints++;
        this.tryShowSkillPanel();

        // 更新經驗條
        this.drawExpBarFill();

        // 地面文字藍色呼吸掃光
        this.triggerLevelUpBreathScan();
    }

    // 重新計算最大 HP（基礎 + 等級成長 + 被動技能加成）
    private recalculateMaxHp() {
        const baseMaxHp = MainScene.BASE_HP + MainScene.HP_PER_LEVEL * this.currentLevel;
        const oldMaxHp = this.maxHp;
        this.maxHp = this.skillManager.calculateFinalMaxHp(baseMaxHp);

        // 如果最大 HP 增加，增加多出來的 HP（不是回滿）
        if (this.maxHp > oldMaxHp && oldMaxHp > 0) {
            const hpIncrease = this.maxHp - oldMaxHp;
            this.currentHp += hpIncrease;
        }

        // 確保當前 HP 不超過最大值
        this.currentHp = Math.min(this.currentHp, this.maxHp);
    }

    // 重新計算移動速度（基礎 + 被動技能加成）
    private recalculateMoveSpeed() {
        this.moveSpeed = this.skillManager.calculateFinalMoveSpeed(this.baseMoveSpeed);
    }

    private handleSkillPanelInput() {
        if (!this.keyOne) return;
        if (this.popupPaused) return; // 彈出視窗時不處理技能選擇

        // 計算選項數量（混合模式、進階模式、一般模式）
        let numChoices: number;
        if (this.mixedSkillTypes.length > 0) {
            numChoices = this.mixedSkillTypes.length;
        } else if (this.isSelectingAdvancedSkill) {
            numChoices = this.currentAdvancedSkillChoices.length;
        } else {
            numChoices = this.currentSkillChoices.length;
        }

        // 根據選項數量決定按鍵對應
        // 3 個選項：1=0, 2=1, 3=2
        // 2 個選項：1=0, 3=1
        // 1 個選項：2=0
        if (numChoices === 1) {
            // 只有一個選項，用 2 鍵
            if (Phaser.Input.Keyboard.JustDown(this.keyTwo)) {
                if (this.selectedSkillIndex === 0) {
                    this.confirmSkillSelection();
                } else {
                    this.setSelectedSkill(0);
                }
            }
        } else if (numChoices === 2) {
            // 兩個選項，用 1 和 3 鍵
            if (Phaser.Input.Keyboard.JustDown(this.keyOne)) {
                if (this.selectedSkillIndex === 0) {
                    this.confirmSkillSelection();
                } else {
                    this.setSelectedSkill(0);
                }
            }
            if (Phaser.Input.Keyboard.JustDown(this.keyThree)) {
                if (this.selectedSkillIndex === 1) {
                    this.confirmSkillSelection();
                } else {
                    this.setSelectedSkill(1);
                }
            }
        } else {
            // 三個選項，用 1, 2, 3 鍵
            if (Phaser.Input.Keyboard.JustDown(this.keyOne)) {
                if (this.selectedSkillIndex === 0) {
                    this.confirmSkillSelection();
                } else {
                    this.setSelectedSkill(0);
                }
            }
            if (Phaser.Input.Keyboard.JustDown(this.keyTwo)) {
                if (this.selectedSkillIndex === 1) {
                    this.confirmSkillSelection();
                } else {
                    this.setSelectedSkill(1);
                }
            }
            if (Phaser.Input.Keyboard.JustDown(this.keyThree)) {
                if (this.selectedSkillIndex === 2) {
                    this.confirmSkillSelection();
                } else {
                    this.setSelectedSkill(2);
                }
            }
        }
    }

    private setSelectedSkill(index: number) {
        if (this.popupPaused) return; // 彈出視窗時不處理

        // 取消之前的選中狀態
        this.updateSkillCardStyle(this.selectedSkillIndex, false);

        // 設定新的選中狀態
        this.selectedSkillIndex = index;
        this.updateSkillCardStyle(this.selectedSkillIndex, true);
    }

    private updateSkillCardStyle(index: number, isSelected: boolean) {
        const cardBg = this.skillCardBgs[index];
        const optionContainer = this.skillOptions[index];

        if (!cardBg || !optionContainer) return;

        if (isSelected) {
            cardBg.setFillStyle(0x333333);
            cardBg.setStrokeStyle(3, 0xffffff);
            this.tweens.add({
                targets: optionContainer,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 100
            });
        } else {
            cardBg.setFillStyle(0x222222);
            cardBg.setStrokeStyle(2, 0x666666);
            this.tweens.add({
                targets: optionContainer,
                scaleX: 1,
                scaleY: 1,
                duration: 100
            });
        }
    }

    private confirmSkillSelection() {
        if (this.popupPaused) return; // 彈出視窗時不處理

        // 處理混合技能選擇模式（有自己的 isSkillSelecting 檢查）
        if (this.mixedSkillTypes.length > 0) {
            this.confirmMixedSkillSelection();
            return;
        }

        // 防止重複點擊（僅用於非混合模式）
        if (this.isSkillSelecting) return;
        this.isSkillSelecting = true;

        // 處理進階技能選擇
        if (this.isSelectingAdvancedSkill) {
            if (this.currentAdvancedSkillChoices.length === 0) return;
            if (this.selectedSkillIndex >= this.currentAdvancedSkillChoices.length) return;

            const selectedAdvSkill = this.currentAdvancedSkillChoices[this.selectedSkillIndex];
            this.selectAdvancedSkill(this.selectedSkillIndex, selectedAdvSkill.id);
            return;
        }

        // 處理一般技能選擇
        if (this.currentSkillChoices.length === 0) return;
        if (this.selectedSkillIndex >= this.currentSkillChoices.length) return;

        const selectedSkill = this.currentSkillChoices[this.selectedSkillIndex];
        this.selectSkill(this.selectedSkillIndex, selectedSkill.id);
    }

    private handleKeyboardInput(delta: number) {
        if (!this.cursors) return;
        if (this.gameOverActive) return; // 遊戲結束後禁止移動
        if (this.popupPaused) return; // 彈出視窗時禁止移動

        let dx = 0;
        let dy = 0;

        if (this.cursors.W.isDown || this.cursors.UP.isDown) dy = -1;
        if (this.cursors.S.isDown || this.cursors.DOWN.isDown) dy = 1;
        if (this.cursors.A.isDown || this.cursors.LEFT.isDown) dx = -1;
        if (this.cursors.D.isDown || this.cursors.RIGHT.isDown) dx = 1;

        // 如果有按鍵按下
        if (dx !== 0 || dy !== 0) {
            this.isKeyboardMoving = true;
            this.isPointerDown = false; // 取消點擊移動

            // 更新角色面向
            if (dx !== 0) {
                this.facingRight = dx > 0;
            }

            // 正規化對角線移動速度
            if (dx !== 0 && dy !== 0) {
                const factor = 1 / Math.sqrt(2);
                dx *= factor;
                dy *= factor;
            }

            // 計算移動距離
            const moveDistance = (this.moveSpeed * delta) / 1000;

            // 計算新位置
            let newX = this.characterX + dx * moveDistance;
            let newY = this.characterY + dy * moveDistance;

            // 限制在地圖範圍內
            newX = Phaser.Math.Clamp(newX, this.characterSize, this.mapWidth - this.characterSize);
            newY = Phaser.Math.Clamp(newY, this.characterSize, this.mapHeight - this.characterSize);

            // 障礙物碰撞檢測（只用腳底小圓）
            const characterRadius = this.characterSize * 0.15;
            if (!this.checkObstacleCollision(newX, newY, characterRadius)) {
                this.characterX = newX;
                this.characterY = newY;
            } else {
                // 嘗試只移動 X 軸
                const testX = Phaser.Math.Clamp(
                    this.characterX + dx * moveDistance,
                    this.characterSize,
                    this.mapWidth - this.characterSize
                );
                if (!this.checkObstacleCollision(testX, this.characterY, characterRadius)) {
                    this.characterX = testX;
                } else {
                    // 嘗試只移動 Y 軸
                    const testY = Phaser.Math.Clamp(
                        this.characterY + dy * moveDistance,
                        this.characterSize,
                        this.mapHeight - this.characterSize
                    );
                    if (!this.checkObstacleCollision(this.characterX, testY, characterRadius)) {
                        this.characterY = testY;
                    }
                }
            }

            // 切換到跑步動畫
            this.setCharacterState('run');

            // 更新角色
            this.updateCharacterSprite();

            // 更新鏡頭
            this.updateCamera();
        } else {
            this.isKeyboardMoving = false;
            // 沒有按鍵時，如果也沒有點擊移動，切換到待機
            if (!this.isPointerDown) {
                this.setCharacterState('idle');
                this.updateCharacterSprite();
            }
        }
    }

    private onPointerDown(pointer: Phaser.Input.Pointer) {
        // 如果遊戲暫停或結束或彈出視窗，不處理點擊移動
        if (this.isPaused) return;
        if (this.gameOverActive) return;
        if (this.popupPaused) return;

        // 檢查點擊是否在遊戲區域內
        if (!this.isPointerInGameArea(pointer)) {
            return;
        }

        this.isPointerDown = true;

        // 記錄搖桿起點並顯示搖桿
        this.joystickOriginX = pointer.x;
        this.joystickOriginY = pointer.y;
        this.joystickContainer.setPosition(pointer.x, pointer.y);
        this.joystickKnob.setPosition(0, 0); // 旋鈕回到中心
        this.joystickContainer.setVisible(true);

        // 初始狀態不移動
        this.moveDirX = 0;
        this.moveDirY = 0;
    }

    private onPointerMove(pointer: Phaser.Input.Pointer) {
        // 只有在按住時才更新方向
        if (!this.isPointerDown || this.isPaused || this.popupPaused) return;

        // 計算從起點到當前位置的向量
        const dx = pointer.x - this.joystickOriginX;
        const dy = pointer.y - this.joystickOriginY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxRadius = MainScene.JOYSTICK_RADIUS;

        if (distance > 0) {
            // 計算移動方向（正規化）
            this.moveDirX = dx / distance;
            this.moveDirY = dy / distance;

            // 更新角色面向
            if (Math.abs(dx) > 5) {
                this.facingRight = dx > 0;
            }

            // 限制旋鈕位置在基座範圍內
            const clampedDist = Math.min(distance, maxRadius);
            const knobX = this.moveDirX * clampedDist;
            const knobY = this.moveDirY * clampedDist;
            this.joystickKnob.setPosition(knobX, knobY);
        } else {
            this.moveDirX = 0;
            this.moveDirY = 0;
            this.joystickKnob.setPosition(0, 0);
        }
    }

    private onPointerUp() {
        this.isPointerDown = false;

        // 隱藏搖桿
        this.joystickContainer.setVisible(false);
        this.moveDirX = 0;
        this.moveDirY = 0;

        // 放開時立即停止移動並切換到待機
        if (!this.isKeyboardMoving) {
            this.setCharacterState('idle');
            this.updateCharacterSprite();
        }
    }

    private isPointerInGameArea(pointer: Phaser.Input.Pointer): boolean {
        return (
            pointer.x >= this.gameBounds.x &&
            pointer.x <= this.gameBounds.x + this.gameBounds.width &&
            pointer.y >= this.gameBounds.y &&
            pointer.y <= this.gameBounds.y + this.gameBounds.height
        );
    }

    private moveCharacter(delta: number) {
        // 計算移動距離
        const moveDistance = (this.moveSpeed * delta) / 1000;

        // 根據方向移動
        let newX = this.characterX + this.moveDirX * moveDistance;
        let newY = this.characterY + this.moveDirY * moveDistance;

        // 限制在地圖範圍內
        newX = Phaser.Math.Clamp(newX, this.characterSize, this.mapWidth - this.characterSize);
        newY = Phaser.Math.Clamp(newY, this.characterSize, this.mapHeight - this.characterSize);

        // 障礙物碰撞檢測（只用腳底小圓）
        const characterRadius = this.characterSize * 0.15;
        if (!this.checkObstacleCollision(newX, newY, characterRadius)) {
            // 沒有碰撞，可以移動
            this.characterX = newX;
            this.characterY = newY;
        } else {
            // 嘗試只移動 X 軸
            const testX = Phaser.Math.Clamp(
                this.characterX + this.moveDirX * moveDistance,
                this.characterSize,
                this.mapWidth - this.characterSize
            );
            if (!this.checkObstacleCollision(testX, this.characterY, characterRadius)) {
                this.characterX = testX;
            } else {
                // 嘗試只移動 Y 軸
                const testY = Phaser.Math.Clamp(
                    this.characterY + this.moveDirY * moveDistance,
                    this.characterSize,
                    this.mapHeight - this.characterSize
                );
                if (!this.checkObstacleCollision(this.characterX, testY, characterRadius)) {
                    this.characterY = testY;
                }
            }
        }

        // 更新角色面向（根據移動方向）
        if (this.moveDirX !== 0) {
            this.updateCharacterFacing(this.characterX + this.moveDirX);
        }

        // 移動中切換到跑步動畫
        this.setCharacterState('run');

        // 更新角色
        this.updateCharacterSprite();

        // 更新鏡頭位置
        this.updateCamera();
    }

    private updateCamera(forceCenter: boolean = false) {
        // 計算角色相對於當前視窗的位置
        const viewCenterX = this.cameraOffsetX + this.gameBounds.width / 2;
        const viewCenterY = this.cameraOffsetY + this.gameBounds.height / 2;

        // 計算角色與視窗中心的距離
        const deltaX = this.characterX - viewCenterX;
        const deltaY = this.characterY - viewCenterY;

        // 安全區域大小（中間 30%）
        const deadZoneWidth = this.gameBounds.width * MainScene.CAMERA_DEAD_ZONE;
        const deadZoneHeight = this.gameBounds.height * MainScene.CAMERA_DEAD_ZONE;

        // 如果強制置中（初始化時）
        if (forceCenter) {
            this.cameraOffsetX = this.characterX - this.gameBounds.width / 2;
            this.cameraOffsetY = this.characterY - this.gameBounds.height / 2;
        } else {
            // 只有當角色超出安全區域時才移動鏡頭
            // X 軸
            if (Math.abs(deltaX) > deadZoneWidth / 2) {
                // 角色超出安全區域，拉動鏡頭
                if (deltaX > 0) {
                    // 角色在右邊，鏡頭往右移
                    this.cameraOffsetX += deltaX - deadZoneWidth / 2;
                } else {
                    // 角色在左邊，鏡頭往左移
                    this.cameraOffsetX += deltaX + deadZoneWidth / 2;
                }
            }

            // Y 軸
            if (Math.abs(deltaY) > deadZoneHeight / 2) {
                // 角色超出安全區域，拉動鏡頭
                if (deltaY > 0) {
                    // 角色在下面，鏡頭往下移
                    this.cameraOffsetY += deltaY - deadZoneHeight / 2;
                } else {
                    // 角色在上面，鏡頭往上移
                    this.cameraOffsetY += deltaY + deadZoneHeight / 2;
                }
            }
        }

        // 限制鏡頭不超出地圖邊界
        this.cameraOffsetX = Phaser.Math.Clamp(
            this.cameraOffsetX,
            0,
            this.mapWidth - this.gameBounds.width
        );
        this.cameraOffsetY = Phaser.Math.Clamp(
            this.cameraOffsetY,
            0,
            this.mapHeight - this.gameBounds.height
        );

        // 移動世界容器（負方向，因為鏡頭往右 = 世界往左）
        this.worldContainer.setPosition(
            this.gameBounds.x - this.cameraOffsetX,
            this.gameBounds.y - this.cameraOffsetY
        );

        // 同步移動角色容器
        this.characterContainer.setPosition(
            this.gameBounds.x - this.cameraOffsetX,
            this.gameBounds.y - this.cameraOffsetY
        );

        // 同步移動回血物品容器
        this.healingItemContainer.setPosition(
            this.gameBounds.x - this.cameraOffsetX,
            this.gameBounds.y - this.cameraOffsetY
        );

        // 更新視差背景位置
        this.updateParallaxBackground();
    }

    private updateRevealMask(data: { x: number; y: number; radius: number }) {
        if (!this.revealMask) return;
        this.revealMask.clear();
        this.revealMask.fillStyle(0xffffff);
        this.revealMask.fillCircle(data.x, data.y, data.radius);
    }

    private onRevealComplete() {
        // 移除遮罩，完全顯示
        this.gameAreaContainer.clearMask(true);
        this.uiContainer.clearMask(true);
        this.revealMask.destroy();
        this.registry.events.off('reveal-update', this.updateRevealMask, this);
        this.registry.events.off('reveal-complete', this.onRevealComplete, this);

        // 轉場完成後顯示控制列（全螢幕、音量）
        const controls = document.getElementById('controls');
        if (controls) {
            controls.classList.add('visible');
        }
        const leftControls = document.getElementById('left-controls');
        if (leftControls) {
            leftControls.classList.add('visible');
        }

        // 轉場完成後顯示技能選擇面板（初始 1 點技能點數）
        this.pendingSkillPoints = 1;
        this.tryShowSkillPanel();

        // 開始生成怪物
        this.monsterManager.startSpawning();

        // 開始播放遊戲 BGM
        this.playRandomGameBgm();
    }

    // 播放隨機遊戲 BGM
    private playRandomGameBgm() {
        // 隨機選擇 BGM01 或 BGM02，但避免重複
        const bgmKeys = ['bgm_game_01', 'bgm_game_02'];
        let nextBgmKey: string;

        if (this.currentBgmKey && bgmKeys.length > 1) {
            // 選擇不同的歌曲
            const otherKeys = bgmKeys.filter(key => key !== this.currentBgmKey);
            nextBgmKey = otherKeys[Math.floor(Math.random() * otherKeys.length)];
        } else {
            // 第一次隨機選擇
            nextBgmKey = bgmKeys[Math.floor(Math.random() * bgmKeys.length)];
        }

        this.currentBgmKey = nextBgmKey;

        // 停止當前 BGM（如果有）
        if (this.gameBgm) {
            this.gameBgm.stop();
            this.gameBgm.destroy();
        }

        // 播放新 BGM（50% 音量，不循環）
        if (this.cache.audio.exists(nextBgmKey)) {
            this.gameBgm = this.sound.add(nextBgmKey, {
                volume: 0.5,
                loop: false
            });

            // 播放完成後切換到另一首
            this.gameBgm.on('complete', () => {
                this.playRandomGameBgm();
            });

            this.gameBgm.play();
        }
    }

    private createFullscreenBackground(screenWidth: number, screenHeight: number) {
        // 滿版背景圖，cover 模式
        this.background = this.add.image(screenWidth / 2, screenHeight / 2, 'background');

        // 計算縮放比例讓圖片 cover 整個畫面
        const scaleX = screenWidth / this.background.width;
        const scaleY = screenHeight / this.background.height;
        const scale = Math.max(scaleX, scaleY);
        this.background.setScale(scale);
    }

    private drawGameBorder() {
        // 黑底 + 深灰色邊框標示遊戲區域
        this.boundsBorder = this.add.rectangle(
            this.gameBounds.x + this.gameBounds.width / 2,
            this.gameBounds.y + this.gameBounds.height / 2,
            this.gameBounds.width,
            this.gameBounds.height,
            0x000000 // 黑色填充
        );
        this.boundsBorder.setStrokeStyle(2, 0x444444);
    }

    // ===== DEBUG 顯示系統 =====

    private createDebugDisplay() {
        // 左下角 DEBUG 資訊文字
        const fontSize = Math.max(12, Math.floor(this.gameBounds.height * 0.02));
        this.debugText = this.add.text(
            this.gameBounds.x + 10,
            this.gameBounds.y + this.gameBounds.height - 10,
            '',
            {
                fontFamily: 'monospace',
                fontSize: `${fontSize}px`,
                color: '#00ff00',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                padding: { x: 6, y: 4 }
            }
        );
        this.debugText.setOrigin(0, 1);
        this.debugText.setDepth(9999); // 最上層
        this.debugText.setVisible(false);
    }

    private updateDebugDisplay() {
        if (!this.debugMode || !this.debugText) return;

        const fps = Math.round(this.game.loop.actualFps);
        const monsterCount = this.monsterManager ? this.monsterManager.getMonsters().length : 0;
        const playerPos = `(${Math.round(this.characterX)}, ${Math.round(this.characterY)})`;
        const cameraPos = `(${Math.round(this.cameraOffsetX)}, ${Math.round(this.cameraOffsetY)})`;
        const gameTime = Math.floor(this.gameTimer / 1000);
        const minutes = Math.floor(gameTime / 60);
        const seconds = gameTime % 60;

        const debugInfo = [
            `FPS: ${fps}`,
            `怪物數量: ${monsterCount} / 200`,
            `玩家位置: ${playerPos}`,
            `鏡頭位置: ${cameraPos}`,
            `遊戲時間: ${minutes}:${String(seconds).padStart(2, '0')}`,
            `等級: ${this.currentLevel}`,
            `HP: ${Math.round(this.currentHp)} / ${Math.round(this.maxHp)}`,
            `護盾: ${Math.round(this.currentShield)} / ${Math.round(this.maxShield)}`,
            `待分配點數: ${this.pendingSkillPoints}`
        ].join('\n');

        this.debugText.setText(debugInfo);
    }

    private toggleDebugMode() {
        this.debugMode = !this.debugMode;
        if (this.debugText) {
            this.debugText.setVisible(this.debugMode);
        }
    }

    // ===== HP 條系統 =====

    private createHpBar() {
        // HP 條容器（用於放置 HP 文字）
        this.hpBarContainer = this.add.container(0, 0);
        this.hpBarContainer.setDepth(1001); // 在網格之上

        // HP 文字位置（頂部 HP 條 3 排的中間，row 1-3）
        const cellHeight = this.skillGridCellSize;
        const barY = this.gameBounds.y + cellHeight * 2; // row 1-3 的中間位置
        const fontSize = Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(this.gameBounds.height * 0.03));

        this.hpText = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY + cellHeight / 2,
            `${this.currentHp} / ${this.maxHp}`,
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4
            }
        );
        this.hpText.setResolution(2); // 提高解析度使文字更清晰
        this.hpText.setOrigin(0.5, 0.5);
        this.hpText.setDepth(1002);
        this.hpBarContainer.add(this.hpText);

        // 初始繪製（HP 條現在使用網格格子繪製）
        this.drawHpBarFill();

        // 加入 UI 容器
        this.uiContainer.add(this.hpBarContainer);
    }

    private drawHpBarFill() {
        // ============================================================
        // ⚠️ 重要：不可刪除！HP/護盾條 UI 佈局設定
        // HP 條使用頂部 3 排（row 1, 2, 3）
        // 護盾條重疊在 HP 的上面 2 排（row 1, 2）
        // 修改此設定時，必須同步更新以下位置：
        // - clearSkillGrid() 中的 row 保護範圍
        // - clearVignetteCells() 中的 row 保護範圍
        // - drawGridVignette() 中的 startRow
        // - createHpBar() 中的 barY 位置
        // ============================================================
        const hpRows = [1, 2, 3];
        const shieldRows = [1, 2];
        // 可用格子數要扣除左右邊框（col 0 和 col cols-1）
        const availableCells = this.skillGridCols - 2;

        // ===== 第一步：先繪製 HP 條（3 排，底層）=====
        // 計算各種 HP 填充格子數
        const fillRatio = this.currentHp / this.maxHp;
        const fillCells = Math.floor(availableCells * fillRatio);

        const displayedRatio = this.displayedHp / this.maxHp;
        const displayedCells = Math.floor(availableCells * displayedRatio);

        // 繪製 HP 區黑底
        for (const row of hpRows) {
            for (let i = 0; i < availableCells; i++) {
                const col = i + 1;
                const index = row * this.skillGridCols + col;
                const cell = this.skillGridCells[index];
                if (!cell) continue;

                cell.setFillStyle(0x000000, 0.9);
                cell.setVisible(true);
                cell.setDepth(1000);
            }
        }

        // 繪製白色損傷區塊（displayedHp 到 currentHp 之間）
        if (displayedCells > fillCells) {
            for (const row of hpRows) {
                for (let i = fillCells; i < displayedCells; i++) {
                    const col = i + 1;
                    const index = row * this.skillGridCols + col;
                    const cell = this.skillGridCells[index];
                    if (!cell) continue;

                    // 白色損傷區塊，上排亮一點
                    const rowIndex = hpRows.indexOf(row);
                    const alpha = rowIndex === 0 ? 0.85 : (rowIndex === 1 ? 0.75 : 0.65);
                    cell.setFillStyle(0xffffff, alpha);
                }
            }
        }

        // 繪製 HP 格子（3 行，暗紅暗紫漸層流動效果）
        if (fillCells > 0) {
            for (const row of hpRows) {
                for (let i = 0; i < fillCells; i++) {
                    const col = i + 1;
                    const index = row * this.skillGridCols + col;
                    const cell = this.skillGridCells[index];
                    if (!cell) continue;

                    // 計算漸層位置（加入流動偏移）
                    const baseT = i / availableCells;
                    const flowT = this.hpBarFlowOffset;
                    const t = (baseT + flowT) % 1;

                    // 使用正弦波讓頭尾同色（暗紅→暗紫→暗紅）
                    const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;

                    // 暗紅色 (0x880022) 到 暗紫色 (0x660088) 漸層
                    const r = Math.floor(0x88 - (0x88 - 0x66) * wave);
                    const g = 0x00;
                    const b = Math.floor(0x22 + (0x88 - 0x22) * wave);
                    const color = (r << 16) | (g << 8) | b;

                    // 上排亮、下排暗（高光效果）
                    const rowIndex = hpRows.indexOf(row);
                    const alpha = rowIndex === 0 ? 0.95 : (rowIndex === 1 ? 0.85 : 0.75);

                    cell.setFillStyle(color, alpha);
                }
            }
        }

        // ===== 第二步：繪製護盾條（2 排，覆蓋在 HP 上方）=====
        // 護盾有值時才覆蓋顯示，優先權高於 HP
        if (this.currentShield > 0 && this.maxShield > 0) {
            const shieldRatio = this.currentShield / this.maxShield;
            const shieldCells = Math.floor(availableCells * shieldRatio);

            for (const row of shieldRows) {
                for (let i = 0; i < availableCells; i++) {
                    const col = i + 1;
                    const index = row * this.skillGridCols + col;
                    const cell = this.skillGridCells[index];
                    if (!cell) continue;

                    if (i < shieldCells) {
                        // 有護盾的格子：顯示金色
                        // 計算金色漸層位置（加入流動偏移）
                        const baseT = i / availableCells;
                        const flowT = this.shieldBarFlowOffset;
                        const t = (baseT + flowT) % 1;

                        // 使用正弦波（金→白金→金）
                        const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;

                        // 金色 (0xffcc00) 到 白金色 (0xffffcc) 漸層
                        const r = 0xff;
                        const g = Math.floor(0xcc + (0xff - 0xcc) * wave);
                        const b = Math.floor(0x00 + (0xcc - 0x00) * wave);
                        const color = (r << 16) | (g << 8) | b;

                        // 上排稍微亮一點
                        const alpha = row === shieldRows[0] ? 0.95 : 0.8;
                        cell.setFillStyle(color, alpha);
                    }
                    // 沒護盾的格子保持 HP 的顏色（已經在上面繪製過了）
                }
            }
        }
    }

    private updateHpBarFlow(delta: number) {
        // 流動速度加快 2 倍
        const flowSpeed = 0.2; // 每秒移動 20% 的漸層
        this.hpBarFlowOffset += (flowSpeed * delta) / 1000;

        // 保持在 0~1 範圍內循環
        if (this.hpBarFlowOffset >= 1) {
            this.hpBarFlowOffset -= 1;
        }

        // 更新損傷顯示（白色區塊延遲靠攏）
        this.updateDamageDisplay(delta);

        // 重繪 HP 條
        this.drawHpBarFill();
    }

    private updateDamageDisplay(delta: number) {
        // 如果顯示 HP 大於實際 HP，需要延遲後靠攏
        if (this.displayedHp > this.currentHp) {
            // 延遲計時
            if (this.hpDamageDelay > 0) {
                this.hpDamageDelay -= delta;
            } else {
                // 延遲結束，開始靠攏
                const diff = this.displayedHp - this.currentHp;
                const lerpAmount = diff * MainScene.HP_DAMAGE_LERP_SPEED * (delta / 1000);
                this.displayedHp -= Math.max(1, lerpAmount); // 至少減少 1

                // 確保不會低於實際 HP
                if (this.displayedHp < this.currentHp) {
                    this.displayedHp = this.currentHp;
                }
            }
        } else if (this.displayedHp < this.currentHp) {
            // 回血時立即跟上
            this.displayedHp = this.currentHp;
        }
    }

    private updateHpText() {
        if (this.hpText) {
            if (this.currentShield > 0) {
                // 有護盾時顯示更緊湊的格式：HP+盾/Max
                this.hpText.setText(`${this.currentHp}+${this.currentShield}/${this.maxHp}`);
            } else {
                this.hpText.setText(`${this.currentHp}/${this.maxHp}`);
            }
        }
    }

    // ===== 護盾條系統 =====

    private createShieldBar() {
        // 護盾現在整合到 HP 條（row 0），不需要獨立的護盾條
        // 護盾文字（顯示在右上角）
        const cellHeight = this.skillGridCellSize;
        const barY = this.gameBounds.y + cellHeight * 2;
        const fontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(this.gameBounds.height * 0.025));

        this.shieldText = this.add.text(
            this.gameBounds.x + this.gameBounds.width - 10,
            barY + cellHeight / 2,
            '',
            {
                fontFamily: 'monospace',
                fontSize: `${fontSize}px`,
                color: '#ffdd44',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.shieldText.setOrigin(1, 0.5);
        this.shieldText.setDepth(1002);
        this.shieldText.setVisible(false);

        // 加入 UI 容器
        this.uiContainer.add(this.shieldText);
    }

    private drawShieldBarFill() {
        // 護盾現在整合到 HP 條的 row 0，由 drawHpBarFill 處理
        // 護盾數值顯示在 HP 文字中，隱藏獨立的護盾文字
        this.shieldText.setVisible(false);
        // 更新 HP 文字（會包含護盾數值）
        this.updateHpText();
    }

    private updateShieldBarFlow(delta: number) {
        // 如果沒有護盾，不更新
        if (this.currentShield <= 0) return;

        // 流動速度高速
        const flowSpeed = 0.6; // 每秒移動 60% 的漸層
        this.shieldBarFlowOffset += (flowSpeed * delta) / 1000;

        // 保持在 0~1 範圍內循環
        if (this.shieldBarFlowOffset >= 1) {
            this.shieldBarFlowOffset -= 1;
        }

        // 護盾由 drawHpBarFill 一起重繪
        this.drawShieldBarFill();
    }

    // 更新護盾光環效果（暈開的橢圓光暈 + 隨機金光閃點）
    private updateShieldAura(delta: number) {
        this.shieldAuraGraphics.clear();

        // 如果沒有護盾，不顯示光環
        if (this.currentShield <= 0) {
            // 隱藏腳底橢圓 sprite
            if (this.shieldGroundSprite && this.shieldGroundSprite.visible) {
                this.shieldGroundSprite.setVisible(false);
            }
            return;
        }

        const originX = this.characterX;
        const originY = this.characterY;

        // 橢圓尺寸（角色周圍）
        const ellipseWidth = this.characterSize * 0.8;
        const ellipseHeight = this.characterSize * 0.35;
        // 橢圓中心在角色腳底往上一點
        const ellipseCenterY = originY - this.characterSize * 0.15;

        // 繪製腳底橢圓（使用 sector_360 壓扁）
        if (!this.shieldGroundSprite) {
            this.shieldGroundSprite = this.add.sprite(0, 0, MainScene.TEXTURE_SECTOR_360);
            this.skillGridContainer.add(this.shieldGroundSprite);
            this.shieldGroundSprite.setDepth(55);
        }

        // 更新橢圓位置和大小（螢幕座標）
        const screen = this.worldToScreen(originX, ellipseCenterY);
        this.shieldGroundSprite.setPosition(screen.x, screen.y);
        const groundScaleX = (ellipseWidth * 1.0) / MainScene.EFFECT_TEXTURE_SIZE; // 縮小一半
        const groundScaleY = groundScaleX * 0.35; // 壓扁成橢圓
        this.shieldGroundSprite.setScale(groundScaleX, groundScaleY);
        this.shieldGroundSprite.setTint(0xffdd44); // 金色
        this.shieldGroundSprite.setAlpha(0.5);
        this.shieldGroundSprite.setVisible(true);

        // 更新閃點計時器
        this.shieldSparkleTimer += delta;

        // 每 80ms 產生一個金光閃點
        const sparkleInterval = 80;
        if (this.shieldSparkleTimer >= sparkleInterval) {
            this.shieldSparkleTimer -= sparkleInterval;
            this.createShieldSparkle(originX, ellipseCenterY, ellipseWidth, ellipseHeight);
        }
    }

    // 在橢圓上隨機位置產生金光閃點（LINE 紋理，小到大擴散放大上升淡出）
    private createShieldSparkle(centerX: number, centerY: number, width: number, height: number) {
        // 隨機角度
        const angle = Math.random() * Math.PI * 2;
        // 橢圓上的點（起始位置）- 使用世界座標
        const startX = centerX + Math.cos(angle) * (width / 2);
        const startY = centerY + Math.sin(angle) * (height / 2);

        // 轉換為螢幕座標
        const screen = this.worldToScreen(startX, startY);

        // 取得 LINE sprite（超過上限則跳過）
        const particle = this.getLineEffectSprite();
        if (!particle) return;

        // 網格大小（使用與地板網格相同的比例）
        const unitSize = this.gameBounds.height / 10;
        const baseLength = unitSize * 0.2; // 起始長度
        const maxLength = unitSize * 0.6; // 最大長度（拉長更多）
        const particleWidth = 24 + Math.random() * 16; // 寬度（再加粗）
        const riseDistance = unitSize * 1.2; // 上升距離（更高）
        const duration = 700 + Math.random() * 300;

        // 設定初始狀態
        particle.setPosition(screen.x, screen.y);
        particle.setRotation(-Math.PI / 2 + (Math.random() - 0.5) * 0.4); // 大致朝上
        particle.setScale(
            baseLength / MainScene.EFFECT_TEXTURE_SIZE,
            particleWidth / MainScene.EFFECT_LINE_HEIGHT
        );
        particle.setTint(0xffdd44); // 金色
        particle.setAlpha(0.85);
        particle.setDepth(150);

        // 動畫：上升 + 拉長 + 淡出
        this.tweens.add({
            targets: particle,
            y: screen.y - riseDistance,
            scaleX: maxLength / MainScene.EFFECT_TEXTURE_SIZE,
            scaleY: particleWidth * 0.5 / MainScene.EFFECT_LINE_HEIGHT, // 變細
            alpha: 0,
            duration: duration,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.releaseLineEffectSprite(particle);
            }
        });
    }

    // 更新 HP 自動回復（鈦金肝被動技能）
    private updateHpRegen(delta: number) {
        // 檢查是否有鈦金肝技能
        const regenInterval = this.skillManager.getTitaniumLiverRegenInterval();
        if (regenInterval <= 0) return;

        // 如果 HP 已滿，不需要回復
        if (this.currentHp >= this.maxHp) {
            this.hpRegenTimer = 0;
            return;
        }

        // 累加計時器
        this.hpRegenTimer += delta;

        // 達到回復間隔時觸發回復
        if (this.hpRegenTimer >= regenInterval) {
            this.hpRegenTimer -= regenInterval;

            // 回復 1% 最大 HP
            const healAmount = Math.max(1, Math.floor(this.maxHp * 0.01));
            this.currentHp = Math.min(this.currentHp + healAmount, this.maxHp);

            // 更新 HP 條顯示
            this.drawHpBarFill();
            this.updateHpText();
            this.updateLowHpVignette();

            // 顯示回復特效
            this.showHpHealEffect(healAmount);

        }
    }

    // 顯示 HP 回復特效（亮藍紫色上升粒子，同護盾 createShieldSparkle）
    private showHpHealEffect(_amount: number) {
        // 產生多個閃點（比護盾更多）
        const particleCount = 12;
        for (let i = 0; i < particleCount; i++) {
            this.time.delayedCall(i * 30, () => {
                this.createHpHealSparkle();
            });
        }
    }

    // 產生單個 HP 回復閃點（同 createShieldSparkle，只改色）
    private createHpHealSparkle() {
        const originX = this.characterX;
        const originY = this.characterY;

        // 橢圓尺寸（同護盾）
        const ellipseWidth = this.characterSize * 0.8;
        const ellipseHeight = this.characterSize * 0.35;
        const ellipseCenterY = originY - this.characterSize * 0.15;

        // 隨機角度
        const angle = Math.random() * Math.PI * 2;
        // 橢圓上的點（起始位置）
        const startX = originX + Math.cos(angle) * (ellipseWidth / 2);
        const startY = ellipseCenterY + Math.sin(angle) * (ellipseHeight / 2);

        // 轉換為螢幕座標
        const screen = this.worldToScreen(startX, startY);

        // 取得 LINE sprite
        const particle = this.getLineEffectSprite();
        if (!particle) return;

        // 網格大小（同 createShieldSparkle）
        const unitSize = this.gameBounds.height / 10;
        const baseLength = unitSize * 0.2;
        const maxLength = unitSize * 0.6;
        const particleWidth = 24 + Math.random() * 16;
        const riseDistance = unitSize * 1.2;
        const duration = 700 + Math.random() * 300;

        // 亮藍紫色系（隨機選擇）
        const colors = [0xaa88ff, 0xbb99ff, 0xcc99ff, 0x99aaff];
        const color = colors[Math.floor(Math.random() * colors.length)];

        // 設定初始狀態
        particle.setPosition(screen.x, screen.y);
        particle.setRotation(-Math.PI / 2 + (Math.random() - 0.5) * 0.4);
        particle.setScale(
            baseLength / MainScene.EFFECT_TEXTURE_SIZE,
            particleWidth / MainScene.EFFECT_LINE_HEIGHT
        );
        particle.setTint(color);
        particle.setAlpha(0.9);
        particle.setDepth(150);

        // 動畫：上升 + 拉長 + 淡出（同 createShieldSparkle）
        this.tweens.add({
            targets: particle,
            y: screen.y - riseDistance,
            scaleX: maxLength / MainScene.EFFECT_TEXTURE_SIZE,
            alpha: 0,
            duration: duration,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.releaseLineEffectSprite(particle);
            }
        });
    }

    // 玩家受到傷害
    private takeDamage(amount: number, attackingMonsters: Monster[] = []) {
        // 迅捷：閃避判定（精神同步率強化 MAX 後啟用）
        const dodgeChance = this.skillManager.getSyncRateDodgeChance(this.currentLevel);
        if (dodgeChance > 0 && Math.random() < dodgeChance) {
            // 顯示閃避特效（角色快速閃爍藍白色）
            this.flashDodgeEffect();
            return; // 完全閃避傷害
        }

        // 套用防禦減免
        const actualDamage = this.skillManager.calculateFinalDamageTaken(amount);

        let remainingDamage = actualDamage;
        let shieldAbsorbed = 0;

        // 優先使用護盾吸收傷害
        if (this.currentShield > 0) {
            const hadShield = this.currentShield > 0; // 記錄原本是否有護盾

            if (this.currentShield >= remainingDamage) {
                // 護盾完全吸收傷害
                shieldAbsorbed = remainingDamage;
                this.currentShield -= remainingDamage;
                remainingDamage = 0;
            } else {
                // 護盾不足，吸收部分傷害
                shieldAbsorbed = this.currentShield;
                remainingDamage -= this.currentShield;
                this.currentShield = 0;
            }

            // 更新護盾條顯示
            this.drawShieldBarFill();

            // 護盾吸收傷害時的視覺效果
            if (shieldAbsorbed > 0) {
                // 金色擴散光圈網格特效（SHIFT+BACKSPACE 開啟，預設關閉以提升效能）
                if (this.showGridSkillEffects) {
                    this.flashShieldHitEffect();
                }
            }

            // 反傷給攻擊者
            if (this.shieldReflectDamage > 0 && attackingMonsters.length > 0) {
                const monsterIds = attackingMonsters.map(m => m.id);
                const reflectResult = this.monsterManager.damageMonsters(monsterIds, this.shieldReflectDamage);
                if (reflectResult.totalExp > 0) {
                    this.addExp(reflectResult.totalExp);
                }

                // 擊退攻擊者 1 單位距離（只有 MAX 等級才有擊退）
                if (this.architectSkillLevel >= 5) {
                    const knockbackDistance = this.gameBounds.height * 0.1; // 1 單位
                    this.monsterManager.knockbackMonsters(monsterIds, this.characterX, this.characterY, knockbackDistance);
                }
            }
        }

        // 扣除剩餘傷害到 HP
        if (remainingDamage > 0) {
            this.currentHp -= remainingDamage;
            this.totalDamageReceived += remainingDamage; // 累計受傷

            // 確保 HP 不低於 0
            if (this.currentHp < 0) {
                this.currentHp = 0;
            }

            // 設定損傷延遲計時器（白色區塊 1 秒後靠攏）
            this.hpDamageDelay = MainScene.HP_DAMAGE_DELAY;

            // 更新 HP 顯示
            this.drawHpBarFill();
            this.updateHpText();

            // 進入受傷硬直狀態（不中斷拖曳/鍵盤狀態，硬直結束後自動恢復移動）
            this.isHurt = true;
            this.hurtEndTime = this.time.now + MainScene.HURT_DURATION;

            // 播放受傷動畫
            this.setCharacterState('hurt');
            this.updateCharacterSprite();

            // 角色閃紅白效果
            this.flashCharacter();

            // 地面文字紅色掃光（兩圈）
            this.triggerDamageScan();

            // 更新低血量紅暈效果
            this.updateLowHpVignette();

        } else {
        }

        // 如果 HP 歸零，檢查是否可以復活
        if (this.currentHp <= 0) {
            // 檢查不死能力（鈦金肝 MAX）
            if (!this.reviveUsed && this.skillManager.hasTitaniumLiverRevive()) {
                this.reviveUsed = true;
                this.currentHp = this.maxHp;
                this.displayedHp = this.maxHp;


                // 觸發暗影爆炸
                this.triggerShadowExplosion();

                // 更新顯示
                this.drawHpBarFill();
                this.updateHpText();
                this.updateLowHpVignette();

                // 角色閃爍紫黑色特效
                this.flashReviveEffect();

                // 顯示不死觸發的 CUT IN
                const titaniumLiver = this.skillManager.getPlayerSkill('passive_titanium_liver');
                if (titaniumLiver?.definition.maxExtraAbility?.triggerQuote) {
                    this.showTriggerCutIn(
                        titaniumLiver.definition,
                        '【不死】觸發',
                        titaniumLiver.definition.maxExtraAbility.triggerQuote
                    );
                }
            } else {
                // 遊戲結束處理
                this.triggerGameOver();
            }
        }
    }

    // 觸發遊戲結束
    private triggerGameOver() {
        if (this.gameOverActive) return; // 防止重複觸發

        // 停止怪物生成
        this.monsterManager.stopSpawning();

        // 隱藏角色
        this.character.setVisible(false);

        // 隱藏所有怪物
        this.monsterManager.hideAllMonsters();

        // 隱藏 UI（HP 條、技能欄、經驗條等）
        this.uiContainer.setVisible(false);

        // 停止所有技能冷卻計時
        this.skillCooldowns.clear();

        // 顯示 GAME OVER 點陣字
        this.showGameOver();

        // 啟動紅色呼吸掃光計時器（每 5 秒）
        this.startGameOverBreathScan();

        // 發送死亡事件到 UI 層
        const minutes = Math.floor(this.gameTimer / 60000);
        const seconds = Math.floor((this.gameTimer % 60000) / 1000);
        const survivalTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        // 計算等級（含經驗值百分比），例如 75級30% = 75.30
        const expPercent = Math.floor((this.currentExp / this.maxExp) * 100);
        const levelWithExp = this.currentLevel + expPercent / 100;

        // 延遲一點時間再顯示死亡彈出視窗，讓玩家看到 GAME OVER
        this.time.delayedCall(2000, () => {
            window.dispatchEvent(new CustomEvent('playerDeath', {
                detail: {
                    survivalTime,
                    level: levelWithExp,
                    totalDamage: Math.floor(this.totalDamageReceived)
                }
            }));
        });
    }

    // 啟動 GAME OVER 紅色呼吸掃光
    private startGameOverBreathScan() {
        // 立即觸發第一次
        this.triggerGameOverBreathScan();

        // 每 5 秒觸發一次
        this.time.addEvent({
            delay: 5000,
            callback: () => this.triggerGameOverBreathScan(),
            loop: true
        });
    }

    // 觸發紅色呼吸掃光（與升級/護盾掃光類似）
    private triggerGameOverBreathScan() {
        if (!this.gameOverActive) return;

        this.gameOverBreathScan = {
            phase: 'expand',
            radius: 0,
            targetRadius: this.gameBounds.height * 0.5 // 5 單位
        };
    }

    // 護盾被擊中時的金色擴散光圈網格特效
    private flashShieldHitEffect() {
        const screen = this.worldToScreen(this.characterX, this.characterY);
        const screenCenterX = screen.x;
        const screenCenterY = screen.y;

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        // 金色
        const color = 0xffcc00;
        const maxRadius = this.gameBounds.height * 0.2; // 擴散範圍

        const duration = 400; // 總時長 400ms
        const expandTime = 200; // 前 200ms 擴散
        const startTime = this.time.now;

        // 計算最大範圍內的所有格子
        const cellsInArea: { col: number, row: number, dist: number }[] = [];

        const minCol = Math.max(0, Math.floor((screenCenterX - maxRadius) / cellTotal));
        const maxCol = Math.min(this.skillGridCols - 1, Math.ceil((screenCenterX + maxRadius) / cellTotal));
        const minRow = Math.max(0, Math.floor((screenCenterY - maxRadius) / cellTotal));
        const maxRow = Math.min(this.skillGridRows - 1, Math.ceil((screenCenterY + maxRadius) / cellTotal));

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellCenterX = col * cellTotal + this.skillGridCellSize / 2;
                const cellCenterY = row * cellTotal + this.skillGridCellSize / 2;

                const dx = cellCenterX - screenCenterX;
                const dy = cellCenterY - screenCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= maxRadius) {
                    cellsInArea.push({ col, row, dist });
                }
            }
        }

        if (cellsInArea.length === 0) return;

        // 使用獨立的 Rectangle 物件
        const flashCells: Phaser.GameObjects.Rectangle[] = [];
        for (const { col, row } of cellsInArea) {
            const x = col * cellTotal + this.skillGridCellSize / 2;
            const y = row * cellTotal + this.skillGridCellSize / 2;
            const cell = this.add.rectangle(x, y, this.skillGridCellSize, this.skillGridCellSize, color, 0);
            cell.setVisible(false);
            this.skillGridContainer.add(cell);
            flashCells.push(cell);
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 擴散進度：從中心向外擴散成環形
            const expandProgress = Math.min(elapsed / expandTime, 1);
            const currentOuterRadius = maxRadius * expandProgress;
            const ringWidth = maxRadius * 0.3; // 光環寬度
            const currentInnerRadius = Math.max(0, currentOuterRadius - ringWidth);

            // 淡出進度
            let fadeProgress = 0;
            if (elapsed > expandTime) {
                fadeProgress = (elapsed - expandTime) / (duration - expandTime);
            }

            let i = 0;
            for (const { dist } of cellsInArea) {
                const cell = flashCells[i++];
                if (!cell) continue;

                // 檢查是否在當前環形範圍內
                if (dist >= currentInnerRadius && dist <= currentOuterRadius) {
                    // 環形漸變：環的中心最亮
                    const ringCenter = (currentInnerRadius + currentOuterRadius) / 2;
                    const distFromRingCenter = Math.abs(dist - ringCenter);
                    const ringHalfWidth = ringWidth / 2;
                    const ringRatio = distFromRingCenter / ringHalfWidth;
                    const baseAlpha = 0.9 * (1 - ringRatio * 0.5); // 環中心 90%，邊緣 45%

                    // 淡出效果
                    const currentAlpha = baseAlpha * (1 - fadeProgress);

                    if (currentAlpha > 0.01) {
                        // 高亮效果
                        if (elapsed < expandTime && ringRatio < 0.3) {
                            // 混合白色高光
                            const r = ((color >> 16) & 0xff);
                            const g = ((color >> 8) & 0xff);
                            const b = (color & 0xff);
                            const brightR = Math.min(255, r + Math.floor((255 - r) * 0.5));
                            const brightG = Math.min(255, g + Math.floor((255 - g) * 0.5));
                            const brightB = Math.min(255, b + Math.floor((255 - b) * 0.5));
                            const brightColor = (brightR << 16) | (brightG << 8) | brightB;
                            cell.setFillStyle(brightColor, currentAlpha);
                        } else {
                            cell.setFillStyle(color, currentAlpha);
                        }
                        cell.setVisible(true);
                    } else {
                        cell.setVisible(false);
                    }
                } else {
                    cell.setVisible(false);
                }
            }

            // 動畫結束時清理
            if (progress >= 1) {
                for (const cell of flashCells) {
                    cell.destroy();
                }
            }
        };

        updateEffect();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            timerEvent.remove();
            for (const cell of flashCells) {
                if (cell.active) cell.destroy();
            }
        });
    }

    // 角色閃紅白效果
    private flashCharacter() {
        // 閃純白（強烈）
        this.character.setTint(0xffffff);

        // 50ms 後閃亮紅（強烈）
        this.time.delayedCall(50, () => {
            this.character.setTint(0xff3333);
        });

        // 100ms 後再閃白
        this.time.delayedCall(100, () => {
            this.character.setTint(0xffffff);
        });

        // 150ms 後恢復正常
        this.time.delayedCall(150, () => {
            this.character.clearTint();
        });
    }

    // 閃避特效（藍白色快速閃爍）
    private flashDodgeEffect() {
        // 閃亮藍色
        this.character.setTint(0x66ccff);

        // 50ms 後閃純白
        this.time.delayedCall(50, () => {
            this.character.setTint(0xffffff);
        });

        // 100ms 後再閃藍
        this.time.delayedCall(100, () => {
            this.character.setTint(0x66ccff);
        });

        // 150ms 後恢復正常
        this.time.delayedCall(150, () => {
            this.character.clearTint();
        });
    }

    // 復活特效（紫黑色多次閃爍）
    private flashReviveEffect() {
        const flashSequence = [0x660066, 0x220022, 0x880088, 0x440044, 0xaa00aa];
        let index = 0;

        const flash = () => {
            if (index < flashSequence.length) {
                this.character.setTint(flashSequence[index]);
                index++;
                this.time.delayedCall(80, flash);
            } else {
                this.character.clearTint();
            }
        };

        flash();
    }

    // 暗影爆炸（秒殺 5 單位距離內所有敵人）
    private triggerShadowExplosion() {
        const unitSize = this.gameBounds.height * 0.1; // 1 單位 = 畫面高度 10%
        const explosionRange = unitSize * 5; // 5 單位距離

        const monsters = this.monsterManager.getMonsters();
        const hitMonsterIds: number[] = [];

        for (const monster of monsters) {
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 計算怪物碰撞半徑
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

            // 距離扣除怪物半徑，邊緣碰到就算命中
            if (dist - monsterRadius <= explosionRange) {
                hitMonsterIds.push(monster.id);
            }
        }

        if (hitMonsterIds.length > 0) {
            // 取得命中怪物的位置
            const hitPositions = monsters
                .filter(m => hitMonsterIds.includes(m.id))
                .map(m => ({ x: m.x, y: m.y }));

            // 秒殺傷害（使用極大值）
            // 注意：不死觸發時角色處於死亡狀態，暗影爆炸擊殺的敵人不給經驗
            const instantKillDamage = 999999;
            this.monsterManager.damageMonsters(hitMonsterIds, instantKillDamage);

            // 顯示暗影打擊特效
            this.flashShadowCrossAtPositions(hitPositions);

        }

        // 繪製暗影圓形邊緣線
        this.drawCircleEdge(explosionRange, 0x660066);

        // 繪製暗影特效（預設使用物件池版本，SHIFT+BACKSPACE 切換為網格版）
        if (this.showGridSkillEffects) {
            this.flashSkillAreaCircle(this.characterX, this.characterY, explosionRange, 0x880088);
        } else {
            this.flashSkillEffectCircle(this.characterX, this.characterY, explosionRange, 0x880088);
        }

        // 畫面震動
        this.cameras.main.shake(200, 0.01);
    }

    // 暗影爆炸圓形特效
    private _drawShadowExplosionEffect(radius: number) {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        const centerX = this.characterX;
        const centerY = this.characterY;
        const shadowColor = 0x440044; // 暗紫色
        const duration = 800;
        const startTime = this.time.now;

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            graphics.clear();

            // 從中心向外擴散的暗影效果
            const currentRadius = radius * progress;
            const alpha = 0.6 * (1 - progress);

            if (alpha > 0.01) {
                graphics.fillStyle(shadowColor, alpha);
                graphics.fillCircle(centerX, centerY, currentRadius);

                // 外圈光暈
                graphics.lineStyle(4, 0x880088, alpha * 0.8);
                graphics.strokeCircle(centerX, centerY, currentRadius);
            }

            if (progress >= 1) {
                graphics.destroy();
            }
        };

        updateEffect();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            timerEvent.remove();
            if (graphics.active) graphics.destroy();
        });
    }

    // 批量顯示暗影十字高光（紫色）
    private flashShadowCrossAtPositions(positions: { x: number, y: number }[]) {
        positions.forEach(pos => {
            this.flashShadowCrossAt(pos.x, pos.y);
        });
    }

    // 在擊中位置顯示暗影十字高光（紫色）
    private flashShadowCrossAt(worldX: number, worldY: number) {
        const screen = this.worldToScreen(worldX, worldY);
        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const centerCol = Math.floor(screen.x / cellTotal);
        const centerRow = Math.floor(screen.y / cellTotal);
        const centerX = centerCol * cellTotal + this.skillGridCellSize / 2;
        const centerY = centerRow * cellTotal + this.skillGridCellSize / 2;

        const crossLength = 5; // 十字臂長度（更大）
        const duration = 500; // 總時長
        const startTime = this.time.now;

        // 隨機旋轉方向和角度
        const rotateDirection = Math.random() < 0.5 ? 1 : -1;
        const rotateAngle = (Math.PI / 4 + Math.random() * Math.PI / 4) * rotateDirection; // 45~90度

        const crossCells: { offsetX: number, offsetY: number, dist: number }[] = [];
        crossCells.push({ offsetX: 0, offsetY: 0, dist: 0 });

        const directions = [
            { dc: 1, dr: 0 },
            { dc: -1, dr: 0 },
            { dc: 0, dr: 1 },
            { dc: 0, dr: -1 }
        ];

        for (const { dc, dr } of directions) {
            for (let i = 1; i <= crossLength; i++) {
                crossCells.push({
                    offsetX: dc * i * cellTotal,
                    offsetY: dr * i * cellTotal,
                    dist: i
                });
            }
        }

        if (crossCells.length === 0) return;

        const shadowColor = 0x880088; // 暗紫色

        const flashCells: Phaser.GameObjects.Rectangle[] = [];
        for (let i = 0; i < crossCells.length; i++) {
            const cell = this.add.rectangle(centerX, centerY, this.skillGridCellSize, this.skillGridCellSize, shadowColor, 0);
            cell.setVisible(false);
            this.skillGridContainer.add(cell);
            flashCells.push(cell);
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const currentAngle = rotateAngle * progress;
            const cos = Math.cos(currentAngle);
            const sin = Math.sin(currentAngle);

            const fadeDistance = crossLength * progress;

            for (let i = 0; i < crossCells.length; i++) {
                const { offsetX, offsetY, dist } = crossCells[i];
                const cell = flashCells[i];
                if (!cell) continue;

                const rotatedX = centerX + offsetX * cos - offsetY * sin;
                const rotatedY = centerY + offsetX * sin + offsetY * cos;
                cell.setPosition(rotatedX, rotatedY);

                if (dist >= fadeDistance) {
                    const distRatio = dist / crossLength;
                    const baseAlpha = 1 - distRatio * 0.2;

                    let edgeFade = 1;
                    if (fadeDistance > 0 && dist < fadeDistance + 1) {
                        edgeFade = (dist - fadeDistance);
                    }

                    const currentAlpha = baseAlpha * Math.max(0, edgeFade);

                    if (currentAlpha > 0.01) {
                        cell.setFillStyle(shadowColor, currentAlpha);
                        cell.setVisible(true);
                    } else {
                        cell.setVisible(false);
                    }
                } else {
                    cell.setVisible(false);
                }
            }

            if (progress >= 1) {
                for (const cell of flashCells) {
                    cell.destroy();
                }
            }
        };

        updateEffect();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            timerEvent.remove();
            for (const cell of flashCells) {
                if (cell.active) cell.destroy();
            }
        });
    }

    // 畫面震動效果（一次擊中多隻怪物時觸發）
    private shakeScreen(hitCount: number) {
        // 至少擊中 10 隻才觸發震動
        if (hitCount < 10) return;

        // 輕微震動：強度 0.005，持續 100ms
        this.cameras.main.shake(100, 0.005);
    }

    // 建立低血量紅暈效果（橢圓形邊緣格子會在 drawGridVignette 動態計算）
    private createLowHpVignette() {
        // vignetteEdgeCells 會在 drawGridVignette 動態填充
    }

    // 更新低血量紅暈效果狀態
    private updateLowHpVignette() {
        const hpRatio = this.currentHp / this.maxHp;
        this.isLowHp = hpRatio <= 0.3;

        // 如果不是低血量，清除邊緣格子顏色
        if (!this.isLowHp && this.currentShield <= 0) {
            this.clearVignetteCells();
        }
    }

    // 清除邊緣格子的紅暈效果
    private clearVignetteCells() {
        for (const index of this.vignetteEdgeCells) {
            const row = Math.floor(index / this.skillGridCols);
            const col = index % this.skillGridCols;
            // 不清除邊框格子
            if (row === 0 || row === this.skillGridRows - 1 ||
                col === 0 || col === this.skillGridCols - 1) {
                continue;
            }
            // ============================================================
            // ⚠️ 重要：不可刪除！HP/護盾條區域保護（row 1-3）
            // 這段代碼防止 vignette 清除時影響 HP/護盾條的顯示
            // ============================================================
            if (row >= 1 && row <= 3) {
                continue;
            }
            const cell = this.skillGridCells[index];
            if (cell) {
                cell.setFillStyle(0xffffff, 0);
                cell.setVisible(false);
            }
        }
        // 清空集合，下次會重新計算
        this.vignetteEdgeCells.clear();
    }

    // 更新低血量紅暈呼吸動畫（每幀更新）
    private updateLowHpVignetteBreathing(delta: number) {
        // 只有低血量或有護盾時才顯示
        if (!this.isLowHp && this.currentShield <= 0) return;

        // 更新呼吸計時器（呼吸週期 1.5 秒）
        this.lowHpBreathTimer += delta;
        const breathCycle = 1500;
        if (this.lowHpBreathTimer >= breathCycle) {
            this.lowHpBreathTimer -= breathCycle;
        }

        // 計算呼吸進度（0~1~0 的週期）
        const breathProgress = this.lowHpBreathTimer / breathCycle;
        const breathValue = Math.sin(breathProgress * Math.PI * 2) * 0.5 + 0.5; // 0~1

        this.drawGridVignette(breathValue);
    }

    // 繪製網格式邊緣紅暈（使用技能網格格子，橢圓形漸層）
    private drawGridVignette(breathValue: number) {
        // 呼吸透明度（0.20 ~ 0.40）- 再淡一點
        const alphaBreath = 0.20 + breathValue * 0.20;

        // 決定顏色：有護盾時金黃色，低血量時紅色
        let baseColor: number;
        if (this.currentShield > 0) {
            baseColor = 0xffdd44; // 金黃色
        } else {
            baseColor = 0xff2222; // 紅色
        }

        // 畫面中心
        const centerCol = this.skillGridCols / 2;
        const centerRow = this.skillGridRows / 2;

        // 橢圓半徑（放大 2 倍，讓橢圓延伸到畫面外更多）
        const radiusX = this.skillGridCols / 2 * 2;
        const radiusY = this.skillGridRows / 2 * 2;

        // 遍歷所有格子（跳過邊框、HP 條和經驗條區域）
        // 邊框：row 0, row (rows-1), col 0, col (cols-1)
        // HP 條：row 1, 2, 3（護盾重疊在 row 1, 2）
        // 經驗條：row (rows-3), (rows-2)
        const startRow = 4; // 跳過 row 0 (邊框) + row 1,2,3 (HP)
        const endRow = this.skillGridRows - 3; // 跳過 row (rows-1) (邊框) + row (rows-3, rows-2) (經驗)
        for (let row = startRow; row < endRow; row++) {
            // 跳過左右邊框（col 0 和 col (cols-1)）
            for (let col = 1; col < this.skillGridCols - 1; col++) {
                const index = row * this.skillGridCols + col;
                const cell = this.skillGridCells[index];
                if (!cell) continue;

                // 計算到橢圓中心的標準化距離
                const dx = (col - centerCol) / radiusX;
                const dy = (row - centerRow) / radiusY;
                const ellipseDist = Math.sqrt(dx * dx + dy * dy);

                // 只顯示橢圓外圍（距離 > 0.5），漸層到邊緣（0.5 ~ 0.75 範圍）
                // 因為橢圓放大了，所以 0.5 ~ 0.75 會剛好在畫面邊緣
                if (ellipseDist > 0.5) {
                    // 越靠近邊緣越亮（0.5 ~ 0.75 映射到 0 ~ 1）
                    const distRatio = Math.min(1, (ellipseDist - 0.5) / 0.25);
                    const cellAlpha = alphaBreath * distRatio;

                    if (cellAlpha > 0.01) {
                        cell.setFillStyle(baseColor, cellAlpha);
                        cell.setVisible(true);
                        // 標記這個格子為邊緣格子（供 clearSkillGrid 使用）
                        this.vignetteEdgeCells.add(index);
                    }
                }
            }
        }
    }

    // ===== 經驗條系統（使用底部 2 行網格格子）=====

    private createExpBar() {
        // 經驗條容器
        this.expBarContainer = this.add.container(0, 0);
        this.expBarContainer.setDepth(1002); // 在網格之上

        // 等級文字（左下角，在網格之上）
        const fontSize = Math.max(MainScene.MIN_FONT_SIZE_LARGE, Math.floor(this.gameBounds.height * 0.03));
        // 底部 2 格的高度
        const cellHeight = this.skillGridCellSize;
        const barY = this.gameBounds.y + this.gameBounds.height - cellHeight * 2;

        this.levelText = this.add.text(
            this.gameBounds.x + 10,
            barY - 5,
            `Lv.${this.currentLevel}`,
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.levelText.setResolution(2); // 提高解析度使文字更清晰
        this.levelText.setOrigin(0, 1);
        this.expBarContainer.add(this.levelText);

        // 遊戲計時器（右下角，對應左側 LV 位置）
        this.timerText = this.add.text(
            this.gameBounds.x + this.gameBounds.width - 10,
            barY - 5,
            '00:00',
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.timerText.setResolution(2);
        this.timerText.setOrigin(1, 1); // 右對齊
        this.expBarContainer.add(this.timerText);

        // 經驗條現在使用網格格子繪製

        // 加入 UI 容器
        this.uiContainer.add(this.expBarContainer);
    }

    private drawExpBarFill() {
        // 經驗條現在使用底部 2 行網格格子
        // EXP 條往上移一格（最底行 row 保留給邊框）
        const expRows = [this.skillGridRows - 3, this.skillGridRows - 2];
        // 可用格子數要扣除左右邊框
        const availableCells = this.skillGridCols - 2;

        // 先繪製所有底部格子為黑底（跳過左右邊框）
        for (const row of expRows) {
            for (let i = 0; i < availableCells; i++) {
                const col = i + 1; // 從 col 1 開始
                const index = row * this.skillGridCols + col;
                const cell = this.skillGridCells[index];
                if (!cell) continue;

                // 設置黑底並顯示
                cell.setFillStyle(0x000000, 0.9);
                cell.setVisible(true);
                // 提升到最高層級
                cell.setDepth(1000);
            }
        }

        // 計算填充格子數
        const fillRatio = this.currentExp / this.maxExp;
        const fillCells = Math.floor(availableCells * fillRatio);

        if (fillCells <= 0) return;

        // 繪製經驗格子（底部 2 行，漸層流動效果）
        for (const row of expRows) {
            for (let i = 0; i < fillCells; i++) {
                const col = i + 1; // 從 col 1 開始
                const index = row * this.skillGridCols + col;
                const cell = this.skillGridCells[index];
                if (!cell) continue;

                // 計算漸層位置（加入流動偏移）
                const baseT = i / availableCells;
                const flowT = this.expBarFlowOffset;
                const t = (baseT + flowT) % 1;

                // 使用正弦波讓頭尾同色（藍→紫→藍）
                const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;

                // 藍色 (0x4488ff) 到 紫色 (0x8844ff) 漸層
                const r = Math.floor(0x44 + (0x88 - 0x44) * wave);
                const g = Math.floor(0x88 - (0x88 - 0x44) * wave);
                const b = 0xff;
                const color = (r << 16) | (g << 8) | b;

                // 上排稍微亮一點（高光效果）
                const alpha = row === this.skillGridRows - 2 ? 0.95 : 0.8;

                cell.setFillStyle(color, alpha);
            }
        }
    }

    private updateExpBarFlow(delta: number) {
        // 流動速度加快 2 倍
        const flowSpeed = 0.2; // 每秒移動 20% 的漸層
        this.expBarFlowOffset += (flowSpeed * delta) / 1000;

        // 保持在 0~1 範圍內循環
        if (this.expBarFlowOffset >= 1) {
            this.expBarFlowOffset -= 1;
        }

        // 重繪經驗條
        this.drawExpBarFill();
    }

    // 繪製遊戲區域邊框（使用 UI 網格最外圍一圈）
    private drawBorderFrame() {
        const borderColor = 0x333333;
        const borderAlpha = 0.95;

        // 頂部邊框（row 0）
        for (let col = 0; col < this.skillGridCols; col++) {
            const index = 0 * this.skillGridCols + col;
            const cell = this.skillGridCells[index];
            if (cell) {
                cell.setFillStyle(borderColor, borderAlpha);
                cell.setVisible(true);
                cell.setDepth(1001); // 比其他 UI 元素更高
            }
        }

        // 底部邊框（最後一行）
        for (let col = 0; col < this.skillGridCols; col++) {
            const index = (this.skillGridRows - 1) * this.skillGridCols + col;
            const cell = this.skillGridCells[index];
            if (cell) {
                cell.setFillStyle(borderColor, borderAlpha);
                cell.setVisible(true);
                cell.setDepth(1001);
            }
        }

        // 左側邊框（第一列，排除已繪製的角落）
        for (let row = 1; row < this.skillGridRows - 1; row++) {
            const index = row * this.skillGridCols + 0;
            const cell = this.skillGridCells[index];
            if (cell) {
                cell.setFillStyle(borderColor, borderAlpha);
                cell.setVisible(true);
                cell.setDepth(1001);
            }
        }

        // 右側邊框（最後一列，排除已繪製的角落）
        for (let row = 1; row < this.skillGridRows - 1; row++) {
            const index = row * this.skillGridCols + (this.skillGridCols - 1);
            const cell = this.skillGridCells[index];
            if (cell) {
                cell.setFillStyle(borderColor, borderAlpha);
                cell.setVisible(true);
                cell.setDepth(1001);
            }
        }
    }

    // 建立視差背景
    private createParallaxBackground() {
        const bgWidth = this.gameBounds.width * MainScene.PARALLAX_BG_SCALE;
        const bgHeight = this.gameBounds.height * MainScene.PARALLAX_BG_SCALE;

        // 隨機選擇 1-5 號城市背景
        const bgIndex = Phaser.Math.Between(1, 5);
        this.parallaxBackground = this.add.sprite(this.mapWidth / 2, this.mapHeight / 2, `bg_city_${bgIndex}`);
        const scaleX = bgWidth / this.parallaxBackground.width;
        const scaleY = bgHeight / this.parallaxBackground.height;
        this.parallaxBackground.setScale(Math.max(scaleX, scaleY));
        this.parallaxBackground.setOrigin(0.5, 0.5);
        this.parallaxBackground.setAlpha(0.5); // 50% 透明度
        this.worldContainer.add(this.parallaxBackground);
    }

    // 更新視差背景位置
    private updateParallaxBackground() {
        if (!this.parallaxBackground) return;

        const bgWidth = this.gameBounds.width * MainScene.PARALLAX_BG_SCALE;
        const bgHeight = this.gameBounds.height * MainScene.PARALLAX_BG_SCALE;

        const parallaxRatioX = (this.mapWidth - bgWidth) / (this.mapWidth - this.gameBounds.width);
        const parallaxRatioY = (this.mapHeight - bgHeight) / (this.mapHeight - this.gameBounds.height);

        const bgCenterX = bgWidth / 2 + this.cameraOffsetX * parallaxRatioX;
        const bgCenterY = bgHeight / 2 + this.cameraOffsetY * parallaxRatioY;

        this.parallaxBackground.setPosition(bgCenterX, bgCenterY);
    }

    // 生成隨機地板障礙物（水坑）
    private generateFloorObstacles() {
        const unitSize = this.gameBounds.height / 10;
        const count = Phaser.Math.Between(
            MainScene.FLOOR_OBSTACLE_COUNT_MIN,
            MainScene.FLOOR_OBSTACLE_COUNT_MAX
        );

        // 計算安全區域（避免生成在地圖邊緣和角色起始位置）
        const maxSize = unitSize * MainScene.FLOOR_OBSTACLE_SIZE_MAX;
        const margin = maxSize * 2;
        const spawnStartX = this.characterX;
        const spawnStartY = this.characterY;
        const safeZone = maxSize * 3;

        for (let i = 0; i < count; i++) {
            let attempts = 0;
            const maxAttempts = 50;
            let placed = false;

            // 隨機大小（2-3 單位）
            const obstacleSize = unitSize * Phaser.Math.FloatBetween(
                MainScene.FLOOR_OBSTACLE_SIZE_MIN,
                MainScene.FLOOR_OBSTACLE_SIZE_MAX
            );

            while (!placed && attempts < maxAttempts) {
                attempts++;

                // 隨機位置
                const x = Phaser.Math.FloatBetween(margin, this.mapWidth - margin);
                const y = Phaser.Math.FloatBetween(margin, this.mapHeight - margin);

                // 檢查是否在角色起始位置安全區域內
                const distToSpawn = Math.sqrt(
                    (x - spawnStartX) ** 2 + (y - spawnStartY) ** 2
                );
                if (distToSpawn < safeZone) continue;

                // 檢查是否與其他障礙物重疊
                let overlaps = false;
                for (const obstacle of this.floorObstacles) {
                    const dist = Math.sqrt(
                        (x - obstacle.x) ** 2 + (y - obstacle.y) ** 2
                    );
                    const minDist = obstacleSize / 2 + obstacle.imageRadius;
                    if (dist < minDist) {
                        overlaps = true;
                        break;
                    }
                }
                if (overlaps) continue;

                // 隨機選擇水坑圖片（1-5）
                const waterIndex = Phaser.Math.Between(1, 5);
                const textureKey = `floor_water_${waterIndex}`;

                // 建立 sprite
                const sprite = this.add.sprite(x, y, textureKey);
                sprite.setOrigin(0.5, 0.5);

                // 設定大小（縮放到目標尺寸）
                const scale = obstacleSize / Math.max(sprite.width, sprite.height);
                sprite.setScale(scale);

                // 設定 30% 透明度（視覺效果，alpha = 0.7）
                sprite.setAlpha(0.7);

                // 實際顯示尺寸
                const displayWidth = sprite.width * scale;
                const displayHeight = sprite.height * scale;
                // 碰撞區域 = 實際尺寸的 70%（對應不透明區域）
                const halfWidth = displayWidth / 2 * 0.7;
                const halfHeight = displayHeight / 2 * 0.7;
                const imageRadius = obstacleSize / 2;

                // 加入容器
                this.floorObstacleContainer.add(sprite);

                // 在灰色地板上挖洞（用水坑形狀，讓視差背景可見）
                this.eraseFloorWithSprite(sprite);

                // 記錄障礙物資料
                this.floorObstacles.push({
                    sprite,
                    x,
                    y,
                    halfWidth,
                    halfHeight,
                    imageRadius
                });

                placed = true;
            }
        }

        // 固定水坑：在起始點旁邊生成一個（讓玩家一開始就能看到），使用 0 號圖
        this.createWaterPit(spawnStartX + unitSize * 2, spawnStartY, unitSize * 4, 'floor_water_0');
    }

    // 建立單個水坑
    private createWaterPit(x: number, y: number, size: number, textureKey: string) {
        const sprite = this.add.sprite(x, y, textureKey);
        sprite.setOrigin(0.5, 0.5);
        const scale = size / Math.max(sprite.width, sprite.height);
        sprite.setScale(scale);
        sprite.setAlpha(0.7);

        this.floorObstacleContainer.add(sprite);

        // 實際顯示尺寸
        const displayWidth = sprite.width * scale;
        const displayHeight = sprite.height * scale;
        // 碰撞區域 = 實際尺寸的 70%
        const halfWidth = displayWidth / 2 * 0.7;
        const halfHeight = displayHeight / 2 * 0.7;
        const imageRadius = size / 2;

        this.floorObstacles.push({
            sprite,
            x,
            y,
            halfWidth,
            halfHeight,
            imageRadius
        });

        // 在灰色地板上挖洞（用水坑形狀，讓視差背景可見）
        this.eraseFloorWithSprite(sprite);
    }

    // 用 sprite 形狀在灰色地板上挖洞
    private eraseFloorWithSprite(sprite: Phaser.GameObjects.Sprite) {
        if (!this.floorRT) return;

        // 暫時設為完全不透明以便正確擦除
        const originalAlpha = sprite.alpha;
        sprite.setAlpha(1);

        // 用 sprite 的形狀擦除（會依照 sprite 的 alpha 通道）
        this.floorRT.erase(sprite, sprite.x, sprite.y);

        // 還原透明度
        sprite.setAlpha(originalAlpha);
    }

    // 檢查位置是否與障礙物碰撞（像素級碰撞）
    private checkObstacleCollision(x: number, y: number, _radius: number): boolean {
        for (const obstacle of this.floorObstacles) {
            const sprite = obstacle.sprite;

            // 計算點在 sprite 本地座標的位置
            const localX = x - obstacle.x;
            const localY = y - obstacle.y;

            // 檢查是否在 sprite 範圍內
            const halfW = sprite.displayWidth / 2;
            const halfH = sprite.displayHeight / 2;
            if (Math.abs(localX) > halfW || Math.abs(localY) > halfH) {
                continue; // 不在範圍內，跳過
            }

            // 轉換到紋理座標（0 到 textureWidth/Height）
            const texX = Math.floor((localX / sprite.displayWidth + 0.5) * sprite.width);
            const texY = Math.floor((localY / sprite.displayHeight + 0.5) * sprite.height);

            // 檢查該像素的 alpha 值
            const alpha = this.textures.getPixelAlpha(texX, texY, sprite.texture.key);
            if (alpha > 128) { // alpha > 50% 視為碰撞
                return true;
            }
        }
        return false;
    }

    // 從物件池取得或建立 hex sprite
    private getFloorHexSprite(char: string): Phaser.GameObjects.Sprite {
        const textureKey = `hex_${char}`;
        let sprite = this.floorHexPool.pop();
        if (!sprite) {
            sprite = this.add.sprite(0, 0, textureKey);
        } else {
            sprite.setTexture(textureKey);
            sprite.setVisible(true);
            sprite.setActive(true);
        }
        sprite.setTint(MainScene.HEX_TINT_NORMAL); // 預設綠色
        return sprite;
    }

    // 釋放 hex sprite 回物件池
    private releaseFloorHexSprite(sprite: Phaser.GameObjects.Sprite) {
        sprite.setVisible(false);
        sprite.setActive(false);
        sprite.setTint(MainScene.HEX_TINT_NORMAL); // 重設 tint
        this.floorHexPool.push(sprite);
    }

    // 隨機選擇字元（30% 16進制，70% 二進制）
    private getRandomHexChar(): string {
        const chars = Math.random() < MainScene.HEX_CHANCE
            ? MainScene.HEX_CHARS
            : MainScene.BINARY_CHARS;
        return chars[Math.floor(Math.random() * chars.length)];
    }

    // 根據強度混合 tint 顏色（0=綠色，1=白色）
    private lerpTint(intensity: number): number {
        const r1 = (MainScene.HEX_TINT_NORMAL >> 16) & 0xff;
        const g1 = (MainScene.HEX_TINT_NORMAL >> 8) & 0xff;
        const b1 = MainScene.HEX_TINT_NORMAL & 0xff;
        const r2 = (MainScene.HEX_TINT_HIGHLIGHT >> 16) & 0xff;
        const g2 = (MainScene.HEX_TINT_HIGHLIGHT >> 8) & 0xff;
        const b2 = MainScene.HEX_TINT_HIGHLIGHT & 0xff;
        const r = Math.round(r1 + (r2 - r1) * intensity);
        const g = Math.round(g1 + (g2 - g1) * intensity);
        const b = Math.round(b1 + (b2 - b1) * intensity);
        return (r << 16) | (g << 8) | b;
    }

    // 通用顏色插值（從 colorFrom 過渡到 colorTo）
    private lerpTintColor(colorFrom: number, colorTo: number, intensity: number): number {
        const r1 = (colorFrom >> 16) & 0xff;
        const g1 = (colorFrom >> 8) & 0xff;
        const b1 = colorFrom & 0xff;
        const r2 = (colorTo >> 16) & 0xff;
        const g2 = (colorTo >> 8) & 0xff;
        const b2 = colorTo & 0xff;
        const r = Math.round(r1 + (r2 - r1) * intensity);
        const g = Math.round(g1 + (g2 - g1) * intensity);
        const b = Math.round(b1 + (b2 - b1) * intensity);
        return (r << 16) | (g << 8) | b;
    }

    // 觸發受傷紅色掃光（兩圈同時擴散）
    private triggerDamageScan() {
        // 清除舊的並啟動兩圈新的
        this.damageScanRings = [
            { radius: 0, active: true },
            { radius: -this.gameBounds.height * 0.1, active: true } // 第二圈稍微延遲
        ];
    }

    // 更新受傷紅色掃光
    private updateDamageScan() {
        const screenHeight = this.gameBounds.height;
        const delta = this.game.loop.delta / 1000;
        const ringWidth = screenHeight * MainScene.DAMAGE_SCAN_WIDTH;
        const maxRadius = screenHeight * MainScene.DAMAGE_SCAN_MAX;

        // 更新每個掃光環
        for (const ring of this.damageScanRings) {
            if (!ring.active) continue;

            // 擴大半徑
            ring.radius += screenHeight * MainScene.DAMAGE_SCAN_SPEED * delta;

            // 對每個字元計算掃光亮度加成
            if (ring.radius > 0) {
                const innerRadius = Math.max(0, ring.radius - ringWidth / 2);
                const outerRadius = ring.radius + ringWidth / 2;

                for (const hex of this.floorHexChars) {
                    const dx = hex.sprite.x - this.characterX;
                    const dy = hex.sprite.y - this.characterY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist >= innerRadius && dist <= outerRadius) {
                        // 在掃光環內，計算亮度漸層（環中心最亮）
                        const distFromRingCenter = Math.abs(dist - ring.radius);
                        const normalizedDist = distFromRingCenter / (ringWidth / 2);
                        const intensity = 1 - normalizedDist;

                        // 紅色→白色漸層
                        const scanColor = this.lerpTintColor(MainScene.DAMAGE_SCAN_COLOR, 0xffffff, intensity);
                        hex.sprite.setTint(scanColor);
                    }
                }
            }

            // 檢查掃光是否結束
            if (ring.radius > maxRadius) {
                ring.active = false;
            }
        }

        // 移除已完成的環
        this.damageScanRings = this.damageScanRings.filter(r => r.active);
    }

    // 觸發護盾金色呼吸掃光
    private triggerShieldBreathScan() {
        this.shieldBreathScan = {
            phase: 'expand',
            radius: 0,
            targetRadius: this.gameBounds.height * MainScene.SHIELD_SCAN_EXPAND_MAX
        };
    }

    // 更新護盾金色呼吸掃光
    private updateShieldBreathScan() {
        if (this.shieldBreathScan.phase === 'idle') return;

        const screenHeight = this.gameBounds.height;
        const delta = this.game.loop.delta / 1000;
        const ringWidth = screenHeight * MainScene.SHIELD_SCAN_WIDTH;

        let speed = 0;
        let colorFrom = MainScene.SHIELD_SCAN_COLOR;
        let colorTo = 0xffffff;

        switch (this.shieldBreathScan.phase) {
            case 'expand':
                speed = MainScene.SHIELD_SCAN_EXPAND_SPEED;
                this.shieldBreathScan.radius += screenHeight * speed * delta;
                colorFrom = MainScene.SHIELD_SCAN_COLOR;
                colorTo = 0xffffff;

                // 到達目標後轉為收縮
                if (this.shieldBreathScan.radius >= this.shieldBreathScan.targetRadius) {
                    this.shieldBreathScan.phase = 'contract';
                }
                break;

            case 'contract':
                speed = MainScene.SHIELD_SCAN_CONTRACT_SPEED;
                this.shieldBreathScan.radius -= screenHeight * speed * delta;
                colorFrom = 0xffffff; // 收縮時變白
                colorTo = 0xffffff;

                // 收縮到中心後轉為爆發
                if (this.shieldBreathScan.radius <= 0) {
                    this.shieldBreathScan.radius = 0;
                    this.shieldBreathScan.phase = 'burst';
                    this.shieldBreathScan.targetRadius = screenHeight * MainScene.SHIELD_SCAN_BURST_MAX;
                }
                break;

            case 'burst':
                speed = MainScene.SHIELD_SCAN_BURST_SPEED;
                this.shieldBreathScan.radius += screenHeight * speed * delta;
                colorFrom = 0xffffff; // 爆發時從白開始
                colorTo = MainScene.SHIELD_SCAN_COLOR;

                // 到達最大後結束
                if (this.shieldBreathScan.radius >= this.shieldBreathScan.targetRadius) {
                    this.shieldBreathScan.phase = 'idle';
                }
                break;
        }

        // 對每個字元計算掃光亮度加成
        if (this.shieldBreathScan.radius > 0) {
            const innerRadius = Math.max(0, this.shieldBreathScan.radius - ringWidth / 2);
            const outerRadius = this.shieldBreathScan.radius + ringWidth / 2;

            for (const hex of this.floorHexChars) {
                const dx = hex.sprite.x - this.characterX;
                const dy = hex.sprite.y - this.characterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist >= innerRadius && dist <= outerRadius) {
                    // 在掃光環內，計算亮度漸層（環中心最亮）
                    const distFromRingCenter = Math.abs(dist - this.shieldBreathScan.radius);
                    const normalizedDist = distFromRingCenter / (ringWidth / 2);
                    const intensity = 1 - normalizedDist;

                    // 根據階段決定顏色過渡
                    const scanColor = this.lerpTintColor(colorFrom, colorTo, intensity);
                    hex.sprite.setTint(scanColor);
                }
            }
        }
    }

    // 觸發升級藍色呼吸掃光
    private triggerLevelUpBreathScan() {
        this.levelUpBreathScan = {
            phase: 'expand',
            radius: 0,
            targetRadius: this.gameBounds.height * MainScene.LEVELUP_SCAN_EXPAND_MAX
        };
    }

    // 更新升級藍色呼吸掃光
    private updateLevelUpBreathScan() {
        if (this.levelUpBreathScan.phase === 'idle') return;

        const screenHeight = this.gameBounds.height;
        const delta = this.game.loop.delta / 1000;
        const ringWidth = screenHeight * MainScene.LEVELUP_SCAN_WIDTH;

        let speed = 0;
        let colorFrom = MainScene.LEVELUP_SCAN_COLOR;
        let colorTo = 0xffffff;

        switch (this.levelUpBreathScan.phase) {
            case 'expand':
                speed = MainScene.LEVELUP_SCAN_EXPAND_SPEED;
                this.levelUpBreathScan.radius += screenHeight * speed * delta;
                colorFrom = MainScene.LEVELUP_SCAN_COLOR;
                colorTo = 0xffffff;

                // 到達目標後轉為收縮
                if (this.levelUpBreathScan.radius >= this.levelUpBreathScan.targetRadius) {
                    this.levelUpBreathScan.phase = 'contract';
                }
                break;

            case 'contract':
                speed = MainScene.LEVELUP_SCAN_CONTRACT_SPEED;
                this.levelUpBreathScan.radius -= screenHeight * speed * delta;
                colorFrom = 0xffffff; // 收縮時變白
                colorTo = 0xffffff;

                // 收縮到中心後轉為爆發
                if (this.levelUpBreathScan.radius <= 0) {
                    this.levelUpBreathScan.radius = 0;
                    this.levelUpBreathScan.phase = 'burst';
                    this.levelUpBreathScan.targetRadius = screenHeight * MainScene.LEVELUP_SCAN_BURST_MAX;
                }
                break;

            case 'burst':
                speed = MainScene.LEVELUP_SCAN_BURST_SPEED;
                this.levelUpBreathScan.radius += screenHeight * speed * delta;
                colorFrom = 0xffffff; // 爆發時從白開始
                colorTo = MainScene.LEVELUP_SCAN_COLOR;

                // 到達最大後結束
                if (this.levelUpBreathScan.radius >= this.levelUpBreathScan.targetRadius) {
                    this.levelUpBreathScan.phase = 'idle';
                }
                break;
        }

        // 對每個字元計算掃光亮度加成
        if (this.levelUpBreathScan.radius > 0) {
            const innerRadius = Math.max(0, this.levelUpBreathScan.radius - ringWidth / 2);
            const outerRadius = this.levelUpBreathScan.radius + ringWidth / 2;

            for (const hex of this.floorHexChars) {
                const dx = hex.sprite.x - this.characterX;
                const dy = hex.sprite.y - this.characterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist >= innerRadius && dist <= outerRadius) {
                    // 在掃光環內，計算亮度漸層（環中心最亮）
                    const distFromRingCenter = Math.abs(dist - this.levelUpBreathScan.radius);
                    const normalizedDist = distFromRingCenter / (ringWidth / 2);
                    const intensity = 1 - normalizedDist;

                    // 根據階段決定顏色過渡
                    const scanColor = this.lerpTintColor(colorFrom, colorTo, intensity);
                    hex.sprite.setTint(scanColor);
                }
            }
        }
    }

    // 更新 GAME OVER 紅色呼吸掃光
    private updateGameOverBreathScan() {
        if (this.gameOverBreathScan.phase === 'idle') return;

        const screenHeight = this.gameBounds.height;
        const delta = this.game.loop.delta / 1000;
        const ringWidth = screenHeight * MainScene.GAMEOVER_SCAN_WIDTH;

        let speed = 0;
        let colorFrom = MainScene.GAMEOVER_SCAN_COLOR;
        let colorTo = 0xffffff;

        switch (this.gameOverBreathScan.phase) {
            case 'expand':
                speed = MainScene.GAMEOVER_SCAN_EXPAND_SPEED;
                this.gameOverBreathScan.radius += screenHeight * speed * delta;
                colorFrom = MainScene.GAMEOVER_SCAN_COLOR;
                colorTo = 0xffaaaa; // 淺紅

                // 到達目標後轉為收縮
                if (this.gameOverBreathScan.radius >= this.gameOverBreathScan.targetRadius) {
                    this.gameOverBreathScan.phase = 'contract';
                }
                break;

            case 'contract':
                speed = MainScene.GAMEOVER_SCAN_CONTRACT_SPEED;
                this.gameOverBreathScan.radius -= screenHeight * speed * delta;
                colorFrom = 0xffffff; // 收縮時變白
                colorTo = 0xffffff;

                // 收縮到中心後轉為爆發
                if (this.gameOverBreathScan.radius <= 0) {
                    this.gameOverBreathScan.radius = 0;
                    this.gameOverBreathScan.phase = 'burst';
                    this.gameOverBreathScan.targetRadius = screenHeight * MainScene.GAMEOVER_SCAN_BURST_MAX;
                }
                break;

            case 'burst':
                speed = MainScene.GAMEOVER_SCAN_BURST_SPEED;
                this.gameOverBreathScan.radius += screenHeight * speed * delta;
                colorFrom = 0xffffff; // 爆發時從白開始
                colorTo = 0x9944ff;   // 爆發變紫色

                // 到達最大後結束
                if (this.gameOverBreathScan.radius >= this.gameOverBreathScan.targetRadius) {
                    this.gameOverBreathScan.phase = 'idle';
                }
                break;
        }

        // 對每個字元計算掃光亮度加成
        if (this.gameOverBreathScan.radius > 0) {
            const innerRadius = Math.max(0, this.gameOverBreathScan.radius - ringWidth / 2);
            const outerRadius = this.gameOverBreathScan.radius + ringWidth / 2;

            for (const hex of this.floorHexChars) {
                const dx = hex.sprite.x - this.characterX;
                const dy = hex.sprite.y - this.characterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist >= innerRadius && dist <= outerRadius) {
                    // 在掃光環內，計算亮度漸層（環中心最亮）
                    const distFromRingCenter = Math.abs(dist - this.gameOverBreathScan.radius);
                    const normalizedDist = distFromRingCenter / (ringWidth / 2);
                    const intensity = 1 - normalizedDist;

                    // 根據階段決定顏色過渡
                    const scanColor = this.lerpTintColor(colorFrom, colorTo, intensity);
                    hex.sprite.setTint(scanColor);
                }
            }
        }
    }

    // 生成地板隨機字元（空間定位用，只在可見區域附近生成）
    private spawnFloorHexChar() {
        if (this.floorHexChars.length >= MainScene.FLOOR_HEX_MAX) return;

        // 格子大小
        const gridSize = this.gameBounds.height * MainScene.FLOOR_HEX_GRID_SIZE;

        // 只在角色周圍 2 倍螢幕範圍內生成
        const viewWidth = this.gameBounds.width * 2;
        const viewHeight = this.gameBounds.height * 2;
        const minX = Math.max(0, this.characterX - viewWidth / 2);
        const minY = Math.max(0, this.characterY - viewHeight / 2);
        const maxX = Math.min(this.mapWidth, this.characterX + viewWidth / 2);
        const maxY = Math.min(this.mapHeight, this.characterY + viewHeight / 2);

        // 嘗試找一個未使用的位置
        let attempts = 0;
        while (attempts < 20) {
            const x = minX + Math.random() * (maxX - minX);
            const y = minY + Math.random() * (maxY - minY);
            const col = Math.floor(x / gridSize);
            const row = Math.floor(y / gridSize);
            const gridKey = `${col},${row}`;

            if (!this.floorHexUsedPositions.has(gridKey)) {
                // 找到空位，生成字元
                const char = this.getRandomHexChar();
                // 平行四邊形排列：每行向右偏移（上端連接偏移4格）
                const skewOffset = gridSize * 0.25; // 每4行偏移1格
                const centerX = col * gridSize + gridSize / 2 + row * skewOffset;
                const centerY = row * gridSize + gridSize / 2;

                // 使用 sprite 圖片
                const sprite = this.getFloorHexSprite(char);
                sprite.setPosition(centerX, centerY);
                // 縮放到適當大小（紋理 80px，目標為 gridSize * 0.8）
                const targetSize = gridSize; // 無間隙
                sprite.setScale(targetSize / 80);
                sprite.setAlpha(0); // 從 0 開始淡入
                this.floorHexContainer.add(sprite);

                this.floorHexChars.push({
                    sprite,
                    gridKey,
                    spawnTime: this.time.now,
                    fadeInDuration: 1000 + Math.random() * 1000, // 淡入1-2秒隨機
                    lifetime: 1000 + Math.random() * 2000,       // 顯現後存活1-3秒隨機
                    fullyVisible: false,
                    visibleStartTime: 0
                });
                this.floorHexUsedPositions.add(gridKey);
                return;
            }
            attempts++;
        }
    }

    // 更新地板字元（淡入淡出）
    private updateFloorHexChars() {
        const now = this.time.now;
        const maxDist = this.gameBounds.width * 1.5; // 超出 1.5 倍螢幕寬度就移除

        // 地圖邊緣警示參數
        const gridSize = this.gameBounds.height * MainScene.FLOOR_HEX_GRID_SIZE;
        const screenHalfW = this.gameBounds.width / 2;
        const screenHalfH = this.gameBounds.height / 2;
        // 計算螢幕可見範圍（地圖座標）
        const viewLeft = this.characterX - screenHalfW;
        const viewRight = this.characterX + screenHalfW;
        const viewTop = this.characterY - screenHalfH;
        const viewBottom = this.characterY + screenHalfH;
        // 判斷地圖邊緣是否在畫面中
        const leftEdgeVisible = viewLeft < 0;
        const rightEdgeVisible = viewRight > this.mapWidth;
        const topEdgeVisible = viewTop < 0;
        const bottomEdgeVisible = viewBottom > this.mapHeight;
        const anyEdgeVisible = leftEdgeVisible || rightEdgeVisible || topEdgeVisible || bottomEdgeVisible;

        // 高頻生成邊緣波浪脈衝
        if (anyEdgeVisible && now - this.lastEdgePulseTime > 16) { // 每幀生成
            this.lastEdgePulseTime = now;
            const visibleEdges: ('left' | 'right' | 'top' | 'bottom')[] = [];
            if (leftEdgeVisible) visibleEdges.push('left');
            if (rightEdgeVisible) visibleEdges.push('right');
            if (topEdgeVisible) visibleEdges.push('top');
            if (bottomEdgeVisible) visibleEdges.push('bottom');

            // 每幀生成 3-5 個脈衝
            const pulseCount = 3 + Math.floor(Math.random() * 3);
            for (let p = 0; p < pulseCount && visibleEdges.length > 0; p++) {
                const edge = visibleEdges[Math.floor(Math.random() * visibleEdges.length)];
                let px = 0, py = 0;
                if (edge === 'left' || edge === 'right') {
                    px = edge === 'left' ? 0 : this.mapWidth;
                    py = viewTop + Math.random() * this.gameBounds.height;
                    py = Math.max(0, Math.min(this.mapHeight, py));
                } else {
                    py = edge === 'top' ? 0 : this.mapHeight;
                    px = viewLeft + Math.random() * this.gameBounds.width;
                    px = Math.max(0, Math.min(this.mapWidth, px));
                }
                this.edgeWavePulses.push({
                    x: px, y: py, edge,
                    startTime: now,
                    length: 6 + Math.floor(Math.random() * 5), // 6-10 格
                    duration: 1000 + Math.random() * 500 // 1-1.5 秒
                });
            }
        }

        // 清理過期的脈衝
        this.edgeWavePulses = this.edgeWavePulses.filter(p => now - p.startTime < p.duration);

        for (let i = this.floorHexChars.length - 1; i >= 0; i--) {
            const hex = this.floorHexChars[i];
            const age = now - hex.spawnTime;

            // 計算距離角色的距離
            const spriteX = hex.sprite.x;
            const spriteY = hex.sprite.y;
            const dist = Math.sqrt(
                Math.pow(spriteX - this.characterX, 2) +
                Math.pow(spriteY - this.characterY, 2)
            );

            // 太遠就移除
            if (dist > maxDist) {
                this.releaseFloorHexSprite(hex.sprite);
                this.floorHexUsedPositions.delete(hex.gridKey);
                this.floorHexChars.splice(i, 1);
                continue;
            }

            // 計算基礎透明度
            let baseAlpha = 0.7;
            if (!hex.fullyVisible) {
                if (age < hex.fadeInDuration) {
                    baseAlpha = 0.7 * (age / hex.fadeInDuration);
                } else {
                    hex.fullyVisible = true;
                    hex.visibleStartTime = now;
                }
            } else {
                const visibleAge = now - hex.visibleStartTime;
                const fadeOutDuration = hex.lifetime * 0.2;
                if (visibleAge >= hex.lifetime) {
                    this.releaseFloorHexSprite(hex.sprite);
                    this.floorHexUsedPositions.delete(hex.gridKey);
                    this.floorHexChars.splice(i, 1);
                    continue;
                } else if (visibleAge > hex.lifetime - fadeOutDuration) {
                    baseAlpha = 0.7 * ((hex.lifetime - visibleAge) / fadeOutDuration);
                }
            }

            // 檢查是否被任何邊緣波浪脈衝影響
            let maxPulseEffect = 0;
            let pulseDistRatio = 0; // 用於漸層（0=邊緣紅，1=內側橘）

            for (const pulse of this.edgeWavePulses) {
                const pulseAge = now - pulse.startTime;
                const pulseProgress = pulseAge / pulse.duration; // 0-1
                const maxDist = pulse.length * gridSize;

                // 計算字元到脈衝起點的距離（根據邊緣方向）
                let distFromEdge = 0;
                let lateralDist = 0; // 橫向距離（用於判斷是否在脈衝範圍內）

                if (pulse.edge === 'left') {
                    distFromEdge = spriteX;
                    lateralDist = Math.abs(spriteY - pulse.y);
                } else if (pulse.edge === 'right') {
                    distFromEdge = this.mapWidth - spriteX;
                    lateralDist = Math.abs(spriteY - pulse.y);
                } else if (pulse.edge === 'top') {
                    distFromEdge = spriteY;
                    lateralDist = Math.abs(spriteX - pulse.x);
                } else {
                    distFromEdge = this.mapHeight - spriteY;
                    lateralDist = Math.abs(spriteX - pulse.x);
                }

                // 波浪擴散效果：當前波峰位置
                const waveHead = pulseProgress * maxDist * 1.5; // 波峰位置
                const waveTail = Math.max(0, waveHead - maxDist); // 波尾位置

                // 橫向範圍（隨機寬度 1-3 格）
                const lateralRange = gridSize * (1 + Math.random() * 0.5);

                // 判斷是否在波浪範圍內
                if (distFromEdge >= waveTail && distFromEdge <= waveHead &&
                    lateralDist < lateralRange && distFromEdge < maxDist) {

                    // 計算效果強度（波峰最強，邊緣衰減）
                    const distFromHead = Math.abs(distFromEdge - waveHead);
                    const waveWidth = maxDist * 0.4;
                    const effect = Math.exp(-distFromHead * distFromHead / (waveWidth * waveWidth));

                    // 淡出效果
                    const fadeOut = pulseProgress > 0.7 ? (1 - pulseProgress) / 0.3 : 1;
                    const finalEffect = effect * fadeOut;

                    if (finalEffect > maxPulseEffect) {
                        maxPulseEffect = finalEffect;
                        pulseDistRatio = distFromEdge / maxDist; // 用於漸層
                    }
                }
            }

            // 套用顏色和透明度
            if (maxPulseEffect > 0.1) {
                // 紅到橘漸層（邊緣紅，內側橘）
                const r = 0xff;
                const g = Math.floor(0x33 + pulseDistRatio * 0x55); // 33 -> 88
                const b = 0x33;
                const tintColor = (r << 16) | (g << 8) | b;

                hex.sprite.setTint(tintColor);
                hex.sprite.setAlpha(baseAlpha * (0.6 + maxPulseEffect * 0.4));
            } else {
                // 恢復正常綠色
                hex.sprite.setTint(MainScene.HEX_TINT_NORMAL);
                hex.sprite.setAlpha(baseAlpha);
            }
        }

        // 每幀生成多個字元，快速填滿到目標數量
        const targetCount = MainScene.FLOOR_HEX_MAX;
        const spawnPerFrame = Math.min(20, targetCount - this.floorHexChars.length);
        for (let i = 0; i < spawnPerFrame; i++) {
            this.spawnFloorHexChar();
        }

        // 更新圓形半徑擴散
        this.updateRadiusWaves();

        // 更新橫向掃光
        this.updateScanLine();

        // 更新 GAME OVER 點陣字閃爍
        this.updateGameOverFlicker();
    }

    // 顯示 GAME OVER 點陣字
    private showGameOver() {
        if (this.gameOverActive) return;
        this.gameOverActive = true;

        // 清除現有地板字
        for (const hex of this.floorHexChars) {
            this.releaseFloorHexSprite(hex.sprite);
        }
        this.floorHexChars = [];
        this.floorHexUsedPositions.clear();

        // 使用地板字的格子大小
        const gridSize = this.gameBounds.height * MainScene.FLOOR_HEX_GRID_SIZE;
        const charWidth = 7;  // 每個字母 7 格寬（2格粗筆畫）
        const charHeight = 9; // 每個字母 9 格高
        const charSpacing = 2; // 字母間隔 2 格
        const rowSpacing = 2;  // 行間隔 2 格
        const rowOffset = charWidth + charSpacing; // 上下排各錯開一個字寬

        // 計算總寬度
        const line1 = 'GAME';
        const line2 = 'OVER';
        const line1Cols = line1.length * (charWidth + charSpacing) - charSpacing;
        const line2Cols = line2.length * (charWidth + charSpacing) - charSpacing;
        const totalHeight = charHeight * 2 + rowSpacing;

        // 平行四邊形偏移量（右上左下：row 增加時 x 減少）
        const skewOffset = -gridSize * 0.25;

        // 計算起始位置（畫面中央）
        const centerX = this.characterX;
        const centerY = this.characterY;

        // 繪製 GAME（第一行，往左偏移半個字寬）
        const line1StartX = centerX - (line1Cols * gridSize) / 2 - (rowOffset * gridSize) / 2;
        const line1StartY = centerY - (totalHeight * gridSize) / 2;
        this.spawnDotMatrixLine(line1, line1StartX, line1StartY, gridSize, skewOffset, 0);

        // 繪製 OVER（第二行，往右偏移半個字寬）
        const line2StartX = centerX - (line2Cols * gridSize) / 2 + (rowOffset * gridSize) / 2;
        const line2StartY = centerY - (totalHeight * gridSize) / 2 + (charHeight + rowSpacing) * gridSize;
        this.spawnDotMatrixLine(line2, line2StartX, line2StartY, gridSize, skewOffset, charHeight + rowSpacing);
    }

    // 繪製一行點陣字（使用地板字系統）
    private spawnDotMatrixLine(text: string, startX: number, startY: number, gridSize: number, skewOffset: number, baseRow: number) {
        const charWidth = 7;
        const charHeight = 9;
        const charSpacing = 2;

        let currentX = startX;

        for (const letter of text) {
            const pattern = MainScene.DOT_MATRIX_FONT[letter];
            if (!pattern) continue;

            for (let row = 0; row < charHeight; row++) {
                for (let col = 0; col < pattern[row].length; col++) {
                    if (pattern[row][col] === 1) {
                        // 計算位置（含平行四邊形偏移：右上左下）
                        const totalRow = baseRow + row;
                        const x = currentX + col * gridSize + gridSize / 2 + totalRow * skewOffset;
                        const y = startY + row * gridSize + gridSize / 2;

                        // 檢查格子是否已被使用
                        const gridCol = Math.floor(x / gridSize);
                        const gridRow = Math.floor(y / gridSize);
                        const gridKey = `go_${gridCol},${gridRow}`;

                        if (!this.floorHexUsedPositions.has(gridKey)) {
                            this.floorHexUsedPositions.add(gridKey);

                            // 隨機選擇 hex 字元
                            const char = MainScene.HEX_CHARS[Math.floor(Math.random() * 16)];
                            const sprite = this.getFloorHexSprite(char);
                            sprite.setPosition(x, y);
                            sprite.setScale(gridSize / 80);
                            sprite.setAlpha(0);
                            sprite.setTint(0xff4444); // 紅色
                            this.floorHexContainer.add(sprite);
                            this.gameOverSprites.push(sprite);

                            // 加入 floorHexChars 讓它參與地板字系統（但不會被自動移除）
                            this.floorHexChars.push({
                                sprite,
                                gridKey,
                                spawnTime: this.time.now,
                                fadeInDuration: 300,
                                lifetime: 999999, // 永久存在
                                fullyVisible: false,
                                visibleStartTime: 0
                            });

                            // 延遲淡入（隨機錯開）
                            const delay = Math.random() * 500;
                            this.tweens.add({
                                targets: sprite,
                                alpha: 0.9,
                                duration: 300,
                                delay: delay,
                                ease: 'Power2',
                                onComplete: () => {
                                    // 標記為完全顯現
                                    const hex = this.floorHexChars.find(h => h.sprite === sprite);
                                    if (hex) {
                                        hex.fullyVisible = true;
                                        hex.visibleStartTime = this.time.now;
                                    }
                                }
                            });
                        }
                    }
                }
            }

            currentX += (charWidth + charSpacing) * gridSize;
        }
    }

    // 更新 GAME OVER 閃爍效果
    private updateGameOverFlicker() {
        if (!this.gameOverActive || this.gameOverSprites.length === 0) return;

        // 隨機閃爍效果
        for (const sprite of this.gameOverSprites) {
            if (!sprite.active) continue;

            // 隨機改變字元
            if (Math.random() < 0.02) { // 2% 機率換字
                const newChar = MainScene.HEX_CHARS[Math.floor(Math.random() * 16)];
                sprite.setTexture(`hex_${newChar}`);
            }

            // 隨機亮度抖動
            if (Math.random() < 0.05) {
                const flicker = 0.7 + Math.random() * 0.3;
                sprite.setAlpha(flicker);
            }

            // 紅白閃爍
            if (Math.random() < 0.01) {
                sprite.setTint(0xffffff);
                this.time.delayedCall(50 + Math.random() * 100, () => {
                    if (sprite.active) sprite.setTint(0xff4444);
                });
            }
        }
    }

    // 更新橫向掃光效果
    private updateScanLine() {
        const now = this.time.now;
        const screenWidth = this.gameBounds.width;
        const scanWidth = screenWidth * MainScene.SCAN_WIDTH;

        // 檢查是否該啟動新的掃光
        if (!this.scanLineActive && now - this.lastScanTime >= MainScene.SCAN_INTERVAL) {
            this.scanLineActive = true;
            this.scanLineX = this.characterX - screenWidth / 2 - scanWidth; // 從畫面左邊外開始
            this.lastScanTime = now;
        }

        if (this.scanLineActive) {
            // 移動掃光位置
            const delta = this.game.loop.delta / 1000; // 秒
            this.scanLineX += screenWidth * MainScene.SCAN_SPEED * delta;

            // 計算掃光範圍
            const scanLeft = this.scanLineX;
            const scanRight = this.scanLineX + scanWidth;
            const scanCenter = this.scanLineX + scanWidth / 2;

            // 對每個字元計算掃光亮度加成
            for (const hex of this.floorHexChars) {
                const spriteX = hex.sprite.x;

                if (spriteX >= scanLeft && spriteX <= scanRight) {
                    // 在掃光範圍內，計算亮度漸層
                    const distFromCenter = Math.abs(spriteX - scanCenter);
                    const normalizedDist = distFromCenter / (scanWidth / 2);
                    const intensity = 1 - normalizedDist; // 中心最亮

                    // 用 tint 變色（綠→白）
                    hex.sprite.setTint(this.lerpTint(intensity));
                } else {
                    // 不在掃光範圍，恢復正常綠色
                    hex.sprite.setTint(MainScene.HEX_TINT_NORMAL);
                }
            }

            // 檢查掃光是否結束（超出畫面右邊）
            if (this.scanLineX > this.characterX + screenWidth / 2 + scanWidth) {
                this.scanLineActive = false;
            }
        }

        // 更新圓形擴散掃光
        this.updateCircularScan();

        // 更新受傷紅色掃光
        this.updateDamageScan();

        // 更新護盾金色呼吸掃光
        this.updateShieldBreathScan();

        // 更新升級藍色呼吸掃光
        this.updateLevelUpBreathScan();

        // 更新 GAME OVER 紅色呼吸掃光
        this.updateGameOverBreathScan();
    }

    // 更新圓形擴散掃光效果（從角色位置向外擴散）
    private updateCircularScan() {
        const now = this.time.now;
        const screenHeight = this.gameBounds.height;
        const ringWidth = screenHeight * MainScene.CIRCULAR_SCAN_WIDTH;
        const maxRadius = screenHeight * MainScene.CIRCULAR_SCAN_MAX;

        // 檢查是否該啟動新的圓形掃光
        if (!this.circularScanActive && now - this.lastCircularScanTime >= MainScene.CIRCULAR_SCAN_INTERVAL) {
            this.circularScanActive = true;
            this.circularScanRadius = 0;
            this.lastCircularScanTime = now;
        }

        if (this.circularScanActive) {
            // 擴大掃光半徑
            const delta = this.game.loop.delta / 1000; // 秒
            this.circularScanRadius += screenHeight * MainScene.CIRCULAR_SCAN_SPEED * delta;

            // 計算掃光環範圍
            const innerRadius = Math.max(0, this.circularScanRadius - ringWidth / 2);
            const outerRadius = this.circularScanRadius + ringWidth / 2;

            // 對每個字元計算掃光亮度加成
            for (const hex of this.floorHexChars) {
                const dx = hex.sprite.x - this.characterX;
                const dy = hex.sprite.y - this.characterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist >= innerRadius && dist <= outerRadius) {
                    // 在掃光環內，計算亮度漸層（環中心最亮）
                    const distFromRingCenter = Math.abs(dist - this.circularScanRadius);
                    const normalizedDist = distFromRingCenter / (ringWidth / 2);
                    const intensity = 1 - normalizedDist;

                    // 用 tint 變色（綠→白）
                    hex.sprite.setTint(this.lerpTint(intensity));
                }
            }

            // 檢查掃光是否結束
            if (this.circularScanRadius > maxRadius) {
                this.circularScanActive = false;
            }
        }
    }

    // 啟動圓形半徑擴散
    private startRadiusWave() {
        const gridSize = this.gameBounds.height * MainScene.FLOOR_HEX_GRID_SIZE;
        const skewOffset = gridSize * 0.25;
        const unitSize = this.gameBounds.height * 0.1; // 1單位 = 畫面10%高
        const gridsPerUnit = unitSize / gridSize;      // 每單位有幾格

        // 計算可視區域的格子範圍
        const viewLeft = this.characterX - this.gameBounds.width / 2;
        const viewRight = this.characterX + this.gameBounds.width / 2;
        const viewTop = this.characterY - this.gameBounds.height / 2;
        const viewBottom = this.characterY + this.gameBounds.height / 2;

        const minRow = Math.floor(viewTop / gridSize);
        const maxRow = Math.ceil(viewBottom / gridSize);

        // 隨機選擇起點
        for (let i = 0; i < MainScene.RADIUS_WAVE_POINTS; i++) {
            let attempts = 0;
            while (attempts < 50) {
                const row = minRow + Math.floor(Math.random() * (maxRow - minRow));
                const rowOffset = row * skewOffset;
                const minCol = Math.floor((viewLeft - rowOffset) / gridSize);
                const maxCol = Math.ceil((viewRight - rowOffset) / gridSize);
                const col = minCol + Math.floor(Math.random() * (maxCol - minCol));

                // 隨機範圍 4-10 單位，轉換為格子數（加大1倍）
                const rangeUnits = 4 + Math.random() * 6; // 4~10 單位
                const maxRadius = Math.floor(rangeUnits * gridsPerUnit);

                // 隨機擴散速度 40-100ms 每環
                const expandSpeed = 40 + Math.random() * 60;

                // 預計算所有環內的格子（按歐幾里得距離分組）
                const rings: string[][] = [];
                for (let r = 0; r <= maxRadius; r++) {
                    rings[r] = [];
                }

                for (let dy = -maxRadius; dy <= maxRadius; dy++) {
                    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const ringIdx = Math.floor(dist);
                        if (ringIdx <= maxRadius) {
                            const nCol = col + dx;
                            const nRow = row + dy;
                            rings[ringIdx].push(`${nCol},${nRow}`);
                        }
                    }
                }

                this.radiusWaves.push({
                    centerCol: col,
                    centerRow: row,
                    rings,
                    currentRing: 0,
                    lastExpandTime: this.time.now,
                    expandSpeed
                });
                break;
            }
        }
    }

    // 更新圓形半徑擴散
    private updateRadiusWaves() {
        const now = this.time.now;
        const gridSize = this.gameBounds.height * MainScene.FLOOR_HEX_GRID_SIZE;
        const skewOffset = gridSize * 0.25;

        // 檢查是否該啟動新的擴散波
        if (now - this.lastRadiusWaveTime >= MainScene.RADIUS_WAVE_INTERVAL) {
            this.startRadiusWave();
            this.lastRadiusWaveTime = now;
        }

        // 計算可視區域邊界（含畫面外緩衝，避免移動時看到切割線）
        const viewLeft = this.characterX - this.gameBounds.width / 2;
        const viewRight = this.characterX + this.gameBounds.width / 2;
        const viewTop = this.characterY - this.gameBounds.height / 2;
        const viewBottom = this.characterY + this.gameBounds.height / 2;
        const buffer = this.gameBounds.height * 0.2; // 20% 畫面高度的緩衝區

        // 更新每個波
        for (let w = this.radiusWaves.length - 1; w >= 0; w--) {
            const wave = this.radiusWaves[w];

            // 檢查是否該擴散下一環（使用此波的隨機速度）
            if (now - wave.lastExpandTime < wave.expandSpeed) {
                continue;
            }
            wave.lastExpandTime = now;

            // 處理當前環的所有格子
            if (wave.currentRing < wave.rings.length) {
                const ring = wave.rings[wave.currentRing];

                for (const gridKey of ring) {
                    // 跳過已有字元的格子
                    if (this.floorHexUsedPositions.has(gridKey)) {
                        continue;
                    }

                    const [col, row] = gridKey.split(',').map(Number);
                    const centerX = col * gridSize + gridSize / 2 + row * skewOffset;
                    const centerY = row * gridSize + gridSize / 2;

                    // 檢查是否在可視區域內（含緩衝）
                    if (centerX < viewLeft - buffer || centerX > viewRight + buffer ||
                        centerY < viewTop - buffer || centerY > viewBottom + buffer) {
                        continue;
                    }

                    // 生成字元
                    const char = this.getRandomHexChar();
                    const sprite = this.getFloorHexSprite(char);
                    sprite.setPosition(centerX, centerY);
                    const targetSize = gridSize; // 無間隙
                    sprite.setScale(targetSize / 80);
                    sprite.setAlpha(0);
                    this.floorHexContainer.add(sprite);

                    this.floorHexChars.push({
                        sprite,
                        gridKey,
                        spawnTime: now,
                        fadeInDuration: 300 + Math.random() * 400,  // 淡入0.3-0.7秒（加快）
                        lifetime: 500 + Math.random() * 1000,       // 顯現後存活0.5-1.5秒（加快）
                        fullyVisible: false,
                        visibleStartTime: 0
                    });
                    this.floorHexUsedPositions.add(gridKey);
                }

                wave.currentRing++;
            }

            // 如果所有環都處理完了，移除這個波
            if (wave.currentRing >= wave.rings.length) {
                this.radiusWaves.splice(w, 1);
            }
        }
    }

    private createSkillBar() {
        // 技能框使用網格格子繪製
        // 每個技能框 8x8 格，邊線間隔 1 格，主被動群組間隔 2 格
        const cellSize = this.skillGridCellSize;
        const gap = MainScene.SKILL_GRID_GAP;
        const iconGridSize = 8; // 每個技能框 8x8 格
        const iconPixelSize = iconGridSize * (cellSize + gap) - gap;
        const iconGapCells = 1; // 技能框間隔 1 格
        const groupGapCells = 2; // 群組間隔 2 格

        const activeCount = MainScene.ACTIVE_SKILLS;
        const passiveCount = MainScene.PASSIVE_SKILLS;

        // 計算總寬度（格子數）- 包含進階技能欄位的空間
        const advancedSlotCells = iconGridSize + groupGapCells; // 進階技能 + 間隔
        const activeGroupCells = activeCount * iconGridSize + (activeCount - 1) * iconGapCells;
        const passiveGroupCells = passiveCount * iconGridSize + (passiveCount - 1) * iconGapCells;
        const totalCells = activeGroupCells + groupGapCells + passiveGroupCells;
        const totalWidth = totalCells * (cellSize + gap) - gap;

        // 起始位置（置中）
        const startX = this.gameBounds.x + (this.gameBounds.width - totalWidth) / 2;
        // Y 位置：在經驗條（底部 2 行）上方，離經驗條 1 格
        const expBarHeight = 2 * (cellSize + gap);
        const bottomMargin = cellSize + gap; // 1 格間距
        const y = this.gameBounds.y + this.gameBounds.height - expBarHeight - iconPixelSize - bottomMargin;

        // 建立進階技能欄位（預設隱藏，在主動技能左側）
        this.createAdvancedSkillSlot(startX, y, iconGridSize, iconPixelSize, advancedSlotCells, cellSize, gap);

        // 主動技能（4個）
        let currentX = startX;
        for (let i = 0; i < activeCount; i++) {
            const iconCenterX = currentX + iconPixelSize / 2;
            const iconCenterY = y + iconPixelSize / 2;
            const container = this.add.container(iconCenterX, iconCenterY);

            // 技能框背景（使用透明填充）
            const icon = this.add.rectangle(0, 0, iconPixelSize, iconPixelSize);
            icon.setStrokeStyle(0, 0xffffff, 0); // 不用邊線，用網格繪製
            icon.setFillStyle(0x000000, 0);
            container.add(icon);

            // 技能顏色指示（預設透明，由 updateSkillBarDisplay 設定）
            const colorBg = this.add.rectangle(0, 0, iconPixelSize - 4, iconPixelSize - 4, 0x333333, 0);
            container.add(colorBg);

            // 技能圖示 Sprite（預設隱藏，由 updateSkillBarDisplay 設定）
            this.skillIconSprites.push(null); // 先放 null，之後由 updateSkillBarDisplay 建立

            // 等級文字
            const fontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(iconPixelSize * 0.2));
            const levelText = this.add.text(0, iconPixelSize * 0.3, '', {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            });
            levelText.setResolution(2); // 提高解析度使文字更清晰
            levelText.setOrigin(0.5, 0.5);
            container.add(levelText);

            this.skillIcons.push(icon);
            this.skillIconContainers.push(container);
            this.skillLevelTexts.push(levelText);
            container.setDepth(1002); // 在網格之上
            this.uiContainer.add(container);

            // 繪製網格邊框
            this.drawSkillIconGrid(currentX, y, iconGridSize, i);

            currentX += iconPixelSize + iconGapCells * (cellSize + gap);
        }

        // 群組間隔
        currentX += (groupGapCells - iconGapCells) * (cellSize + gap);

        // 被動技能（3個）
        for (let i = 0; i < passiveCount; i++) {
            const iconCenterX = currentX + iconPixelSize / 2;
            const iconCenterY = y + iconPixelSize / 2;
            const container = this.add.container(iconCenterX, iconCenterY);

            // 技能框背景
            const icon = this.add.rectangle(0, 0, iconPixelSize, iconPixelSize);
            icon.setStrokeStyle(0, 0xffffff, 0);
            icon.setFillStyle(0x000000, 0);
            container.add(icon);

            // 技能顏色指示
            const colorBg = this.add.rectangle(0, 0, iconPixelSize - 4, iconPixelSize - 4, 0x333333, 0);
            container.add(colorBg);

            // 技能圖示 Sprite（預設隱藏，由 updateSkillBarDisplay 設定）
            this.skillIconSprites.push(null); // 先放 null，之後由 updateSkillBarDisplay 建立

            // 等級文字
            const fontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(iconPixelSize * 0.2));
            const levelText = this.add.text(0, iconPixelSize * 0.3, '', {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            });
            levelText.setResolution(2); // 提高解析度使文字更清晰
            levelText.setOrigin(0.5, 0.5);
            container.add(levelText);

            this.skillIcons.push(icon);
            this.skillIconContainers.push(container);
            this.skillLevelTexts.push(levelText);
            container.setDepth(1002); // 在網格之上
            this.uiContainer.add(container);

            // 繪製網格邊框
            this.drawSkillIconGrid(currentX, y, iconGridSize, activeCount + i);

            currentX += iconPixelSize + iconGapCells * (cellSize + gap);
        }

        // 建立技能資訊窗格
        this.createSkillInfoPanel();

        // 為技能圖示添加點擊事件
        this.setupSkillIconInteractions();
    }

    // 建立進階技能欄位（預設隱藏）
    private createAdvancedSkillSlot(
        activeStartX: number,
        y: number,
        iconGridSize: number,
        iconPixelSize: number,
        advancedSlotCells: number,
        cellSize: number,
        gap: number
    ) {
        // 進階技能欄位位於主動技能左側，間隔 2 格
        const slotX = activeStartX - advancedSlotCells * (cellSize + gap);
        const iconCenterX = slotX + iconPixelSize / 2;
        const iconCenterY = y + iconPixelSize / 2;

        // 建立容器
        this.advancedSkillContainer = this.add.container(iconCenterX, iconCenterY);
        this.advancedSkillContainer.setDepth(1002);
        this.advancedSkillContainer.setVisible(false); // 預設隱藏
        this.advancedSkillContainer.setAlpha(0);
        this.uiContainer.add(this.advancedSkillContainer);

        // 技能框背景（使用透明填充）
        const icon = this.add.rectangle(0, 0, iconPixelSize, iconPixelSize);
        icon.setStrokeStyle(0, 0xffffff, 0);
        icon.setFillStyle(0x000000, 0);
        this.advancedSkillContainer.add(icon);

        // 技能顏色指示背景
        const colorBg = this.add.rectangle(0, 0, iconPixelSize - 4, iconPixelSize - 4, 0x333333, 0);
        this.advancedSkillContainer.add(colorBg);

        // 等級文字
        const fontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(iconPixelSize * 0.2));
        this.advancedSkillLevelText = this.add.text(0, iconPixelSize * 0.3, '', {
            fontFamily: '"Noto Sans TC", sans-serif',
            fontSize: `${fontSize}px`,
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        });
        this.advancedSkillLevelText.setResolution(2);
        this.advancedSkillLevelText.setOrigin(0.5, 0.5);
        this.advancedSkillContainer.add(this.advancedSkillLevelText);

        // 建立網格邊框 Graphics
        this.advancedSkillGridGraphics = this.add.graphics();
        this.advancedSkillGridGraphics.setDepth(1001);
        this.advancedSkillGridGraphics.setVisible(false);
        this.uiContainer.add(this.advancedSkillGridGraphics);

        // 儲存位置資料
        this.advancedSkillGridData = { startX: slotX, startY: y, gridSize: iconGridSize };

        // 設定點擊事件（顯示技能資訊）
        icon.setInteractive({ useHandCursor: true });
        icon.on('pointerdown', () => {
            const equipped = this.skillManager.getEquippedAdvancedSkill();
            if (equipped) {
                this.showAdvancedSkillInfo(equipped);
            }
        });
    }

    // 顯示進階技能欄位（第一次選擇時呼叫）
    private showAdvancedSkillSlot() {
        if (this.advancedSkillSlotVisible) return;

        this.advancedSkillSlotVisible = true;
        this.advancedSkillContainer.setVisible(true);
        this.advancedSkillGridGraphics.setVisible(true);

        // 動畫：從左側滑入
        const targetX = this.advancedSkillContainer.x;
        this.advancedSkillContainer.x = targetX - 50;
        this.tweens.add({
            targets: this.advancedSkillContainer,
            x: targetX,
            alpha: 1,
            duration: 300,
            ease: 'Power2'
        });
    }

    // 更新進階技能欄位顯示
    private updateAdvancedSkillDisplay() {
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        if (!equipped) return;

        const def = equipped.definition;

        // 更新等級文字（無上限技能永遠顯示等級）
        if (def.maxLevel >= 0 && equipped.level >= def.maxLevel) {
            this.advancedSkillLevelText.setText('MAX');
            this.advancedSkillLevelText.setColor('#FFD700');
        } else {
            this.advancedSkillLevelText.setText(`Lv.${equipped.level}`);
            this.advancedSkillLevelText.setColor('#ffffff');
        }

        // 更新圖示（檢查是否為固定圖示，如 SA0, SB1）
        const isFixedIcon = /\d$/.test(def.iconPrefix);
        const iconKey = isFixedIcon
            ? `skill_icon_${def.iconPrefix}`
            : `skill_${def.iconPrefix}0${equipped.level}`;
        if (this.textures.exists(iconKey)) {
            if (this.advancedSkillIconSprite) {
                this.advancedSkillIconSprite.setTexture(iconKey);
            } else {
                const cellSize = this.skillGridCellSize;
                const gap = MainScene.SKILL_GRID_GAP;
                const iconPixelSize = 8 * (cellSize + gap) - gap;
                const spriteSize = iconPixelSize - 4;

                this.advancedSkillIconSprite = this.add.sprite(0, 0, iconKey);
                this.advancedSkillIconSprite.setDisplaySize(spriteSize, spriteSize);
                this.advancedSkillContainer.add(this.advancedSkillIconSprite);
                this.advancedSkillContainer.sendToBack(this.advancedSkillIconSprite);
            }
        }
    }

    // 繪製進階技能彩虹邊框（在 update 中呼叫）
    private redrawAdvancedSkillRainbowBorder(cdProgress: number, delta: number) {
        if (!this.advancedSkillSlotVisible || !this.advancedSkillGridGraphics) return;

        // 更新彩虹相位
        this.advancedSkillHue = (this.advancedSkillHue + delta * 0.1) % 360;

        const graphics = this.advancedSkillGridGraphics;
        const data = this.advancedSkillGridData;
        if (!data) return;

        graphics.clear();

        const cellSize = this.skillGridCellSize;
        const gap = MainScene.SKILL_GRID_GAP;
        const { startX, startY, gridSize } = data;

        // 計算邊框格子順序（從 12 點鐘方向順時針）
        const edgeCells: { row: number; col: number }[] = [];

        // 頂邊（從中間開始往右）
        const midCol = Math.floor(gridSize / 2);
        for (let col = midCol; col < gridSize; col++) {
            edgeCells.push({ row: 0, col });
        }
        // 右邊（上到下，跳過右上角）
        for (let row = 1; row < gridSize; row++) {
            edgeCells.push({ row, col: gridSize - 1 });
        }
        // 底邊（右到左，跳過右下角）
        for (let col = gridSize - 2; col >= 0; col--) {
            edgeCells.push({ row: gridSize - 1, col });
        }
        // 左邊（下到上，跳過左下角和左上角）
        for (let row = gridSize - 2; row >= 1; row--) {
            edgeCells.push({ row, col: 0 });
        }
        // 左上角
        edgeCells.push({ row: 0, col: 0 });
        // 頂邊左半部（col 1 到中間前）
        for (let col = 1; col < midCol; col++) {
            edgeCells.push({ row: 0, col });
        }

        const totalCells = edgeCells.length;
        const cdCellCount = Math.floor(totalCells * cdProgress);

        // 繪製彩虹邊框格子
        for (let i = 0; i < totalCells; i++) {
            const { row, col } = edgeCells[i];
            const x = startX + col * (cellSize + gap);
            const y = startY + row * (cellSize + gap);

            if (i < cdCellCount) {
                // CD 中：彩虹漸變色
                const hue = (this.advancedSkillHue + i * 12) % 360;
                const color = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.5).color;
                graphics.fillStyle(color, 0.8);
            } else {
                // CD 完成：半透明黑
                graphics.fillStyle(0x000000, 0.5);
            }
            graphics.fillRect(x, y, cellSize, cellSize);
        }
    }

    // 繪製技能框的網格邊框
    private drawSkillIconGrid(startX: number, startY: number, gridSize: number, skillIndex: number) {
        // 建立一個 Graphics 來繪製邊框
        const graphics = this.add.graphics();
        graphics.setDepth(1001);
        this.uiContainer.add(graphics);

        // 儲存位置資料供 CD 更新使用
        this.skillIconGridData[skillIndex] = { startX, startY, gridSize };

        // 初始繪製（灰黑色邊框）
        this.redrawSkillIconGrid(skillIndex, 0);

        // 儲存 graphics
        this.skillIconGridGraphics[skillIndex] = graphics;
    }

    // 重繪技能框邊框（支援 CD 進度顯示）
    // cdProgress: 0 = 無 CD，0~1 = CD 進行中
    private redrawSkillIconGrid(skillIndex: number, cdProgress: number) {
        const graphics = this.skillIconGridGraphics[skillIndex];
        const data = this.skillIconGridData[skillIndex];
        if (!graphics || !data) return;

        graphics.clear();

        const cellSize = this.skillGridCellSize;
        const gap = MainScene.SKILL_GRID_GAP;
        const { startX, startY, gridSize } = data;

        // 檢查是否擁有此技能
        const activeCount = MainScene.ACTIVE_SKILLS;
        const isActive = skillIndex < activeCount;
        const skills = isActive
            ? this.skillManager.getPlayerActiveSkills()
            : this.skillManager.getPlayerPassiveSkills();
        const idx = isActive ? skillIndex : skillIndex - activeCount;
        const skill = skills[idx];

        // 未取得技能：繪製整個填滿的網格
        if (!skill) {
            graphics.fillStyle(0x000000, 0.5);
            for (let row = 0; row < gridSize; row++) {
                for (let col = 0; col < gridSize; col++) {
                    const x = startX + col * (cellSize + gap);
                    const y = startY + row * (cellSize + gap);
                    graphics.fillRect(x, y, cellSize, cellSize);
                }
            }
            return;
        }

        // 已取得技能：只繪製邊框格子（空心）
        // 計算邊框格子順序（從 12 點鐘方向順時針）
        const edgeCells: { row: number; col: number }[] = [];

        // 頂邊（從中間開始往右）
        const midCol = Math.floor(gridSize / 2);
        for (let col = midCol; col < gridSize; col++) {
            edgeCells.push({ row: 0, col });
        }
        // 右邊（上到下，跳過右上角）
        for (let row = 1; row < gridSize; row++) {
            edgeCells.push({ row, col: gridSize - 1 });
        }
        // 底邊（右到左，跳過右下角）
        for (let col = gridSize - 2; col >= 0; col--) {
            edgeCells.push({ row: gridSize - 1, col });
        }
        // 左邊（下到上，跳過左下角和左上角）
        for (let row = gridSize - 2; row >= 1; row--) {
            edgeCells.push({ row, col: 0 });
        }
        // 左上角
        edgeCells.push({ row: 0, col: 0 });
        // 頂邊左半部（col 1 到中間前）
        for (let col = 1; col < midCol; col++) {
            edgeCells.push({ row: 0, col });
        }

        const totalCells = edgeCells.length;
        const cdCellCount = Math.floor(totalCells * cdProgress);

        // 繪製邊框格子
        for (let i = 0; i < totalCells; i++) {
            const { row, col } = edgeCells[i];
            const x = startX + col * (cellSize + gap);
            const y = startY + row * (cellSize + gap);

            if (i < cdCellCount) {
                // CD 進行中的格子：技能顏色（壓暗 40% 透明度）
                const skillColor = this.getSkillColorForIndex(skillIndex);
                graphics.fillStyle(skillColor, 0.4);
            } else {
                // 未到的格子：黑色 50% 透明度
                graphics.fillStyle(0x000000, 0.5);
            }
            graphics.fillRect(x, y, cellSize, cellSize);
        }
    }

    // 取得技能顏色
    private getSkillColorForIndex(skillIndex: number): number {
        const activeCount = MainScene.ACTIVE_SKILLS;
        const isActive = skillIndex < activeCount;
        const skills = isActive
            ? this.skillManager.getPlayerActiveSkills()
            : this.skillManager.getPlayerPassiveSkills();
        const idx = isActive ? skillIndex : skillIndex - activeCount;
        const skill = skills[idx];
        if (skill) {
            return skill.definition.color;
        }
        return 0x666666; // 預設灰色
    }

    // 更新技能 CD 進度顯示
    private updateSkillCooldownDisplay() {
        const now = this.time.now;
        const activeSkills = this.skillManager.getPlayerActiveSkills();

        for (let i = 0; i < activeSkills.length; i++) {
            const skill = activeSkills[i];
            if (!skill) {
                // 沒有技能，顯示灰黑色邊框
                this.redrawSkillIconGrid(i, 0);
                continue;
            }

            const def = skill.definition;
            let baseCooldown = def.cooldown || 1000;
            if (def.id === 'active_architect') {
                baseCooldown = baseCooldown - skill.level * 500;
            }
            const cooldown = this.skillManager.calculateFinalCooldown(baseCooldown);
            const lastActivation = this.skillCooldowns.get(def.id) || 0;
            const elapsed = now - lastActivation;

            if (elapsed >= cooldown) {
                // CD 完成，顯示全滿的技能顏色邊框
                this.redrawSkillIconGrid(i, 1);
            } else {
                // CD 進行中，計算進度
                const progress = elapsed / cooldown;
                this.redrawSkillIconGrid(i, progress);
            }
        }

        // 被動技能計時顯示
        const passiveSkills = this.skillManager.getPlayerPassiveSkills();
        const activeCount = MainScene.ACTIVE_SKILLS;
        for (let i = 0; i < passiveSkills.length; i++) {
            const skill = passiveSkills[i];
            if (!skill) {
                this.redrawSkillIconGrid(activeCount + i, 0);
                continue;
            }

            const def = skill.definition;
            let progress = 1; // 預設滿格

            switch (def.id) {
                case 'passive_titanium_liver': {
                    // 鈦金肝：HP 回復計時
                    const regenInterval = this.skillManager.getTitaniumLiverRegenInterval();
                    if (regenInterval > 0 && this.currentHp < this.maxHp) {
                        progress = this.hpRegenTimer / regenInterval;
                    }
                    break;
                }
                // 其他被動技能目前沒有計時，保持滿格
            }

            this.redrawSkillIconGrid(activeCount + i, progress);
        }
    }

    // 更新進階技能冷卻與彩虹邊框
    private updateAdvancedSkillCooldown(delta: number) {
        if (!this.advancedSkillSlotVisible) return;

        const equipped = this.skillManager.getEquippedAdvancedSkill();
        if (!equipped) return;

        const now = this.time.now;
        const cooldown = this.skillManager.calculateFinalCooldown(equipped.definition.cooldown);
        const elapsed = now - this.advancedSkillCooldownTime;

        // 計算進度（1 = 冷卻完成）
        const progress = Math.min(1, elapsed / cooldown);

        // 繪製彩虹邊框
        this.redrawAdvancedSkillRainbowBorder(progress, delta);

        // 持續更新輪鋸自轉角度（每幀更新，讓視覺效果流暢）
        if (equipped.definition.id === 'advanced_absolute_defense') {
            this.updateSawBladeSpinVisual(delta);
        }

        // 冷卻完成且不是暫停中或遊戲結束，發動進階技能
        if (progress >= 1 && !this.isPaused && !this.popupPaused && !this.isHurt && !this.gameOverActive) {
            this.activateAdvancedSkill(equipped);
            this.advancedSkillCooldownTime = now;
        }
    }

    // 發動進階技能
    private activateAdvancedSkill(equipped: PlayerAdvancedSkill) {
        const def = equipped.definition;

        // 根據進階技能類型執行不同效果
        switch (def.id) {
            case 'advanced_burning_celluloid':
                this.executeBurningCelluloid(equipped.level);
                break;
            case 'advanced_tech_artist':
                this.executeTechArtist(equipped.level);
                break;
            case 'advanced_absolute_defense':
                this.executeAbsoluteDefense(equipped.level);
                break;
            case 'advanced_perfect_pixel':
                this.executePerfectPixel(equipped.level);
                break;
            case 'advanced_vfx_burst':
                this.executeVfxBurst(equipped.level);
                break;
            case 'advanced_phantom_iteration':
                this.executePhantomIteration(equipped.level);
                break;
            case 'advanced_zero_trust':
                // 零信任防禦協定是被動觸發，不需要手動執行
                // 啟用矩陣即可
                this.activateZeroTrust(equipped.level);
                break;
            case 'advanced_soul_slash':
                this.executeSoulSlash(equipped.level);
                break;
        }
    }

    // 燃燒的賽璐珞：消耗 10 HP，7 單位距離 30° 扇形旋轉一圈攻擊
    private executeBurningCelluloid(skillLevel: number) {
        // 消耗 10 HP
        const hpCost = 10;
        if (this.currentHp > hpCost) {
            this.currentHp -= hpCost;
            this.drawHpBarFill();
            this.updateHpText();
            // 顯示 HP 消耗效果（角色閃紅）
            this.character.setTint(0xff6600);
            this.time.delayedCall(100, () => {
                this.character.clearTint();
            });
        } else {
            // HP 不足，不發動技能
            return;
        }

        // 傷害單位 = 角色等級 + 技能等級
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
        const range = this.gameBounds.height * 0.7; // 7 單位距離
        const sectorAngle = 30; // 30 度扇形
        const halfAngle = (sectorAngle / 2) * (Math.PI / 180);

        // 找最近的敵人，從該方向開始掃
        const monsters = this.monsterManager.getMonsters();
        let startAngle = 0;
        if (monsters.length > 0) {
            let nearestDist = Infinity;
            for (const monster of monsters) {
                const dx = monster.x - this.characterX;
                const dy = monster.y - this.characterY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    startAngle = Math.atan2(dy, dx);
                }
            }
            // 更新角色面向
            this.facingRight = Math.cos(startAngle) >= 0;
            this.updateCharacterSprite();
        }

        // 旋轉一圈 = 12 次 30° 扇形攻擊
        const rotationSteps = 12;
        const rotationDuration = 600; // 總旋轉時間 0.6 秒
        const stepDelay = rotationDuration / rotationSteps;

        // 記錄已經被擊中的怪物（每次發動只能被打一次）
        const hitMonsterSet = new Set<number>();

        for (let i = 0; i < rotationSteps; i++) {
            this.time.delayedCall(i * stepDelay, () => {
                // 計算當前扇形角度（從最近敵人方向開始旋轉）
                const currentAngle = startAngle + (i / rotationSteps) * Math.PI * 2;

                // 計算傷害（含暴擊）
                const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

                const monsters = this.monsterManager.getMonsters();
                const hitMonsters: number[] = [];
                const hitPositions: { x: number; y: number }[] = [];

                for (const monster of monsters) {
                    // 跳過已經被擊中的怪物
                    if (hitMonsterSet.has(monster.id)) continue;

                    const dx = monster.x - this.characterX;
                    const dy = monster.y - this.characterY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

                    if (dist - monsterRadius > range) continue;

                    const monsterAngle = Math.atan2(dy, dx);
                    let angleDiff = monsterAngle - currentAngle;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                    const angleOffset = dist > 0 ? Math.atan2(monsterRadius, dist) : Math.PI;
                    if (Math.abs(angleDiff) <= halfAngle + angleOffset) {
                        hitMonsters.push(monster.id);
                        hitPositions.push({ x: monster.x, y: monster.y });
                        hitMonsterSet.add(monster.id);
                    }
                }

                if (hitMonsters.length > 0) {
                    const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                    if (result.totalExp > 0) this.addExp(result.totalExp);

                    // 打擊火花（藍色，暴擊更亮，靈魂渲染系）
                    for (const pos of hitPositions) {
                        this.showHitSparkEffect(pos.x, pos.y, isCrit ? SparkColors.CELLULOID_CRIT : SparkColors.CELLULOID, currentAngle);
                    }

                    // 燃燒機率：10% + 每級 1%
                    const burnChance = 0.10 + skillLevel * 0.01;
                    const burnDamage = Math.floor(baseDamage * 0.2); // 原始傷害的 20%
                    const burnDuration = 5000; // 5 秒燃燒
                    const monstersToBurn: number[] = [];

                    for (const monsterId of hitMonsters) {
                        if (Math.random() < burnChance) {
                            monstersToBurn.push(monsterId);
                        }
                    }

                    if (monstersToBurn.length > 0) {
                        this.monsterManager.burnMonsters(monstersToBurn, burnDuration, burnDamage);
                    }
                }

                // 顯示斬擊特效（使用 SLASH 圖片）
                this.flashSlashEffect(this.characterX, this.characterY, range, currentAngle, 0xff6600);
            });
        }

        // 震動效果（旋轉結束時）
        this.time.delayedCall(rotationDuration, () => {
            this.shakeScreen(hitMonsterSet.size);
        });
    }

    // 斬擊特效（燃燒賽璐珞用，同 flashSkillEffectSector 邏輯只換圖）
    private flashSlashEffect(centerX: number, centerY: number, radius: number, angle: number, color: number) {
        const sprite = this.getSkillEffectSprite();
        if (!sprite) return;

        // 使用 SLASH 紋理
        sprite.setTexture(MainScene.TEXTURE_SLASH);

        // 設定位置和旋轉
        sprite.setPosition(centerX, centerY);
        sprite.setRotation(angle);

        // 設定縮放（紋理尺寸 256，縮放到實際半徑）
        const scale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        sprite.setScale(scale);

        // 設定顏色
        sprite.setTint(color);
        sprite.setAlpha(0);

        // 展開動畫（同 flashSkillEffectSector）
        this.tweens.add({
            targets: sprite,
            alpha: { from: 0, to: 0.75 },
            scale: { from: scale * 0.5, to: scale },
            duration: 150,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // 停留後淡出
                this.time.delayedCall(150, () => {
                    this.tweens.add({
                        targets: sprite,
                        alpha: 0,
                        scale: scale * 1.1,
                        duration: 200,
                        ease: 'Quad.easeIn',
                        onComplete: () => {
                            this.releaseSkillEffectSprite(sprite);
                        }
                    });
                });
            }
        });
    }

    // 更新燃燒中的怪物（每秒觸發 AOE 傷害）
    private updateBurningMonsters() {
        const now = this.time.now;
        const burningMonsters = this.monsterManager.getBurningMonsters();

        for (const monster of burningMonsters) {
            // 取得燃燒狀態效果
            const burnEffect = this.monsterManager.getStatusEffect(monster, 'burn');
            if (!burnEffect) continue;

            const tickInterval = burnEffect.tickInterval || 1000;
            const lastTick = burnEffect.lastTickTime || now;

            // 檢查是否該觸發這一秒的傷害
            if (now - lastTick >= tickInterval) {
                // 更新最後觸發時間
                burnEffect.lastTickTime = now;

                // AOE 傷害
                const aoeDamage = burnEffect.damage || 0;
                if (aoeDamage <= 0) continue;

                const aoeRadius = this.gameBounds.height * (burnEffect.aoeRadius || 0.1);

                // 找出範圍內的所有怪物
                const monsters = this.monsterManager.getMonsters();
                const hitMonsters: number[] = [];

                for (const m of monsters) {
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const monsterRadius = this.gameBounds.height * m.definition.size * 0.5;

                    if (dist <= aoeRadius + monsterRadius) {
                        hitMonsters.push(m.id);
                    }
                }

                // 造成傷害
                if (hitMonsters.length > 0) {
                    const result = this.monsterManager.damageMonsters(hitMonsters, aoeDamage);
                    if (result.totalExp > 0) this.addExp(result.totalExp);
                }

                // 顯示圓形爆炸效果（橘紅色）
                this.showBurnExplosionEffect(monster.x, monster.y, aoeRadius);
            }
        }

        // 清理過期的狀態效果
        this.monsterManager.cleanupExpiredEffects();
    }

    // 燃燒 AOE 爆炸效果（簡單圓形）
    private showBurnExplosionEffect(worldX: number, worldY: number, radius: number) {
        const screen = this.worldToScreen(worldX, worldY);

        // 圓形爆炸圖（橘色半透明圓）
        const explosion = this.add.circle(screen.x, screen.y, radius, 0xff6600, 0.3);
        explosion.setDepth(60);
        this.skillGridContainer.add(explosion);

        // 記錄世界座標
        const startWorldX = worldX;
        const startWorldY = worldY;

        // 淡出動畫
        this.tweens.add({
            targets: explosion,
            alpha: 0,
            scale: 1.3,
            duration: 250,
            ease: 'Cubic.easeOut',
            onUpdate: () => {
                const newScreen = this.worldToScreen(startWorldX, startWorldY);
                explosion.setPosition(newScreen.x, newScreen.y);
            },
            onComplete: () => {
                explosion.destroy();
            }
        });
    }

    // [已移除] 舊的手繪旋轉扇形特效，改用 flashSkillEffectSector
    private _showRotatingSectorEffect_deprecated(angle: number, radius: number, halfAngle: number, color: number) {
        const graphics = this.add.graphics();
        this.skillGridContainer.add(graphics);
        graphics.setDepth(55);

        const duration = 150;
        const startTime = this.time.now;

        // 記錄世界座標
        const worldX = this.characterX;
        const worldY = this.characterY;

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const alpha = 0.8 * (1 - progress);

            // 每幀重新計算螢幕座標
            const screen = this.worldToScreen(worldX, worldY);

            graphics.clear();

            // 填充扇形
            graphics.fillStyle(color, alpha * 0.5);
            graphics.beginPath();
            graphics.moveTo(screen.x, screen.y);
            graphics.arc(screen.x, screen.y, radius, angle - halfAngle, angle + halfAngle, false);
            graphics.lineTo(screen.x, screen.y);
            graphics.closePath();
            graphics.fillPath();

            // 扇形邊線
            graphics.lineStyle(2, 0xffffff, alpha);
            graphics.beginPath();
            graphics.moveTo(screen.x, screen.y);
            graphics.lineTo(
                screen.x + Math.cos(angle - halfAngle) * radius,
                screen.y + Math.sin(angle - halfAngle) * radius
            );
            graphics.strokePath();
            graphics.beginPath();
            graphics.moveTo(screen.x, screen.y);
            graphics.lineTo(
                screen.x + Math.cos(angle + halfAngle) * radius,
                screen.y + Math.sin(angle + halfAngle) * radius
            );
            graphics.strokePath();

            if (progress >= 1) {
                graphics.destroy();
            }
        };

        this.time.addEvent({ callback: updateEffect, loop: true, delay: 16 });
    }

    // 技術美術大神：在角色周圍 5 單位隨機地點射下光線，3 單位爆炸範圍，命中敵人癱瘓 0.5 秒
    private executeTechArtist(skillLevel: number) {
        // 傷害單位 = 角色等級 + 技能等級
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 範圍參數（世界單位）
        const unitSize = this.gameBounds.height / 10;
        const spawnRadiusUnits = 5; // 5 單位距離
        const explosionRadiusUnits = 3; // 3 單位爆炸範圍
        const stunDuration = 1000; // 1 秒癱瘓

        // 隨機選擇落點（角色周圍 5 單位內）
        const randomAngle = Math.random() * Math.PI * 2;
        const randomDist = Math.random() * spawnRadiusUnits * unitSize;
        const targetX = this.characterX + Math.cos(randomAngle) * randomDist;
        const targetY = this.characterY + Math.sin(randomAngle) * randomDist;

        // 計算光束角度（用於爆炸線條方向）- 反彈效果：與攻擊方向相反
        const beamOffsetX = (Math.random() - 0.5) * 2 * unitSize;
        const targetScreen = this.worldToScreen(targetX, targetY);
        // 光束從上方落下，噴發往上（反彈）：基準 -π/2 + 偏移修正
        const beamAngle = -Math.PI / 2 - Math.atan2(beamOffsetX, targetScreen.y + 50);

        // 顯示光線落下特效（藍紫色）
        const techArtistColor = SparkColors.TECH_ARTIST; // 藍紫色
        const explosionRadiusPx = explosionRadiusUnits * unitSize; // 視覺用像素
        this.showLightBeamEffect(targetX, targetY, explosionRadiusPx, techArtistColor, beamOffsetX);

        // 延遲 200ms 後造成傷害（光線落地）
        this.time.delayedCall(200, () => {
            // 計算傷害（含暴擊）
            const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

            const monsters = this.monsterManager.getMonsters();
            const hitMonsters: number[] = [];
            const hitPositions: { x: number; y: number }[] = [];

            for (const monster of monsters) {
                const dx = monster.x - targetX;
                const dy = monster.y - targetY;
                const distPixels = Math.sqrt(dx * dx + dy * dy);
                // 轉換成世界單位
                const distUnits = distPixels / unitSize;
                const monsterRadiusUnits = monster.definition.size * 0.5;

                // 在爆炸範圍內
                if (distUnits - monsterRadiusUnits <= explosionRadiusUnits) {
                    hitMonsters.push(monster.id);
                    hitPositions.push({ x: monster.x, y: monster.y });
                }
            }

            if (hitMonsters.length > 0) {
                // 先癱瘓效果（暈眩/停止活動），再造成傷害
                // 這樣存活的怪物會保持暈眩狀態
                this.monsterManager.stunMonsters(hitMonsters, stunDuration);

                // 造成傷害
                const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                if (result.totalExp > 0) this.addExp(result.totalExp);
    
                // 被炸到的怪物噴出爆炸火花（紫色，爆擊更亮）
                for (const pos of hitPositions) {
                    const screenPos = this.worldToScreen(pos.x, pos.y);
                    this.showExplosionSparkEffect(screenPos.x, screenPos.y, isCrit ? SparkColors.TECH_ARTIST_CRIT : SparkColors.TECH_ARTIST, 1.0);
                }

                // 震動效果
                this.shakeScreen(hitMonsters.length);
            }

            // 顯示爆炸特效（藍紫色），含線條噴發
            this.showExplosionEffect(targetX, targetY, explosionRadiusPx, techArtistColor, beamAngle, isCrit);
        });
    }

    // 顯示光線落下特效（使用 line 圖片瞬間射下，隨機角度）
    private showLightBeamEffect(worldX: number, worldY: number, radius: number, color: number, beamOffsetX?: number) {
        const targetScreen = this.worldToScreen(worldX, worldY);
        const unitSize = this.gameBounds.height / 10;

        // 使用傳入的偏移或隨機生成（正上方螢幕邊緣 ±1 單位）
        const offsetX = beamOffsetX !== undefined ? beamOffsetX : (Math.random() - 0.5) * 2 * unitSize;

        // 光束從畫面頂端外射到打擊點
        const startX = targetScreen.x + offsetX;
        const startY = -200; // 從畫面外更高處開始
        const endX = targetScreen.x;
        const endY = targetScreen.y;

        // 計算長度和角度
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const beamAngle = Math.atan2(dy, dx);

        // 建立光束 sprite
        const beamSprite = this.add.sprite((startX + endX) / 2, (startY + endY) / 2, MainScene.TEXTURE_LINE);
        this.skillGridContainer.add(beamSprite);
        beamSprite.setDepth(55);
        beamSprite.setTint(color);
        beamSprite.setRotation(beamAngle); // 對準目標角度

        // 設定縮放（更粗的線條）
        const beamWidth = 160; // 更粗的線條
        const scaleX = length / MainScene.EFFECT_TEXTURE_SIZE;
        const scaleY = beamWidth / MainScene.EFFECT_LINE_HEIGHT;

        // 瞬間出現，然後淡出
        beamSprite.setScale(scaleX, scaleY * 0.3);
        beamSprite.setAlpha(1);

        // 快速展開 + 淡出動畫
        this.tweens.add({
            targets: beamSprite,
            scaleY: { from: scaleY * 0.3, to: scaleY },
            alpha: { from: 1, to: 0.9 },
            duration: 50,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // 停留後淡出
                this.tweens.add({
                    targets: beamSprite,
                    alpha: 0,
                    scaleY: scaleY * 0.2,
                    duration: 300,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        beamSprite.destroy();
                    }
                });
            }
        });

        // 落點光圈效果
        const circleGraphics = this.add.graphics();
        this.skillGridContainer.add(circleGraphics);
        circleGraphics.setDepth(54);

        const circleStartTime = this.time.now;
        const circleDuration = 400;

        const updateCircle = () => {
            const elapsed = this.time.now - circleStartTime;
            const progress = elapsed / circleDuration;
            const screen = this.worldToScreen(worldX, worldY);

            circleGraphics.clear();

            if (progress < 1) {
                const alpha = 0.5 * (1 - progress);
                circleGraphics.lineStyle(2, color, alpha);
                circleGraphics.strokeCircle(screen.x, screen.y, radius * Math.min(progress * 2, 1));
            } else {
                circleGraphics.destroy();
            }
        };

        this.time.addEvent({ callback: updateCircle, loop: true, delay: 16 });
    }

    // 顯示爆炸特效（技術美術大神用）- 使用 sector_360 和 circle 紋理
    private showExplosionEffect(worldX: number, worldY: number, radius: number, color: number, beamAngle?: number, isCrit?: boolean) {
        const screen = this.worldToScreen(worldX, worldY);
        const duration = 300; // 爆炸持續時間
        const unitSize = this.gameBounds.height / 10;

        // 外圈：circle 紋理高速旋轉
        const circleSprite = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(circleSprite);
        circleSprite.setDepth(55);
        circleSprite.setTint(color);
        const circleScale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        circleSprite.setScale(circleScale);
        circleSprite.setAlpha(0.8);

        // 中心白點：sector_360 紋理
        const centerSprite = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_SECTOR_360);
        this.skillGridContainer.add(centerSprite);
        centerSprite.setDepth(56);
        centerSprite.setTint(0xffffff);
        const centerScale = (radius * 0.4) / MainScene.EFFECT_TEXTURE_SIZE;
        centerSprite.setScale(centerScale);
        centerSprite.setAlpha(1);

        // 線條噴發：使用標準化打擊火花（紫色，爆擊更亮）
        if (beamAngle !== undefined) {
            // beamAngle 已經是反彈方向，需要轉換回攻擊方向給 showHitSparkEffect
            const attackDir = beamAngle + Math.PI;
            this.showHitSparkEffect(worldX, worldY, isCrit ? SparkColors.TECH_ARTIST_CRIT : SparkColors.TECH_ARTIST, attackDir);
        }

        // 高速旋轉動畫（外圈）
        this.tweens.add({
            targets: circleSprite,
            rotation: Math.PI * 4, // 轉 2 圈
            alpha: 0,
            scale: circleScale * 1.5,
            duration: duration,
            ease: 'Power2',
            onUpdate: () => {
                // 更新位置（隨鏡頭移動）
                const currentScreen = this.worldToScreen(worldX, worldY);
                circleSprite.setPosition(currentScreen.x, currentScreen.y);
                centerSprite.setPosition(currentScreen.x, currentScreen.y);
            },
            onComplete: () => {
                circleSprite.destroy();
            }
        });

        // 中心白點淡出（稍慢）
        this.tweens.add({
            targets: centerSprite,
            alpha: 0,
            scale: centerScale * 0.5,
            duration: duration * 0.8,
            ease: 'Power2',
            onComplete: () => {
                centerSprite.destroy();
            }
        });
    }

    // 絕對邏輯防禦：有護盾時產生繞角色旋轉的輪鋸（最多6個，按護盾比例）
    private executeAbsoluteDefense(skillLevel: number) {
        // 只在有護盾時才發動
        if (this.currentShield <= 0) {
            // 隱藏輪鋸（雙層）
            for (const blade of this.sawBladeSprites) {
                blade.outer.setVisible(false);
                blade.inner.setVisible(false);
            }
            return;
        }

        // 傷害單位 = 角色等級 + 技能等級
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 範圍參數（世界單位）
        const unitSize = this.gameBounds.height / 10;
        const orbitRadiusUnits = 2; // 2 單位距離
        const bladeRadiusUnits = 0.5; // 0.5 單位範圍
        const orbitRadius = orbitRadiusUnits * unitSize; // 像素（位置計算用）
        const bladeRadius = bladeRadiusUnits * unitSize; // 像素（視覺用）
        this.sawBladeRadius = bladeRadius; // 儲存輪鋸半徑

        // 輪鋸數量：基本 3 個，每 5 技能等級 +1，最多 8 個
        const maxBladeCount = 8;
        const bladeCount = Math.min(maxBladeCount, 3 + Math.floor(skillLevel / 5));

        // 固定轉速：2 秒一圈
        const rotationTime = 2000;
        const angularSpeed = (Math.PI * 2) / rotationTime; // 弧度/毫秒

        // 更新輪鋸公轉角度（每次發動都更新一點）
        const deltaAngle = angularSpeed * 100; // cooldown 是 100ms
        this.sawBladeAngle += deltaAngle;
        if (this.sawBladeAngle > Math.PI * 2) {
            this.sawBladeAngle -= Math.PI * 2;
        }

        // 計算護盾相關加成
        const shieldPercent = this.maxShield > 0 ? this.currentShield / this.maxShield : 0;
        const lostShieldPercent = 1 - shieldPercent;
        // 爆擊率 = 盾值%（滿盾 = 100% 爆擊）
        const critChance = shieldPercent;
        // 傷害加成 = 損失盾值% × 10（例：損失 10% 盾 = 100% 傷害加成）
        const damageMultiplier = 1 + lostShieldPercent * 10;

        // 計算最終傷害
        const isCrit = Math.random() < critChance;
        let finalDamage = Math.floor(baseDamage * damageMultiplier);
        if (isCrit) {
            finalDamage = Math.floor(finalDamage * 1.5); // 暴擊 1.5 倍
        }

        // 檢測輪鋸範圍內的怪物
        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];
        const hitPositions: { x: number; y: number }[] = [];
        const now = this.time.now;
        const hitCooldown = 500; // 每個怪物 0.5 秒只能被擊中一次

        // 輪鋸等距分布
        const bladePositions: { x: number; y: number }[] = [];
        for (let i = 0; i < bladeCount; i++) {
            const angle = this.sawBladeAngle + (i / bladeCount) * Math.PI * 2;
            const bladeX = this.characterX + Math.cos(angle) * orbitRadius;
            const bladeY = this.characterY + Math.sin(angle) * orbitRadius;
            bladePositions.push({ x: bladeX, y: bladeY });
        }
        // 儲存當前輪鋸位置（用於護盾填充時飛出）
        this.currentSawBladePositions = bladePositions;

        for (const monster of monsters) {
            // 檢查每個輪鋸
            for (const bladePos of bladePositions) {
                const dx = monster.x - bladePos.x;
                const dy = monster.y - bladePos.y;
                const distPixels = Math.sqrt(dx * dx + dy * dy);
                // 轉換成世界單位
                const distUnits = distPixels / unitSize;
                const monsterRadiusUnits = monster.definition.size * 0.5;

                // 在輪鋸範圍內
                if (distUnits - monsterRadiusUnits <= bladeRadiusUnits) {
                    // 檢查擊中冷卻
                    const lastHit = this.sawBladeLastHitTime.get(monster.id) || 0;
                    if (now - lastHit >= hitCooldown) {
                        hitMonsters.push(monster.id);
                        hitPositions.push({ x: monster.x, y: monster.y });
                        this.sawBladeLastHitTime.set(monster.id, now);
                        break; // 同一隻怪物只被一個輪鋸擊中一次
                    }
                }
            }
        }

        if (hitMonsters.length > 0) {
            // 先擊退（避免怪物死亡後找不到）
            const knockbackDistance = this.gameBounds.height * 0.1; // 1 單位
            this.monsterManager.knockbackMonsters(hitMonsters, this.characterX, this.characterY, knockbackDistance);

            // 再造成傷害
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.addExp(result.totalExp);

            // 每次命中消耗護盾值（1%，升滿 8 個後每技能級 -0.1%，可降至負數變回血）
            let costRate = 0.01;
            if (bladeCount >= maxBladeCount) {
                const levelsAbove25 = skillLevel - 25;
                costRate = 0.01 - levelsAbove25 * 0.001; // 可以變負數
            }
            const shieldChangePerHit = Math.ceil(this.maxShield * Math.abs(costRate));
            const totalChange = shieldChangePerHit * hitMonsters.length;
            if (costRate >= 0) {
                // 消耗護盾
                this.currentShield = Math.max(0, this.currentShield - totalChange);
            } else {
                // 補充護盾
                this.currentShield = Math.min(this.maxShield, this.currentShield + totalChange);
            }
            this.drawShieldBarFill();

            // 輪鋸火花效果（金色，爆擊更亮）
            for (const pos of hitPositions) {
                this.showHitSparkEffect(pos.x, pos.y, isCrit ? SparkColors.SAWBLADE_CRIT : SparkColors.SAWBLADE);
            }

        }

        // 繪製 3 個輪鋸視覺效果
        this.drawSawBlades(bladePositions, bladeRadius);
    }

    // 繪製多個輪鋸視覺效果（使用護盾圖片，雙層逆轉設計）
    private drawSawBlades(bladePositions: { x: number; y: number }[], radius: number) {
        // 調整 sprite 數量（每個輪鋸需要兩層）
        while (this.sawBladeSprites.length < bladePositions.length) {
            // 外層
            const outer = this.add.sprite(0, 0, MainScene.TEXTURE_SHIELD);
            this.skillGridContainer.add(outer);
            outer.setDepth(56);
            outer.setTint(0xffdd00); // 金色
            outer.setAlpha(0.7);

            // 內層（1/2 大小，逆轉）- 使用 CIRCLE
            const inner = this.add.sprite(0, 0, MainScene.TEXTURE_CIRCLE);
            this.skillGridContainer.add(inner);
            inner.setDepth(57);
            inner.setTint(0xffee66); // 較亮金色
            inner.setAlpha(0.8);

            this.sawBladeSprites.push({ outer, inner });
        }

        // 隱藏多餘的 sprite
        for (let i = bladePositions.length; i < this.sawBladeSprites.length; i++) {
            this.sawBladeSprites[i].outer.setVisible(false);
            this.sawBladeSprites[i].inner.setVisible(false);
        }

        // 更新每個輪鋸
        for (let i = 0; i < bladePositions.length; i++) {
            const bladePos = bladePositions[i];
            const { outer, inner } = this.sawBladeSprites[i];

            // 轉換為螢幕座標
            const screen = this.worldToScreen(bladePos.x, bladePos.y);

            // 外層
            outer.setPosition(screen.x, screen.y);
            outer.setVisible(true);
            const outerScale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
            outer.setScale(outerScale);
            outer.setRotation(this.sawBladeSpinAngle);

            // 內層（1/2 大小，逆轉）
            inner.setPosition(screen.x, screen.y);
            inner.setVisible(true);
            inner.setScale(outerScale * 0.5);
            inner.setRotation(-this.sawBladeSpinAngle * 1.5); // 反方向且稍快
        }
    }

    // 輪鋸向外飛出（護盾重新填充時觸發，朝最近敵人飛去）
    private launchSawBladesOutward() {
        const bladeCount = this.currentSawBladePositions.length;
        if (bladeCount === 0) return;

        const radius = this.sawBladeRadius || this.gameBounds.height * 0.05;

        // 取得進階技能等級計算傷害
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const skillLevel = equipped ? equipped.level : 1;
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 取得所有怪物並按距離排序
        const monsters = this.monsterManager.getMonsters();
        const sortedMonsters = [...monsters].sort((a, b) => {
            const distA = Math.sqrt((a.x - this.characterX) ** 2 + (a.y - this.characterY) ** 2);
            const distB = Math.sqrt((b.x - this.characterX) ** 2 + (b.y - this.characterY) ** 2);
            return distA - distB;
        });

        // 每個輪鋸朝最近的敵人飛去（輪流分配）
        for (let i = 0; i < bladeCount; i++) {
            const bladePos = this.currentSawBladePositions[i];
            let targetAngle: number;

            if (sortedMonsters.length > 0) {
                // 輪流分配目標（避免全部射同一隻）
                const targetMonster = sortedMonsters[i % sortedMonsters.length];
                targetAngle = Math.atan2(targetMonster.y - bladePos.y, targetMonster.x - bladePos.x);
            } else {
                // 沒有敵人時向外飛
                targetAngle = Math.atan2(bladePos.y - this.characterY, bladePos.x - this.characterX);
            }

            this.launchSingleSawBladeToTarget(bladePos.x, bladePos.y, radius, baseDamage, targetAngle);
        }

        // 清空當前輪鋸位置
        this.currentSawBladePositions = [];
    }

    // 發射單個飛出的輪鋸（螺旋狀：一邊繞角色旋轉一邊向外飛，雙層八角設計）
    private launchSingleSawBlade(radius: number, baseDamage: number, startOrbitAngle: number) {
        // 建立雙層 sprite
        const outer = this.add.sprite(0, 0, MainScene.TEXTURE_SHIELD);
        this.skillGridContainer.add(outer);
        outer.setDepth(100);
        outer.setTint(0xffdd00);
        outer.setAlpha(0.7);

        // 內層使用 CIRCLE
        const inner = this.add.sprite(0, 0, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(inner);
        inner.setDepth(101);
        inner.setTint(0xffee66);
        inner.setAlpha(0.8);

        // 起始軌道半徑（從角色到輪鋸的距離）
        const startOrbitRadius = this.gameBounds.height * 0.2; // 2 單位
        const endOrbitRadius = this.gameBounds.height * 1.0; // 飛到 10 單位外

        // 飛行參數
        const flyDuration = 1600; // 1600ms（速度減半）
        const rotations = 1.5; // 飛出時繞 1.5 圈（繞轉速度也減半）

        // 狀態
        const state = {
            orbitAngle: startOrbitAngle, // 公轉角度
            orbitRadius: startOrbitRadius, // 當前軌道半徑
            spinAngle: this.sawBladeSpinAngle, // 自轉角度
            progress: 0
        };

        const outerScale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;

        // 更新 sprite 位置函數
        const updateBlade = () => {
            // 根據軌道半徑和角度計算世界座標
            const worldX = this.characterX + Math.cos(state.orbitAngle) * state.orbitRadius;
            const worldY = this.characterY + Math.sin(state.orbitAngle) * state.orbitRadius;
            const screen = this.worldToScreen(worldX, worldY);

            // 外層
            outer.setPosition(screen.x, screen.y);
            outer.setScale(outerScale);
            outer.setRotation(state.spinAngle);

            // 內層（1/2 大小，逆轉且稍快）
            inner.setPosition(screen.x, screen.y);
            inner.setScale(outerScale * 0.5);
            inner.setRotation(-state.spinAngle * 1.5);

            return { worldX, worldY };
        };

        // 擊中紀錄（避免同一怪物被多次傷害）
        const hitMonsters = new Set<number>();

        // 飛行動畫
        this.tweens.add({
            targets: state,
            progress: 1,
            duration: flyDuration,
            ease: 'Quad.easeIn', // 加速飛出
            onUpdate: () => {
                // 更新軌道半徑（向外擴展）
                state.orbitRadius = startOrbitRadius + (endOrbitRadius - startOrbitRadius) * state.progress;

                // 更新公轉角度（持續繞圈）
                state.orbitAngle = startOrbitAngle + rotations * Math.PI * 2 * state.progress;

                // 高速自轉
                state.spinAngle += 0.3;
                if (state.spinAngle > Math.PI * 2) state.spinAngle -= Math.PI * 2;

                // 更新並取得當前位置
                const { worldX, worldY } = updateBlade();

                // 碰撞檢測
                const monsters = this.monsterManager.getMonsters();
                for (const monster of monsters) {
                    if (hitMonsters.has(monster.id)) continue;

                    const mdx = monster.x - worldX;
                    const mdy = monster.y - worldY;
                    const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
                    const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

                    if (mDist - monsterRadius <= radius) {
                        hitMonsters.add(monster.id);
                        // 造成傷害
                        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
                        const result = this.monsterManager.damageMonsters([monster.id], finalDamage);
                        if (result.totalExp > 0) this.addExp(result.totalExp);
            
                        // 擊退（1 單位）
                        const sawKnockback = this.gameBounds.height * 0.1;
                        this.monsterManager.knockbackMonsters([monster.id], this.characterX, this.characterY, sawKnockback);

                        // 輪鋸火花效果（金色，暴擊更亮）
                        this.showHitSparkEffect(monster.x, monster.y, isCrit ? SparkColors.SAWBLADE_CRIT : SparkColors.SAWBLADE);

                        // 命中特效
                    }
                }
            },
            onComplete: () => {
                outer.destroy();
                inner.destroy();
            }
        });

        updateBlade();
    }

    // 發射輪鋸朝目標方向直線飛行（擊中後隨機偏轉 ±30° 繼續飛行）
    private launchSingleSawBladeToTarget(startX: number, startY: number, radius: number, baseDamage: number, angle: number) {
        // 建立雙層 sprite
        const outer = this.add.sprite(0, 0, MainScene.TEXTURE_SHIELD);
        this.skillGridContainer.add(outer);
        outer.setDepth(100);
        outer.setTint(0xffdd00);
        outer.setAlpha(0.7);

        const inner = this.add.sprite(0, 0, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(inner);
        inner.setDepth(101);
        inner.setTint(0xffee66);
        inner.setAlpha(0.8);

        const outerScale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        const unitSize = this.gameBounds.height / 10;

        // 飛行狀態（世界座標）
        const state = {
            x: startX,
            y: startY,
            angle: angle,
            spinAngle: this.sawBladeSpinAngle
        };

        // 飛行速度（每秒 15 單位）
        const speed = unitSize * 15;

        // 擊中冷卻（避免同一怪物連續被傷害）
        const hitCooldowns = new Map<number, number>();
        const hitCooldownTime = 200;

        // 更新位置
        const updateBlade = () => {
            const screen = this.worldToScreen(state.x, state.y);
            outer.setPosition(screen.x, screen.y);
            outer.setScale(outerScale);
            outer.setRotation(state.spinAngle);
            inner.setPosition(screen.x, screen.y);
            inner.setScale(outerScale * 0.5);
            inner.setRotation(-state.spinAngle * 1.5);
        };

        // 檢查是否在世界範圍內（用角色位置為中心判斷）
        const isInRange = () => {
            const dx = state.x - this.characterX;
            const dy = state.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist < unitSize * 15; // 15 單位範圍內
        };

        // 每幀更新
        const updateEvent = this.time.addEvent({
            delay: 16,
            loop: true,
            callback: () => {
                const now = this.time.now;
                const deltaTime = 16 / 1000;

                // 移動
                state.x += Math.cos(state.angle) * speed * deltaTime;
                state.y += Math.sin(state.angle) * speed * deltaTime;

                // 自轉
                state.spinAngle += 0.3;
                if (state.spinAngle > Math.PI * 2) state.spinAngle -= Math.PI * 2;

                // 清除過期冷卻
                for (const [id, time] of hitCooldowns) {
                    if (now - time > hitCooldownTime) hitCooldowns.delete(id);
                }

                // 碰撞檢測
                const monsters = this.monsterManager.getMonsters();
                for (const monster of monsters) {
                    if (hitCooldowns.has(monster.id)) continue;

                    const dx = monster.x - state.x;
                    const dy = monster.y - state.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const monsterRadius = unitSize * monster.definition.size * 0.5;

                    if (dist - monsterRadius <= radius) {
                        hitCooldowns.set(monster.id, now);

                        // 造成傷害
                        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
                        const result = this.monsterManager.damageMonsters([monster.id], finalDamage);
                        if (result.totalExp > 0) this.addExp(result.totalExp);

                        // 擊退
                        const sawKnockback = unitSize;
                        this.monsterManager.knockbackMonsters([monster.id], state.x, state.y, sawKnockback);

                        // 火花特效（爆擊更亮）
                        this.showHitSparkEffect(monster.x, monster.y, isCrit ? SparkColors.SAWBLADE_CRIT : SparkColors.SAWBLADE);

                        // 搜尋前進方向 ±45 度（90度扇形）內最近的敵人
                        let nearestInCone: { id: number; x: number; y: number; dist: number } | null = null;
                        for (const m of monsters) {
                            if (hitCooldowns.has(m.id)) continue;
                            const mdx = m.x - state.x;
                            const mdy = m.y - state.y;
                            const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
                            if (mDist < unitSize * 0.5) continue; // 太近的跳過

                            // 計算與當前前進方向的夾角
                            const angleToMonster = Math.atan2(mdy, mdx);
                            let angleDiff = angleToMonster - state.angle;
                            // 正規化到 -PI ~ PI
                            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                            // 在 ±45 度內
                            if (Math.abs(angleDiff) <= Math.PI / 4) {
                                if (!nearestInCone || mDist < nearestInCone.dist) {
                                    nearestInCone = { id: m.id, x: m.x, y: m.y, dist: mDist };
                                }
                            }
                        }

                        // 朝扇形內最近敵人飛去，沒有則隨機偏轉
                        if (nearestInCone) {
                            state.angle = Math.atan2(nearestInCone.y - state.y, nearestInCone.x - state.x);
                        } else {
                            state.angle += (Math.random() - 0.5) * (Math.PI / 2);
                        }
                        break;
                    }
                }

                updateBlade();

                // 離開範圍則銷毀
                if (!isInRange()) {
                    updateEvent.destroy();
                    outer.destroy();
                    inner.destroy();
                }
            }
        });

        updateBlade();
    }

    // 每幀更新輪鋸自轉視覺效果（讓旋轉流暢）
    private updateSawBladeSpinVisual(delta: number) {
        // 沒有護盾時不顯示輪鋸
        if (this.currentShield <= 0) {
            for (const blade of this.sawBladeSprites) {
                blade.outer.setVisible(false);
                blade.inner.setVisible(false);
            }
            return;
        }

        // 更新自轉角度（0.15 秒一圈，超快速旋轉）
        const spinSpeed = (Math.PI * 2) / 150; // 弧度/毫秒
        this.sawBladeSpinAngle += spinSpeed * delta;
        if (this.sawBladeSpinAngle > Math.PI * 2) {
            this.sawBladeSpinAngle -= Math.PI * 2;
        }

        // 計算輪鋸位置並重繪
        const orbitRadius = this.gameBounds.height * 0.2; // 2 單位距離
        const bladeRadius = this.gameBounds.height * 0.05; // 0.5 單位範圍

        // 取得技能等級
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const skillLevel = equipped ? equipped.level : 1;

        // 輪鋸數量：基本 3 個，每 5 技能等級 +1，最多 8 個
        const maxBladeCount = 8;
        const bladeCount = Math.min(maxBladeCount, 3 + Math.floor(skillLevel / 5));

        const bladePositions: { x: number; y: number }[] = [];
        for (let i = 0; i < bladeCount; i++) {
            const angle = this.sawBladeAngle + (i / bladeCount) * Math.PI * 2;
            const bladeX = this.characterX + Math.cos(angle) * orbitRadius;
            const bladeY = this.characterY + Math.sin(angle) * orbitRadius;
            bladePositions.push({ x: bladeX, y: bladeY });
        }

        this.drawSawBlades(bladePositions, bladeRadius);
    }

    // 清除進階技能的視覺效果（切換技能時呼叫）
    private clearAdvancedSkillEffects() {
        // 隱藏輪鋸（絕對邏輯防禦，雙層）
        for (const blade of this.sawBladeSprites) {
            blade.outer.setVisible(false);
            blade.inner.setVisible(false);
        }
        // 重設輪鋸擊中記錄
        this.sawBladeLastHitTime.clear();

        // 清除井字線 sprites（完美像素審判）
        for (const sprite of this.perfectPixelLineSprites) {
            sprite.destroy();
        }
        this.perfectPixelLineSprites = [];
        this.perfectPixelFocusIndex = 0;
        this.perfectPixelLineAlpha = 0;

        // 清除分身（咒言幻象），產生咒言爆炸
        this.dismissAllPhantoms(true);
    }

    // 場景重啟前清理（回收物件池、重置狀態）
    private cleanupBeforeRestart() {
        // 重置怪物系統
        this.monsterManager.reset();

        // 重置技能系統
        this.skillManager.reset();

        // 清除進階技能效果（輪鋸、井字線、分身）
        this.clearAdvancedSkillEffects();

        // 停用零信任防禦協定
        this.deactivateZeroTrust();

        // 隱藏輪鋸 Sprites（不 destroy，讓 scene.restart 處理）
        for (const blade of this.sawBladeSprites) {
            blade.outer.setVisible(false);
            blade.inner.setVisible(false);
        }

        // 重置輪鋸狀態
        this.sawBladeAngle = 0;
        this.sawBladeSpinAngle = 0;
        this.sawBladeLastHitTime.clear();
        this.currentSawBladePositions = [];

        // 回收技能特效物件池（隱藏所有活躍的特效）
        for (const sprite of this.skillEffectPool) {
            sprite.setVisible(false);
            sprite.setActive(false);
        }
        for (const sprite of this.lineEffectPool) {
            sprite.setVisible(false);
            sprite.setActive(false);
        }
        for (const sprite of this.circleLineEffectPool) {
            sprite.setVisible(false);
            sprite.setActive(false);
        }

        // 回收地板 Hex 物件池
        for (const sprite of this.floorHexPool) {
            sprite.setVisible(false);
            sprite.setActive(false);
        }

        // 清除回血物品
        for (const item of this.healingItems) {
            item.sprite.destroy();
        }
        this.healingItems = [];
        this.nextHealingItemId = 0;

        // 隱藏角色
        if (this.character) {
            this.character.setVisible(false);
        }

        // 停止 BGM
        if (this.gameBgm && this.gameBgm.isPlaying) {
            this.gameBgm.stop();
        }

        // 重置遊戲狀態標誌
        this.gameOverActive = false;
        this.isHurt = false;
        this.isAttacking = false;
        this.popupPaused = false;
        this.isPaused = false;

        // 清空技能冷卻
        this.skillCooldowns.clear();

        // 重置遊戲計時器
        this.gameTimer = 0;

        // 重置玩家狀態
        this.currentLevel = 0;
        this.currentExp = 0;
        this.currentHp = 200;
        this.currentShield = 0;
        this.totalDamageReceived = 0;

        // 清空 GAME OVER 字樣
        for (const sprite of this.gameOverSprites) {
            sprite.setVisible(false);
        }

        // 顯示 UI 容器（遊戲結束時會隱藏）
        if (this.uiContainer) {
            this.uiContainer.setVisible(true);
        }

        // 重置掃光效果
        this.scanLineX = -1;
        this.scanLineActive = false;
        this.circularScanRadius = 0;
        this.circularScanActive = false;
        this.damageScanRings = [];
        this.shieldBreathScan = { phase: 'idle', radius: 0, targetRadius: 0 };
        this.levelUpBreathScan = { phase: 'idle', radius: 0, targetRadius: 0 };
        this.gameOverBreathScan = { phase: 'idle', radius: 0, targetRadius: 0 };

        // 清空技能選項面板
        if (this.skillPanelContainer) {
            this.skillPanelContainer.setVisible(false);
        }

        // 清空技能資訊面板
        if (this.skillInfoPanel) {
            this.skillInfoPanel.setVisible(false);
        }
    }

    // ========== 回血物品系統 ==========

    // 菁英怪死亡時生成回血物品（2-3 個散落在死亡位置附近）
    private spawnHealingItems(worldX: number, worldY: number) {
        const dropCount = Phaser.Math.Between(
            MainScene.HEALING_ITEM_DROP_COUNT_MIN,
            MainScene.HEALING_ITEM_DROP_COUNT_MAX
        );
        const unitSize = this.gameBounds.height * 0.1;
        const scatterRadius = MainScene.HEALING_ITEM_SCATTER_RADIUS * unitSize;
        const itemSize = MainScene.HEALING_ITEM_SIZE * this.gameBounds.height;

        for (let i = 0; i < dropCount; i++) {
            // 隨機散落位置（圓形分佈）
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * scatterRadius;
            const itemX = worldX + Math.cos(angle) * radius;
            const itemY = worldY + Math.sin(angle) * radius;

            // 創建愛心形狀的 sprite（使用 Graphics 繪製）
            const graphics = this.add.graphics();
            // 愛心繪製在紋理中心（itemSize/2, itemSize/2）
            const centerX = itemSize / 2;
            const centerY = itemSize / 2;
            const heartSize = itemSize * 0.4;

            graphics.fillStyle(0xcc66ff, 1); // 粉紫色愛心
            // 簡易愛心形狀（兩個圓 + 一個三角形）
            graphics.fillCircle(centerX - heartSize * 0.3, centerY - heartSize * 0.2, heartSize * 0.4);
            graphics.fillCircle(centerX + heartSize * 0.3, centerY - heartSize * 0.2, heartSize * 0.4);
            graphics.fillTriangle(
                centerX - heartSize * 0.65, centerY,
                centerX + heartSize * 0.65, centerY,
                centerX, centerY + heartSize * 0.7
            );
            // 加上白色高光
            graphics.fillStyle(0xffffff, 0.4);
            graphics.fillCircle(centerX - heartSize * 0.2, centerY - heartSize * 0.3, heartSize * 0.15);

            // 生成紋理
            const textureKey = `healing_item_${this.nextHealingItemId}`;
            graphics.generateTexture(textureKey, itemSize, itemSize);
            graphics.destroy();

            // 創建 sprite
            const sprite = this.add.sprite(itemX, itemY, textureKey);
            sprite.setOrigin(0.5, 0.5);
            this.healingItemContainer.add(sprite);

            this.healingItems.push({
                id: this.nextHealingItemId++,
                x: itemX,
                y: itemY,
                sprite,
                floatPhase: Math.random() * Math.PI * 2
            });
        }
    }

    // 更新回血物品（浮動動畫 + 拾取檢測）
    private updateHealingItems(delta: number) {
        if (this.healingItems.length === 0) return;

        const unitSize = this.gameBounds.height * 0.1;
        // 拾取範圍 = 基礎 1 單位 + 視網膜增強模組加成
        const pickupBonus = this.skillManager.getRetinaModulePickupBonus();
        const pickupRange = (this.basePickupRange + pickupBonus) * unitSize;
        const itemsToRemove: number[] = [];

        for (const item of this.healingItems) {
            // 浮動動畫
            item.floatPhase += delta * 0.003;
            const floatOffset = Math.sin(item.floatPhase) * 5;
            item.sprite.setY(item.y + floatOffset);

            // 拾取檢測
            const dx = this.characterX - item.x;
            const dy = this.characterY - item.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= pickupRange) {
                // 拾取物品：回復 10% 最大 HP
                const healAmount = Math.floor(this.maxHp * MainScene.HEALING_ITEM_HEAL_PERCENT);
                this.currentHp = Math.min(this.maxHp, this.currentHp + healAmount);
                this.displayedHp = this.currentHp;
                this.drawHpBarFill();
                this.updateHpText();

                // 拾取特效（綠色光環）
                this.playPickupEffect(item.x, item.y);

                itemsToRemove.push(item.id);
            }
        }

        // 移除過期或被拾取的物品
        for (const id of itemsToRemove) {
            const index = this.healingItems.findIndex(i => i.id === id);
            if (index !== -1) {
                const item = this.healingItems[index];
                // 刪除紋理
                this.textures.remove(`healing_item_${item.id}`);
                item.sprite.destroy();
                this.healingItems.splice(index, 1);
            }
        }
    }

    // 拾取特效（綠色上升光點）
    private playPickupEffect(x: number, y: number) {
        // 獲取或創建一個特效 sprite
        const sprite = this.getSkillEffectSprite();
        if (!sprite) return;

        sprite.setTexture(MainScene.TEXTURE_CIRCLE);
        sprite.setPosition(x, y);
        sprite.setScale(0.1);
        sprite.setTint(0x66ff66); // 綠色
        sprite.setAlpha(1);
        sprite.setVisible(true);
        sprite.setActive(true);

        // 上升 + 縮小 + 淡出
        this.tweens.add({
            targets: sprite,
            y: y - 50,
            scaleX: 0.3,
            scaleY: 0.3,
            alpha: 0,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.releaseSkillEffectSprite(sprite);
            }
        });
    }

    // 處理怪物死亡（掉落系統入口）
    private handleMonsterDeath(monster: { x: number; y: number; isElite: boolean; isBoss: boolean }) {
        // 菁英怪掉落血球
        if (monster.isElite) {
            this.spawnHealingItems(monster.x, monster.y);
        }
        // BOSS 掉落（未來擴展）
        if (monster.isBoss) {
            // TODO: BOSS 專屬掉落
        }
        // 未來可以在這裡加入其他掉落邏輯
    }

    // ========== 結束回血物品系統 ==========

    // 完美像素審判：井字線 + 四焦點隨機輪流爆炸（1秒內全部炸完）
    private executePerfectPixel(skillLevel: number) {
        // 傷害單位 = 角色等級 + 技能等級
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 計算井字線位置（畫面 1/3 和 2/3 處）
        const bounds = this.gameBounds;
        const x1 = bounds.x + bounds.width / 3;
        const x2 = bounds.x + bounds.width * 2 / 3;
        const y1 = bounds.y + bounds.height / 3;
        const y2 = bounds.y + bounds.height * 2 / 3;

        // 四個焦點位置（井字線交叉點）
        const focusPoints = [
            { x: x1, y: y1 }, // 左上
            { x: x2, y: y1 }, // 右上
            { x: x1, y: y2 }, // 左下
            { x: x2, y: y2 }  // 右下
        ];

        // 爆炸範圍（3 單位）
        const explosionRadius = this.gameBounds.height * 0.3; // 像素（視覺用）
        const unitSize = this.gameBounds.height / 10; // 1 單位 = 10% 畫面高度
        const explosionRadiusUnits = 3; // 世界單位

        // 繪製井字線（淡入效果）
        this.perfectPixelLineAlpha = 1.0;
        this.drawPerfectPixelLines(x1, x2, y1, y2);

        // 隨機打亂四個焦點的順序
        const shuffledIndices = [0, 1, 2, 3];
        for (let i = shuffledIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
        }

        // 1秒內四個點全部各炸一次（每 250ms 炸一個）
        const explosionInterval = 250;

        shuffledIndices.forEach((focusIndex, order) => {
            this.time.delayedCall(order * explosionInterval, () => {
                const focus = focusPoints[focusIndex];

                // 轉換螢幕座標到世界座標（爆炸檢測用）
                const worldPos = {
                    x: focus.x + this.cameraOffsetX,
                    y: focus.y + this.cameraOffsetY
                };

                // 計算傷害（每次爆炸獨立計算暴擊）
                const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

                // 檢測爆炸範圍內的怪物
                const monsters = this.monsterManager.getMonsters();
                const hitMonsters: number[] = [];

                for (const monster of monsters) {
                    const dx = monster.x - worldPos.x;
                    const dy = monster.y - worldPos.y;
                    const distPixels = Math.sqrt(dx * dx + dy * dy);
                    // 轉換成世界單位
                    const distUnits = distPixels / unitSize;
                    // 怪物半徑（世界單位）
                    const monsterRadiusUnits = monster.definition.size * 0.5;

                    if (distUnits - monsterRadiusUnits <= explosionRadiusUnits) {
                        hitMonsters.push(monster.id);
                    }
                }

                if (hitMonsters.length > 0) {
                    // 先暈眩效果（1 秒），再造成傷害
                    // 這樣存活的怪物會保持暈眩狀態
                    this.monsterManager.stunMonsters(hitMonsters, 1000);

                    const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                    if (result.totalExp > 0) this.addExp(result.totalExp);
        
                    // 被炸到的怪物噴出爆炸火花（青綠色）
                    const monsters = this.monsterManager.getMonsters();
                    for (const monsterId of hitMonsters) {
                        const monster = monsters.find(m => m.id === monsterId);
                        if (monster) {
                            const screenPos = this.worldToScreen(monster.x, monster.y);
                            this.showExplosionSparkEffect(screenPos.x, screenPos.y, 0x66ffcc, 1.0);
                        }
                    }
                }

                // 顯示爆炸視覺效果（極白色爆炸）
                this.showPerfectPixelExplosion(focus.x, focus.y, explosionRadius, isCrit);
            });
        });

        // 井字線淡出動畫（在所有爆炸結束後開始淡出）
        this.time.delayedCall(4 * explosionInterval, () => {
            this.tweens.add({
                targets: this,
                perfectPixelLineAlpha: 0,
                duration: 2000,
                ease: 'Power2',
                onUpdate: () => {
                    this.drawPerfectPixelLines(x1, x2, y1, y2);
                }
            });
        });
    }

    // 繪製井字線（使用 LINE 紋理）
    private drawPerfectPixelLines(x1: number, x2: number, y1: number, y2: number) {
        const bounds = this.gameBounds;
        const lineWidth = 16; // 線條粗度

        // 如果 sprites 還沒建立，建立 4 條線
        if (this.perfectPixelLineSprites.length === 0) {
            // 垂直線 1 (x1)
            const vLine1 = this.add.sprite(x1, bounds.y + bounds.height / 2, MainScene.TEXTURE_LINE);
            this.uiContainer.add(vLine1);
            vLine1.setDepth(1005);
            vLine1.setTint(0x66ffcc);
            vLine1.setRotation(Math.PI / 2); // 垂直
            vLine1.setScale(bounds.height / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
            this.perfectPixelLineSprites.push(vLine1);

            // 垂直線 2 (x2)
            const vLine2 = this.add.sprite(x2, bounds.y + bounds.height / 2, MainScene.TEXTURE_LINE);
            this.uiContainer.add(vLine2);
            vLine2.setDepth(1005);
            vLine2.setTint(0x66ffcc);
            vLine2.setRotation(Math.PI / 2); // 垂直
            vLine2.setScale(bounds.height / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
            this.perfectPixelLineSprites.push(vLine2);

            // 水平線 1 (y1)
            const hLine1 = this.add.sprite(bounds.x + bounds.width / 2, y1, MainScene.TEXTURE_LINE);
            this.uiContainer.add(hLine1);
            hLine1.setDepth(1005);
            hLine1.setTint(0x66ffcc);
            hLine1.setRotation(0); // 水平
            hLine1.setScale(bounds.width / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
            this.perfectPixelLineSprites.push(hLine1);

            // 水平線 2 (y2)
            const hLine2 = this.add.sprite(bounds.x + bounds.width / 2, y2, MainScene.TEXTURE_LINE);
            this.uiContainer.add(hLine2);
            hLine2.setDepth(1005);
            hLine2.setTint(0x66ffcc);
            hLine2.setRotation(0); // 水平
            hLine2.setScale(bounds.width / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
            this.perfectPixelLineSprites.push(hLine2);
        }

        // 更新透明度
        const alpha = this.perfectPixelLineAlpha * 0.8;
        for (const sprite of this.perfectPixelLineSprites) {
            sprite.setAlpha(alpha);
        }
    }

    // 顯示完美像素爆炸效果（極白色）- 使用 sector_360 和 circle_line 紋理
    private showPerfectPixelExplosion(x: number, y: number, radius: number, isCrit: boolean) {
        const allSprites: Phaser.GameObjects.Sprite[] = [];
        const lineWidth = 24; // 線條粗度
        const flashLength = radius * 1.2;

        // 爆炸核心（青綠色系）- 使用 sector_360 紋理
        const coreColor = isCrit ? 0xffff00 : 0x66ffcc;
        const coreSprite = this.add.sprite(x, y, MainScene.TEXTURE_SECTOR_360);
        this.uiContainer.add(coreSprite);
        coreSprite.setDepth(1006);
        coreSprite.setTint(coreColor);
        coreSprite.setScale((radius * 0.6) / MainScene.EFFECT_TEXTURE_SIZE);
        coreSprite.setAlpha(1.0);
        allSprites.push(coreSprite);

        // 爆炸光環 - 使用 circle_line 紋理
        const ringSprite = this.add.sprite(x, y, MainScene.TEXTURE_CIRCLE_LINE);
        this.uiContainer.add(ringSprite);
        ringSprite.setDepth(1005);
        ringSprite.setTint(0x66ffcc);
        ringSprite.setScale((radius * 1.0) / MainScene.EFFECT_TEXTURE_SIZE);
        ringSprite.setAlpha(0.8);
        allSprites.push(ringSprite);

        // 外圈光暈 - 使用 circle_line 紋理（更大更透明）
        const outerSprite = this.add.sprite(x, y, MainScene.TEXTURE_CIRCLE_LINE);
        this.uiContainer.add(outerSprite);
        outerSprite.setDepth(1004);
        outerSprite.setTint(0x88ffee);
        outerSprite.setScale((radius * 2) / MainScene.EFFECT_TEXTURE_SIZE);
        outerSprite.setAlpha(0.4);
        allSprites.push(outerSprite);

        // 十字閃光 - 水平線
        const hLine = this.add.sprite(x, y, MainScene.TEXTURE_LINE);
        this.uiContainer.add(hLine);
        hLine.setDepth(1007);
        hLine.setTint(0x66ffcc);
        hLine.setRotation(0);
        hLine.setScale((flashLength * 2) / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
        hLine.setAlpha(0.8);
        allSprites.push(hLine);

        // 十字閃光 - 垂直線
        const vLine = this.add.sprite(x, y, MainScene.TEXTURE_LINE);
        this.uiContainer.add(vLine);
        vLine.setDepth(1007);
        vLine.setTint(0x66ffcc);
        vLine.setRotation(Math.PI / 2);
        vLine.setScale((flashLength * 2) / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
        vLine.setAlpha(0.8);
        allSprites.push(vLine);

        // 淡出動畫
        for (const sprite of allSprites) {
            this.tweens.add({
                targets: sprite,
                alpha: 0,
                duration: 500,
                ease: 'Power2',
                onComplete: () => sprite.destroy()
            });
        }

        // 擴散圓環動畫 - 使用 sector_360 紋理
        const expandSprite = this.add.sprite(x, y, MainScene.TEXTURE_SECTOR_360);
        this.uiContainer.add(expandSprite);
        expandSprite.setDepth(1005);
        expandSprite.setTint(0x66ffcc);
        const startScale = (radius * 0.6) / MainScene.EFFECT_TEXTURE_SIZE;
        const endScale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        expandSprite.setScale(startScale);
        expandSprite.setAlpha(1);

        this.tweens.add({
            targets: expandSprite,
            scale: endScale,
            alpha: 0,
            duration: 300,
            ease: 'Power2',
            onComplete: () => expandSprite.destroy()
        });
    }

    // 爆發的影視特效：2秒內發射30枚追蹤導彈
    private executeVfxBurst(skillLevel: number) {
        // 傷害單位 = 角色等級 + 技能等級
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 找到最近的敵人
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 2秒內發射30枚導彈（每66.7ms一枚）
        const missileCount = 30;
        const missileInterval = 67;

        for (let i = 0; i < missileCount; i++) {
            this.time.delayedCall(i * missileInterval, () => {
                // 每次發射時重新找怪物（目標可能已死亡）
                const currentMonsters = this.monsterManager.getMonsters();
                if (currentMonsters.length === 0) return;

                // 計算所有怪物距離並排序
                const monstersWithDist = currentMonsters.map(monster => {
                    const dx = monster.x - this.characterX;
                    const dy = monster.y - this.characterY;
                    return { monster, dist: Math.sqrt(dx * dx + dy * dy) };
                });
                monstersWithDist.sort((a, b) => a.dist - b.dist);

                // 取最近的5隻（或全部，如果不足5隻）
                const nearestCount = Math.min(5, monstersWithDist.length);
                const nearestMonsters = monstersWithDist.slice(0, nearestCount);

                // 隨機選一隻
                const targetIndex = Math.floor(Math.random() * nearestMonsters.length);
                const target = nearestMonsters[targetIndex].monster;

                // 發射導彈
                this.launchMissile(target.id, baseDamage, skillLevel);
            });
        }
    }

    // 發射單枚追蹤導彈
    private launchMissile(targetId: number, baseDamage: number, skillLevel: number) {
        const unitSize = this.gameBounds.height / 10;  // 螢幕 1 單位
        const flyOutDist = this.gameBounds.height * 0.2;  // 飛出距離 2 單位（螢幕座標）

        // 玩家螢幕位置（使用 worldToScreen 取得正確位置）
        const playerScreen = this.worldToScreen(this.characterX, this.characterY);
        const playerScreenX = playerScreen.x;
        const playerScreenY = playerScreen.y;

        // 創建導彈 sprite（使用 line 紋理）
        const missile = this.add.sprite(playerScreenX, playerScreenY, MainScene.TEXTURE_LINE);
        this.skillGridContainer.add(missile);
        missile.setDepth(100);
        missile.setTint(0xff6600); // 橘色

        // 導彈尺寸（4倍寬度）
        const missileWidth = 32; // 4倍粗
        let missileLength = unitSize * 0.3;  // 初始長度，俯衝時會拉長

        // 設定初始縮放
        const updateMissileScale = () => {
            const scaleX = missileLength / MainScene.EFFECT_TEXTURE_SIZE;
            const scaleY = missileWidth / MainScene.EFFECT_LINE_HEIGHT;
            missile.setScale(scaleX, scaleY);
        };
        updateMissileScale();

        // 記錄目標
        const monsters = this.monsterManager.getMonsters();
        const target = monsters.find(m => m.id === targetId);
        if (!target) {
            missile.destroy();
            return;
        }

        // 階段1：隨機方向飛出 2 單位（400ms）
        const randomAngle = Math.random() * Math.PI * 2;
        missile.setRotation(randomAngle);
        const flyOutScreenX = playerScreenX + Math.cos(randomAngle) * flyOutDist;
        const flyOutScreenY = playerScreenY + Math.sin(randomAngle) * flyOutDist;

        this.tweens.add({
            targets: missile,
            x: flyOutScreenX,
            y: flyOutScreenY,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // 取得目標當前螢幕位置
                const targetScreen = this.worldToScreen(target.x, target.y);

                // 計算俯衝方向
                const dx = targetScreen.x - missile.x;
                const dy = targetScreen.y - missile.y;
                missile.setRotation(Math.atan2(dy, dx));

                // 俯衝時拉長導彈（8倍）
                missileLength = unitSize * 2.4;
                updateMissileScale();

                // 階段2：直衝目標（500ms）
                this.tweens.add({
                    targets: missile,
                    x: targetScreen.x,
                    y: targetScreen.y,
                    duration: 500,
                    ease: 'Linear',
                    onComplete: () => {
                        const currentMonsters = this.monsterManager.getMonsters();
                        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

                        // 第一段：命中目標傷害
                        const hitTarget = currentMonsters.find(m => m.id === targetId);
                        if (hitTarget) {
                            const result = this.monsterManager.damageMonsters([hitTarget.id], finalDamage);
                            if (result.totalExp > 0) this.addExp(result.totalExp);

                            // 燃燒 DOT 機率觸發（技能等級%）
                            const burnChance = skillLevel * 0.01;
                            if (Math.random() < burnChance) {
                                const burnDamage = Math.floor(baseDamage * 0.2);
                                this.monsterManager.burnMonsters([hitTarget.id], 5000, burnDamage);
                            }
                        }

                        // 第二段：3 單位範圍爆炸傷害（包含已受傷目標）
                        const explosionRadius = 3; // 3 單位
                        const hitMonsterIds: number[] = [];
                        for (const monster of currentMonsters) {
                            const monsterScreen = this.worldToScreen(monster.x, monster.y);
                            const dx = monsterScreen.x - missile.x;
                            const dy = monsterScreen.y - missile.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist <= explosionRadius * unitSize) {
                                hitMonsterIds.push(monster.id);
                            }
                        }

                        if (hitMonsterIds.length > 0) {
                            const result = this.monsterManager.damageMonsters(hitMonsterIds, finalDamage);
                            if (result.totalExp > 0) this.addExp(result.totalExp);

                            // 燃燒 DOT 機率觸發（技能等級%，每隻分別判定）
                            const burnChance = skillLevel * 0.01;
                            const burnDamage = Math.floor(baseDamage * 0.2);
                            const monstersToBurn: number[] = [];
                            for (const monsterId of hitMonsterIds) {
                                if (Math.random() < burnChance) {
                                    monstersToBurn.push(monsterId);
                                }
                            }
                            if (monstersToBurn.length > 0) {
                                this.monsterManager.burnMonsters(monstersToBurn, 5000, burnDamage);
                            }

                            // 被炸到的怪物噴出爆炸火花（橘色）
                            for (const monsterId of hitMonsterIds) {
                                const monster = currentMonsters.find(m => m.id === monsterId);
                                if (monster) {
                                    const screenPos = this.worldToScreen(monster.x, monster.y);
                                    this.showExplosionSparkEffect(screenPos.x, screenPos.y, 0xff6600, 1.0);
                                }
                            }
                        }

                        // 3 單位爆炸效果
                        this.showMissileExplosion(missile.x, missile.y, isCrit);

                        missile.destroy();
                    }
                });
            }
        });
    }

    // 導彈爆炸效果（3 單位大小）
    private showMissileExplosion(x: number, y: number, _isCrit: boolean) {
        const unitSize = this.gameBounds.height / 10;
        const radius = unitSize * 3;  // 3 單位

        // 爆炸核心：sector_360 紋理（橘色）
        const coreSprite = this.add.sprite(x, y, MainScene.TEXTURE_SECTOR_360);
        this.skillGridContainer.add(coreSprite);
        coreSprite.setDepth(101);
        coreSprite.setTint(0xff6600);
        const coreScale = (radius * 0.6) / MainScene.EFFECT_TEXTURE_SIZE;
        coreSprite.setScale(coreScale);
        coreSprite.setAlpha(0.9);

        // 外圈：circle_line 紋理（黃色）
        const outerSprite = this.add.sprite(x, y, MainScene.TEXTURE_CIRCLE_LINE);
        this.skillGridContainer.add(outerSprite);
        outerSprite.setDepth(100);
        outerSprite.setTint(0xffcc00);
        const outerScale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        outerSprite.setScale(outerScale);
        outerSprite.setAlpha(0.7);

        // 飛散線條：使用標準化爆炸火花效果（橘色，3 單位）
        this.showExplosionSparkEffect(x, y, 0xff6600, 3);

        // 核心擴散淡出
        this.tweens.add({
            targets: coreSprite,
            alpha: 0,
            scale: coreScale * 1.5,
            duration: 250,
            ease: 'Power2',
            onComplete: () => {
                coreSprite.destroy();
            }
        });

        // 外圈擴散淡出
        this.tweens.add({
            targets: outerSprite,
            alpha: 0,
            scale: outerScale * 1.3,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                outerSprite.destroy();
            }
        });
    }

    // 零信任防禦協定：啟用
    private activateZeroTrust(_skillLevel: number) {
        if (this.zeroTrustActive) return;
        this.zeroTrustActive = true;

        const unitSize = this.gameBounds.height / 10;
        const radius = 5; // 5 單位半徑
        const radiusPx = radius * unitSize;

        // 建立八角矩陣護盾圖
        if (!this.zeroTrustSprite) {
            this.zeroTrustSprite = this.add.sprite(0, 0, MainScene.TEXTURE_SHIELD);
            this.skillGridContainer.add(this.zeroTrustSprite);
            this.zeroTrustSprite.setDepth(49);
            this.zeroTrustSprite.setAlpha(0.15);
        }

        // 建立 8 個光點（在領域的 8 個角）
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 - Math.PI / 2; // 從正上方開始
            const homeX = this.characterX + Math.cos(angle) * radiusPx;
            const homeY = this.characterY + Math.sin(angle) * radiusPx;

            // 光點 sprite（sector_360，橢圓壓扁，參考護盾腳底橢圓再小一半）
            const pointSprite = this.add.sprite(0, 0, MainScene.TEXTURE_SECTOR_360);
            this.skillGridContainer.add(pointSprite);
            pointSprite.setDepth(56);
            pointSprite.setTint(0xffffff); // 平時白色
            pointSprite.setAlpha(0.8);
            const pointScaleX = (unitSize * 0.3) / MainScene.EFFECT_TEXTURE_SIZE; // 小一半
            const pointScaleY = pointScaleX * 0.35; // 壓扁成橢圓
            pointSprite.setScale(pointScaleX, pointScaleY);

            // 向上射線 sprite（裝飾用）
            const beamSprite = this.add.sprite(0, 0, MainScene.TEXTURE_LINE);
            this.skillGridContainer.add(beamSprite);
            beamSprite.setDepth(55);
            beamSprite.setTint(0xffdd44);
            beamSprite.setAlpha(0.6);
            beamSprite.setRotation(-Math.PI / 2); // 向上

            this.zeroTrustPoints.push({
                targetMonsterId: null,
                currentX: homeX,
                currentY: homeY,
                homeAngle: angle,
                lastDamageTime: 0,
                pointSprite: pointSprite,
                beamSprite: beamSprite,
                flickerPhase: Math.random() * Math.PI * 2, // 隨機初始相位
                lockStartTime: 0,
                beamMultiplier: 1
            });
        }

        // 設定減速區域（5 單位半徑，速度減半）
        this.monsterManager.setSlowZone(this.characterX, this.characterY, 5, 0.5);
    }

    // 零信任防禦協定：更新邏輯（在 update 中呼叫）
    private updateZeroTrust(skillLevel: number, delta: number) {
        if (!this.zeroTrustActive) return;

        // 更新減速區域中心（跟隨玩家）
        this.monsterManager.setSlowZone(this.characterX, this.characterY, 5, 0.5);

        const unitSize = this.gameBounds.height / 10;
        const radius = 5; // 5 單位半徑
        const radiusPx = radius * unitSize;
        const damageInterval = 500; // 0.5 秒
        const damageRadius = 1; // 1 單位傷害範圍
        const now = this.time.now;
        const beamColor = 0xffcc00; // 金黃色
        const moveSpeed = unitSize * 8; // 光點移動速度（每秒 8 單位）

        // 更新八角矩陣護盾圖位置、大小與旋轉
        const screen = this.worldToScreen(this.characterX, this.characterY);
        if (this.zeroTrustSprite) {
            this.zeroTrustSprite.setPosition(screen.x, screen.y);
            const scale = (radiusPx * 2) / MainScene.EFFECT_TEXTURE_SIZE;
            this.zeroTrustSprite.setScale(scale);
            this.zeroTrustSprite.setTint(beamColor);
            this.zeroTrustSprite.setAlpha(0.15);
            this.zeroTrustSprite.rotation += 0.015;
        }

        // 傷害計算
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 取得所有怪物
        const monsters = this.monsterManager.getMonsters();
        const aliveMonsterIds = new Set(monsters.map(m => m.id));

        // 取得範圍內的怪物
        const monstersInRange: Monster[] = [];
        for (const monster of monsters) {
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radiusPx) {
                monstersInRange.push(monster);
            }
        }

        // 更新每個光點
        for (const point of this.zeroTrustPoints) {
            // 更新閃爍相位（高速閃爍）
            point.flickerPhase += delta * 0.02; // 高速閃爍

            // 檢查目標是否還活著且在範圍內
            if (point.targetMonsterId !== null) {
                const targetAlive = aliveMonsterIds.has(point.targetMonsterId);
                const targetMonster = monsters.find(m => m.id === point.targetMonsterId);
                const targetInRange = targetMonster && monstersInRange.some(m => m.id === point.targetMonsterId);

                if (!targetAlive || !targetInRange) {
                    // 目標死亡或離開範圍，釋放追蹤並重置倍率
                    this.zeroTrustTrackedMonsters.delete(point.targetMonsterId);
                    point.targetMonsterId = null;
                    point.lockStartTime = 0;
                    point.beamMultiplier = 1;
                }
            }

            // 如果沒有目標，嘗試鎖定最近的未被追蹤的怪物
            if (point.targetMonsterId === null && monstersInRange.length > 0) {
                // 找到最近的未被追蹤的怪物
                let nearestMonster: Monster | null = null;
                let nearestDist = Infinity;
                for (const monster of monstersInRange) {
                    if (this.zeroTrustTrackedMonsters.has(monster.id)) continue;
                    const dx = monster.x - point.currentX;
                    const dy = monster.y - point.currentY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestMonster = monster;
                    }
                }
                if (nearestMonster) {
                    point.targetMonsterId = nearestMonster.id;
                    this.zeroTrustTrackedMonsters.add(nearestMonster.id);
                    point.lockStartTime = now; // 記錄鎖定開始時間
                    point.beamMultiplier = 1;  // 重置倍率
                }
            }

            // 計算目標位置
            let targetX: number, targetY: number;
            if (point.targetMonsterId !== null) {
                // 追蹤怪物
                const targetMonster = monsters.find(m => m.id === point.targetMonsterId);
                if (targetMonster) {
                    targetX = targetMonster.x;
                    targetY = targetMonster.y;
                } else {
                    // 怪物不存在，回到角落
                    targetX = this.characterX + Math.cos(point.homeAngle) * radiusPx;
                    targetY = this.characterY + Math.sin(point.homeAngle) * radiusPx;
                }
            } else {
                // 回到角落（跟隨玩家移動）
                targetX = this.characterX + Math.cos(point.homeAngle) * radiusPx;
                targetY = this.characterY + Math.sin(point.homeAngle) * radiusPx;
            }

            // 平滑移動向目標
            const dx = targetX - point.currentX;
            const dy = targetY - point.currentY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1) {
                const moveAmount = Math.min(moveSpeed * delta / 1000, dist);
                point.currentX += (dx / dist) * moveAmount;
                point.currentY += (dy / dist) * moveAmount;
            }

            // 限制光點不超出 8 角矩陣範圍
            const distFromCenter = Math.sqrt(
                Math.pow(point.currentX - this.characterX, 2) +
                Math.pow(point.currentY - this.characterY, 2)
            );
            if (distFromCenter > radiusPx) {
                // 把光點拉回範圍內
                const angle = Math.atan2(point.currentY - this.characterY, point.currentX - this.characterX);
                point.currentX = this.characterX + Math.cos(angle) * radiusPx;
                point.currentY = this.characterY + Math.sin(angle) * radiusPx;
            }

            // 更新光點 sprite 位置
            const pointScreen = this.worldToScreen(point.currentX, point.currentY);
            point.pointSprite.setPosition(pointScreen.x, pointScreen.y);

            // 顏色：平時白色，接觸敵人變紅色
            const isTracking = point.targetMonsterId !== null;
            const flickerValue = Math.sin(point.flickerPhase) * 0.5 + 0.5;
            if (isTracking) {
                // 追蹤敵人時：紅色閃爍
                const redColor = flickerValue > 0.5 ? 0xff6666 : 0xff0000;
                point.pointSprite.setTint(redColor);
            } else {
                // 平時：白色閃爍
                const whiteColor = flickerValue > 0.5 ? 0xffffff : 0xdddddd;
                point.pointSprite.setTint(whiteColor);
            }
            point.pointSprite.setAlpha(0.7 + flickerValue * 0.3);

            // 計算光束倍率（鎖定目標時，每0.5秒+1倍，從1開始）
            if (point.targetMonsterId !== null && point.lockStartTime > 0) {
                const lockDuration = now - point.lockStartTime;
                point.beamMultiplier = 1 + Math.floor(lockDuration / 500); // 每0.5秒+1
            } else {
                point.beamMultiplier = 1;
            }

            // 更新向上射線（寬度隨倍率增加）
            const beamHeight = this.gameBounds.height * 0.8; // 射線長度
            const beamStartY = pointScreen.y - beamHeight;
            point.beamSprite.setPosition(pointScreen.x, (beamStartY + pointScreen.y) / 2);
            const beamScaleX = beamHeight / MainScene.EFFECT_TEXTURE_SIZE;
            const baseBeamWidth = 12;
            const beamWidth = baseBeamWidth * point.beamMultiplier; // 寬度隨倍率增加
            const beamScaleY = beamWidth / MainScene.EFFECT_LINE_HEIGHT;
            point.beamSprite.setScale(beamScaleX, beamScaleY);

            // 射線閃爍（金白色，裝飾用，高倍率時更亮）
            const beamFlickerColor = flickerValue > 0.5 ? 0xffdd44 : 0xffffff;
            point.beamSprite.setTint(beamFlickerColor);
            const beamAlpha = Math.min(0.9, 0.3 + flickerValue * 0.4 + (point.beamMultiplier - 1) * 0.1);
            point.beamSprite.setAlpha(beamAlpha);

            // 每 0.5 秒造成範圍傷害（只有在追蹤怪物時）
            if (point.targetMonsterId !== null && now - point.lastDamageTime >= damageInterval) {
                point.lastDamageTime = now;

                // 傷害範圍隨倍率增加（基礎1單位，每倍+0.5單位）
                const actualDamageRadius = damageRadius + (point.beamMultiplier - 1) * 0.5;

                // 檢測傷害範圍內的怪物
                const hitMonsterIds: number[] = [];
                for (const monster of monsters) {
                    const mdx = monster.x - point.currentX;
                    const mdy = monster.y - point.currentY;
                    const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
                    if (mdist <= actualDamageRadius * unitSize) {
                        hitMonsterIds.push(monster.id);
                    }
                }

                if (hitMonsterIds.length > 0) {
                    // 傷害加成：每秒 +技能等級% 傷害
                    const damageBonus = (point.beamMultiplier - 1) * skillLevel * 0.01;
                    const boostedDamage = Math.floor(baseDamage * (1 + damageBonus));
                    const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(boostedDamage, this.currentLevel);
                    const result = this.monsterManager.damageMonsters(hitMonsterIds, finalDamage);
                    if (result.totalExp > 0) this.addExp(result.totalExp);

                    // 在減速範圍內殺死敵人時，機率重置靈魂統領（護盾）冷卻
                    // 機率 = 技能等級 × 1%（每擊殺一隻判定一次）
                    if (result.killCount > 0) {
                        const resetChance = skillLevel * 0.01;
                        for (let i = 0; i < result.killCount; i++) {
                            if (Math.random() < resetChance) {
                                this.skillCooldowns.delete('active_architect');
                                break; // 重置一次即可
                            }
                        }
                    }

                    // 命中時顯示小爆炸效果（倍率高時效果更大）
                    this.showZeroTrustHitEffect(point.currentX, point.currentY, isCrit);
                }
            }
        }
    }

    // 零信任防禦協定：命中 8 角形擴散效果（雙層逆轉設計）+ 線條噴發
    private showZeroTrustHitEffect(worldX: number, worldY: number, isCrit: boolean) {
        const screen = this.worldToScreen(worldX, worldY);
        const unitSize = this.gameBounds.height / 10;

        const color = isCrit ? 0xff6600 : 0xffcc00;
        const maxSize = unitSize * 2; // 2 單位大小
        const targetScale = (maxSize * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        const rotations = Math.PI * 4; // 兩圈
        const duration = 300;

        // 隨機起始角度
        const randomAngle = Math.random() * Math.PI * 2;

        // 線條噴發：光束從上方落下，打擊方向是向下
        const hitDirection = Math.PI / 2; // 向下（攻擊方向）
        this.showHitSparkEffect(worldX, worldY, color, hitDirection);

        // 外層
        const outer = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_SHIELD);
        this.skillGridContainer.add(outer);
        outer.setDepth(59);
        outer.setTint(color);
        outer.setScale(0.1);
        outer.setAlpha(0.8);
        outer.setRotation(randomAngle); // 隨機角度

        // 內層
        const inner = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_SHIELD);
        this.skillGridContainer.add(inner);
        inner.setDepth(60);
        inner.setTint(0xffffff);
        inner.setScale(0.05);
        inner.setAlpha(0.9);
        inner.setRotation(-randomAngle); // 反向隨機角度

        // 外層動畫：擴散 + 順時針旋轉 + 淡出
        this.tweens.add({
            targets: outer,
            scale: targetScale,
            rotation: randomAngle + rotations,
            alpha: 0,
            duration: duration,
            ease: 'Quad.easeOut',
            onComplete: () => {
                outer.destroy();
            }
        });

        // 內層動畫：擴散 + 逆時針旋轉 + 淡出
        this.tweens.add({
            targets: inner,
            scale: targetScale * 0.5,
            rotation: -randomAngle - rotations * 1.5,
            alpha: 0,
            duration: duration,
            ease: 'Quad.easeOut',
            onComplete: () => {
                inner.destroy();
            }
        });
    }

    // 零信任防禦協定：停用並清理
    private deactivateZeroTrust() {
        this.zeroTrustActive = false;

        // 清理光點和射線
        for (const point of this.zeroTrustPoints) {
            point.pointSprite.destroy();
            point.beamSprite.destroy();
        }
        this.zeroTrustPoints = [];
        this.zeroTrustTrackedMonsters.clear();

        // 清理八角矩陣護盾圖
        if (this.zeroTrustSprite) {
            this.zeroTrustSprite.destroy();
            this.zeroTrustSprite = undefined;
        }

        // 清除減速區域
        this.monsterManager.clearSlowZone();
    }

    // 次元向量疾劃：朝最近敵人揮出貫穿全螢幕的直線斬擊
    private executeSoulSlash(skillLevel: number) {
        // 傷害計算
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 找最近的敵人
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        let nearestMonster = monsters[0];
        let nearestDist = Infinity;
        for (const monster of monsters) {
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestMonster = monster;
            }
        }

        // 計算斬擊方向（從玩家指向最近敵人）
        const dx = nearestMonster.x - this.characterX;
        const dy = nearestMonster.y - this.characterY;
        const angle = Math.atan2(dy, dx);

        // 執行斬擊（從玩家位置）
        this.performSoulSlash(this.characterX, this.characterY, angle, baseDamage, skillLevel, false);
    }

    // 執行單次斬擊（可遞迴觸發連鎖）
    private performSoulSlash(originX: number, originY: number, angle: number, baseDamage: number, skillLevel: number, isChain: boolean) {
        // 斬擊線：貫穿全螢幕（前後延伸）
        const maxDist = Math.max(this.gameBounds.width, this.gameBounds.height) * 2;
        const startX = originX - Math.cos(angle) * maxDist;
        const startY = originY - Math.sin(angle) * maxDist;
        const endX = originX + Math.cos(angle) * maxDist;
        const endY = originY + Math.sin(angle) * maxDist;

        // 繪製斬擊線視覺效果
        if (isChain) {
            // 連鎖斬擊用不同顏色
            this.drawChainSlashEffect(startX, startY, endX, endY, angle, originX, originY);
        } else {
            this.drawSoulSlashEffect(startX, startY, endX, endY, angle);
        }

        // 檢測斬擊線上的所有怪物
        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];
        const hitPositions: { x: number; y: number }[] = [];
        const slashWidth = this.gameBounds.height * 0.05; // 0.5 單位寬度

        for (const monster of monsters) {
            // 計算怪物到斬擊線的距離
            const distToLine = this.pointToLineDistance(
                monster.x, monster.y,
                startX, startY, endX, endY
            );
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

            if (distToLine <= slashWidth + monsterRadius) {
                hitMonsters.push(monster.id);
                hitPositions.push({ x: monster.x, y: monster.y });
            }
        }

        // 造成傷害（次元向量疾劃暴擊傷害 3 倍）
        if (hitMonsters.length > 0) {
            const critChance = this.skillManager.getCritChance(this.currentLevel);
            const isCrit = Math.random() < critChance;
            const critMultiplier = isCrit ? 3.0 : 1.0; // 暴擊 3 倍傷害
            const finalDamage = Math.floor(baseDamage * critMultiplier);
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.addExp(result.totalExp);

            // 打擊火花（紅色，次元向量系，暴擊時更亮）
            for (const pos of hitPositions) {
                this.showHitSparkEffect(pos.x, pos.y, isCrit ? SparkColors.SOUL_SLASH_CRIT : SparkColors.SOUL_SLASH, angle);
            }

            // 連鎖斬擊機率：每級 1%（只有主斬擊能觸發連鎖，連鎖不再觸發連鎖）
            if (!isChain) {
                const chainChance = skillLevel * 0.01;
                for (const hitPos of hitPositions) {
                    if (Math.random() < chainChance) {
                        // 觸發連鎖！從擊中位置發射新斬擊
                        // 角度偏移 30~60 度（隨機正負）
                        const offsetDeg = 30 + Math.random() * 30; // 30~60 度
                        const offsetRad = offsetDeg * Math.PI / 180;
                        const newAngle = angle + (Math.random() < 0.5 ? offsetRad : -offsetRad);

                        // 延遲一點時間再觸發連鎖，有視覺效果
                        // 連鎖斬擊傷害 2 倍
                        this.time.delayedCall(50, () => {
                            this.performSoulSlash(hitPos.x, hitPos.y, newAngle, baseDamage * 2, skillLevel, true);
                        });
                    }
                }
            }
        }
    }

    // 繪製連鎖斬擊視覺效果（青色）
    private drawChainSlashEffect(startX: number, startY: number, endX: number, endY: number, angle: number, originX: number, originY: number) {
        const screenStart = this.worldToScreen(startX, startY);
        const screenEnd = this.worldToScreen(endX, endY);

        // 計算長度
        const dx = screenEnd.x - screenStart.x;
        const dy = screenEnd.y - screenStart.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const centerX = (screenStart.x + screenEnd.x) / 2;
        const centerY = (screenStart.y + screenEnd.y) / 2;

        // 連鎖斬擊用青色，6倍粗度
        const slashColor = 0x00ffff;
        const lineWidth = 48; // 6倍（基準8）

        // 外層光暈
        const outer = this.add.sprite(centerX, centerY, MainScene.TEXTURE_LINE);
        this.skillGridContainer.add(outer);
        outer.setDepth(60);
        outer.setTint(slashColor);
        outer.setRotation(angle);
        outer.setScale(length / MainScene.EFFECT_TEXTURE_SIZE, (lineWidth * 1.5) / MainScene.EFFECT_LINE_HEIGHT);
        outer.setAlpha(0.3);

        // 中層
        const middle = this.add.sprite(centerX, centerY, MainScene.TEXTURE_LINE);
        this.skillGridContainer.add(middle);
        middle.setDepth(61);
        middle.setTint(slashColor);
        middle.setRotation(angle);
        middle.setScale(length / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
        middle.setAlpha(0.6);

        // 核心線
        const core = this.add.sprite(centerX, centerY, MainScene.TEXTURE_LINE);
        this.skillGridContainer.add(core);
        core.setDepth(62);
        core.setTint(0xffffff);
        core.setRotation(angle);
        core.setScale(length / MainScene.EFFECT_TEXTURE_SIZE, (lineWidth * 0.3) / MainScene.EFFECT_LINE_HEIGHT);
        core.setAlpha(0.9);

        // 淡出效果
        const sprites = [outer, middle, core];
        for (const sprite of sprites) {
            this.tweens.add({
                targets: sprite,
                alpha: 0,
                duration: 150,
                onComplete: () => sprite.destroy()
            });
        }

        // 連鎖起點閃光
        const originScreen = this.worldToScreen(originX, originY);
        this.showChainSlashFlashEffect(originScreen.x, originScreen.y, angle);
    }

    // 連鎖斬擊閃光效果（青色）
    private showChainSlashFlashEffect(x: number, y: number, angle: number) {
        const graphics = this.add.graphics();
        this.skillGridContainer.add(graphics);
        graphics.setDepth(61);

        const flashSize = this.gameBounds.height * 0.08;

        graphics.lineStyle(3, 0x00ffff, 0.8);
        graphics.beginPath();
        graphics.arc(x, y, flashSize, angle - 0.3, angle + 0.3, false);
        graphics.strokePath();

        graphics.lineStyle(1, 0xffffff, 1);
        graphics.beginPath();
        graphics.arc(x, y, flashSize * 0.7, angle - 0.2, angle + 0.2, false);
        graphics.strokePath();

        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: 80,
            onComplete: () => {
                graphics.destroy();
            }
        });
    }

    // 計算點到線段的距離
    private pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const ddx = px - xx;
        const ddy = py - yy;
        return Math.sqrt(ddx * ddx + ddy * ddy);
    }

    // 繪製靈魂斬擊視覺效果
    private drawSoulSlashEffect(startX: number, startY: number, endX: number, endY: number, angle: number) {
        const screenStart = this.worldToScreen(startX, startY);
        const screenEnd = this.worldToScreen(endX, endY);

        // 計算長度
        const dx = screenEnd.x - screenStart.x;
        const dy = screenEnd.y - screenStart.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const centerX = (screenStart.x + screenEnd.x) / 2;
        const centerY = (screenStart.y + screenEnd.y) / 2;

        // 斬擊線（多層疊加），6倍粗度
        const slashColor = 0xff3366;
        const lineWidth = 48; // 6倍（基準8）

        // 外層光暈
        const outer = this.add.sprite(centerX, centerY, MainScene.TEXTURE_LINE);
        this.skillGridContainer.add(outer);
        outer.setDepth(60);
        outer.setTint(slashColor);
        outer.setRotation(angle);
        outer.setScale(length / MainScene.EFFECT_TEXTURE_SIZE, (lineWidth * 1.5) / MainScene.EFFECT_LINE_HEIGHT);
        outer.setAlpha(0.3);

        // 中層
        const middle = this.add.sprite(centerX, centerY, MainScene.TEXTURE_LINE);
        this.skillGridContainer.add(middle);
        middle.setDepth(61);
        middle.setTint(slashColor);
        middle.setRotation(angle);
        middle.setScale(length / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
        middle.setAlpha(0.6);

        // 核心線
        const core = this.add.sprite(centerX, centerY, MainScene.TEXTURE_LINE);
        this.skillGridContainer.add(core);
        core.setDepth(62);
        core.setTint(0xffffff);
        core.setRotation(angle);
        core.setScale(length / MainScene.EFFECT_TEXTURE_SIZE, (lineWidth * 0.3) / MainScene.EFFECT_LINE_HEIGHT);
        core.setAlpha(0.9);

        // 淡出效果
        const sprites = [outer, middle, core];
        for (const sprite of sprites) {
            this.tweens.add({
                targets: sprite,
                alpha: 0,
                duration: 150,
                onComplete: () => sprite.destroy()
            });
        }

        // 斬擊起點閃光效果
        const charScreen = this.worldToScreen(this.characterX, this.characterY);
        this.showSlashFlashEffect(charScreen.x, charScreen.y, angle);
    }

    // 斬擊閃光效果
    private showSlashFlashEffect(x: number, y: number, angle: number) {
        const graphics = this.add.graphics();
        this.skillGridContainer.add(graphics);
        graphics.setDepth(61);

        const flashSize = this.gameBounds.height * 0.1;

        // 繪製弧形斬擊痕跡
        graphics.lineStyle(4, 0xff3366, 0.8);
        graphics.beginPath();
        graphics.arc(x, y, flashSize, angle - 0.3, angle + 0.3, false);
        graphics.strokePath();

        graphics.lineStyle(2, 0xffffff, 1);
        graphics.beginPath();
        graphics.arc(x, y, flashSize * 0.8, angle - 0.2, angle + 0.2, false);
        graphics.strokePath();

        // 淡出
        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: 100,
            onComplete: () => {
                graphics.destroy();
            }
        });
    }

    // 幻影迭代模式：召喚影分身（最多 3 個，滿 3 個後每個分身啟動跟隨咒言圈）
    private executePhantomIteration(skillLevel: number) {
        const unitSize = this.gameBounds.height / 10;

        // 如果已有 3 個分身，啟動每個分身的跟隨咒言圈
        if (this.phantoms.length >= MainScene.PHANTOM_MAX_COUNT) {
            this.activatePhantomFollowingCurseCircles(skillLevel);
            return;
        }

        // 計算新分身的扇區索引
        const sectorIndex = this.phantoms.length;

        // 根據將有的分身數量計算初始角度
        const totalAfterAdd = this.phantoms.length + 1;
        const sectorAngle = (Math.PI * 2) / totalAfterAdd;
        const baseAngle = sectorIndex * sectorAngle + sectorAngle / 2;

        // 初始位置（玩家周圍 3~5 單位，在分配的扇區內）
        const angleOffset = (Math.random() - 0.5) * sectorAngle * 0.8;
        const angle = baseAngle + angleOffset;
        const distance = (3 + Math.random() * 2) * unitSize; // 3~5 單位
        const startX = this.characterX + Math.cos(angle) * distance;
        const startY = this.characterY + Math.sin(angle) * distance;

        // 創建分身 Sprite（半透明玩家圖像）
        const sprite = this.add.sprite(0, 0, 'char_idle_1');
        sprite.setOrigin(0.5, 1);
        sprite.setScale(this.character.scaleX, this.character.scaleY);
        sprite.setAlpha(0.7);
        sprite.setTint(MainScene.PHANTOM_COLOR); // 初始暗紫色
        sprite.play('char_idle');
        this.skillGridContainer.add(sprite);
        sprite.setDepth(55);

        const phantomId = this.nextPhantomId++;

        // 嘲諷狀態顏色漸變計時器（平時暗紫，嘲諷時緩和閃爍紅橘色）
        let tauntColorPhase = 0; // 嘲諷顏色相位（0~1循環）
        const flashTimer = this.time.addEvent({
            delay: 50, // 50ms 更新一次
            loop: true,
            callback: () => {
                if (this.isPaused || this.popupPaused) return;
                const phantom = this.phantoms.find(p => p.id === phantomId);
                if (!phantom || !phantom.sprite) return;

                if (phantom.isTaunting) {
                    // 嘲諷狀態：緩和閃爍紅橘色
                    tauntColorPhase += 0.03; // 緩慢變化
                    if (tauntColorPhase > 1) tauntColorPhase -= 1;

                    // 使用正弦波在紅色和橘色之間緩和過渡
                    const wave = (Math.sin(tauntColorPhase * Math.PI * 2) + 1) / 2; // 0~1
                    // 紅色 0xff4400 到 橘色 0xff8844
                    const r = 255;
                    const g = Math.floor(68 + wave * 68); // 68~136
                    const b = Math.floor(wave * 68); // 0~68
                    const color = (r << 16) | (g << 8) | b;
                    phantom.sprite.setTint(color);
                } else {
                    // 平時：暗紫色
                    phantom.sprite.setTint(MainScene.PHANTOM_COLOR);
                }
            }
        });

        // 嘲諷週期計時器（每5秒週期，嘲諷2秒，休息3秒）
        const tauntTimer = this.time.addEvent({
            delay: 5000, // 5秒一個週期
            loop: true,
            callback: () => {
                const phantom = this.phantoms.find(p => p.id === phantomId);
                if (!phantom) return;

                // 開始嘲諷
                phantom.isTaunting = true;
                this.updatePhantomTauntTarget();

                // 2秒後結束嘲諷
                this.time.delayedCall(2000, () => {
                    const p = this.phantoms.find(pp => pp.id === phantomId);
                    if (p) {
                        p.isTaunting = false;
                        this.updatePhantomTauntTarget();
                    }
                });
            }
        });

        // 可施放的進階技能（只有技術美術大神，燃燒賽璐珞和像素審判改由咒言圈觸發）
        const availableSkillIds = [
            'advanced_tech_artist'
        ];

        // 每 1 秒施放一個隨機進階技能並移動
        const skillTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                if (this.isPaused || this.popupPaused) return;
                const phantom = this.phantoms.find(p => p.id === phantomId);
                if (!phantom) return;

                // 隨機選一個進階技能施放
                const randomSkillId = availableSkillIds[Math.floor(Math.random() * availableSkillIds.length)];
                this.executePhantomSkillAt(randomSkillId, skillLevel, phantom.x, phantom.y);

                // 施放後設定新的移動目標（朝敵人多的方向）
                this.setPhantomMoveTargetFor(phantom);
            }
        });

        // 加入幻影列表
        const phantom = {
            id: phantomId,
            x: startX,
            y: startY,
            targetX: startX,
            targetY: startY,
            moving: false,
            sprite: sprite,
            flashTimer: flashTimer,
            skillTimer: skillTimer,
            tauntTimer: tauntTimer,
            isTaunting: true, // 初始開始嘲諷
            sectorIndex: sectorIndex,
            lastAfterimageTime: 0
        };
        this.phantoms.push(phantom);

        // 初始嘲諷（由週期計時器控制）
        this.updatePhantomTauntTarget();

        // 重新分配所有分身的扇區
        this.reassignPhantomSectors();

        // 分身出現特效
        this.showPhantomSpawnEffectAt(startX, startY);

        // 設定移動目標
        this.setPhantomMoveTargetFor(phantom);
    }

    // 重新分配所有分身的扇區（當分身數量變化時調用）
    private reassignPhantomSectors() {
        const count = this.phantoms.length;
        for (let i = 0; i < count; i++) {
            this.phantoms[i].sectorIndex = i;
        }
    }

    // 更新嘲諷目標（找到正在嘲諷的分身）
    private updatePhantomTauntTarget() {
        // 找到正在嘲諷的分身
        const tauntingPhantom = this.phantoms.find(p => p.isTaunting);
        if (tauntingPhantom) {
            this.monsterManager.setTauntTarget(tauntingPhantom.x, tauntingPhantom.y, true);
        } else {
            // 沒有正在嘲諷的分身，清除嘲諷目標
            this.monsterManager.clearTauntTarget();
        }
    }

    // 分身在指定位置施放技能
    private executePhantomSkillAt(skillId: string, skillLevel: number, phantomX: number, phantomY: number) {
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const level = equipped ? equipped.level : skillLevel;

        // 傷害單位 = 角色等級 + 技能等級
        const damageUnits = this.currentLevel + level;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 顯示分身施放特效
        this.showPhantomCastEffectAt(phantomX, phantomY);

        switch (skillId) {
            case 'advanced_burning_celluloid':
                this.phantomCastBurningCelluloidAt(baseDamage, phantomX, phantomY, level);
                break;
            case 'advanced_tech_artist':
                this.phantomCastTechArtistAt(baseDamage, phantomX, phantomY);
                break;
            case 'advanced_perfect_pixel':
                this.phantomCastPerfectPixelAt(baseDamage, phantomX, phantomY);
                break;
        }
    }

    // 每個分身啟動跟隨咒言圈（持續 2 秒，每 0.2 秒傷害一次）
    private activatePhantomFollowingCurseCircles(skillLevel: number) {
        const unitSize = this.gameBounds.height / 10;
        const circleRadius = unitSize * 2; // 2 單位半徑

        // 計算傷害
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const level = equipped ? equipped.level : skillLevel;
        const damageUnits = this.currentLevel + level;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 對每個分身啟動跟隨咒言圈
        for (const phantom of this.phantoms) {
            this.createFollowingCurseCircle(phantom.id, circleRadius, baseDamage, level);
        }
    }

    // 創建跟隨分身的咒言圈
    private createFollowingCurseCircle(phantomId: number, _radius: number, damage: number, skillLevel: number) {
        const duration = 2000; // 持續 2 秒
        const damageInterval = 200; // 每 0.2 秒傷害一次
        const unitSize = this.gameBounds.height / 10;

        // 呼吸效果參數（2-3單位範圍快速呼吸）
        const minRadius = unitSize * 2;
        const maxRadius = unitSize * 3;
        let breathPhase = 0;

        // 創建咒言圈 sprite（外圈）
        const circleSprite = this.add.sprite(0, 0, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(circleSprite);
        circleSprite.setDepth(57);
        circleSprite.setTint(MainScene.PHANTOM_COLOR);
        circleSprite.setAlpha(0.6);

        // 內圈亮色
        const innerCircle = this.add.sprite(0, 0, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(innerCircle);
        innerCircle.setDepth(58);
        innerCircle.setTint(0xffffff);
        innerCircle.setAlpha(0.4);

        const startTime = this.time.now;
        let lastDamageTime = 0;

        // 記錄已經被這個咒言圈打過的怪物（避免同一次傷害重複計算）
        const hitMonsterSet = new Set<number>();

        // 更新函數：跟隨分身位置 + 造成傷害
        const updateCircle = () => {
            const elapsed = this.time.now - startTime;
            if (elapsed >= duration) {
                // 結束：丟至另一個分身身上放大消失
                this.transferCurseCircleToAnotherPhantom(phantomId, circleSprite, innerCircle);
                return;
            }

            // 找到對應的分身
            const phantom = this.phantoms.find(p => p.id === phantomId);
            if (!phantom) {
                // 分身不存在，銷毀咒言圈
                circleSprite.destroy();
                innerCircle.destroy();
                return;
            }

            // 快速呼吸效果（2-3單位範圍）
            breathPhase += 0.15; // 快速呼吸
            const breathWave = (Math.sin(breathPhase) + 1) / 2; // 0~1
            const currentRadius = minRadius + (maxRadius - minRadius) * breathWave;
            const scale = (currentRadius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
            circleSprite.setScale(scale);
            innerCircle.setScale(scale * 0.6);

            // 更新位置（跟隨分身）
            const screen = this.worldToScreen(phantom.x, phantom.y);
            circleSprite.setPosition(screen.x, screen.y);
            innerCircle.setPosition(screen.x, screen.y);

            // 旋轉效果（高速）
            circleSprite.rotation += 0.3;
            innerCircle.rotation -= 0.4;

            // 每 0.2 秒造成傷害（使用當前呼吸半徑）
            if (elapsed - lastDamageTime >= damageInterval) {
                lastDamageTime = elapsed;
                hitMonsterSet.clear(); // 每次傷害清空，允許重複命中

                // 檢測範圍內的怪物
                const monsters = this.monsterManager.getMonsters();
                const hitMonsters: number[] = [];

                for (const monster of monsters) {
                    const dx = monster.x - phantom.x;
                    const dy = monster.y - phantom.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

                    if (dist - monsterRadius <= currentRadius) {
                        hitMonsters.push(monster.id);
                    }
                }

                if (hitMonsters.length > 0) {
                    // 咒言圈傷害減半
                    const halfDamage = Math.floor(damage * 0.5);
                    const { damage: finalDamage } = this.skillManager.calculateFinalDamageWithCrit(halfDamage, this.currentLevel);
                    const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                    if (result.totalExp > 0) this.addExp(result.totalExp);

                    // 燃燒 DOT 機率觸發（與燃燒賽璐珞相同：10% + 每級 1%）
                    const burnChance = 0.10 + skillLevel * 0.01;
                    const burnDamage = Math.floor(damage * 0.2);
                    const burnDuration = 5000;
                    const monstersToBurn: number[] = [];

                    for (const monsterId of hitMonsters) {
                        if (Math.random() < burnChance) {
                            monstersToBurn.push(monsterId);
                        }
                    }

                    if (monstersToBurn.length > 0) {
                        this.monsterManager.burnMonsters(monstersToBurn, burnDuration, burnDamage);
                    }

                    // 命中特效（咒言圈打擊閃光）
                    for (const monsterId of hitMonsters) {
                        const monster = monsters.find(m => m.id === monsterId);
                        if (monster) {
                            this.showHitSparkEffect(monster.x, monster.y, MainScene.PHANTOM_COLOR);
                            // 額外咒言圈特效：小圓環擴散
                            this.showCurseCircleHitEffect(monster.x, monster.y);
                        }
                    }
                }
            }

            // 繼續更新
            this.time.delayedCall(16, updateCircle);
        };

        // 開始更新
        updateCircle();
    }

    // 咒言圈結束時轉移到另一個分身並放大消失
    private transferCurseCircleToAnotherPhantom(
        currentPhantomId: number,
        circleSprite: Phaser.GameObjects.Sprite,
        innerCircle: Phaser.GameObjects.Sprite
    ) {
        // 找到另一個分身（不是當前的）
        const otherPhantoms = this.phantoms.filter(p => p.id !== currentPhantomId);

        if (otherPhantoms.length > 0) {
            // 隨機選一個其他分身
            const targetPhantom = otherPhantoms[Math.floor(Math.random() * otherPhantoms.length)];
            const targetScreen = this.worldToScreen(targetPhantom.x, targetPhantom.y);

            // 當前縮放
            const currentScale = circleSprite.scaleX;

            // 飛向另一個分身
            this.tweens.add({
                targets: [circleSprite, innerCircle],
                x: targetScreen.x,
                y: targetScreen.y,
                duration: 300,
                ease: 'Quad.easeIn',
                onUpdate: () => {
                    // 飛行過程中繼續旋轉
                    circleSprite.rotation += 0.3;
                    innerCircle.rotation -= 0.4;
                },
                onComplete: () => {
                    // 到達後放大消失
                    this.tweens.add({
                        targets: circleSprite,
                        scale: currentScale * 2.5,
                        alpha: 0,
                        duration: 300,
                        ease: 'Quad.easeOut',
                        onComplete: () => {
                            circleSprite.destroy();
                        }
                    });
                    this.tweens.add({
                        targets: innerCircle,
                        scale: currentScale * 0.6 * 2.5,
                        alpha: 0,
                        duration: 300,
                        ease: 'Quad.easeOut',
                        onComplete: () => {
                            innerCircle.destroy();
                        }
                    });
                }
            });
        } else {
            // 沒有其他分身，直接在原地放大消失
            const currentScale = circleSprite.scaleX;
            this.tweens.add({
                targets: circleSprite,
                scale: currentScale * 2,
                alpha: 0,
                duration: 300,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    circleSprite.destroy();
                }
            });
            this.tweens.add({
                targets: innerCircle,
                scale: currentScale * 0.6 * 2,
                alpha: 0,
                duration: 300,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    innerCircle.destroy();
                }
            });
        }
    }

    // 咒言圈命中特效（小圓環擴散）
    private showCurseCircleHitEffect(worldX: number, worldY: number) {
        const screen = this.worldToScreen(worldX, worldY);
        const unitSize = this.gameBounds.height / 10;

        // 創建小圓環
        const ring = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_CIRCLE_LINE);
        this.skillGridContainer.add(ring);
        ring.setDepth(60);
        ring.setTint(MainScene.PHANTOM_COLOR_LIGHT);
        ring.setAlpha(0.8);
        ring.setScale(0.1);

        // 擴散動畫
        this.tweens.add({
            targets: ring,
            scale: (unitSize * 0.8) / MainScene.EFFECT_TEXTURE_SIZE,
            alpha: 0,
            duration: 200,
            ease: 'Quad.easeOut',
            onComplete: () => {
                ring.destroy();
            }
        });
    }

    // 發射咒言圓圈攻擊（從本尊飛向所有分身）- 保留但不再使用
    private launchPhantomCurseCircles(skillLevel: number) {
        const unitSize = this.gameBounds.height / 10;
        const startRadius = unitSize * 0.5; // 起始半徑 0.5 單位
        const endRadius = unitSize * 4;     // 結束半徑 4 單位

        // 計算傷害
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const level = equipped ? equipped.level : skillLevel;
        const damageUnits = this.currentLevel + level;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 固定發射角度（依據分身數量）
        const phantomCount = this.phantoms.length;
        let launchAngles: number[] = [];
        if (phantomCount === 1) {
            launchAngles = [0]; // 1隻：0度
        } else if (phantomCount === 2) {
            launchAngles = [0, Math.PI]; // 2隻：0度、180度
        } else {
            launchAngles = [0, Math.PI * 2 / 3, Math.PI * 4 / 3]; // 3隻：0度、120度、240度
        }

        // 收集分身位置作為追蹤目標
        const phantomPositions = this.phantoms.map(p => ({ x: p.x, y: p.y }));

        // 對每個固定角度發射咒言圓圈，追蹤對應分身
        for (let i = 0; i < launchAngles.length; i++) {
            const angle = launchAngles[i];
            const targetPos = phantomPositions[i] || phantomPositions[0]; // fallback
            this.launchSingleCurseCircle(angle, targetPos.x, targetPos.y, startRadius, endRadius, baseDamage);
        }
        // 分身保持存在，持續嘲諷
    }

    // 發射單個咒言圓圈（曲線追蹤）
    private launchSingleCurseCircle(launchAngle: number, targetX: number, targetY: number, startRadius: number, endRadius: number, damage: number) {
        const unitSize = this.gameBounds.height / 10;

        // 初始方向（固定角度射出）
        let dirX = Math.cos(launchAngle);
        let dirY = Math.sin(launchAngle);

        // 飛行參數
        const speed = unitSize * 8; // 每秒飛行8單位
        const maxFlyDuration = 4000; // 最長 4 秒（安全上限）
        const fadeDuration = 600; // 到達後淡出時間
        const rotationSpeed = Math.PI * 8; // 高速旋轉
        const arrivalThreshold = unitSize * 0.5; // 到達判定距離（0.5 單位）

        // 創建咒言圓圈 sprite（使用 CIRCLE 紋理）
        const startScreen = this.worldToScreen(this.characterX, this.characterY);

        // 外圈（主色）
        const circleSprite = this.add.sprite(startScreen.x, startScreen.y, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(circleSprite);
        circleSprite.setDepth(58);
        circleSprite.setTint(MainScene.PHANTOM_COLOR);
        circleSprite.setAlpha(0.8);

        // 內圈亮色
        const innerCircle = this.add.sprite(startScreen.x, startScreen.y, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(innerCircle);
        innerCircle.setDepth(59);
        innerCircle.setTint(MainScene.PHANTOM_COLOR_LIGHT);
        innerCircle.setAlpha(0.9);

        // 設定初始大小
        const startScale = (startRadius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        circleSprite.setScale(startScale);
        innerCircle.setScale(startScale * 0.7);

        // 追蹤已擊中的怪物
        const hitMonsterIds = new Set<number>();

        // 當前世界位置
        let currentWorldX = this.characterX;
        let currentWorldY = this.characterY;

        // 狀態追蹤
        let elapsed = 0;
        let hasArrived = false; // 是否已到達目標
        let fadeElapsed = 0; // 淡出經過時間
        let currentRadius = startRadius;

        const updateEvent = this.time.addEvent({
            delay: 16, // 約 60fps
            loop: true,
            callback: () => {
                elapsed += 16;
                const dt = 16 / 1000; // 秒

                // 計算到目標的距離
                const toTargetX = targetX - currentWorldX;
                const toTargetY = targetY - currentWorldY;
                const toTargetDist = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);

                // 檢查是否到達目標
                if (!hasArrived && toTargetDist <= arrivalThreshold) {
                    hasArrived = true;
                }

                // 飛行階段（未到達時）
                if (!hasArrived) {
                    const flyProgress = Math.min(1, elapsed / maxFlyDuration);

                    if (toTargetDist > 0.1) {
                        const targetDirX = toTargetX / toTargetDist;
                        const targetDirY = toTargetY / toTargetDist;

                        // 追蹤強度隨進度增加（前0.3秒直線，之後開始追蹤）
                        const trackingStrength = flyProgress < 0.08 ? 0 : Math.min(1, (flyProgress - 0.08) * 4);
                        const turnRate = 4 * trackingStrength; // 轉向速率

                        // 平滑轉向
                        dirX += (targetDirX - dirX) * turnRate * dt;
                        dirY += (targetDirY - dirY) * turnRate * dt;

                        // 正規化方向
                        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
                        if (dirLen > 0) {
                            dirX /= dirLen;
                            dirY /= dirLen;
                        }
                    }

                    // 更新位置
                    currentWorldX += dirX * speed * dt;
                    currentWorldY += dirY * speed * dt;

                    // 放大（飛行中緩慢放大到一半）
                    currentRadius = startRadius + (endRadius - startRadius) * 0.5 * flyProgress;

                    // 超時強制進入淡出
                    if (flyProgress >= 1) {
                        hasArrived = true;
                    }
                }

                // 淡出階段（到達後）
                if (hasArrived) {
                    fadeElapsed += 16;
                    const fadeProgress = Math.min(1, fadeElapsed / fadeDuration);

                    // 到達後快速放大到最終尺寸
                    currentRadius = startRadius + (endRadius - startRadius) * (0.5 + 0.5 * fadeProgress);

                    // 淡出
                    const alphaMultiplier = 1 - fadeProgress;
                    circleSprite.setAlpha(0.8 * alphaMultiplier);
                    innerCircle.setAlpha(0.9 * alphaMultiplier);

                    // 結束
                    if (fadeProgress >= 1) {
                        updateEvent.destroy();
                        circleSprite.destroy();
                        innerCircle.destroy();
                        return;
                    }
                }

                // 更新螢幕位置
                const currentScreen = this.worldToScreen(currentWorldX, currentWorldY);
                circleSprite.setPosition(currentScreen.x, currentScreen.y);
                innerCircle.setPosition(currentScreen.x, currentScreen.y);

                // 更新尺寸
                const currentScale = (currentRadius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
                circleSprite.setScale(currentScale);
                innerCircle.setScale(currentScale * 0.7);

                // 高速旋轉
                const rotation = (elapsed / 1000) * rotationSpeed;
                circleSprite.setRotation(rotation);
                innerCircle.setRotation(-rotation * 0.5);

                // 碰撞檢測
                const monsters = this.monsterManager.getMonsters();
                for (const monster of monsters) {
                    if (hitMonsterIds.has(monster.id)) continue;

                    const mdx = monster.x - currentWorldX;
                    const mdy = monster.y - currentWorldY;
                    const monsterDist = Math.sqrt(mdx * mdx + mdy * mdy);
                    const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

                    if (monsterDist <= currentRadius + monsterRadius) {
                        hitMonsterIds.add(monster.id);
                        this.monsterManager.damageMonster(monster.id, damage);
                        // 擊中特效
                        const hitScreen = this.worldToScreen(monster.x, monster.y);
                        this.showExplosionSparkEffect(hitScreen.x, hitScreen.y, MainScene.PHANTOM_COLOR_LIGHT, 0.6);
                    }
                }
            }
        });
    }

    // 清除所有分身
    private dismissAllPhantoms(withExplosion: boolean = false) {
        // 複製列表避免迭代中修改
        const phantomIds = this.phantoms.map(p => p.id);
        for (const id of phantomIds) {
            this.dismissPhantomById(id, withExplosion);
        }
    }

    // 分身咒言爆炸效果
    private showPhantomCurseExplosion(worldX: number, worldY: number) {
        const unitSize = this.gameBounds.height / 10;
        const explosionRadius = unitSize * 2; // 2單位範圍爆炸

        // 計算傷害
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const level = equipped?.level ?? 1;
        const damageUnits = this.currentLevel + level;
        const damage = MainScene.DAMAGE_UNIT * damageUnits;

        // 視覺效果：擴散的咒言圓圈
        const screen = this.worldToScreen(worldX, worldY);

        // 外圈
        const outerCircle = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(outerCircle);
        outerCircle.setDepth(60);
        outerCircle.setTint(MainScene.PHANTOM_COLOR);
        outerCircle.setAlpha(0.9);
        outerCircle.setScale(0.1);

        // 內圈
        const innerCircle = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(innerCircle);
        innerCircle.setDepth(61);
        innerCircle.setTint(MainScene.PHANTOM_COLOR_LIGHT);
        innerCircle.setAlpha(1);
        innerCircle.setScale(0.05);

        // 擴散動畫
        const targetScale = (explosionRadius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        this.tweens.add({
            targets: outerCircle,
            scaleX: targetScale,
            scaleY: targetScale,
            alpha: 0,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => outerCircle.destroy()
        });
        this.tweens.add({
            targets: innerCircle,
            scaleX: targetScale * 0.7,
            scaleY: targetScale * 0.7,
            alpha: 0,
            duration: 350,
            ease: 'Quad.easeOut',
            onComplete: () => innerCircle.destroy()
        });

        // 碰撞檢測：範圍內的怪物受傷
        const monsters = this.monsterManager.getMonsters();
        for (const monster of monsters) {
            const dx = monster.x - worldX;
            const dy = monster.y - worldY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

            if (dist <= explosionRadius + monsterRadius) {
                this.monsterManager.damageMonster(monster.id, damage);
            }
        }
    }

    // 設定指定幻影的移動目標（在分配的扇區內朝敵人多的方向移動）
    private setPhantomMoveTargetFor(phantom: typeof this.phantoms[0]) {
        const unitSize = this.gameBounds.height / 10;
        const phantomCount = this.phantoms.length;

        // 計算這個分身負責的扇區範圍
        const sectorAngle = (Math.PI * 2) / phantomCount;
        const sectorStart = phantom.sectorIndex * sectorAngle;
        const sectorEnd = sectorStart + sectorAngle;
        const sectorCenter = sectorStart + sectorAngle / 2;

        // 距離範圍：3~5 單位
        const minDist = 3 * unitSize;
        const maxDist = 5 * unitSize;

        // 找到扇區內的所有怪物
        const monsters = this.monsterManager.getMonsters();
        let enemyWeightedAngle = sectorCenter;
        let totalWeight = 0;

        for (const monster of monsters) {
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let monsterAngle = Math.atan2(dy, dx);

            // 正規化角度到 0~2π
            if (monsterAngle < 0) monsterAngle += Math.PI * 2;

            // 檢查怪物是否在這個扇區內
            let inSector = false;
            if (sectorEnd <= Math.PI * 2) {
                inSector = monsterAngle >= sectorStart && monsterAngle < sectorEnd;
            } else {
                // 扇區跨越 0 度
                inSector = monsterAngle >= sectorStart || monsterAngle < (sectorEnd - Math.PI * 2);
            }

            // 如果在扇區內且在合理距離內（10 單位內），加入權重計算
            if (inSector && dist < 10 * unitSize) {
                // 距離越近權重越高
                const weight = 1 / (1 + dist / unitSize);
                enemyWeightedAngle += monsterAngle * weight;
                totalWeight += weight;
            }
        }

        // 計算目標角度
        let targetAngle: number;
        if (totalWeight > 0) {
            // 有敵人，朝敵人加權平均方向移動
            targetAngle = enemyWeightedAngle / (1 + totalWeight);
        } else {
            // 沒有敵人，在扇區內隨機移動
            targetAngle = sectorStart + Math.random() * sectorAngle;
        }

        // 在扇區範圍內加入一些隨機偏移
        const angleVariance = sectorAngle * 0.3;
        targetAngle += (Math.random() - 0.5) * angleVariance;

        // 確保在扇區範圍內
        while (targetAngle < sectorStart) targetAngle += sectorAngle;
        while (targetAngle >= sectorEnd) targetAngle -= sectorAngle;

        // 計算目標距離（3~5 單位）
        const targetDist = minDist + Math.random() * (maxDist - minDist);

        // 設定目標位置（相對於玩家當前位置）
        phantom.targetX = this.characterX + Math.cos(targetAngle) * targetDist;
        phantom.targetY = this.characterY + Math.sin(targetAngle) * targetDist;
        phantom.moving = true;

        // 播放跑步動畫
        if (phantom.sprite && phantom.sprite.anims) {
            phantom.sprite.play('char_run', true);
        }
    }

    // 分身版燃燒的賽璐珞（指定座標，範圍 3 單位）- 保留供其他用途
    private phantomCastBurningCelluloidAt(baseDamage: number, phantomX: number, phantomY: number, skillLevel: number) {
        const range = this.gameBounds.height * 0.3; // 3 單位（本尊 7 單位）
        const halfAngleDeg = 15; // 30 度扇形
        const halfAngle = halfAngleDeg * Math.PI / 180;
        const color = MainScene.PHANTOM_COLOR; // 分身暗紫色

        // 旋轉一圈
        const rotationSteps = 12;
        const stepDelay = 80;

        for (let i = 0; i < rotationSteps; i++) {
            this.time.delayedCall(i * stepDelay, () => {
                const targetAngle = (i / rotationSteps) * Math.PI * 2;

                // 扇形範圍內的怪物
                const monsters = this.monsterManager.getMonsters();
                const hitMonsters: number[] = [];

                for (const monster of monsters) {
                    const dx = monster.x - phantomX;
                    const dy = monster.y - phantomY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= range) {
                        const monsterAngle = Math.atan2(dy, dx);
                        let angleDiff = Math.abs(monsterAngle - targetAngle);
                        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

                        if (angleDiff <= halfAngle) {
                            hitMonsters.push(monster.id);
                        }
                    }
                }

                if (hitMonsters.length > 0) {
                    const { damage: finalDamage } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
                    const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                    if (result.totalExp > 0) this.addExp(result.totalExp);

                    // 燃燒機率：10% + 每級 1%（與本尊相同）
                    const burnChance = 0.10 + skillLevel * 0.01;
                    const burnDamage = Math.floor(baseDamage * 0.2);
                    const burnDuration = 5000;
                    const monstersToBurn: number[] = [];

                    for (const monsterId of hitMonsters) {
                        if (Math.random() < burnChance) {
                            monstersToBurn.push(monsterId);
                        }
                    }

                    if (monstersToBurn.length > 0) {
                        this.monsterManager.burnMonsters(monstersToBurn, burnDuration, burnDamage);
                    }
                }

                // 視覺效果
                this.flashSkillEffectSector(phantomX, phantomY, range, targetAngle, halfAngleDeg, color);
            });
        }
    }

    // 分身版技術美術大神（指定座標，每次 2 發，範圍縮小）
    private phantomCastTechArtistAt(baseDamage: number, phantomX: number, phantomY: number) {
        const unitSize = this.gameBounds.height / 10;
        const range = unitSize * 3;          // 縮小：本尊 5 單位
        const explosionRadius = unitSize * 2; // 縮小：本尊 3 單位
        const beamCount = 2; // 分身版每次 2 發

        for (let b = 0; b < beamCount; b++) {
            // 每發稍微延遲以區分視覺
            this.time.delayedCall(b * 100, () => {
                // 隨機位置
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * range;
                const targetX = phantomX + Math.cos(angle) * dist;
                const targetY = phantomY + Math.sin(angle) * dist;

                // 計算光束角度（用於爆炸線條方向）- 反彈效果：與攻擊方向相反
                const beamOffsetX = (Math.random() - 0.5) * 2 * unitSize;
                const targetScreen = this.worldToScreen(targetX, targetY);
                const beamAngle = -Math.PI / 2 - Math.atan2(beamOffsetX, targetScreen.y + 50);

                // 光線效果
                this.showLightBeamEffect(targetX, targetY, explosionRadius, MainScene.PHANTOM_COLOR, beamOffsetX);

                // 延遲後爆炸
                this.time.delayedCall(150, () => {
                    const monsters = this.monsterManager.getMonsters();
                    const hitMonsters: number[] = [];

                    for (const monster of monsters) {
                        const dx = monster.x - targetX;
                        const dy = monster.y - targetY;
                        const distPixels = Math.sqrt(dx * dx + dy * dy);
                        // 轉換成世界單位
                        const distUnits = distPixels / unitSize;
                        const monsterRadiusUnits = monster.definition.size * 0.5;

                        if (distUnits - monsterRadiusUnits <= 2) { // 2 單位爆炸範圍（本尊 3）
                            hitMonsters.push(monster.id);
                        }
                    }

                    if (hitMonsters.length > 0) {
                        // 先暈眩，再造成傷害
                        this.monsterManager.stunMonsters(hitMonsters, 1000);

                        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
                        const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                        if (result.totalExp > 0) this.addExp(result.totalExp);

                        this.showExplosionEffect(targetX, targetY, explosionRadius, MainScene.PHANTOM_COLOR, beamAngle, isCrit);
                    } else {
                        this.showExplosionEffect(targetX, targetY, explosionRadius, MainScene.PHANTOM_COLOR, beamAngle);
                    }
                });
            });
        }
    }

    // 分身版完美像素審判（指定座標，範圍縮小）
    private phantomCastPerfectPixelAt(baseDamage: number, phantomX: number, phantomY: number) {
        const unitSize = this.gameBounds.height / 10;
        const explosionRadius = unitSize * 2; // 縮小：本尊 3 單位

        // 4 個焦點位置（分身位置 ±1.5 單位，本尊 ±2）
        const offset = unitSize * 1.5;
        const focusPoints = [
            { x: phantomX - offset, y: phantomY - offset },  // 左上
            { x: phantomX + offset, y: phantomY - offset },  // 右上
            { x: phantomX - offset, y: phantomY + offset },  // 左下
            { x: phantomX + offset, y: phantomY + offset }   // 右下
        ];

        // 隨機順序爆炸
        const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);

        order.forEach((index, i) => {
            this.time.delayedCall(i * 250, () => {
                const point = focusPoints[index];

                const monsters = this.monsterManager.getMonsters();
                const hitMonsters: number[] = [];

                for (const monster of monsters) {
                    const dx = monster.x - point.x;
                    const dy = monster.y - point.y;
                    const distPixels = Math.sqrt(dx * dx + dy * dy);
                    // 轉換成世界單位
                    const distUnits = distPixels / unitSize;
                    const monsterRadiusUnits = monster.definition.size * 0.5;

                    if (distUnits - monsterRadiusUnits <= 2) { // 2 單位爆炸範圍（本尊 3）
                        hitMonsters.push(monster.id);
                    }
                }

                if (hitMonsters.length > 0) {
                    // 先暈眩效果（1 秒），再造成傷害
                    this.monsterManager.stunMonsters(hitMonsters, 1000);

                    const { damage: finalDamage } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
                    const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                    if (result.totalExp > 0) this.addExp(result.totalExp);
                        }

                // 顯示完整爆炸視覺效果（暗紫色版）
                const screenPos = this.worldToScreen(point.x, point.y);
                this.showPhantomPerfectPixelExplosion(screenPos.x, screenPos.y, explosionRadius);

                // 被炸到的怪物噴出爆炸火花（暗紫色）
                const monstersForSpark = this.monsterManager.getMonsters();
                for (const monsterId of hitMonsters) {
                    const monster = monstersForSpark.find(m => m.id === monsterId);
                    if (monster) {
                        const sparkPos = this.worldToScreen(monster.x, monster.y);
                        this.showExplosionSparkEffect(sparkPos.x, sparkPos.y, MainScene.PHANTOM_COLOR_LIGHT, 0.8);
                    }
                }
            });
        });
    }

    // 分身版完美像素爆炸效果（暗紫色）
    private showPhantomPerfectPixelExplosion(x: number, y: number, radius: number) {
        const allSprites: Phaser.GameObjects.Sprite[] = [];
        const lineWidth = 20; // 稍細
        const flashLength = radius * 1.0; // 稍短

        // 爆炸核心（暗紫色）- 使用 sector_360 紋理
        const coreSprite = this.add.sprite(x, y, MainScene.TEXTURE_SECTOR_360);
        this.uiContainer.add(coreSprite);
        coreSprite.setDepth(1006);
        coreSprite.setTint(MainScene.PHANTOM_COLOR);
        coreSprite.setScale((radius * 0.5) / MainScene.EFFECT_TEXTURE_SIZE);
        coreSprite.setAlpha(0.9);
        allSprites.push(coreSprite);

        // 爆炸光環 - 使用 circle_line 紋理
        const ringSprite = this.add.sprite(x, y, MainScene.TEXTURE_CIRCLE_LINE);
        this.uiContainer.add(ringSprite);
        ringSprite.setDepth(1005);
        ringSprite.setTint(MainScene.PHANTOM_COLOR_LIGHT);
        ringSprite.setScale((radius * 0.8) / MainScene.EFFECT_TEXTURE_SIZE);
        ringSprite.setAlpha(0.7);
        allSprites.push(ringSprite);

        // 外圈光暈 - 使用 circle_line 紋理（更大更透明）
        const outerSprite = this.add.sprite(x, y, MainScene.TEXTURE_CIRCLE_LINE);
        this.uiContainer.add(outerSprite);
        outerSprite.setDepth(1004);
        outerSprite.setTint(MainScene.PHANTOM_COLOR_LIGHT);
        outerSprite.setScale((radius * 1.5) / MainScene.EFFECT_TEXTURE_SIZE);
        outerSprite.setAlpha(0.35);
        allSprites.push(outerSprite);

        // 十字閃光 - 水平線
        const hLine = this.add.sprite(x, y, MainScene.TEXTURE_LINE);
        this.uiContainer.add(hLine);
        hLine.setDepth(1007);
        hLine.setTint(MainScene.PHANTOM_COLOR_LIGHT);
        hLine.setRotation(0);
        hLine.setScale((flashLength * 1.8) / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
        hLine.setAlpha(0.7);
        allSprites.push(hLine);

        // 十字閃光 - 垂直線
        const vLine = this.add.sprite(x, y, MainScene.TEXTURE_LINE);
        this.uiContainer.add(vLine);
        vLine.setDepth(1007);
        vLine.setTint(MainScene.PHANTOM_COLOR_LIGHT);
        vLine.setRotation(Math.PI / 2);
        vLine.setScale((flashLength * 1.8) / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
        vLine.setAlpha(0.7);
        allSprites.push(vLine);

        // 淡出動畫
        for (const sprite of allSprites) {
            this.tweens.add({
                targets: sprite,
                alpha: 0,
                duration: 400,
                ease: 'Power2',
                onComplete: () => sprite.destroy()
            });
        }

        // 擴散圓環動畫 - 使用 sector_360 紋理
        const expandSprite = this.add.sprite(x, y, MainScene.TEXTURE_SECTOR_360);
        this.uiContainer.add(expandSprite);
        expandSprite.setDepth(1005);
        expandSprite.setTint(MainScene.PHANTOM_COLOR);
        const startScale = (radius * 0.5) / MainScene.EFFECT_TEXTURE_SIZE;
        const endScale = (radius * 1.5) / MainScene.EFFECT_TEXTURE_SIZE;
        expandSprite.setScale(startScale);
        expandSprite.setAlpha(0.8);

        this.tweens.add({
            targets: expandSprite,
            scale: endScale,
            alpha: 0,
            duration: 250,
            ease: 'Power2',
            onComplete: () => expandSprite.destroy()
        });
    }

    // 分身版爆發的影視特效（指定座標）
    private phantomCastVfxBurstAt(baseDamage: number, phantomX: number, phantomY: number) {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 找最近的 5 隻怪物
        const nearestMonsters = monsters
            .map(m => {
                const dx = m.x - phantomX;
                const dy = m.y - phantomY;
                return { monster: m, dist: Math.sqrt(dx * dx + dy * dy) };
            })
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 5);

        // 發射 5 枚導彈
        for (let i = 0; i < Math.min(5, nearestMonsters.length); i++) {
            this.time.delayedCall(i * 100, () => {
                const target = nearestMonsters[i % nearestMonsters.length].monster;
                this.launchPhantomMissileAt(target.id, baseDamage, phantomX, phantomY);
            });
        }
    }

    // 分身版導彈（指定座標）
    private launchPhantomMissileAt(targetId: number, baseDamage: number, phantomX: number, phantomY: number) {
        const unitSize = this.gameBounds.height / 10;
        const flyOutDist = this.gameBounds.height * 0.15;

        const missile = this.add.graphics();
        this.skillGridContainer.add(missile);
        missile.setDepth(100);

        const phantomScreen = this.worldToScreen(phantomX, phantomY);

        const state = {
            screenX: phantomScreen.x,
            screenY: phantomScreen.y,
            rotation: 0
        };

        const missileWidth = unitSize * 0.05;
        let missileLength = unitSize * 0.25;

        const drawMissile = () => {
            missile.clear();
            missile.save();
            missile.translateCanvas(state.screenX, state.screenY);
            missile.rotateCanvas(state.rotation);

            const halfLen = missileLength / 2;
            // 暗紫色漸層（比本尊更暗）
            const colors = [0x331188, 0x442299, 0x5522aa, 0x6633bb, 0x7744cc, 0x8855dd];
            const segmentLen = missileLength / 6;

            for (let i = 0; i < 6; i++) {
                missile.fillStyle(colors[i], 0.8);
                missile.fillRect(-halfLen + i * segmentLen, -missileWidth / 2, segmentLen + 1, missileWidth);
            }
            missile.restore();
        };

        const monsters = this.monsterManager.getMonsters();
        const target = monsters.find(m => m.id === targetId);
        if (!target) {
            missile.destroy();
            return;
        }

        const randomAngle = Math.random() * Math.PI * 2;
        state.rotation = randomAngle;
        const flyOutScreenX = state.screenX + Math.cos(randomAngle) * flyOutDist;
        const flyOutScreenY = state.screenY + Math.sin(randomAngle) * flyOutDist;

        drawMissile();

        this.tweens.add({
            targets: state,
            screenX: flyOutScreenX,
            screenY: flyOutScreenY,
            duration: 300,
            ease: 'Quad.easeOut',
            onUpdate: drawMissile,
            onComplete: () => {
                const targetScreen = this.worldToScreen(target.x, target.y);
                const dx = targetScreen.x - state.screenX;
                const dy = targetScreen.y - state.screenY;
                state.rotation = Math.atan2(dy, dx);
                missileLength = unitSize * 1.5;

                this.tweens.add({
                    targets: state,
                    screenX: targetScreen.x,
                    screenY: targetScreen.y,
                    duration: 400,
                    ease: 'Linear',
                    onUpdate: drawMissile,
                    onComplete: () => {
                        const currentMonsters = this.monsterManager.getMonsters();
                        const hitTarget = currentMonsters.find(m => m.id === targetId);

                        if (hitTarget) {
                            const { damage: finalDamage } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
                            const result = this.monsterManager.damageMonsters([hitTarget.id], finalDamage);
                            if (result.totalExp > 0) this.addExp(result.totalExp);
                                        }

                        this.showMissileExplosion(state.screenX, state.screenY, false);
                        missile.destroy();
                    }
                });
            }
        });
    }

    // 分身版靈魂斬擊（指定座標）- 保留供其他用途
    private phantomCastSoulSlashAt(baseDamage: number, phantomX: number, phantomY: number) {
        // 找最近的敵人
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        let nearestMonster = monsters[0];
        let nearestDist = Infinity;
        for (const monster of monsters) {
            const dx = monster.x - phantomX;
            const dy = monster.y - phantomY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestMonster = monster;
            }
        }

        // 計算斬擊方向（從分身指向最近敵人）
        const dx = nearestMonster.x - phantomX;
        const dy = nearestMonster.y - phantomY;
        const angle = Math.atan2(dy, dx);

        // 斬擊線：貫穿全螢幕（前後延伸）
        const maxDist = Math.max(this.gameBounds.width, this.gameBounds.height) * 2;
        const startX = phantomX - Math.cos(angle) * maxDist;
        const startY = phantomY - Math.sin(angle) * maxDist;
        const endX = phantomX + Math.cos(angle) * maxDist;
        const endY = phantomY + Math.sin(angle) * maxDist;

        // 繪製斬擊線視覺效果（分身用紫色）
        this.drawPhantomSoulSlashEffect(startX, startY, endX, endY, angle, phantomX, phantomY);

        // 檢測斬擊線上的所有怪物
        const hitMonsters: number[] = [];
        const hitPositions: { x: number; y: number }[] = [];
        const slashWidth = this.gameBounds.height * 0.05; // 0.5 單位寬度

        for (const monster of monsters) {
            const distToLine = this.pointToLineDistance(
                monster.x, monster.y,
                startX, startY, endX, endY
            );
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

            if (distToLine <= slashWidth + monsterRadius) {
                hitMonsters.push(monster.id);
                hitPositions.push({ x: monster.x, y: monster.y });
            }
        }

        // 造成傷害
        if (hitMonsters.length > 0) {
            const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.addExp(result.totalExp);
        }
    }

    // 分身版靈魂斬擊視覺效果（暗紫色）
    private drawPhantomSoulSlashEffect(startX: number, startY: number, endX: number, endY: number, angle: number, phantomX: number, phantomY: number) {
        const screenStart = this.worldToScreen(startX, startY);
        const screenEnd = this.worldToScreen(endX, endY);

        const graphics = this.add.graphics();
        this.skillGridContainer.add(graphics);
        graphics.setDepth(60);

        // 斬擊線（暗紫色）
        const slashColor = MainScene.PHANTOM_COLOR;

        // 外層光暈
        graphics.lineStyle(12, slashColor, 0.3);
        graphics.beginPath();
        graphics.moveTo(screenStart.x, screenStart.y);
        graphics.lineTo(screenEnd.x, screenEnd.y);
        graphics.strokePath();

        // 中層
        graphics.lineStyle(6, slashColor, 0.6);
        graphics.beginPath();
        graphics.moveTo(screenStart.x, screenStart.y);
        graphics.lineTo(screenEnd.x, screenEnd.y);
        graphics.strokePath();

        // 核心線
        graphics.lineStyle(2, 0xffffff, 0.9);
        graphics.beginPath();
        graphics.moveTo(screenStart.x, screenStart.y);
        graphics.lineTo(screenEnd.x, screenEnd.y);
        graphics.strokePath();

        // 淡出效果
        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: 150,
            onComplete: () => {
                graphics.destroy();
            }
        });

        // 分身位置閃光效果
        const phantomScreen = this.worldToScreen(phantomX, phantomY);
        this.showPhantomSlashFlashEffect(phantomScreen.x, phantomScreen.y, angle);
    }

    // 分身斬擊閃光效果（暗紫色）
    private showPhantomSlashFlashEffect(x: number, y: number, angle: number) {
        const graphics = this.add.graphics();
        this.skillGridContainer.add(graphics);
        graphics.setDepth(61);

        const flashSize = this.gameBounds.height * 0.1;

        graphics.lineStyle(4, MainScene.PHANTOM_COLOR, 0.8);
        graphics.beginPath();
        graphics.arc(x, y, flashSize, angle - 0.3, angle + 0.3, false);
        graphics.strokePath();

        graphics.lineStyle(2, 0xffffff, 1);
        graphics.beginPath();
        graphics.arc(x, y, flashSize * 0.8, angle - 0.2, angle + 0.2, false);
        graphics.strokePath();

        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: 100,
            onComplete: () => {
                graphics.destroy();
            }
        });
    }

    // 計算點到線段的最短距離
    private pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;

        if (lengthSquared === 0) {
            // 線段長度為 0，直接計算點到點距離
            return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
        }

        // 計算投影比例 t
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));

        // 計算投影點
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        // 返回點到投影點的距離
        return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    }

    // 分身出現特效（指定座標）
    private showPhantomSpawnEffectAt(phantomX: number, phantomY: number) {
        const screen = this.worldToScreen(phantomX, phantomY);
        const unitSize = this.gameBounds.height / 10;
        const targetSize = unitSize * 0.5; // 0.5 單位

        // 使用 LINE 紋理創建光點
        const lineSprite = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_LINE);
        lineSprite.setOrigin(0.5, 1); // 底部中心對齊
        lineSprite.setTint(0xbb88ff);
        this.skillGridContainer.add(lineSprite);
        lineSprite.setDepth(60);

        // 初始：小正方形（1:1）
        const initialSize = 4;
        const initialScaleX = initialSize / MainScene.EFFECT_TEXTURE_SIZE;
        const initialScaleY = initialSize / MainScene.EFFECT_LINE_HEIGHT;
        lineSprite.setScale(initialScaleX, initialScaleY);
        lineSprite.setAlpha(1);

        // 階段 1：膨脹到 0.5 單位正方形
        const expandScaleX = targetSize / MainScene.EFFECT_TEXTURE_SIZE;
        const expandScaleY = targetSize / MainScene.EFFECT_LINE_HEIGHT;

        this.tweens.add({
            targets: lineSprite,
            scaleX: expandScaleX,
            scaleY: expandScaleY,
            duration: 150,
            ease: 'Power2.easeOut',
            onComplete: () => {
                // 階段 2：向上延展拉長、變細、淡出
                const stretchHeight = targetSize * 3; // 拉長到 3 倍高度
                const finalScaleY = stretchHeight / MainScene.EFFECT_LINE_HEIGHT;
                const finalScaleX = expandScaleX * 0.1; // 變細到 10%

                this.tweens.add({
                    targets: lineSprite,
                    scaleX: finalScaleX,
                    scaleY: finalScaleY,
                    alpha: 0,
                    y: screen.y - stretchHeight * 0.5, // 向上移動
                    duration: 250,
                    ease: 'Power2.easeIn',
                    onComplete: () => lineSprite.destroy()
                });
            }
        });
    }

    // 分身施放特效（指定座標）
    private showPhantomCastEffectAt(phantomX: number, phantomY: number) {
        const screen = this.worldToScreen(phantomX, phantomY);
        const graphics = this.add.graphics();
        this.skillGridContainer.add(graphics);

        // 閃光效果
        graphics.fillStyle(0xbb88ff, 0.6);
        graphics.fillCircle(screen.x, screen.y, 20);

        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: 200,
            onComplete: () => graphics.destroy()
        });
    }

    // 指定 ID 的分身消失
    private dismissPhantomById(phantomId: number, withExplosion: boolean = false) {
        const index = this.phantoms.findIndex(p => p.id === phantomId);
        if (index === -1) return;

        const phantom = this.phantoms[index];

        // 停止計時器
        if (phantom.flashTimer) {
            phantom.flashTimer.destroy();
        }
        if (phantom.skillTimer) {
            phantom.skillTimer.destroy();
        }
        if (phantom.tauntTimer) {
            phantom.tauntTimer.destroy();
        }

        // 記錄位置（爆炸用）
        const phantomX = phantom.x;
        const phantomY = phantom.y;

        // 從列表移除
        this.phantoms.splice(index, 1);

        // 重新分配扇區
        this.reassignPhantomSectors();

        // 更新嘲諷目標
        this.updatePhantomTauntTarget();

        // 咒言爆炸效果
        if (withExplosion) {
            this.showPhantomCurseExplosion(phantomX, phantomY);
        }

        // 消失特效（使用 LINE 紋理）
        const screen = this.worldToScreen(phantom.x, phantom.y);
        const unitSize = this.gameBounds.height / 10;
        const targetSize = unitSize * 0.5; // 0.5 單位

        const lineSprite = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_LINE);
        lineSprite.setOrigin(0.5, 1); // 底部中心對齊
        lineSprite.setTint(MainScene.PHANTOM_COLOR); // 暗紫色
        this.skillGridContainer.add(lineSprite);
        lineSprite.setDepth(60);

        // 初始：小正方形
        const initialSize = 4;
        const initialScaleX = initialSize / MainScene.EFFECT_TEXTURE_SIZE;
        const initialScaleY = initialSize / MainScene.EFFECT_LINE_HEIGHT;
        lineSprite.setScale(initialScaleX, initialScaleY);
        lineSprite.setAlpha(1);

        // 階段 1：膨脹到 0.5 單位
        const expandScaleX = targetSize / MainScene.EFFECT_TEXTURE_SIZE;
        const expandScaleY = targetSize / MainScene.EFFECT_LINE_HEIGHT;

        this.tweens.add({
            targets: lineSprite,
            scaleX: expandScaleX,
            scaleY: expandScaleY,
            duration: 150,
            ease: 'Power2.easeOut',
            onComplete: () => {
                // 階段 2：向上延展拉長、變細、淡出
                const stretchHeight = targetSize * 3;
                const finalScaleY = stretchHeight / MainScene.EFFECT_LINE_HEIGHT;
                const finalScaleX = expandScaleX * 0.1;

                this.tweens.add({
                    targets: lineSprite,
                    scaleX: finalScaleX,
                    scaleY: finalScaleY,
                    alpha: 0,
                    y: screen.y - stretchHeight * 0.5,
                    duration: 250,
                    ease: 'Power2.easeIn',
                    onComplete: () => lineSprite.destroy()
                });
            }
        });

        // 銷毀分身圖像
        phantom.sprite.destroy();
    }

    // 創建殘影效果
    private createAfterimage(phantom: typeof this.phantoms[0]) {
        const screen = this.worldToScreen(phantom.x, phantom.y);

        // 創建殘影 sprite
        const afterimage = this.add.sprite(screen.x, screen.y, 'char_idle_1');
        afterimage.setOrigin(0.5, 1);
        afterimage.setScale(phantom.sprite.scaleX, phantom.sprite.scaleY);
        afterimage.setFlipX(phantom.sprite.flipX);
        afterimage.setAlpha(0.3);
        afterimage.setTint(MainScene.PHANTOM_COLOR);
        this.skillGridContainer.add(afterimage);
        afterimage.setDepth(54);

        // 淡出並銷毀
        this.tweens.add({
            targets: afterimage,
            alpha: 0,
            duration: 300,
            onComplete: () => afterimage.destroy()
        });
    }

    // 零信任防禦協定：視覺更新（在 update 中呼叫）
    private updateZeroTrustVisual(delta: number) {
        if (this.isPaused) return; // 暫停時不更新

        // 檢查是否裝備了零信任防禦協定
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        if (!equipped || equipped.definition.id !== 'advanced_zero_trust') {
            // 未裝備，停用並清理
            if (this.zeroTrustActive) {
                this.deactivateZeroTrust();
            }
            return;
        }

        // 啟用（如果尚未啟用）
        if (!this.zeroTrustActive) {
            this.activateZeroTrust(equipped.level);
        }

        // 更新光束
        this.updateZeroTrust(equipped.level, delta);
    }

    // 每幀更新所有分身視覺與移動
    private updatePhantomVisual(delta: number) {
        if (this.isPaused) return; // 暫停時不更新

        const now = this.time.now;

        for (const phantom of this.phantoms) {
            // 如果正在移動，以 4 倍速移動到目標點
            if (phantom.moving) {
                const dx = phantom.targetX - phantom.x;
                const dy = phantom.targetY - phantom.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // 4 倍玩家移動速度
                const phantomSpeed = this.moveSpeed * 4;
                const moveDistance = (phantomSpeed * delta) / 1000;

                if (distance <= moveDistance) {
                    // 到達目標
                    phantom.x = phantom.targetX;
                    phantom.y = phantom.targetY;
                    phantom.moving = false;

                    // 播放待機動畫
                    if (phantom.sprite.anims) {
                        phantom.sprite.play('char_idle', true);
                    }
                } else {
                    // 移動中
                    const ratio = moveDistance / distance;
                    phantom.x += dx * ratio;
                    phantom.y += dy * ratio;

                    // 根據移動方向翻轉
                    if (dx < 0) {
                        phantom.sprite.setFlipX(true);
                    } else if (dx > 0) {
                        phantom.sprite.setFlipX(false);
                    }

                    // 產生殘影（每 50ms）
                    if (now - phantom.lastAfterimageTime > 50) {
                        this.createAfterimage(phantom);
                        phantom.lastAfterimageTime = now;
                    }
                }
            }

            // 更新分身位置（螢幕座標）
            const screen = this.worldToScreen(phantom.x, phantom.y);
            phantom.sprite.setPosition(screen.x, screen.y);

            // 同步縮放
            phantom.sprite.setScale(this.character.scaleX, this.character.scaleY);
        }
        // 嘲諷由各分身的 tauntTimer 週期性控制（每 5 秒啟動 2 秒）
    }

    // 取得分身位置（供怪物 AI 使用）- 返回第一個幻影位置
    getPhantomPosition(): { x: number; y: number; active: boolean } {
        if (this.phantoms.length > 0) {
            const first = this.phantoms[0];
            return {
                x: first.x,
                y: first.y,
                active: true
            };
        }
        return {
            x: 0,
            y: 0,
            active: false
        };
    }

    // 更新遊戲計時器顯示
    private updateTimerDisplay() {
        const totalSeconds = Math.floor(this.gameTimer / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.timerText.setText(timeString);
    }

    // 建立技能資訊窗格
    private createSkillInfoPanel() {
        const bounds = this.gameBounds;
        const panelWidth = 200;
        const panelHeight = 80;
        // 距離邊緣 5%
        const edgeMargin = bounds.width * 0.05;

        // 窗格位置：左下角，距離邊緣 5%
        const x = bounds.x + edgeMargin;
        const y = bounds.y + bounds.height - panelHeight - edgeMargin - 60; // 在技能欄上方

        this.skillInfoPanel = this.add.container(x, y);
        this.skillInfoPanel.setDepth(1003); // 在網格和技能欄之上

        // 半透明黑色背景
        this.skillInfoBg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x000000, 0.7);
        this.skillInfoBg.setOrigin(0, 0);
        this.skillInfoBg.setStrokeStyle(1, 0x666666);
        this.skillInfoPanel.add(this.skillInfoBg);

        // 技能資訊文字
        const textPadding = 10;
        const infoFontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, 12);
        this.skillInfoText = this.add.text(textPadding, textPadding, '', {
            fontFamily: '"Noto Sans TC", sans-serif',
            fontSize: `${infoFontSize}px`,
            color: '#ffffff',
            wordWrap: { width: panelWidth - textPadding * 2 }
        });
        this.skillInfoText.setResolution(2); // 提高解析度使文字更清晰
        this.skillInfoPanel.add(this.skillInfoText);

        // 初始隱藏
        this.skillInfoPanel.setVisible(false);
        this.uiContainer.add(this.skillInfoPanel);
    }

    // 為技能圖示設定點擊互動
    private setupSkillIconInteractions() {
        const activeSkillCount = MainScene.ACTIVE_SKILLS;

        for (let i = 0; i < this.skillIconContainers.length; i++) {
            const container = this.skillIconContainers[i];
            const isActive = i < activeSkillCount;
            const skillIndex = isActive ? i : i - activeSkillCount;

            // 設定為可互動
            container.setSize(container.getBounds().width, container.getBounds().height);
            container.setInteractive({ useHandCursor: true });

            // 點擊事件
            container.on('pointerdown', () => {
                this.showSkillInfo(isActive, skillIndex);
            });
        }
    }

    // 顯示技能資訊
    private showSkillInfo(isActive: boolean, skillIndex: number) {
        const skills = isActive
            ? this.skillManager.getPlayerActiveSkills()
            : this.skillManager.getPlayerPassiveSkills();

        const skill = skills[skillIndex];
        if (!skill) {
            // 沒有技能，隱藏窗格
            this.skillInfoPanel.setVisible(false);
            return;
        }

        // 組合技能資訊文字
        const infoLines: string[] = [];
        infoLines.push(`【${skill.definition.name}】${SkillManager.formatLevel(skill.level, skill.definition.maxLevel)}`);

        if (isActive) {
            // 主動技能：顯示當前數值
            this.appendActiveSkillInfo(infoLines, skill);
        } else {
            // 被動技能：顯示累積效果
            this.appendPassiveSkillInfo(infoLines, skill);
        }

        this.skillInfoText.setText(infoLines.join('\n'));

        // 調整背景大小
        const textBounds = this.skillInfoText.getBounds();
        const padding = 10;
        this.skillInfoBg.setSize(
            Math.max(180, textBounds.width + padding * 2),
            textBounds.height + padding * 2
        );

        // 顯示窗格
        this.skillInfoPanel.setVisible(true);

        // 清除之前的計時器
        if (this.skillInfoHideTimer) {
            this.skillInfoHideTimer.destroy();
        }

        // 3 秒後自動隱藏
        this.skillInfoHideTimer = this.time.delayedCall(3000, () => {
            this.skillInfoPanel.setVisible(false);
        });
    }

    // 顯示進階技能資訊
    private showAdvancedSkillInfo(equipped: PlayerAdvancedSkill) {
        const def = equipped.definition;
        const level = equipped.level;
        const cdReduction = this.skillManager.getSyncRateCooldownReduction();
        const damageBonus = this.skillManager.getAiEnhancementDamageBonus();

        // 組合技能資訊文字
        const infoLines: string[] = [];
        infoLines.push(`【${def.name}】${SkillManager.formatLevel(level, def.maxLevel)}`);
        if (def.subtitle) {
            infoLines.push(def.subtitle);
        }

        // 根據技能 ID 顯示不同資訊
        if (def.id === 'advanced_burning_celluloid') {
            // 燃燒的賽璐珞
            const damageUnits = this.currentLevel + level;
            const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
            const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
            const baseCd = def.cooldown;
            const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);

            infoLines.push(`HP 消耗: 10`);
            infoLines.push(`傷害: ${damageUnits} 單位（${finalDamage}）`);
            infoLines.push(`範圍: 7 單位 / 30°`);
            infoLines.push(`冷卻: ${finalCd}s`);
        } else if (def.id === 'advanced_tech_artist') {
            // 技術美術大神
            const damageUnits = this.currentLevel + level;
            const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
            const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
            const baseCd = def.cooldown;
            const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);

            infoLines.push(`傷害: ${damageUnits} 單位（${finalDamage}）`);
            infoLines.push(`範圍: 5 單位隨機 / 3 單位爆炸`);
            infoLines.push(`癱瘓: 1s`);
            infoLines.push(`冷卻: ${finalCd}s`);
        } else if (def.id === 'advanced_absolute_defense') {
            // 絕對邏輯防禦
            const damageUnits = this.currentLevel + level;
            const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
            const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
            // 輪鋸數量：基本 3 個，每 5 技能等級 +1，最多 8 個
            const maxBladeCount = 8;
            const bladeCount = Math.min(maxBladeCount, 3 + Math.floor(level / 5));
            // 護盾消耗：1%，升滿後每技能級 -0.1%，可變負數回血
            let costRate = 0.01;
            if (bladeCount >= maxBladeCount) {
                const levelsAbove25 = level - 25;
                costRate = 0.01 - levelsAbove25 * 0.001;
            }
            const shieldChange = Math.ceil(this.maxShield * Math.abs(costRate));
            const costPercent = (costRate * 100).toFixed(1) + '%';
            const costLabel = costRate >= 0 ? '撞敵耗盾' : '撞敵回盾';

            infoLines.push(`傷害: ${damageUnits} 單位（${finalDamage}）`);
            infoLines.push(`輪鋸數量: ${bladeCount} / 6（技能Lv${level}）`);
            infoLines.push(`旋轉速度: 2 秒/圈`);
            infoLines.push(`${costLabel}: ${shieldChange} (${costPercent})`);
            infoLines.push(`當前護盾: ${this.currentShield}/${this.maxShield}`);
        } else if (def.id === 'advanced_perfect_pixel') {
            // 完美像素審判
            const damageUnits = this.currentLevel + level;
            const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
            const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
            const baseCd = def.cooldown;
            const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);

            infoLines.push(`傷害: ${damageUnits} 單位（${finalDamage}）`);
            infoLines.push(`爆炸範圍: 3 單位`);
            infoLines.push(`焦點輪轉: 四焦點循環`);
            infoLines.push(`暈眩: 1s`);
            infoLines.push(`冷卻: ${finalCd}s`);
        } else if (def.id === 'advanced_vfx_burst') {
            // 爆發的影視特效
            const damageUnits = this.currentLevel + level;
            const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
            const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
            const baseCd = def.cooldown;
            const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);
            const missileCount = 20;

            infoLines.push(`導彈數量: ${missileCount} 枚`);
            infoLines.push(`單發傷害: ${damageUnits} 單位（${finalDamage}）`);
            infoLines.push(`總傷害: ${finalDamage * missileCount}`);
            infoLines.push(`冷卻: ${finalCd}s`);
        } else if (def.id === 'advanced_zero_trust') {
            // 零信任防禦協定
            const damageUnits = this.currentLevel + level;
            const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
            const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
            infoLines.push(`基礎傷害: ${damageUnits} 單位（${finalDamage}）`);
            infoLines.push(`鎖敵加成: 每秒 +${level}% 傷害`);
            infoLines.push(`光束加粗: 每秒 x2, x3, x4...`);
            infoLines.push(`傷害範圍: 1 + 每秒 +0.5 單位`);
            infoLines.push(`減速效果: 50%`);
        } else if (def.id === 'advanced_phantom_iteration') {
            // 幻影迭代模式
            const duration = Math.floor(level / 5) + 10;
            const baseCd = def.cooldown;
            const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);
            const canOverlap = duration > parseFloat(finalCd);

            infoLines.push(`持續時間: ${duration} 秒 (Sk${level}/5+10)`);
            infoLines.push(`冷卻: ${finalCd}s`);
            infoLines.push(`分身行為: 每0.5秒施放隨機技能`);
            infoLines.push(`可用技: 賽璐珞/美術/特效/彈射`);
            infoLines.push(`嘲諷: 每5秒吸引怪物2秒`);
            if (canOverlap) {
                infoLines.push(`狀態: 可多分身重疊！`);
            } else {
                const needLevel = Math.ceil((parseFloat(finalCd) - 8 + 1) * 5);
                infoLines.push(`狀態: Lv${needLevel} 開始可重疊`);
            }
        } else if (def.id === 'advanced_soul_slash') {
            // 靈魂斬擊
            const damageUnits = this.currentLevel + level;
            const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
            const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
            const baseCd = def.cooldown;
            const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);

            infoLines.push(`傷害: ${damageUnits} 單位（${finalDamage}）`);
            infoLines.push(`範圍: 貫穿全螢幕直線`);
            infoLines.push(`寬度: 0.5 單位`);
            infoLines.push(`冷卻: ${finalCd}s`);
        }

        this.skillInfoText.setText(infoLines.join('\n'));

        // 調整背景大小
        const textBounds = this.skillInfoText.getBounds();
        const padding = 10;
        this.skillInfoBg.setSize(
            Math.max(180, textBounds.width + padding * 2),
            textBounds.height + padding * 2
        );

        // 顯示窗格
        this.skillInfoPanel.setVisible(true);

        // 清除之前的計時器
        if (this.skillInfoHideTimer) {
            this.skillInfoHideTimer.destroy();
        }

        // 3 秒後自動隱藏
        this.skillInfoHideTimer = this.time.delayedCall(3000, () => {
            this.skillInfoPanel.setVisible(false);
        });
    }

    // 添加主動技能資訊
    private appendActiveSkillInfo(lines: string[], skill: PlayerSkill) {
        const level = skill.level;
        const damageBonus = this.skillManager.getAiEnhancementDamageBonus();
        const cdReduction = this.skillManager.getSyncRateCooldownReduction();

        switch (skill.definition.id) {
            case 'active_soul_render': {
                const angle = 60 + level * 10;
                const damageUnits = 2 + level;
                const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
                const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
                const baseCd = skill.definition.cooldown || 1000;
                const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);
                lines.push(`扇形角度: ${angle}°`);
                lines.push(`射程: 3 單位`);
                lines.push(`傷害: ${finalDamage}`);
                lines.push(`冷卻: ${finalCd}s`);
                break;
            }
            case 'active_coder': {
                const rangeUnits = 3 + level * 0.5;
                // 傷害：2 單位 + 每級 2 單位（Lv.0=2單位，Lv.5=12單位）
                const damageUnits = (1 + level) * 2;
                const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
                const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
                const baseCd = skill.definition.cooldown || 2000;
                const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);
                lines.push(`範圍: ${rangeUnits} 單位`);
                lines.push(`傷害: ${finalDamage}`);
                lines.push(`冷卻: ${finalCd}s`);
                break;
            }
            case 'active_vfx': {
                const isMax = level >= skill.definition.maxLevel;
                const damageUnits = 1 + level;
                const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
                const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
                const baseCd = skill.definition.cooldown || 2500;
                const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);
                if (isMax) {
                    // MAX 模式：3 條精準鎖定超粗射線，15 單位射程
                    lines.push(`精準鎖定: 3 道超粗射線`);
                    lines.push(`射程: 15 單位`);
                } else {
                    lines.push(`光束數: ${level + 1} 道`);
                    lines.push(`射程: 10 單位`);
                }
                lines.push(`傷害: ${finalDamage}`);
                lines.push(`冷卻: ${finalCd}s`);
                break;
            }
            case 'active_architect': {
                const shieldPercent = 0.3;
                const shieldAmount = Math.floor(this.maxHp * shieldPercent);
                const reflectUnits = 1 + level * 1.5;
                const reflectDamage = MainScene.DAMAGE_UNIT * reflectUnits;
                const baseCd = skill.definition.cooldown || 10000;
                const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);
                lines.push(`護盾: ${shieldAmount} (霸體)`);
                lines.push(`反傷: ${reflectDamage} + 擊退 1 單位`);
                lines.push(`護盾消失回血: ${shieldAmount}`);
                lines.push(`冷卻: ${finalCd}s`);
                break;
            }
        }

        // 添加 MAX 後額外能力
        this.appendMaxExtraAbility(lines, skill);
    }

    // 添加 MAX 後額外能力資訊
    private appendMaxExtraAbility(lines: string[], skill: PlayerSkill) {
        const extraText = this.skillManager.getMaxExtraAbilityText(skill.definition.id, this.currentLevel);
        if (extraText) {
            lines.push('');  // 空行分隔
            lines.push(extraText);
        }
    }

    // 添加被動技能資訊
    private appendPassiveSkillInfo(lines: string[], skill: PlayerSkill) {
        switch (skill.definition.id) {
            case 'passive_titanium_liver': {
                const bonus = this.skillManager.getTitaniumLiverHpBonus();
                const regenInterval = this.skillManager.getTitaniumLiverRegenInterval() / 1000;
                lines.push(`HP 加成: +${Math.round(bonus * 100)}%`);
                lines.push(`最大 HP: ${this.maxHp}`);
                lines.push(`回復: 每 ${regenInterval} 秒 +1% HP`);
                // MAX 後顯示不死能力狀態
                if (this.skillManager.hasTitaniumLiverRevive()) {
                    const status = this.reviveUsed ? '(已使用)' : '(待命)';
                    lines.push(`【不死】抵銷一次死亡 ${status}`);
                }
                break;
            }
            case 'passive_sync_rate': {
                const speedBonus = this.skillManager.getSyncRateSpeedBonus();
                const cdReduction = this.skillManager.getSyncRateCooldownReduction();
                lines.push(`移速加成: +${Math.round(speedBonus * 100)}%`);
                lines.push(`冷卻減少: -${Math.round(cdReduction * 100)}%`);
                break;
            }
            case 'passive_retina_module': {
                const expBonus = this.skillManager.getRetinaModuleExpBonus();
                const pickupBonus = this.skillManager.getRetinaModulePickupBonus();
                lines.push(`經驗加成: +${Math.round(expBonus * 100)}%`);
                lines.push(`拾取範圍: +${pickupBonus} 單位`);
                break;
            }
            case 'passive_ai_enhancement': {
                const damageBonus = this.skillManager.getAiEnhancementDamageBonus();
                const defenseBonus = this.skillManager.getAiEnhancementDefenseBonus();
                lines.push(`攻擊加成: +${Math.round(damageBonus * 100)}%`);
                lines.push(`防禦加成: +${Math.round(defenseBonus * 100)}%`);
                break;
            }
        }

        // 添加 MAX 後額外能力
        this.appendMaxExtraAbility(lines, skill);
    }

    // 更新技能欄顯示
    private updateSkillBarDisplay() {
        const activeSkills = this.skillManager.getPlayerActiveSkills();
        const passiveSkills = this.skillManager.getPlayerPassiveSkills();
        const allSkills = [...activeSkills, ...passiveSkills];

        // 計算圖示大小（與 createSkillBar 相同邏輯）
        const cellSize = this.skillGridCellSize;
        const gap = MainScene.SKILL_GRID_GAP;
        const iconGridSize = 8;
        const iconPixelSize = iconGridSize * (cellSize + gap) - gap;

        for (let i = 0; i < this.skillIconContainers.length; i++) {
            const container = this.skillIconContainers[i];
            const levelText = this.skillLevelTexts[i];
            const skill = allSkills[i];

            // 取得顏色背景（container 的第二個子元素）
            const colorBg = container.list[1] as Phaser.GameObjects.Rectangle;

            // 處理技能圖示 Sprite
            const existingSprite = this.skillIconSprites[i];

            if (skill) {
                // 有技能，使用技能本身的顏色和等級
                colorBg.setFillStyle(skill.definition.color, 0.5);
                levelText.setText(SkillManager.formatLevel(skill.level, skill.definition.maxLevel));

                // 如果有 iconPrefix，顯示對應等級的圖示
                if (skill.definition.iconPrefix) {
                    // P 系列（被動技能）使用固定圖示，不隨等級變換
                    const isPassiveIcon = skill.definition.iconPrefix.startsWith('P');
                    const iconKey = isPassiveIcon
                        ? `skill_icon_${skill.definition.iconPrefix}`
                        : `skill_icon_${skill.definition.iconPrefix}${skill.level.toString().padStart(2, '0')}`;

                    // 檢查紋理是否存在
                    if (this.textures.exists(iconKey)) {
                        if (existingSprite) {
                            // 更新現有 Sprite 的紋理
                            existingSprite.setTexture(iconKey);
                            existingSprite.setVisible(true);
                        } else {
                            // 建立新的 Sprite
                            const sprite = this.add.sprite(0, 0, iconKey);
                            sprite.setOrigin(0.5, 0.5);
                            // 縮放圖示以適應技能框（留一些邊距）
                            const targetSize = iconPixelSize - 8;
                            const scale = targetSize / Math.max(sprite.width, sprite.height);
                            sprite.setScale(scale);
                            // 插入到顏色背景之後、等級文字之前
                            container.addAt(sprite, 2);
                            this.skillIconSprites[i] = sprite;
                        }
                        // 隱藏顏色背景（因為有圖示）
                        colorBg.setAlpha(0);
                    } else {
                        // 紋理不存在，隱藏 Sprite 並顯示顏色背景
                        if (existingSprite) {
                            existingSprite.setVisible(false);
                        }
                        colorBg.setAlpha(1);
                    }
                } else {
                    // 沒有 iconPrefix，隱藏 Sprite 並顯示顏色背景
                    if (existingSprite) {
                        existingSprite.setVisible(false);
                    }
                    colorBg.setAlpha(1);
                }
            } else {
                // 無技能
                colorBg.setFillStyle(0x333333, 0);
                colorBg.setAlpha(1);
                levelText.setText('');
                if (existingSprite) {
                    existingSprite.setVisible(false);
                }
            }
        }
    }

    private createCharacterAnimations() {
        // 待機動畫（2 幀循環）
        this.anims.create({
            key: 'char_idle',
            frames: [
                { key: 'char_idle_1' },
                { key: 'char_idle_2' }
            ],
            frameRate: 2,
            repeat: -1
        });

        // 跑步動畫（2 幀循環）
        this.anims.create({
            key: 'char_run',
            frames: [
                { key: 'char_run_1' },
                { key: 'char_run_2' }
            ],
            frameRate: 8,
            repeat: -1
        });

        // 攻擊動畫（2 幀）
        this.anims.create({
            key: 'char_attack',
            frames: [
                { key: 'char_attack_1' },
                { key: 'char_attack_2' }
            ],
            frameRate: 8,
            repeat: 0
        });

        // 受傷動畫（單幀，2 FPS 讓動畫更流暢）
        this.anims.create({
            key: 'char_hurt',
            frames: [{ key: 'char_hurt' }],
            frameRate: 2,
            repeat: 0
        });
    }

    private updateCharacterSprite() {
        // 更新角色位置
        this.character.setPosition(this.characterX, this.characterY);

        // 更新角色縮放（保持大小一致）
        this.character.setScale(
            (this.facingRight ? 1 : -1) * (this.characterSize / this.character.height),
            this.characterSize / this.character.height
        );
    }

    private setCharacterState(newState: CharacterState, force: boolean = false) {
        if (this.characterState === newState) return;

        // 受傷硬直中只能強制切換或切換到 hurt
        if (this.isHurt && !force && newState !== 'hurt') {
            return;
        }

        // 攻擊動畫中只能強制切換或切換到 hurt
        if (this.isAttacking && !force && newState !== 'hurt') {
            return;
        }

        this.characterState = newState;
        this.character.play(`char_${newState}`);
    }

    private updateCharacterFacing(targetX: number) {
        // 根據移動方向更新角色面向
        if (targetX > this.characterX) {
            this.facingRight = true;
        } else if (targetX < this.characterX) {
            this.facingRight = false;
        }
    }

    // ===== 技能選擇面板 =====

    private createSkillPanel() {
        // 建立面板容器
        this.skillPanelContainer = this.add.container(0, 0);
        this.skillPanelContainer.setVisible(false);

        // 將技能面板加入 uiContainer，確保受到揭露遮罩控制
        // 不會顯示在 GridScene 轉場圖層之上
        this.uiContainer.add(this.skillPanelContainer);

        // 80% 黑色透明背景覆蓋遊戲區域
        const overlay = this.add.rectangle(
            this.gameBounds.x + this.gameBounds.width / 2,
            this.gameBounds.y + this.gameBounds.height / 2,
            this.gameBounds.width,
            this.gameBounds.height,
            0x000000,
            0.8
        );
        overlay.setInteractive(); // 阻擋點擊穿透
        this.skillPanelContainer.add(overlay);

        // 標題文字
        const titleY = this.gameBounds.y + this.gameBounds.height * 0.12;
        const title = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            titleY,
            '選擇技能',
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_LARGE, Math.floor(this.gameBounds.height * 0.07))}px`,
                color: '#ffffff',
                fontStyle: 'bold'
            }
        );
        title.setResolution(2);
        title.setOrigin(0.5, 0.5);
        this.skillPanelContainer.add(title);

        // 副標題文字
        const subtitleY = titleY + this.gameBounds.height * 0.06;
        const subtitle = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            subtitleY,
            '提升你的數位能力',
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(this.gameBounds.height * 0.025))}px`,
                color: '#cccccc'
            }
        );
        subtitle.setResolution(2);
        subtitle.setOrigin(0.5, 0.5);
        this.skillPanelContainer.add(subtitle);

        // 建立 3 個技能選項
        this.createSkillOptions();

        // 底部提示文字（手機版與 PC 版統一為點兩次確認）
        const hintY = this.gameBounds.y + this.gameBounds.height * 0.92;
        const hintText = this.isMobile ? '點兩次確認' : '重複按同一鍵確認';
        const hint = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            hintY,
            hintText,
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(this.gameBounds.height * 0.022))}px`,
                color: '#888888'
            }
        );
        hint.setResolution(2);
        hint.setOrigin(0.5, 0.5);
        this.skillPanelContainer.add(hint);
    }

    // 建立技能升級 CUT IN 容器
    private createSkillCutIn() {
        this.skillCutInContainer = this.add.container(0, 0);
        this.skillCutInContainer.setVisible(false);
        this.skillCutInContainer.setDepth(1000); // 確保在最上層
        this.uiContainer.add(this.skillCutInContainer);
    }

    // 顯示技能升級 CUT IN
    private showSkillCutIn(skillDef: SkillDefinition, newLevel: number) {
        // 清除之前的內容
        this.skillCutInContainer.removeAll(true);

        // CUT IN 條的高度和位置（畫面上半中間）
        const barHeight = this.gameBounds.height * 0.22; // 加高區塊
        const barY = this.gameBounds.y + this.gameBounds.height * 0.25;
        const fadeWidth = this.gameBounds.width * 0.15; // 兩側漸層區域寬度
        const solidWidth = this.gameBounds.width - fadeWidth * 2; // 中間實心區域

        // 中間實心黑色背景
        const bgCenter = this.add.rectangle(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY,
            solidWidth,
            barHeight,
            0x000000,
            0.75
        );
        this.skillCutInContainer.add(bgCenter);

        // 左側漸層（從透明到黑色）
        const leftFade = this.add.graphics();
        const leftStartX = this.gameBounds.x;
        const leftEndX = this.gameBounds.x + fadeWidth;
        const fadeSteps = 20;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (i / fadeSteps) * 0.75; // 從 0 漸變到 0.75
            const x = leftStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1; // +1 避免間隙
            leftFade.fillStyle(0x000000, alpha);
            leftFade.fillRect(x, barY - barHeight / 2, w, barHeight);
        }
        this.skillCutInContainer.add(leftFade);

        // 右側漸層（從黑色到透明）
        const rightFade = this.add.graphics();
        const rightStartX = this.gameBounds.x + this.gameBounds.width - fadeWidth;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (1 - i / fadeSteps) * 0.75; // 從 0.75 漸變到 0
            const x = rightStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            rightFade.fillStyle(0x000000, alpha);
            rightFade.fillRect(x, barY - barHeight / 2, w, barHeight);
        }
        this.skillCutInContainer.add(rightFade);

        // 技能顏色的邊線（上下，同樣兩側漸層）
        const lineThickness = 3;

        // 上邊線
        const topLineGraphics = this.add.graphics();
        const lineY = barY - barHeight / 2 - lineThickness / 2;
        // 左側漸層
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (i / fadeSteps) * 0.8;
            const x = leftStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            topLineGraphics.fillStyle(skillDef.color, alpha);
            topLineGraphics.fillRect(x, lineY, w, lineThickness);
        }
        // 中間實心
        topLineGraphics.fillStyle(skillDef.color, 0.8);
        topLineGraphics.fillRect(leftEndX, lineY, solidWidth, lineThickness);
        // 右側漸層
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (1 - i / fadeSteps) * 0.8;
            const x = rightStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            topLineGraphics.fillStyle(skillDef.color, alpha);
            topLineGraphics.fillRect(x, lineY, w, lineThickness);
        }
        this.skillCutInContainer.add(topLineGraphics);

        // 下邊線
        const bottomLineGraphics = this.add.graphics();
        const bottomLineY = barY + barHeight / 2 - lineThickness / 2;
        // 左側漸層
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (i / fadeSteps) * 0.8;
            const x = leftStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            bottomLineGraphics.fillStyle(skillDef.color, alpha);
            bottomLineGraphics.fillRect(x, bottomLineY, w, lineThickness);
        }
        // 中間實心
        bottomLineGraphics.fillStyle(skillDef.color, 0.8);
        bottomLineGraphics.fillRect(leftEndX, bottomLineY, solidWidth, lineThickness);
        // 右側漸層
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (1 - i / fadeSteps) * 0.8;
            const x = rightStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            bottomLineGraphics.fillStyle(skillDef.color, alpha);
            bottomLineGraphics.fillRect(x, bottomLineY, w, lineThickness);
        }
        this.skillCutInContainer.add(bottomLineGraphics);

        // 等級顯示文字（進階技能 maxLevel=-1 表示無上限，不顯示 MAX）
        const levelDisplay = (skillDef.maxLevel > 0 && newLevel >= skillDef.maxLevel) ? 'MAX' : `Lv.${newLevel}`;

        // 主標題：技能名稱提升到等級
        const titleText = `${skillDef.name} 提升到 ${levelDisplay}`;
        const title = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY - barHeight * 0.30,
            titleText,
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_LARGE, Math.floor(barHeight * 0.26))}px`,
                color: '#ffffff',
                fontStyle: 'bold'
            }
        );
        title.setResolution(2);
        title.setOrigin(0.5, 0.5);
        this.skillCutInContainer.add(title);

        // 角色對話（大字副標題）
        let quoteText = '';
        if (skillDef.levelUpQuotes && skillDef.levelUpQuotes[newLevel]) {
            quoteText = skillDef.levelUpQuotes[newLevel];
        }
        if (quoteText) {
            const quote = this.add.text(
                this.gameBounds.x + this.gameBounds.width / 2,
                barY + barHeight * 0.05,
                quoteText,
                {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_LARGE, Math.floor(barHeight * 0.23))}px`,
                    color: '#ffffff'
                }
            );
            quote.setResolution(2);
            quote.setOrigin(0.5, 0.5);
            this.skillCutInContainer.add(quote);
        }

        // 數值描述（小字）
        let descriptionText = skillDef.description;
        if (skillDef.levelUpMessages && skillDef.levelUpMessages[newLevel]) {
            descriptionText = skillDef.levelUpMessages[newLevel];
        }
        const description = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY + barHeight * 0.25,
            descriptionText,
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(barHeight * 0.15))}px`,
                color: Phaser.Display.Color.IntegerToColor(skillDef.color).rgba
            }
        );
        description.setResolution(2);
        description.setOrigin(0.5, 0.5);
        this.skillCutInContainer.add(description);

        // MAX 能力效果說明（只有達到 MAX 等級時顯示）
        if (newLevel >= skillDef.maxLevel && skillDef.maxExtraAbility) {
            const extra = skillDef.maxExtraAbility;
            // 計算每級提供的數值
            const perLevelDisplay = extra.isPercentage
                ? (extra.perLevel * 100).toFixed(2)
                : extra.perLevel.toFixed(2);
            // 組合能力說明文字，包含每級成長率
            let abilityText = `【${extra.name}】${extra.description.replace('{value}', `角色每級 +${perLevelDisplay}${extra.unit}`)}`;

            const maxAbility = this.add.text(
                this.gameBounds.x + this.gameBounds.width / 2,
                barY + barHeight * 0.42,
                abilityText,
                {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(barHeight * 0.13))}px`,
                    color: '#ffcc00' // 金色顯示 MAX 能力
                }
            );
            maxAbility.setResolution(2);
            maxAbility.setOrigin(0.5, 0.5);
            this.skillCutInContainer.add(maxAbility);
        }

        // 從左邊滑入動畫
        this.skillCutInContainer.setX(-this.gameBounds.width);
        this.skillCutInContainer.setVisible(true);
        this.skillCutInContainer.setAlpha(1);

        this.tweens.add({
            targets: this.skillCutInContainer,
            x: 0,
            duration: 250,
            ease: 'Power2.easeOut',
            onComplete: () => {
                // 停留 2 秒後滑出
                this.time.delayedCall(2000, () => {
                    this.tweens.add({
                        targets: this.skillCutInContainer,
                        x: this.gameBounds.width,
                        duration: 250,
                        ease: 'Power2.easeIn',
                        onComplete: () => {
                            this.skillCutInContainer.setVisible(false);
                            this.skillCutInContainer.setX(0);
                            // CutIn 動畫結束
                            this.isSkillSelecting = false;
                        }
                    });
                });
            }
        });
    }

    // 顯示技能觸發 CUT IN（如不死觸發）
    private showTriggerCutIn(skillDef: SkillDefinition, title: string, quote: string) {
        // 清除之前的內容
        this.skillCutInContainer.removeAll(true);

        // CUT IN 條的高度和位置
        const barHeight = this.gameBounds.height * 0.22; // 加高區塊
        const barY = this.gameBounds.y + this.gameBounds.height * 0.25;
        const fadeWidth = this.gameBounds.width * 0.15;
        const solidWidth = this.gameBounds.width - fadeWidth * 2;

        // 中間實心黑色背景
        const bgCenter = this.add.rectangle(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY,
            solidWidth,
            barHeight,
            0x000000,
            0.85
        );
        this.skillCutInContainer.add(bgCenter);

        // 左側漸層
        const leftFade = this.add.graphics();
        const leftStartX = this.gameBounds.x;
        const fadeSteps = 20;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (i / fadeSteps) * 0.85;
            const x = leftStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            leftFade.fillStyle(0x000000, alpha);
            leftFade.fillRect(x, barY - barHeight / 2, w, barHeight);
        }
        this.skillCutInContainer.add(leftFade);

        // 右側漸層
        const rightFade = this.add.graphics();
        const rightStartX = this.gameBounds.x + this.gameBounds.width - fadeWidth;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (1 - i / fadeSteps) * 0.85;
            const x = rightStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            rightFade.fillStyle(0x000000, alpha);
            rightFade.fillRect(x, barY - barHeight / 2, w, barHeight);
        }
        this.skillCutInContainer.add(rightFade);

        // 技能顏色的邊線
        const lineThickness = 3;
        const leftEndX = this.gameBounds.x + fadeWidth;

        // 上邊線
        const topLineGraphics = this.add.graphics();
        const lineY = barY - barHeight / 2 - lineThickness / 2;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (i / fadeSteps) * 0.8;
            const x = leftStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            topLineGraphics.fillStyle(skillDef.color, alpha);
            topLineGraphics.fillRect(x, lineY, w, lineThickness);
        }
        topLineGraphics.fillStyle(skillDef.color, 0.8);
        topLineGraphics.fillRect(leftEndX, lineY, solidWidth, lineThickness);
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (1 - i / fadeSteps) * 0.8;
            const x = rightStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            topLineGraphics.fillStyle(skillDef.color, alpha);
            topLineGraphics.fillRect(x, lineY, w, lineThickness);
        }
        this.skillCutInContainer.add(topLineGraphics);

        // 下邊線
        const bottomLineGraphics = this.add.graphics();
        const bottomLineY = barY + barHeight / 2 - lineThickness / 2;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (i / fadeSteps) * 0.8;
            const x = leftStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            bottomLineGraphics.fillStyle(skillDef.color, alpha);
            bottomLineGraphics.fillRect(x, bottomLineY, w, lineThickness);
        }
        bottomLineGraphics.fillStyle(skillDef.color, 0.8);
        bottomLineGraphics.fillRect(leftEndX, bottomLineY, solidWidth, lineThickness);
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (1 - i / fadeSteps) * 0.8;
            const x = rightStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            bottomLineGraphics.fillStyle(skillDef.color, alpha);
            bottomLineGraphics.fillRect(x, bottomLineY, w, lineThickness);
        }
        this.skillCutInContainer.add(bottomLineGraphics);

        // 主標題
        const titleTextObj = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY - barHeight * 0.25,
            title,
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_LARGE, Math.floor(barHeight * 0.24))}px`,
                color: Phaser.Display.Color.IntegerToColor(skillDef.color).rgba,
                fontStyle: 'bold'
            }
        );
        titleTextObj.setResolution(2);
        titleTextObj.setOrigin(0.5, 0.5);
        this.skillCutInContainer.add(titleTextObj);

        // 角色對話（大字）
        const quoteTextObj = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY + barHeight * 0.15,
            quote,
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(barHeight * 0.17))}px`,
                color: '#ffffff'
            }
        );
        quoteTextObj.setResolution(2);
        quoteTextObj.setOrigin(0.5, 0.5);
        this.skillCutInContainer.add(quoteTextObj);

        // 從左邊滑入動畫
        this.skillCutInContainer.setX(-this.gameBounds.width);
        this.skillCutInContainer.setVisible(true);
        this.skillCutInContainer.setAlpha(1);

        this.tweens.add({
            targets: this.skillCutInContainer,
            x: 0,
            duration: 250,
            ease: 'Power2.easeOut',
            onComplete: () => {
                // 停留 2 秒後滑出
                this.time.delayedCall(2000, () => {
                    this.tweens.add({
                        targets: this.skillCutInContainer,
                        x: this.gameBounds.width,
                        duration: 250,
                        ease: 'Power2.easeIn',
                        onComplete: () => {
                            this.skillCutInContainer.setVisible(false);
                            this.skillCutInContainer.setX(0);
                        }
                    });
                });
            }
        });
    }

    private createSkillOptions() {
        // 清除舊的選項
        this.skillOptions.forEach(option => option.destroy());
        this.skillOptions = [];
        this.skillCardBgs = [];

        // 重設混合選項追蹤（非混合模式時應為空）
        this.mixedSkillTypes = [];
        this.mixedNormalIndices = [];
        this.mixedAdvancedIndices = [];

        // 取得混合技能選項（一般 + 進階）
        const mixedOptions = this.skillManager.getMixedSkillOptions();
        this.currentSkillChoices = mixedOptions.normal;
        this.currentAdvancedSkillChoices = mixedOptions.advanced;

        // 計算總選項數
        const totalOptions = this.currentSkillChoices.length + this.currentAdvancedSkillChoices.length;

        // 如果沒有可選技能，不顯示面板
        if (totalOptions === 0) {
            return;
        }

        // 如果只有進階技能（一般技能全滿等）
        if (this.currentSkillChoices.length === 0 && this.currentAdvancedSkillChoices.length > 0) {
            this.isSelectingAdvancedSkill = true;
            // 隨機抽取最多 3 個進階技能
            if (this.currentAdvancedSkillChoices.length > 3) {
                // 已經在 getMixedSkillOptions 中 shuffle 過了，直接取前 3 個
                this.currentAdvancedSkillChoices = this.currentAdvancedSkillChoices.slice(0, 3);
            }
            this.createAdvancedSkillOptions();
            return;
        }

        // 如果有進階技能可選，創建混合選項面板
        if (this.currentAdvancedSkillChoices.length > 0) {
            this.createMixedSkillOptions();
            return;
        }

        // 只有一般技能
        this.isSelectingAdvancedSkill = false;

        // 選項卡片設定（手機版增加高度避免文字超出邊框）
        const cardWidth = this.gameBounds.width * 0.25;
        const cardHeight = this.gameBounds.height * (this.isMobile ? 0.55 : 0.5);
        const cardGap = this.gameBounds.width * 0.05;
        const numCards = this.currentSkillChoices.length;
        const totalWidth = cardWidth * numCards + cardGap * (numCards - 1);
        const startX = this.gameBounds.x + (this.gameBounds.width - totalWidth) / 2 + cardWidth / 2;
        const centerY = this.gameBounds.y + this.gameBounds.height * 0.55;

        // 根據選項數量決定按鍵對應
        // 3 個選項：A, S, D
        // 2 個選項：A, D
        // 1 個選項：S
        let keys: string[];
        if (numCards === 1) {
            keys = ['2'];
        } else if (numCards === 2) {
            keys = ['1', '3'];
        } else {
            keys = ['1', '2', '3'];
        }

        for (let i = 0; i < this.currentSkillChoices.length; i++) {
            const skillDef = this.currentSkillChoices[i];
            const currentLevel = this.skillManager.getSkillLevel(skillDef.id);
            // 未擁有時 currentLevel = -1，學習後為 Lv.0
            // 等級範圍：0-5（共 6 級）
            const isNew = currentLevel < 0;
            const displayCurrentLevel = isNew ? '-' : currentLevel;
            const nextLevel = isNew ? 0 : currentLevel + 1;
            const x = startX + i * (cardWidth + cardGap);

            // 建立選項容器
            const optionContainer = this.add.container(x, centerY);

            // 卡片背景
            const cardBg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x222222);
            cardBg.setStrokeStyle(2, 0x666666);
            optionContainer.add(cardBg);

            // 技能類型標籤
            const typeLabel = this.add.text(0, -cardHeight * 0.42, skillDef.type === 'active' ? 'ACTIVE' : 'PASSIVE', {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045))}px`,
                color: skillDef.type === 'active' ? '#ff6666' : '#66ffff',
                fontStyle: 'bold'
            });
            typeLabel.setResolution(2);
            typeLabel.setOrigin(0.5, 0.5);
            optionContainer.add(typeLabel);

            // 技能圖示區域（上半部）
            const iconSize = cardWidth * 0.5;
            const iconY = -cardHeight * 0.18;
            const iconBg = this.add.rectangle(0, iconY, iconSize, iconSize, skillDef.color, 0.3);
            iconBg.setStrokeStyle(2, skillDef.color);
            optionContainer.add(iconBg);

            // 如果有技能圖示，顯示對應等級的圖示
            if (skillDef.iconPrefix) {
                // P 系列（被動技能）使用固定圖示，不隨等級變換
                const isPassiveIcon = skillDef.iconPrefix.startsWith('P');
                const iconKey = isPassiveIcon
                    ? `skill_icon_${skillDef.iconPrefix}`
                    : `skill_icon_${skillDef.iconPrefix}${nextLevel.toString().padStart(2, '0')}`;
                if (this.textures.exists(iconKey)) {
                    const iconSprite = this.add.sprite(0, iconY, iconKey);
                    iconSprite.setOrigin(0.5, 0.5);
                    // 縮放圖示以適應區域
                    const targetSize = iconSize - 8;
                    const scale = targetSize / Math.max(iconSprite.width, iconSprite.height);
                    iconSprite.setScale(scale);
                    optionContainer.add(iconSprite);
                    // 隱藏顏色背景
                    iconBg.setAlpha(0);
                }
            }

            // 技能名稱（固定位置）
            const nameY = cardHeight * 0.06;
            const nameText = this.add.text(0, nameY, skillDef.name, {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(cardHeight * 0.08))}px`,
                color: '#ffffff',
                fontStyle: 'bold'
            });
            nameText.setResolution(2);
            nameText.setOrigin(0.5, 0.5);
            optionContainer.add(nameText);

            // 副標題（如果有）
            if (skillDef.subtitle) {
                const subtitleFontSize = this.isMobile
                    ? Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045))
                    : Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.055));
                const subtitleText = this.add.text(0, cardHeight * 0.12, skillDef.subtitle, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${subtitleFontSize}px`,
                    color: '#999999'
                });
                subtitleText.setResolution(2);
                subtitleText.setOrigin(0.5, 0.5);
                optionContainer.add(subtitleText);
            }

            // 等級顯示（固定位置）
            let levelDisplay: string;
            if (nextLevel >= skillDef.maxLevel) {
                levelDisplay = `Lv.${displayCurrentLevel} → MAX`;
            } else if (isNew) {
                levelDisplay = `NEW → Lv.${nextLevel}`;
            } else {
                levelDisplay = `Lv.${displayCurrentLevel} → Lv.${nextLevel}`;
            }
            const levelText = this.add.text(0, cardHeight * 0.20, levelDisplay, {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.05))}px`,
                color: nextLevel >= skillDef.maxLevel ? '#ffff00' : '#88ff88',
                fontStyle: 'bold'
            });
            levelText.setResolution(2);
            levelText.setOrigin(0.5, 0.5);
            optionContainer.add(levelText);

            // 技能描述（固定字體大小，自動換行）
            const descY = cardHeight * 0.26;
            const descFontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045));
            // 使用 padding 常數計算文字換行寬度
            const textWrapWidth = cardWidth * (1 - MainScene.CARD_TEXT_PADDING * 2);
            const descText = this.add.text(0, descY, skillDef.description, {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${descFontSize}px`,
                color: '#dddddd',
                wordWrap: { width: textWrapWidth, useAdvancedWrap: true },
                align: 'center'
            });
            descText.setResolution(2);
            descText.setOrigin(0.5, 0);
            optionContainer.add(descText);

            // 按鍵提示標籤（手機版隱藏）- 放在卡片外的下方
            if (!this.isMobile) {
                const keyLabelY = cardHeight * 0.5 + cardHeight * 0.08; // 卡片底部外側
                const keyLabel = this.add.text(0, keyLabelY, `[ ${keys[i]} ]`, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(cardHeight * 0.06))}px`,
                    color: '#ffff00',
                    fontStyle: 'bold'
                });
                keyLabel.setResolution(2);
                keyLabel.setOrigin(0.5, 0.5);
                optionContainer.add(keyLabel);
            }

            // 設定互動
            cardBg.setInteractive({ useHandCursor: true });

            // Hover 效果 - 使用 setSelectedSkill 統一處理
            const skillIndex = i;
            cardBg.on('pointerover', () => {
                this.setSelectedSkill(skillIndex);
            });

            // 點擊選擇（PC 直接確認，手機需點兩次）
            cardBg.on('pointerdown', () => {
                if (this.isMobile) {
                    // 手機版：第一次點擊選中，第二次點擊確認（比照 PC 鍵盤操作）
                    if (this.selectedSkillIndex === skillIndex) {
                        this.confirmSkillSelection();
                    } else {
                        this.setSelectedSkill(skillIndex);
                    }
                } else {
                    // PC 版：直接確認（因為有 hover 預覽）
                    this.setSelectedSkill(skillIndex);
                    this.confirmSkillSelection();
                }
            });

            this.skillPanelContainer.add(optionContainer);
            this.skillOptions.push(optionContainer);
            this.skillCardBgs.push(cardBg);
        }

        // 預設選中第一個（索引 0，對應 A 鍵）
        this.selectedSkillIndex = 0;
    }

    // 嘗試顯示技能面板（如果面板未顯示且有待分配點數）
    private tryShowSkillPanel() {
        // 如果面板已經顯示，不重複顯示
        if (this.skillPanelContainer && this.skillPanelContainer.visible) {
            return;
        }
        // 如果沒有待分配點數，不顯示
        if (this.pendingSkillPoints <= 0) {
            return;
        }
        this.showSkillPanel();
    }

    private showSkillPanel() {
        // 如果面板已經顯示，不重複顯示（防止快速連點造成狀態混亂）
        if (this.skillPanelContainer && this.skillPanelContainer.visible) {
            return;
        }

        // 檢查是否有可升級的技能（包含進階技能）
        const hasNormalSkills = this.skillManager.hasUpgradeableSkills();
        const hasAdvancedSkills = this.skillManager.getUpgradeableAdvancedSkills().length > 0;

        if (!hasNormalSkills && !hasAdvancedSkills) {
            // 技能全滿後不暫停遊戲，消耗所有待分配點數
            this.pendingSkillPoints = 0;
            return;
        }

        // 重新生成技能選項
        this.createSkillOptions();

        // 如果沒有選項可選，不顯示面板
        // 檢查一般技能、混合模式、進階技能模式
        const hasOptions = this.currentSkillChoices.length > 0 ||
                           this.mixedSkillTypes.length > 0 ||
                           (this.isSelectingAdvancedSkill && this.currentAdvancedSkillChoices.length > 0);
        if (!hasOptions) {
            this.pendingSkillPoints = 0;
            return;
        }

        this.isPaused = true;
        this.isSkillSelecting = false; // 重置選擇狀態，允許新的選擇
        this.isPointerDown = false; // 停止移動
        this.skillPanelContainer.setVisible(true);

        // 重設選中狀態為第一個
        this.selectedSkillIndex = 0;

        // 重設所有卡片樣式
        this.skillCardBgs.forEach((cardBg, index) => {
            if (index === 0) {
                // 預設選中第一個
                cardBg.setFillStyle(0x333333);
                cardBg.setStrokeStyle(3, 0xffffff);
            } else {
                cardBg.setFillStyle(0x222222);
                cardBg.setStrokeStyle(2, 0x666666);
            }
        });

        // 淡入動畫
        this.skillPanelContainer.setAlpha(0);
        this.tweens.add({
            targets: this.skillPanelContainer,
            alpha: 1,
            duration: 200
        });

        // 選項卡片動畫（從下往上彈出）
        this.skillOptions.forEach((option, index) => {
            // 重設縮放（第一個預設放大）
            option.setScale(index === 0 ? 1.05 : 1);
            option.setY(this.gameBounds.y + this.gameBounds.height * 0.55 + 50);
            option.setAlpha(0);
            this.tweens.add({
                targets: option,
                y: this.gameBounds.y + this.gameBounds.height * 0.55,
                alpha: 1,
                duration: 300,
                delay: index * 100,
                ease: 'Back.easeOut'
            });
        });
    }

    private hideSkillPanel() {
        // 消耗一個待分配技能點數
        this.pendingSkillPoints = Math.max(0, this.pendingSkillPoints - 1);

        // 立即重置選擇狀態，避免快速連點時卡住
        this.isSkillSelecting = false;

        // 淡出動畫
        this.tweens.add({
            targets: this.skillPanelContainer,
            alpha: 0,
            duration: 200,
            onComplete: () => {
                this.skillPanelContainer.setVisible(false);

                // 檢查是否還有待分配的技能點數
                if (this.pendingSkillPoints > 0) {
                    // 延遲一小段時間後顯示下一個面板
                    this.time.delayedCall(100, () => {
                        this.tryShowSkillPanel();
                    });
                } else {
                    // 沒有待分配點數時才恢復遊戲
                    this.isPaused = false;
                }
            }
        });
    }

    private selectSkill(index: number, skillId: string) {
        // 取得升級前的技能定義（用於 CUT IN 顯示）
        const skillDef = this.currentSkillChoices[index];

        // 學習或升級技能
        const success = this.skillManager.learnOrUpgradeSkill(skillId);
        if (!success) {
            console.warn(`Failed to learn/upgrade skill: ${skillId}`);
            // 失敗時重置狀態
            this.isSkillSelecting = false;
            this.isPaused = false;
            return;
        }

        const skill = this.skillManager.getPlayerSkill(skillId);
        const newLevel = skill?.level ?? 0;

        // 更新技能欄顯示
        this.updateSkillBarDisplay();

        // 如果是被動技能，重新計算屬性並更新顯示
        if (skill?.definition.type === 'passive') {
            this.recalculateMaxHp();
            this.recalculateMoveSpeed();
            this.drawHpBarFill();
            this.updateHpText();
        }

        // 立即隱藏面板並恢復遊戲（不等動畫）
        this.hideSkillPanel();

        // 選中動畫（純視覺，不影響遊戲狀態）
        const selectedOption = this.skillOptions[index];
        this.tweens.add({
            targets: selectedOption,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 100,
            yoyo: true,
            onComplete: () => {
                // 動畫結束後顯示 CUT IN
                this.showSkillCutIn(skillDef, newLevel);
            }
        });
    }

    // 選擇進階技能
    private selectAdvancedSkill(index: number, skillId: string) {
        const advSkillDef = this.currentAdvancedSkillChoices[index];

        // 檢查是否為升級同一技能還是切換到不同技能
        const currentEquipped = this.skillManager.getEquippedAdvancedSkill();
        const isSameSkill = currentEquipped?.definition.id === skillId;
        const isFirstTime = !currentEquipped; // 首次取得進階技能

        // 只有切換到不同技能時才清除舊效果
        if (!isSameSkill && !isFirstTime) {
            this.clearAdvancedSkillEffects();
        }

        // 設定為裝備的進階技能
        const success = this.skillManager.setEquippedAdvancedSkill(skillId);
        if (!success) {
            console.warn(`Failed to equip advanced skill: ${skillId}`);
            // 失敗時重置狀態
            this.isSkillSelecting = false;
            this.isPaused = false;
            return;
        }

        // 升級進階技能
        this.skillManager.upgradeAdvancedSkill(skillId);

        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const newLevel = equipped?.level ?? 1;

        // 第一次選擇進階技能時顯示欄位
        if (!this.advancedSkillSlotVisible) {
            this.showAdvancedSkillSlot();
        }

        // 更新進階技能欄位顯示
        this.updateAdvancedSkillDisplay();

        // 首次取得或切換技能時：重置冷卻並立即觸發
        // 升級同一技能時：保持現有冷卻，不觸發
        if (equipped && (isFirstTime || (!isSameSkill && newLevel === 1))) {
            this.advancedSkillCooldownTime = 0;
            this.activateAdvancedSkill(equipped);
            this.advancedSkillCooldownTime = this.time.now;
        } else if (!isSameSkill) {
            // 切換到已升級過的技能：重置冷卻但不立即觸發
            this.advancedSkillCooldownTime = this.time.now;
        }
        // 升級同一技能：冷卻保持不變

        // 立即隱藏面板並恢復遊戲（不等動畫）
        this.hideSkillPanel();

        // 選中動畫（純視覺，不影響遊戲狀態）
        const selectedOption = this.skillOptions[index];
        this.tweens.add({
            targets: selectedOption,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 100,
            yoyo: true,
            onComplete: () => {
                // 動畫結束後顯示 CUT IN（使用進階技能定義）
                this.showAdvancedSkillCutIn(advSkillDef, newLevel);
            }
        });
    }

    // 建立進階技能選項卡片
    private createAdvancedSkillOptions() {
        // 選項卡片設定
        const cardWidth = this.gameBounds.width * 0.25;
        const cardHeight = this.gameBounds.height * (this.isMobile ? 0.55 : 0.5);
        const cardGap = this.gameBounds.width * 0.05;
        const numCards = this.currentAdvancedSkillChoices.length;
        const totalWidth = cardWidth * numCards + cardGap * (numCards - 1);
        const startX = this.gameBounds.x + (this.gameBounds.width - totalWidth) / 2 + cardWidth / 2;
        const centerY = this.gameBounds.y + this.gameBounds.height * 0.55;

        // 按鍵對應
        let keys: string[];
        if (numCards === 1) {
            keys = ['2'];
        } else if (numCards === 2) {
            keys = ['1', '3'];
        } else {
            keys = ['1', '2', '3'];
        }

        for (let i = 0; i < this.currentAdvancedSkillChoices.length; i++) {
            const advSkillDef = this.currentAdvancedSkillChoices[i];
            const currentLevel = this.skillManager.getAdvancedSkillLevel(advSkillDef.id);
            // 未擁有時 currentLevel = -1，學習後從 Lv.0 開始（與一般技能統一）
            const isNew = currentLevel < 0;
            const displayCurrentLevel = isNew ? '-' : currentLevel;
            const nextLevel = currentLevel + 1; // -1+1=0（新）、0+1=1、...
            const x = startX + i * (cardWidth + cardGap);

            // 建立選項容器
            const optionContainer = this.add.container(x, centerY);

            // 卡片背景（進階技能使用漸變邊框效果）
            const cardBg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x1a1a2e);
            cardBg.setStrokeStyle(3, 0xffd700); // 金色邊框
            optionContainer.add(cardBg);

            // 技能類型標籤
            const typeLabel = this.add.text(0, -cardHeight * 0.42, 'ADVANCED', {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045))}px`,
                color: '#ffd700',
                fontStyle: 'bold'
            });
            typeLabel.setResolution(2);
            typeLabel.setOrigin(0.5, 0.5);
            optionContainer.add(typeLabel);

            // 技能圖示區域
            const iconSize = cardWidth * 0.5;
            const iconY = -cardHeight * 0.18;
            const iconBg = this.add.rectangle(0, iconY, iconSize, iconSize, advSkillDef.color, 0.3);
            iconBg.setStrokeStyle(2, advSkillDef.color);
            optionContainer.add(iconBg);

            // 如果有技能圖示（檢查是否為固定圖示）
            if (advSkillDef.iconPrefix) {
                const isFixedIcon = /\d$/.test(advSkillDef.iconPrefix);
                const iconKey = isFixedIcon
                    ? `skill_icon_${advSkillDef.iconPrefix}`
                    : `skill_${advSkillDef.iconPrefix}0${Math.min(nextLevel, advSkillDef.maxLevel)}`;
                if (this.textures.exists(iconKey)) {
                    const iconSprite = this.add.sprite(0, iconY, iconKey);
                    iconSprite.setOrigin(0.5, 0.5);
                    const targetSize = iconSize - 8;
                    const scale = targetSize / Math.max(iconSprite.width, iconSprite.height);
                    iconSprite.setScale(scale);
                    optionContainer.add(iconSprite);
                    iconBg.setAlpha(0);
                }
            }

            // 技能名稱
            const nameY = cardHeight * 0.06;
            const nameText = this.add.text(0, nameY, advSkillDef.name, {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(cardHeight * 0.08))}px`,
                color: '#ffd700',
                fontStyle: 'bold'
            });
            nameText.setResolution(2);
            nameText.setOrigin(0.5, 0.5);
            optionContainer.add(nameText);

            // 副標題
            if (advSkillDef.subtitle) {
                const subtitleFontSize = this.isMobile
                    ? Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045))
                    : Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.055));
                const subtitleText = this.add.text(0, cardHeight * 0.12, advSkillDef.subtitle, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${subtitleFontSize}px`,
                    color: '#999999'
                });
                subtitleText.setResolution(2);
                subtitleText.setOrigin(0.5, 0.5);
                optionContainer.add(subtitleText);
            }

            // 等級顯示（無上限技能 maxLevel < 0）
            let levelDisplay: string;
            const isMaxed = advSkillDef.maxLevel >= 0 && nextLevel > advSkillDef.maxLevel;
            if (isMaxed) {
                levelDisplay = `Lv.${displayCurrentLevel} (MAX)`;
            } else if (isNew) {
                levelDisplay = `NEW → Lv.${nextLevel}`;
            } else {
                levelDisplay = `Lv.${displayCurrentLevel} → Lv.${nextLevel}`;
            }
            const levelText = this.add.text(0, cardHeight * 0.20, levelDisplay, {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.05))}px`,
                color: isMaxed ? '#ffff00' : '#88ff88',
                fontStyle: 'bold'
            });
            levelText.setResolution(2);
            levelText.setOrigin(0.5, 0.5);
            optionContainer.add(levelText);

            // 技能描述（固定字體大小，自動換行）
            const descY = cardHeight * 0.26;
            const descFontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045));
            // 使用 padding 常數計算文字換行寬度
            const textWrapWidth = cardWidth * (1 - MainScene.CARD_TEXT_PADDING * 2);
            const descText = this.add.text(0, descY, advSkillDef.description, {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${descFontSize}px`,
                color: '#dddddd',
                wordWrap: { width: textWrapWidth, useAdvancedWrap: true },
                align: 'center'
            });
            descText.setResolution(2);
            descText.setOrigin(0.5, 0);
            optionContainer.add(descText);

            // 按鍵提示標籤（手機版隱藏）- 放在卡片外的下方
            if (!this.isMobile) {
                const keyLabelY = cardHeight * 0.5 + cardHeight * 0.08; // 卡片底部外側
                const keyLabel = this.add.text(0, keyLabelY, `[ ${keys[i]} ]`, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.07))}px`,
                    color: '#ffff00',
                    fontStyle: 'bold'
                });
                keyLabel.setResolution(2);
                keyLabel.setOrigin(0.5, 0.5);
                optionContainer.add(keyLabel);
            }

            // 互動設定
            cardBg.setInteractive({ useHandCursor: true });
            cardBg.on('pointerover', () => {
                const prevIndex = this.selectedSkillIndex;
                this.selectedSkillIndex = i;
                this.updateSkillCardStyle(prevIndex, false);
                this.updateSkillCardStyle(i, true);
            });
            cardBg.on('pointerdown', () => {
                this.selectedSkillIndex = i;
                this.confirmSkillSelection();
            });

            this.skillOptions.push(optionContainer);
            this.skillCardBgs.push(cardBg);
            this.skillPanelContainer.add(optionContainer);
        }

        // 初始選中第一個
        this.selectedSkillIndex = 0;
        this.updateSkillCardStyle(0, true);
    }

    // 創建混合技能選項面板（一般 + 進階混合顯示）
    // 優先顯示一般技能，不足 3 個時用進階技能填充
    private createMixedSkillOptions() {
        // 重設混合選項追蹤
        this.mixedSkillTypes = [];
        this.mixedNormalIndices = [];
        this.mixedAdvancedIndices = [];
        this.isSelectingAdvancedSkill = false; // 混合模式使用特殊處理

        // 合併所有選項
        interface MixedOption {
            type: 'normal' | 'advanced';
            index: number;
        }
        const selectedOptions: MixedOption[] = [];

        // 先加入一般技能（最多 3 個）
        for (let i = 0; i < Math.min(3, this.currentSkillChoices.length); i++) {
            selectedOptions.push({ type: 'normal', index: i });
        }

        // 剩餘空位用進階技能填充
        const remainingSlots = 3 - selectedOptions.length;
        for (let i = 0; i < Math.min(remainingSlots, this.currentAdvancedSkillChoices.length); i++) {
            selectedOptions.push({ type: 'advanced', index: i });
        }

        // 記錄選擇的類型和索引
        selectedOptions.forEach(opt => {
            this.mixedSkillTypes.push(opt.type);
            if (opt.type === 'normal') {
                this.mixedNormalIndices.push(opt.index);
                this.mixedAdvancedIndices.push(-1);
            } else {
                this.mixedNormalIndices.push(-1);
                this.mixedAdvancedIndices.push(opt.index);
            }
        });

        // 選項卡片設定
        const cardWidth = this.gameBounds.width * 0.25;
        const cardHeight = this.gameBounds.height * (this.isMobile ? 0.55 : 0.5);
        const cardGap = this.gameBounds.width * 0.05;
        const numCards = selectedOptions.length;
        const totalWidth = cardWidth * numCards + cardGap * (numCards - 1);
        const startX = this.gameBounds.x + (this.gameBounds.width - totalWidth) / 2 + cardWidth / 2;
        const centerY = this.gameBounds.y + this.gameBounds.height * 0.55;

        // 按鍵對應
        let keys: string[];
        if (numCards === 1) {
            keys = ['2'];
        } else if (numCards === 2) {
            keys = ['1', '3'];
        } else {
            keys = ['1', '2', '3'];
        }

        for (let i = 0; i < selectedOptions.length; i++) {
            const opt = selectedOptions[i];
            const x = startX + i * (cardWidth + cardGap);

            // 建立選項容器
            const optionContainer = this.add.container(x, centerY);

            if (opt.type === 'normal') {
                // 一般技能卡片
                const skillDef = this.currentSkillChoices[opt.index];
                const currentLevel = this.skillManager.getSkillLevel(skillDef.id);
                const isNew = currentLevel < 0;
                const displayCurrentLevel = isNew ? '-' : currentLevel;
                const nextLevel = isNew ? 0 : currentLevel + 1;

                // 卡片背景
                const cardBg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x222222);
                cardBg.setStrokeStyle(2, 0x666666);
                optionContainer.add(cardBg);

                // 技能類型標籤
                const typeLabel = this.add.text(0, -cardHeight * 0.42, skillDef.type === 'active' ? 'ACTIVE' : 'PASSIVE', {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045))}px`,
                    color: skillDef.type === 'active' ? '#ff6666' : '#66ffff',
                    fontStyle: 'bold'
                });
                typeLabel.setResolution(2);
                typeLabel.setOrigin(0.5, 0.5);
                optionContainer.add(typeLabel);

                // 技能圖示區域
                const iconSize = cardWidth * 0.5;
                const iconY = -cardHeight * 0.18;
                const iconBg = this.add.rectangle(0, iconY, iconSize, iconSize, skillDef.color, 0.3);
                iconBg.setStrokeStyle(2, skillDef.color);
                optionContainer.add(iconBg);

                // 如果有技能圖示
                if (skillDef.iconPrefix) {
                    const isPassiveIcon = skillDef.iconPrefix.startsWith('P');
                    const iconKey = isPassiveIcon
                        ? `skill_icon_${skillDef.iconPrefix}`
                        : `skill_icon_${skillDef.iconPrefix}${nextLevel.toString().padStart(2, '0')}`;
                    if (this.textures.exists(iconKey)) {
                        const iconSprite = this.add.sprite(0, iconY, iconKey);
                        iconSprite.setOrigin(0.5, 0.5);
                        const targetSize = iconSize - 8;
                        const scale = targetSize / Math.max(iconSprite.width, iconSprite.height);
                        iconSprite.setScale(scale);
                        optionContainer.add(iconSprite);
                        iconBg.setAlpha(0);
                    }
                }

                // 技能名稱（固定位置）
                const nameY = cardHeight * 0.06;
                const nameText = this.add.text(0, nameY, skillDef.name, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(cardHeight * 0.08))}px`,
                    color: '#ffffff',
                    fontStyle: 'bold'
                });
                nameText.setResolution(2);
                nameText.setOrigin(0.5, 0.5);
                optionContainer.add(nameText);

                // 副標題
                if (skillDef.subtitle) {
                    const subtitleFontSize = this.isMobile
                        ? Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045))
                        : Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.055));
                    const subtitleText = this.add.text(0, cardHeight * 0.12, skillDef.subtitle, {
                        fontFamily: '"Noto Sans TC", sans-serif',
                        fontSize: `${subtitleFontSize}px`,
                        color: '#999999'
                    });
                    subtitleText.setResolution(2);
                    subtitleText.setOrigin(0.5, 0.5);
                    optionContainer.add(subtitleText);
                }

                // 等級顯示
                let levelDisplay: string;
                if (nextLevel >= skillDef.maxLevel) {
                    levelDisplay = `Lv.${displayCurrentLevel} → MAX`;
                } else if (isNew) {
                    levelDisplay = `NEW → Lv.${nextLevel}`;
                } else {
                    levelDisplay = `Lv.${displayCurrentLevel} → Lv.${nextLevel}`;
                }
                const levelText = this.add.text(0, cardHeight * 0.20, levelDisplay, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.05))}px`,
                    color: nextLevel >= skillDef.maxLevel ? '#ffff00' : '#88ff88',
                    fontStyle: 'bold'
                });
                levelText.setResolution(2);
                levelText.setOrigin(0.5, 0.5);
                optionContainer.add(levelText);

                // 技能描述（固定字體大小，自動換行）
                const descY = cardHeight * 0.26;
                const descFontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045));
                // 使用 padding 常數計算文字換行寬度
                const textWrapWidth = cardWidth * (1 - MainScene.CARD_TEXT_PADDING * 2);
                const descText = this.add.text(0, descY, skillDef.description, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${descFontSize}px`,
                    color: '#dddddd',
                    wordWrap: { width: textWrapWidth, useAdvancedWrap: true },
                    align: 'center'
                });
                descText.setResolution(2);
                descText.setOrigin(0.5, 0);
                optionContainer.add(descText);

                // 按鍵提示標籤 - 放在卡片外的下方
                if (!this.isMobile) {
                    const keyLabelY = cardHeight * 0.5 + cardHeight * 0.08; // 卡片底部外側
                    const keyLabel = this.add.text(0, keyLabelY, `[ ${keys[i]} ]`, {
                        fontFamily: '"Noto Sans TC", sans-serif',
                        fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(cardHeight * 0.06))}px`,
                        color: '#ffff00',
                        fontStyle: 'bold'
                    });
                    keyLabel.setResolution(2);
                    keyLabel.setOrigin(0.5, 0.5);
                    optionContainer.add(keyLabel);
                }

                // 互動
                cardBg.setInteractive({ useHandCursor: true });
                const cardIndex = i;
                cardBg.on('pointerover', () => {
                    this.setSelectedSkill(cardIndex);
                });
                cardBg.on('pointerdown', () => {
                    if (this.isMobile) {
                        if (this.selectedSkillIndex === cardIndex) {
                            this.confirmMixedSkillSelection();
                        } else {
                            this.setSelectedSkill(cardIndex);
                        }
                    } else {
                        this.setSelectedSkill(cardIndex);
                        this.confirmMixedSkillSelection();
                    }
                });

                this.skillCardBgs.push(cardBg);
            } else {
                // 進階技能卡片
                const advSkillDef = this.currentAdvancedSkillChoices[opt.index];
                const currentLevel = this.skillManager.getAdvancedSkillLevel(advSkillDef.id);
                // 未擁有時 currentLevel = -1，學習後從 Lv.0 開始（與一般技能統一）
                const isNew = currentLevel < 0;
                const displayCurrentLevel = isNew ? '-' : currentLevel;
                const nextLevel = currentLevel + 1; // -1+1=0（新）、0+1=1、...

                // 卡片背景（進階技能用金色邊框）
                const cardBg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x1a1a2e);
                cardBg.setStrokeStyle(3, 0xffd700);
                optionContainer.add(cardBg);

                // 技能類型標籤
                const typeLabel = this.add.text(0, -cardHeight * 0.42, 'ADVANCED', {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045))}px`,
                    color: '#ffd700',
                    fontStyle: 'bold'
                });
                typeLabel.setResolution(2);
                typeLabel.setOrigin(0.5, 0.5);
                optionContainer.add(typeLabel);

                // 技能圖示區域
                const iconSize = cardWidth * 0.5;
                const iconY = -cardHeight * 0.18;
                const iconBg = this.add.rectangle(0, iconY, iconSize, iconSize, advSkillDef.color, 0.3);
                iconBg.setStrokeStyle(2, advSkillDef.color);
                optionContainer.add(iconBg);

                // 如果有技能圖示（檢查是否為固定圖示）
                if (advSkillDef.iconPrefix) {
                    const isFixedIcon = /\d$/.test(advSkillDef.iconPrefix);
                    const iconKey = isFixedIcon
                        ? `skill_icon_${advSkillDef.iconPrefix}`
                        : `skill_${advSkillDef.iconPrefix}0${Math.min(nextLevel, advSkillDef.maxLevel < 0 ? nextLevel : advSkillDef.maxLevel)}`;
                    if (this.textures.exists(iconKey)) {
                        const iconSprite = this.add.sprite(0, iconY, iconKey);
                        iconSprite.setOrigin(0.5, 0.5);
                        const targetSize = iconSize - 8;
                        const scale = targetSize / Math.max(iconSprite.width, iconSprite.height);
                        iconSprite.setScale(scale);
                        optionContainer.add(iconSprite);
                        iconBg.setAlpha(0);
                    }
                }

                // 技能名稱
                const nameY = cardHeight * 0.06;
                const nameText = this.add.text(0, nameY, advSkillDef.name, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(cardHeight * 0.08))}px`,
                    color: '#ffd700',
                    fontStyle: 'bold'
                });
                nameText.setResolution(2);
                nameText.setOrigin(0.5, 0.5);
                optionContainer.add(nameText);

                // 副標題
                if (advSkillDef.subtitle) {
                    const subtitleFontSize = this.isMobile
                        ? Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045))
                        : Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.055));
                    const subtitleText = this.add.text(0, cardHeight * 0.12, advSkillDef.subtitle, {
                        fontFamily: '"Noto Sans TC", sans-serif',
                        fontSize: `${subtitleFontSize}px`,
                        color: '#999999'
                    });
                    subtitleText.setResolution(2);
                    subtitleText.setOrigin(0.5, 0.5);
                    optionContainer.add(subtitleText);
                }

                // 等級顯示（無上限技能）
                let levelDisplay: string;
                const isMaxed = advSkillDef.maxLevel >= 0 && nextLevel > advSkillDef.maxLevel;
                if (isMaxed) {
                    levelDisplay = `Lv.${displayCurrentLevel} (MAX)`;
                } else if (isNew) {
                    levelDisplay = `NEW → Lv.${nextLevel}`;
                } else {
                    levelDisplay = `Lv.${displayCurrentLevel} → Lv.${nextLevel}`;
                }
                const levelText = this.add.text(0, cardHeight * 0.20, levelDisplay, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.05))}px`,
                    color: isMaxed ? '#ffff00' : '#88ff88',
                    fontStyle: 'bold'
                });
                levelText.setResolution(2);
                levelText.setOrigin(0.5, 0.5);
                optionContainer.add(levelText);

                // 技能描述（固定字體大小，自動換行）
                const descY = cardHeight * 0.26;
                const descFontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045));
                // 使用 padding 常數計算文字換行寬度
                const textWrapWidthAdv = cardWidth * (1 - MainScene.CARD_TEXT_PADDING * 2);
                const descText = this.add.text(0, descY, advSkillDef.description, {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${descFontSize}px`,
                    color: '#dddddd',
                    wordWrap: { width: textWrapWidthAdv, useAdvancedWrap: true },
                    align: 'center'
                });
                descText.setResolution(2);
                descText.setOrigin(0.5, 0);
                optionContainer.add(descText);

                // 按鍵提示標籤 - 放在卡片外的下方
                if (!this.isMobile) {
                    const keyLabelY = cardHeight * 0.5 + cardHeight * 0.08; // 卡片底部外側
                    const keyLabel = this.add.text(0, keyLabelY, `[ ${keys[i]} ]`, {
                        fontFamily: '"Noto Sans TC", sans-serif',
                        fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.07))}px`,
                        color: '#ffff00',
                        fontStyle: 'bold'
                    });
                    keyLabel.setResolution(2);
                    keyLabel.setOrigin(0.5, 0.5);
                    optionContainer.add(keyLabel);
                }

                // 互動
                cardBg.setInteractive({ useHandCursor: true });
                const cardIndex = i;
                cardBg.on('pointerover', () => {
                    this.setSelectedSkill(cardIndex);
                });
                cardBg.on('pointerdown', () => {
                    if (this.isMobile) {
                        if (this.selectedSkillIndex === cardIndex) {
                            this.confirmMixedSkillSelection();
                        } else {
                            this.setSelectedSkill(cardIndex);
                        }
                    } else {
                        this.setSelectedSkill(cardIndex);
                        this.confirmMixedSkillSelection();
                    }
                });

                this.skillCardBgs.push(cardBg);
            }

            this.skillOptions.push(optionContainer);
            this.skillPanelContainer.add(optionContainer);
        }

        // 初始選中第一個
        this.selectedSkillIndex = 0;
        this.updateSkillCardStyle(0, true);
    }

    // 確認混合技能選擇
    private confirmMixedSkillSelection() {
        // 防止重複點擊
        if (this.isSkillSelecting) return;
        this.isSkillSelecting = true;

        const index = this.selectedSkillIndex;
        if (index < 0 || index >= this.mixedSkillTypes.length) return;

        const type = this.mixedSkillTypes[index];

        if (type === 'normal') {
            // 一般技能
            const normalIndex = this.mixedNormalIndices[index];
            if (normalIndex >= 0 && normalIndex < this.currentSkillChoices.length) {
                const skillDef = this.currentSkillChoices[normalIndex];
                this.selectSkill(normalIndex, skillDef.id);
            }
        } else {
            // 進階技能
            const advIndex = this.mixedAdvancedIndices[index];
            if (advIndex >= 0 && advIndex < this.currentAdvancedSkillChoices.length) {
                const advSkillDef = this.currentAdvancedSkillChoices[advIndex];

                // 檢查是否為升級同一技能還是切換到不同技能
                const currentEquipped = this.skillManager.getEquippedAdvancedSkill();
                const isSameSkill = currentEquipped?.definition.id === advSkillDef.id;
                const isFirstTime = !currentEquipped; // 首次取得進階技能

                // 只有切換到不同技能時才清除舊效果
                if (!isSameSkill && !isFirstTime) {
                    this.clearAdvancedSkillEffects();
                }

                // 裝備並升級進階技能
                this.skillManager.setEquippedAdvancedSkill(advSkillDef.id);
                this.skillManager.upgradeAdvancedSkill(advSkillDef.id);

                const newLevel = this.skillManager.getAdvancedSkillLevel(advSkillDef.id);

                // 顯示進階技能欄位（如果是第一次）
                this.showAdvancedSkillSlot();

                // 更新進階技能欄位顯示
                this.updateAdvancedSkillDisplay();

                // 首次取得或切換技能時：重置冷卻並立即觸發
                // 升級同一技能時：保持現有冷卻，不觸發
                const equipped = this.skillManager.getEquippedAdvancedSkill();
                if (equipped && (isFirstTime || (!isSameSkill && newLevel === 1))) {
                    this.advancedSkillCooldownTime = 0;
                    this.activateAdvancedSkill(equipped);
                    this.advancedSkillCooldownTime = this.time.now;
                } else if (!isSameSkill) {
                    // 切換到已升級過的技能：重置冷卻但不立即觸發
                    this.advancedSkillCooldownTime = this.time.now;
                }
                // 升級同一技能：冷卻保持不變

                // 先隱藏技能面板並恢復遊戲
                this.hideSkillPanel();

                // 再顯示 CUT IN
                this.showAdvancedSkillCutIn(advSkillDef, newLevel);
            }
        }
    }

    // 顯示進階技能 CUT IN
    private showAdvancedSkillCutIn(advSkillDef: AdvancedSkillDefinition, level: number) {
        // 動態生成進階技能的升級訊息
        const dynamicMessage = this.generateAdvancedSkillMessage(advSkillDef, level);
        const dynamicQuote = this.generateAdvancedSkillQuote(advSkillDef, level);

        // 進階技能專用 CUT IN（不使用 showSkillCutIn 避免 MAX 判斷問題）
        this.showAdvancedSkillCutInDirect(advSkillDef, level, dynamicMessage, dynamicQuote);
    }

    // 進階技能專用 CUT IN 顯示（無 MAX 上限）
    private showAdvancedSkillCutInDirect(
        advSkillDef: AdvancedSkillDefinition,
        level: number,
        message: string,
        quote: string
    ) {
        // 清除之前的內容
        this.skillCutInContainer.removeAll(true);

        // CUT IN 條的高度和位置（畫面上半中間）
        const barHeight = this.gameBounds.height * 0.22; // 加高區塊
        const barY = this.gameBounds.y + this.gameBounds.height * 0.25;
        const fadeWidth = this.gameBounds.width * 0.15;
        const solidWidth = this.gameBounds.width - fadeWidth * 2;

        // 中間實心黑色背景
        const bgCenter = this.add.rectangle(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY,
            solidWidth,
            barHeight,
            0x000000,
            0.75
        );
        this.skillCutInContainer.add(bgCenter);

        // 左側漸層
        const leftFade = this.add.graphics();
        const leftStartX = this.gameBounds.x;
        const leftEndX = this.gameBounds.x + fadeWidth;
        const fadeSteps = 20;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (i / fadeSteps) * 0.75;
            const x = leftStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            leftFade.fillStyle(0x000000, alpha);
            leftFade.fillRect(x, barY - barHeight / 2, w, barHeight);
        }
        this.skillCutInContainer.add(leftFade);

        // 右側漸層
        const rightFade = this.add.graphics();
        const rightStartX = this.gameBounds.x + this.gameBounds.width - fadeWidth;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (1 - i / fadeSteps) * 0.75;
            const x = rightStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            rightFade.fillStyle(0x000000, alpha);
            rightFade.fillRect(x, barY - barHeight / 2, w, barHeight);
        }
        this.skillCutInContainer.add(rightFade);

        // 邊線
        const lineThickness = 3;
        const color = advSkillDef.color;

        // 上邊線
        const topLineGraphics = this.add.graphics();
        const lineY = barY - barHeight / 2 - lineThickness / 2;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (i / fadeSteps) * 0.8;
            const x = leftStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            topLineGraphics.fillStyle(color, alpha);
            topLineGraphics.fillRect(x, lineY, w, lineThickness);
        }
        topLineGraphics.fillStyle(color, 0.8);
        topLineGraphics.fillRect(leftEndX, lineY, solidWidth, lineThickness);
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (1 - i / fadeSteps) * 0.8;
            const x = rightStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            topLineGraphics.fillStyle(color, alpha);
            topLineGraphics.fillRect(x, lineY, w, lineThickness);
        }
        this.skillCutInContainer.add(topLineGraphics);

        // 下邊線
        const bottomLineGraphics = this.add.graphics();
        const bottomLineY = barY + barHeight / 2 - lineThickness / 2;
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (i / fadeSteps) * 0.8;
            const x = leftStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            bottomLineGraphics.fillStyle(color, alpha);
            bottomLineGraphics.fillRect(x, bottomLineY, w, lineThickness);
        }
        bottomLineGraphics.fillStyle(color, 0.8);
        bottomLineGraphics.fillRect(leftEndX, bottomLineY, solidWidth, lineThickness);
        for (let i = 0; i < fadeSteps; i++) {
            const alpha = (1 - i / fadeSteps) * 0.8;
            const x = rightStartX + (fadeWidth / fadeSteps) * i;
            const w = fadeWidth / fadeSteps + 1;
            bottomLineGraphics.fillStyle(color, alpha);
            bottomLineGraphics.fillRect(x, bottomLineY, w, lineThickness);
        }
        this.skillCutInContainer.add(bottomLineGraphics);

        // 主標題：進階技能永遠顯示 Lv.X（無 MAX）
        const titleText = `${advSkillDef.name} 提升到 Lv.${level}`;
        const title = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY - barHeight * 0.30,
            titleText,
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_LARGE, Math.floor(barHeight * 0.26))}px`,
                color: '#ffffff',
                fontStyle: 'bold'
            }
        );
        title.setResolution(2);
        title.setOrigin(0.5, 0.5);
        this.skillCutInContainer.add(title);

        // 角色對話
        if (quote) {
            const quoteText = this.add.text(
                this.gameBounds.x + this.gameBounds.width / 2,
                barY + barHeight * 0.05,
                quote,
                {
                    fontFamily: '"Noto Sans TC", sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_LARGE, Math.floor(barHeight * 0.23))}px`,
                    color: '#ffffff'
                }
            );
            quoteText.setResolution(2);
            quoteText.setOrigin(0.5, 0.5);
            this.skillCutInContainer.add(quoteText);
        }

        // 數值描述
        const description = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY + barHeight * 0.25,
            message,
            {
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(barHeight * 0.15))}px`,
                color: Phaser.Display.Color.IntegerToColor(color).rgba
            }
        );
        description.setResolution(2);
        description.setOrigin(0.5, 0.5);
        this.skillCutInContainer.add(description);

        // 滑入動畫
        this.skillCutInContainer.setX(-this.gameBounds.width);
        this.skillCutInContainer.setVisible(true);
        this.skillCutInContainer.setAlpha(1);

        this.tweens.add({
            targets: this.skillCutInContainer,
            x: 0,
            duration: 250,
            ease: 'Power2.easeOut',
            onComplete: () => {
                this.time.delayedCall(1500, () => {
                    this.tweens.add({
                        targets: this.skillCutInContainer,
                        x: this.gameBounds.width,
                        duration: 200,
                        ease: 'Power2.easeIn',
                        onComplete: () => {
                            this.skillCutInContainer.setVisible(false);
                            // CutIn 動畫結束
                            this.isSkillSelecting = false;
                        }
                    });
                });
            }
        });
    }

    // 動態生成進階技能升級訊息
    private generateAdvancedSkillMessage(advSkillDef: AdvancedSkillDefinition, level: number): string {
        // 傷害單位 = 角色等級 + 技能等級，每單位 = 10 傷害
        const damageUnits = this.currentLevel + level;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 根據技能 ID 生成不同的訊息
        switch (advSkillDef.id) {
            case 'advanced_burning_celluloid':
                return `Lv.${level} - 傷害 ${damageUnits} 單位（${baseDamage}）`;
            case 'advanced_tech_artist':
                return `Lv.${level} - 傷害 ${damageUnits} 單位（${baseDamage}）`;
            case 'advanced_absolute_defense':
                return `Lv.${level} - 傷害 ${damageUnits} 單位（${baseDamage}）`;
            case 'advanced_perfect_pixel':
                return `Lv.${level} - 傷害 ${damageUnits} 單位（${baseDamage}）`;
            case 'advanced_vfx_burst':
                return `Lv.${level} - 傷害 ${damageUnits} 單位（${baseDamage}）`;
            case 'advanced_phantom_iteration': {
                const duration = Math.floor(level / 5) + 8;
                return `Lv.${level} - 持續 ${duration} 秒`;
            }
            case 'advanced_zero_trust':
                return `Lv.${level} - 傷害 ${damageUnits} 單位（${baseDamage}）`;
            case 'advanced_soul_slash':
                return `Lv.${level} - 傷害 ${damageUnits} 單位（${baseDamage}）`;
            default:
                return `Lv.${level}`;
        }
    }

    // 動態生成進階技能升級台詞
    private generateAdvancedSkillQuote(advSkillDef: AdvancedSkillDefinition, _level: number): string {
        // 使用定義中的第一個台詞作為基礎，如果沒有則使用副標題
        if (advSkillDef.levelUpQuotes && advSkillDef.levelUpQuotes.length > 0) {
            return advSkillDef.levelUpQuotes[0];
        }
        return advSkillDef.subtitle || '';
    }

    // ===== 技能範圍格子系統 =====

    // 建立技能範圍格子覆蓋層（只覆蓋遊玩區域）
    private createSkillGrid() {
        // 格子大小：倍率越高，格子越小（越細）
        // 1X = 粗（baseCellSize 20），2X = 中（10），3X = 細（6.67）
        const screenWidth = this.cameras.main.width;
        const baseWidth = 1920;
        const baseCellSize = 20 / this.gridScaleMultiplier;
        const minCellSize = 6 / this.gridScaleMultiplier;

        const scale = Math.min(1, screenWidth / baseWidth);
        this.skillGridCellSize = Math.max(minCellSize, Math.floor(baseCellSize * scale));

        const gap = MainScene.SKILL_GRID_GAP;

        // 只覆蓋遊玩區域（gameBounds），不是整個地圖
        this.skillGridCols = Math.ceil((this.gameBounds.width + gap) / (this.skillGridCellSize + gap));
        this.skillGridRows = Math.ceil((this.gameBounds.height + gap) / (this.skillGridCellSize + gap));

        // 建立格子容器（直接加到場景，不加入 uiContainer，避免蓋住 UI）
        this.skillGridContainer = this.add.container(this.gameBounds.x, this.gameBounds.y);
        // 深度 3：在 gameAreaContainer(0) 之上，怪物網格(5) 之下，uiContainer(100) 之下
        this.skillGridContainer.setDepth(3);

        // 建立所有格子（初始隱藏）
        for (let row = 0; row < this.skillGridRows; row++) {
            for (let col = 0; col < this.skillGridCols; col++) {
                const x = col * (this.skillGridCellSize + gap) + this.skillGridCellSize / 2;
                const y = row * (this.skillGridCellSize + gap) + this.skillGridCellSize / 2;

                const cell = this.add.rectangle(x, y, this.skillGridCellSize, this.skillGridCellSize, 0xffffff, 0);
                cell.setVisible(false);
                this.skillGridCells.push(cell);
                this.skillGridContainer.add(cell);
            }
        }

        // 繪製邊框
        this.drawBorderFrame();
    }

    // 重新建立技能範圍格子（用於切換網格倍率）
    private recreateSkillGrid() {
        // 清除舊的格子
        this.skillGridCells.forEach(cell => cell.destroy());
        this.skillGridCells = [];

        // 移除舊的容器
        if (this.skillGridContainer) {
            this.skillGridContainer.destroy();
        }

        // 重新建立格子
        this.createSkillGrid();

        // 重新建立技能欄（因為格子大小改變）
        this.recreateSkillBar();

        // 將 UI 元素移到容器頂層（確保在新網格之上）
        this.bringUIToTop();
    }

    // 將所有 UI 元素移到容器頂層
    private bringUIToTop() {
        // 把重要的 UI 元素移到 uiContainer 頂層（依渲染順序由下至上）

        // 角色容器
        if (this.characterContainer) {
            this.uiContainer.bringToTop(this.characterContainer);
        }

        // HP 條容器
        if (this.hpBarContainer) {
            this.uiContainer.bringToTop(this.hpBarContainer);
        }

        // 護盾文字
        if (this.shieldText) {
            this.uiContainer.bringToTop(this.shieldText);
        }

        // 經驗條容器
        if (this.expBarContainer) {
            this.uiContainer.bringToTop(this.expBarContainer);
        }

        // 技能圖示容器
        this.skillIconContainers.forEach(container => {
            this.uiContainer.bringToTop(container);
        });

        // 技能網格邊框
        this.skillIconGridGraphics.forEach(graphics => {
            this.uiContainer.bringToTop(graphics);
        });

        // 技能資訊面板
        if (this.skillInfoPanel) {
            this.uiContainer.bringToTop(this.skillInfoPanel);
        }

        // 技能選擇面板（最上層）
        if (this.skillPanelContainer) {
            this.uiContainer.bringToTop(this.skillPanelContainer);
        }
    }

    // 重新建立技能欄
    private recreateSkillBar() {
        // 清除舊的技能欄元素
        this.skillIcons.forEach(icon => icon.destroy());
        this.skillIcons = [];
        this.skillIconContainers.forEach(container => container.destroy());
        this.skillIconContainers = [];
        this.skillLevelTexts.forEach(text => text.destroy());
        this.skillLevelTexts = [];
        this.skillIconGridGraphics.forEach(graphics => graphics.destroy());
        this.skillIconGridGraphics = [];
        this.skillIconGridData = [];
        // 清除技能圖示 Sprite（已在 container 中被銷毀，只需重置陣列）
        this.skillIconSprites = [];

        // 清除技能資訊面板
        if (this.skillInfoPanel) {
            this.skillInfoPanel.destroy();
        }

        // 重新建立技能欄
        this.createSkillBar();
    }

    // ============ 技能特效物件池系統 ============
    // 紋理由 BootScene 預載（effects/*.png）

    // 初始化技能特效物件池
    private initSkillEffectPool() {
        // 預先創建 Sprite 物件
        for (let i = 0; i < MainScene.SKILL_EFFECT_POOL_SIZE; i++) {
            const sprite = this.add.sprite(0, 0, MainScene.TEXTURE_CIRCLE);
            sprite.setVisible(false);
            sprite.setActive(false);
            sprite.setDepth(51); // 在格子之上
            this.worldContainer.add(sprite);
            this.skillEffectPool.push(sprite);
        }
    }

    // 從物件池取得 Sprite
    private getSkillEffectSprite(): Phaser.GameObjects.Sprite | null {
        // 檢查是否超過最大活躍數
        if (this.activeSkillEffects.length >= MainScene.MAX_ACTIVE_SKILL_EFFECTS) {
            return null; // 超過上限，跳過此特效
        }
        // 優先從池中取用
        let sprite = this.skillEffectPool.pop();
        if (!sprite) {
            // 池空了，創建新的（但這應該很少發生）
            sprite = this.add.sprite(0, 0, MainScene.TEXTURE_CIRCLE);
            sprite.setDepth(51);
            this.worldContainer.add(sprite);
        }
        sprite.setVisible(true);
        sprite.setActive(true);
        this.activeSkillEffects.push(sprite);
        return sprite;
    }

    // 歸還 Sprite 到物件池
    private releaseSkillEffectSprite(sprite: Phaser.GameObjects.Sprite) {
        sprite.setVisible(false);
        sprite.setActive(false);
        sprite.setScale(1);
        sprite.setRotation(0);
        sprite.setAlpha(1);
        sprite.setTint(0xffffff);

        // 從活動列表移除
        const index = this.activeSkillEffects.indexOf(sprite);
        if (index > -1) {
            this.activeSkillEffects.splice(index, 1);
        }

        // 放回池中
        this.skillEffectPool.push(sprite);
    }

    // 初始化 LINE 物件池
    private initLineEffectPool() {
        for (let i = 0; i < MainScene.LINE_EFFECT_POOL_SIZE; i++) {
            const sprite = this.add.sprite(0, 0, MainScene.TEXTURE_LINE);
            sprite.setVisible(false);
            sprite.setActive(false);
            sprite.setDepth(58);
            this.skillGridContainer.add(sprite);
            this.lineEffectPool.push(sprite);
        }
    }

    // 從 LINE 池取得 Sprite（超過上限時返回 null）
    private getLineEffectSprite(): Phaser.GameObjects.Sprite | null {
        // 檢查是否超過最大活躍數
        if (this.activeLineEffects.length >= MainScene.MAX_ACTIVE_LINE_EFFECTS) {
            return null; // 超過上限，跳過此粒子
        }
        let sprite = this.lineEffectPool.pop();
        if (!sprite) {
            sprite = this.add.sprite(0, 0, MainScene.TEXTURE_LINE);
            sprite.setDepth(58);
            this.skillGridContainer.add(sprite);
        }
        sprite.setVisible(true);
        sprite.setActive(true);
        this.activeLineEffects.push(sprite);
        return sprite;
    }

    // 歸還 LINE Sprite 到物件池
    private releaseLineEffectSprite(sprite: Phaser.GameObjects.Sprite) {
        sprite.setVisible(false);
        sprite.setActive(false);
        sprite.setScale(1);
        sprite.setRotation(0);
        sprite.setAlpha(1);
        sprite.setTint(0xffffff);
        const index = this.activeLineEffects.indexOf(sprite);
        if (index > -1) {
            this.activeLineEffects.splice(index, 1);
        }
        this.lineEffectPool.push(sprite);
    }

    // 初始化 CIRCLE_LINE 物件池
    private initCircleLineEffectPool() {
        for (let i = 0; i < MainScene.CIRCLE_LINE_EFFECT_POOL_SIZE; i++) {
            const sprite = this.add.sprite(0, 0, MainScene.TEXTURE_CIRCLE_LINE);
            sprite.setVisible(false);
            sprite.setActive(false);
            sprite.setDepth(55);
            this.skillGridContainer.add(sprite);
            this.circleLineEffectPool.push(sprite);
        }
    }

    // 從 CIRCLE_LINE 池取得 Sprite
    private getCircleLineEffectSprite(): Phaser.GameObjects.Sprite {
        let sprite = this.circleLineEffectPool.pop();
        if (!sprite) {
            sprite = this.add.sprite(0, 0, MainScene.TEXTURE_CIRCLE_LINE);
            sprite.setDepth(55);
            this.skillGridContainer.add(sprite);
        }
        sprite.setVisible(true);
        sprite.setActive(true);
        this.activeCircleLineEffects.push(sprite);
        return sprite;
    }

    // 歸還 CIRCLE_LINE Sprite 到物件池
    private releaseCircleLineEffectSprite(sprite: Phaser.GameObjects.Sprite) {
        sprite.setVisible(false);
        sprite.setActive(false);
        sprite.setScale(1);
        sprite.setRotation(0);
        sprite.setAlpha(1);
        sprite.setTint(0xffffff);
        const index = this.activeCircleLineEffects.indexOf(sprite);
        if (index > -1) {
            this.activeCircleLineEffects.splice(index, 1);
        }
        this.circleLineEffectPool.push(sprite);
    }

    /**
     * 標準化打擊火花效果（使用物件池）
     * @param worldX 世界座標 X
     * @param worldY 世界座標 Y
     * @param color 主色調
     * @param hitDirection 打擊方向（弧度），火花會往反方向噴發；undefined 則隨機方向
     * @param count 火花數量（預設 8，一般技能建議 4-5）
     */
    private showHitSparkEffect(worldX: number, worldY: number, color: number, hitDirection?: number, count: number = 4) {
        const screen = this.worldToScreen(worldX, worldY);
        const unitSize = this.gameBounds.height / 10;

        const sparkCount = count;
        const sparkLength = unitSize * 1.2; // 原 1.8，減少 1/3
        const sparkWidth = 36;
        const spreadAngle = 35 * (Math.PI / 180); // 原 40°，左右各少 5°（總 70°）

        // 根據主色生成漸層
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        const sparkColors = [
            color,
            ((Math.min(255, r + 30) << 16) | (Math.min(255, g + 30) << 8) | Math.min(255, b + 30)),
            ((Math.min(255, r + 60) << 16) | (Math.min(255, g + 60) << 8) | Math.min(255, b + 60)),
            0xffffff,
            ((Math.min(255, r + 40) << 16) | (Math.min(255, g + 40) << 8) | Math.min(255, b + 40)),
            color,
            ((Math.min(255, r + 20) << 16) | (Math.min(255, g + 20) << 8) | Math.min(255, b + 20)),
            0xffffff
        ];

        for (let i = 0; i < sparkCount; i++) {
            let angle: number;
            let startX: number, startY: number;

            // 每條線的長度和寬度隨機變化
            const lengthRandom = 0.6 + Math.random() * 0.8; // 0.6~1.4 倍
            const widthRandom = 0.7 + Math.random() * 0.6;  // 0.7~1.3 倍
            const thisSparkLength = sparkLength * lengthRandom;
            const thisSparkWidth = sparkWidth * widthRandom;

            if (hitDirection !== undefined) {
                // 反彈模式：往打擊方向的反向噴發
                const reboundDir = hitDirection + Math.PI;
                // 均勻分布在扇形內，加較大隨機抖動
                const baseOffset = ((i / (sparkCount - 1)) - 0.5) * 2 * spreadAngle;
                const randomJitter = (Math.random() - 0.5) * 0.5; // 加大到 ±0.25 弧度（約 14°）
                angle = reboundDir + baseOffset + randomJitter;

                // 起點沿著垂直於反彈方向的線分散（橫向排列）+ 隨機偏移
                const perpDir = reboundDir + Math.PI / 2; // 垂直方向
                const lateralSpread = ((i / (sparkCount - 1)) - 0.5) * unitSize * 0.8;
                const lateralRandom = (Math.random() - 0.5) * unitSize * 0.3; // 額外隨機橫向偏移
                // 往飛行方向前進半個線條長度，讓線條尾端對齊撞擊點
                const tailOffset = thisSparkLength * 0.5;
                startX = screen.x + Math.cos(perpDir) * (lateralSpread + lateralRandom) + Math.cos(angle) * tailOffset;
                startY = screen.y + Math.sin(perpDir) * (lateralSpread + lateralRandom) + Math.sin(angle) * tailOffset;
            } else {
                // 隨機方向模式
                angle = Math.random() * Math.PI * 2;
                // 往飛行方向前進半個線條長度，讓線條尾端對齊中心
                const tailOffset = thisSparkLength * 0.5;
                startX = screen.x + Math.cos(angle) * tailOffset + (Math.random() - 0.5) * unitSize * 0.3;
                startY = screen.y + Math.sin(angle) * tailOffset + (Math.random() - 0.5) * unitSize * 0.3;
            }

            const lineSprite = this.getLineEffectSprite();
            if (!lineSprite) continue; // 超過上限則跳過

            lineSprite.setPosition(startX, startY);
            lineSprite.setTint(sparkColors[i % sparkColors.length]);
            lineSprite.setRotation(angle);
            const scaleX = thisSparkLength / MainScene.EFFECT_TEXTURE_SIZE;
            const scaleY = thisSparkWidth / MainScene.EFFECT_LINE_HEIGHT;
            lineSprite.setScale(scaleX, scaleY);
            lineSprite.setAlpha(1);

            const flyDist = unitSize * (1.2 + Math.random() * 1.3); // 1.2~2.5 單位
            const endX = startX + Math.cos(angle) * flyDist;
            const endY = startY + Math.sin(angle) * flyDist;

            this.tweens.add({
                targets: lineSprite,
                x: endX,
                y: endY,
                alpha: 0,
                scaleX: scaleX * 0.2,
                scaleY: scaleY * 0.4,
                duration: 280 + Math.random() * 140, // 280~420ms 隨機
                ease: 'Power2',
                onComplete: () => {
                    this.releaseLineEffectSprite(lineSprite);
                }
            });
        }
    }

    /**
     * 標準化爆炸火花效果（360度向外發散，使用物件池）
     * @param screenX 螢幕座標 X
     * @param screenY 螢幕座標 Y
     * @param color 主色調
     * @param radiusUnits 爆炸半徑（單位）
     */
    private showExplosionSparkEffect(screenX: number, screenY: number, color: number, radiusUnits: number = 1.5) {
        const unitSize = this.gameBounds.height / 10;

        const sparkCount = 8;
        const sparkLength = unitSize * 1.5;
        const sparkWidth = 32;
        const radius = unitSize * radiusUnits;

        // 根據主色生成漸層（從深到亮）
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        const sparkColors = [
            ((Math.max(0, r - 40) << 16) | (Math.max(0, g - 40) << 8) | Math.max(0, b - 40)),
            ((Math.max(0, r - 20) << 16) | (Math.max(0, g - 20) << 8) | Math.max(0, b - 20)),
            color,
            ((Math.min(255, r + 30) << 16) | (Math.min(255, g + 30) << 8) | Math.min(255, b + 30)),
            ((Math.min(255, r + 60) << 16) | (Math.min(255, g + 60) << 8) | Math.min(255, b + 60)),
            ((Math.min(255, r + 90) << 16) | (Math.min(255, g + 90) << 8) | Math.min(255, b + 90)),
            0xffffff,
            ((Math.min(255, r + 50) << 16) | (Math.min(255, g + 50) << 8) | Math.min(255, b + 50))
        ];

        for (let i = 0; i < sparkCount; i++) {
            // 每條線的長度和寬度隨機變化
            const lengthRandom = 0.6 + Math.random() * 0.8; // 0.6~1.4 倍
            const widthRandom = 0.7 + Math.random() * 0.6;  // 0.7~1.3 倍
            const thisSparkLength = sparkLength * lengthRandom;
            const thisSparkWidth = sparkWidth * widthRandom;

            // 均勻分布在 360 度，加較大隨機抖動
            const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;

            // 往飛行方向前進半個線條長度，讓線條尾端從中心開始
            const tailOffset = thisSparkLength * 0.5;
            const startX = screenX + Math.cos(angle) * tailOffset;
            const startY = screenY + Math.sin(angle) * tailOffset;

            const lineSprite = this.getLineEffectSprite();
            if (!lineSprite) continue; // 超過上限則跳過

            lineSprite.setPosition(startX, startY);
            lineSprite.setTint(sparkColors[i % sparkColors.length]);
            lineSprite.setRotation(angle);
            const scaleX = thisSparkLength / MainScene.EFFECT_TEXTURE_SIZE;
            const scaleY = thisSparkWidth / MainScene.EFFECT_LINE_HEIGHT;
            lineSprite.setScale(scaleX, scaleY);
            lineSprite.setAlpha(1);

            // 線條向外飛散（隨機距離）
            const flyDist = radius * (0.9 + Math.random() * 0.5); // 0.9~1.4 倍
            const endX = screenX + Math.cos(angle) * flyDist;
            const endY = screenY + Math.sin(angle) * flyDist;

            this.tweens.add({
                targets: lineSprite,
                x: endX,
                y: endY,
                alpha: 0,
                scaleX: scaleX * 0.3,
                duration: 250 + Math.random() * 100, // 250~350ms 隨機
                ease: 'Power2',
                onComplete: () => {
                    this.releaseLineEffectSprite(lineSprite);
                }
            });
        }
    }

    // 取得最接近的預生成扇形紋理 key
    private getSectorTextureKey(angleDegrees: number): string {
        // 常用角度
        const angles = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
        // 找最接近的
        let closest = angles[0];
        let minDiff = Math.abs(angleDegrees - closest);
        for (const angle of angles) {
            const diff = Math.abs(angleDegrees - angle);
            if (diff < minDiff) {
                minDiff = diff;
                closest = angle;
            }
        }
        return MainScene.TEXTURE_SECTOR_PREFIX + closest;
    }

    // ============ 使用物件池的技能特效函數 ============

    // 扇形特效（使用物件池）
    private flashSkillEffectSector(
        centerX: number, centerY: number,
        radius: number, angle: number, halfAngleDeg: number,
        color: number
    ) {
        const sprite = this.getSkillEffectSprite();
        if (!sprite) return;

        // 選擇最接近的紋理
        const textureKey = this.getSectorTextureKey(halfAngleDeg * 2);
        sprite.setTexture(textureKey);

        // 設定位置和旋轉
        sprite.setPosition(centerX, centerY);
        sprite.setRotation(angle); // angle 已經是弧度

        // 設定縮放（紋理尺寸 256，縮放到實際半徑）
        const scale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        sprite.setScale(scale);

        // 設定顏色
        sprite.setTint(color);
        sprite.setAlpha(0);

        // 展開動畫
        this.tweens.add({
            targets: sprite,
            alpha: { from: 0, to: 0.75 },
            scale: { from: scale * 0.5, to: scale },
            duration: 150,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // 停留後淡出
                this.time.delayedCall(150, () => {
                    this.tweens.add({
                        targets: sprite,
                        alpha: 0,
                        scale: scale * 1.1,
                        duration: 200,
                        ease: 'Quad.easeIn',
                        onComplete: () => {
                            this.releaseSkillEffectSprite(sprite);
                        }
                    });
                });
            }
        });
    }

    // 圓形特效（使用物件池）
    private flashSkillEffectCircle(
        centerX: number, centerY: number,
        radius: number,
        color: number
    ) {
        const sprite = this.getSkillEffectSprite();
        if (!sprite) return;

        sprite.setTexture(MainScene.TEXTURE_CIRCLE);
        sprite.setPosition(centerX, centerY);

        // 設定縮放
        const scale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        sprite.setScale(scale * 0.3);

        // 設定顏色
        sprite.setTint(color);
        sprite.setAlpha(0);
        sprite.setRotation(0); // 重置旋轉

        // 動畫參數
        const totalDuration = 500; // 總時長 500ms
        const startTime = this.time.now;
        const slowRotationSpeed = Math.PI * 5; // 前 80%（400ms）：轉 1 圈
        const fastRotationSpeed = Math.PI * 200; // 後 20%（100ms）：轉 10 圈

        // 動畫更新函數（同時處理旋轉、縮放、透明度）
        const updateEffect = () => {
            if (!sprite.active) return;

            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / totalDuration, 1);

            // 計算旋轉角度（前 80% 慢，後 20% 加速）
            let rotationAngle: number;
            if (progress < 0.8) {
                // 前 80%：慢速旋轉
                rotationAngle = progress * totalDuration / 1000 * slowRotationSpeed;
            } else {
                // 後 20%：加速旋轉
                const slowPart = 0.8 * totalDuration / 1000 * slowRotationSpeed;
                const fastProgress = (progress - 0.8) / 0.2; // 0~1
                const fastPart = fastProgress * 0.2 * totalDuration / 1000 * fastRotationSpeed;
                rotationAngle = slowPart + fastPart;
            }
            sprite.setRotation(rotationAngle);

            // 計算縮放（前 80% 慢慢放大，後 20% 快速放大並淡出）
            let currentScale: number;
            let currentAlpha: number;
            if (progress < 0.8) {
                // 前 80%：慢慢放大到目標大小
                const scaleProgress = progress / 0.8;
                currentScale = scale * 0.3 + (scale - scale * 0.3) * scaleProgress;
                currentAlpha = 0.75;
            } else {
                // 後 20%：快速放大並淡出
                const fadeProgress = (progress - 0.8) / 0.2;
                currentScale = scale + (scale * 0.2) * fadeProgress;
                currentAlpha = 0.75 * (1 - fadeProgress);
            }
            sprite.setScale(currentScale);
            sprite.setAlpha(currentAlpha);

            if (progress < 1) {
                this.time.delayedCall(16, updateEffect);
            } else {
                this.releaseSkillEffectSprite(sprite);
            }
        };

        updateEffect();
    }

    // 護盾特效（腳底橢圓 + 上升粒子）- 靈魂統領及相關組合技專用
    private flashShieldEffect(
        worldX: number, worldY: number,
        radius: number,
        color: number
    ) {
        const screen = this.worldToScreen(worldX, worldY);
        const unitSize = this.gameBounds.height / 10;

        // === 腳底橢圓（sector_360 壓扁）===
        const groundSprite = this.getSkillEffectSprite();
        if (!groundSprite) return;

        groundSprite.setTexture(MainScene.TEXTURE_SECTOR_360);
        groundSprite.setPosition(screen.x, screen.y + unitSize * 0.3); // 稍微往下（腳底位置）
        const groundScaleX = (radius * 2.5) / MainScene.EFFECT_TEXTURE_SIZE;
        const groundScaleY = groundScaleX * 0.3; // 壓扁成橢圓
        groundSprite.setScale(groundScaleX * 0.1, groundScaleY * 0.1);
        groundSprite.setTint(color);
        groundSprite.setAlpha(0);
        groundSprite.setRotation(0);
        groundSprite.setDepth(199);

        // 腳底橢圓動畫：快速展開 + 淡出
        this.tweens.add({
            targets: groundSprite,
            scaleX: { from: groundScaleX * 0.1, to: groundScaleX },
            scaleY: { from: groundScaleY * 0.1, to: groundScaleY },
            alpha: { from: 0.8, to: 0 },
            duration: 500,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.releaseSkillEffectSprite(groundSprite);
            }
        });

        // === 上升金色粒子（LINE 紋理）===
        const particleCount = 8;

        for (let i = 0; i < particleCount; i++) {
            const particle = this.getLineEffectSprite();
            if (!particle) continue; // 超過上限則跳過

            // 隨機起始位置（角色周圍橢圓分布）
            const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const dist = unitSize * (0.3 + Math.random() * 0.5);
            const startX = screen.x + Math.cos(angle) * dist;
            const startY = screen.y + unitSize * (0.1 + Math.random() * 0.3); // 隨機高度錯開

            // 粒子大小隨機（加大）
            const particleLength = unitSize * (0.25 + Math.random() * 0.2);
            const particleWidth = 20 + Math.random() * 16; // 加粗

            particle.setPosition(startX, startY);
            particle.setRotation(-Math.PI / 2 + (Math.random() - 0.5) * 0.4); // 大致朝上
            particle.setScale(
                particleLength / MainScene.EFFECT_TEXTURE_SIZE,
                particleWidth / MainScene.EFFECT_LINE_HEIGHT
            );
            particle.setTint(color);
            particle.setAlpha(0.9);
            particle.setDepth(200);

            // 上升 + 拉長 + 淡出動畫
            const riseHeight = unitSize * (2.0 + Math.random() * 1.5); // 上升更高
            const finalLength = particleLength * 2.5; // 拉長更多
            const duration = 500 + Math.random() * 300;
            const delay = i * 40; // 錯開出現時間

            this.tweens.add({
                targets: particle,
                y: startY - riseHeight,
                alpha: 0,
                scaleX: finalLength / MainScene.EFFECT_TEXTURE_SIZE, // 拉長
                scaleY: particleWidth * 0.4 / MainScene.EFFECT_LINE_HEIGHT,
                duration: duration,
                delay: delay,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    this.releaseLineEffectSprite(particle);
                }
            });
        }
    }

    // 八角盾爆炸特效（使用護盾八角形紋理，高速旋轉展開）
    private flashOctagonShieldExplosion(
        worldX: number, worldY: number,
        radius: number,
        color: number
    ) {
        // 轉換為螢幕座標
        const screen = this.worldToScreen(worldX, worldY);

        // 計算最終縮放（根據半徑和紋理大小）
        const finalScale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        const initialScale = finalScale * 0.05; // 從 5% 開始

        // === 1. 中央閃光爆發 ===
        const flash = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_CIRCLE);
        this.skillGridContainer.add(flash);
        flash.setTint(0xffffff);
        flash.setAlpha(1);
        flash.setScale(0.1);
        flash.setDepth(252);

        this.tweens.add({
            targets: flash,
            scaleX: finalScale * 0.8,
            scaleY: finalScale * 0.8,
            alpha: 0,
            duration: 300,
            ease: 'Cubic.easeOut',
            onUpdate: () => {
                const updatedScreen = this.worldToScreen(worldX, worldY);
                flash.setPosition(updatedScreen.x, updatedScreen.y);
            },
            onComplete: () => flash.destroy()
        });

        // === 2. 多層衝擊波環（延遲產生） ===
        const ringDelays = [0, 80, 160];
        const ringColors = [color, 0xffee88, 0xffffff];
        const ringAlphas = [0.9, 0.7, 0.5];

        ringDelays.forEach((delay, i) => {
            this.time.delayedCall(delay, () => {
                const ring = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_SHIELD);
                this.skillGridContainer.add(ring);
                ring.setTint(ringColors[i]);
                ring.setAlpha(ringAlphas[i]);
                ring.setScale(initialScale * (1 + i * 0.3));
                ring.setDepth(249 - i);

                this.tweens.add({
                    targets: ring,
                    scaleX: finalScale * (1.2 + i * 0.15),
                    scaleY: finalScale * (1.2 + i * 0.15),
                    rotation: Math.PI * (4 - i), // 各層不同旋轉速度
                    alpha: 0,
                    duration: 600 + i * 100,
                    ease: 'Cubic.easeOut',
                    onUpdate: () => {
                        const updatedScreen = this.worldToScreen(worldX, worldY);
                        ring.setPosition(updatedScreen.x, updatedScreen.y);
                    },
                    onComplete: () => ring.destroy()
                });
            });
        });

        // === 3. 主八角盾（金色，高速旋轉） ===
        const outer = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_SHIELD);
        this.skillGridContainer.add(outer);
        outer.setTint(color);
        outer.setAlpha(1);
        outer.setScale(initialScale);
        outer.setDepth(250);
        outer.setRotation(0);

        // === 4. 內層八角盾（白色高光，反向旋轉） ===
        const inner = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_SHIELD);
        this.skillGridContainer.add(inner);
        inner.setTint(0xffffff);
        inner.setAlpha(0.9);
        inner.setScale(initialScale * 0.5);
        inner.setDepth(251);
        inner.setRotation(0);

        // 外層動畫：快速展開 + 高速旋轉 3 圈 + 淡出
        this.tweens.add({
            targets: outer,
            scaleX: finalScale,
            scaleY: finalScale,
            rotation: Math.PI * 6, // 旋轉 3 圈（1080 度）
            alpha: 0,
            duration: 500,
            ease: 'Cubic.easeOut',
            onUpdate: () => {
                // 每幀更新位置以跟隨鏡頭
                const updatedScreen = this.worldToScreen(worldX, worldY);
                outer.setPosition(updatedScreen.x, updatedScreen.y);
            },
            onComplete: () => {
                outer.destroy();
            }
        });

        // 內層動畫：稍慢展開 + 反向高速旋轉 2 圈 + 淡出
        this.tweens.add({
            targets: inner,
            scaleX: finalScale * 0.6,
            scaleY: finalScale * 0.6,
            rotation: -Math.PI * 4, // 反向旋轉 2 圈
            alpha: 0,
            duration: 600,
            ease: 'Cubic.easeOut',
            onUpdate: () => {
                const updatedScreen = this.worldToScreen(worldX, worldY);
                inner.setPosition(updatedScreen.x, updatedScreen.y);
            },
            onComplete: () => {
                inner.destroy();
            }
        });

        // === 5. 金色火花粒子向外輻射（使用物件池）===
        const sparkCount = 8; // 減少至 8 個
        for (let i = 0; i < sparkCount; i++) {
            // 使用技能特效池來限制總數
            const spark = this.getSkillEffectSprite();
            if (!spark) continue; // 超過上限則跳過

            spark.setTexture(MainScene.TEXTURE_CIRCLE);

            const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.3;
            const sparkDist = radius * (0.8 + Math.random() * 0.4);
            const startScreen = this.worldToScreen(worldX, worldY);

            spark.setPosition(startScreen.x, startScreen.y);
            spark.setTint(i % 2 === 0 ? color : 0xffffff);
            spark.setAlpha(1);
            spark.setScale(0.08 + Math.random() * 0.04);
            spark.setDepth(253);

            // 火花目標位置（世界座標）
            const targetWorldX = worldX + Math.cos(angle) * sparkDist;
            const targetWorldY = worldY + Math.sin(angle) * sparkDist;

            this.tweens.add({
                targets: spark,
                scaleX: 0.02,
                scaleY: 0.02,
                alpha: 0,
                duration: 400 + Math.random() * 200,
                ease: 'Cubic.easeOut',
                onUpdate: (tween) => {
                    // 計算當前進度並更新螢幕位置
                    const progress = tween.progress;
                    const currentWorldX = worldX + (targetWorldX - worldX) * progress;
                    const currentWorldY = worldY + (targetWorldY - worldY) * progress;
                    const currentScreen = this.worldToScreen(currentWorldX, currentWorldY);
                    spark.setPosition(currentScreen.x, currentScreen.y);
                },
                onComplete: () => this.releaseSkillEffectSprite(spark)
            });
        }
    }

    // 直線特效（使用物件池）
    private flashSkillEffectLine(
        startX: number, startY: number,
        endX: number, endY: number,
        width: number,
        color: number
    ) {
        const sprite = this.getSkillEffectSprite();
        if (!sprite) return;

        sprite.setTexture(MainScene.TEXTURE_LINE);

        // 計算中心點和長度
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const centerX = (startX + endX) / 2;
        const centerY = (startY + endY) / 2;
        const angle = Math.atan2(dy, dx);

        sprite.setPosition(centerX, centerY);
        sprite.setRotation(angle);

        // 設定縮放（紋理尺寸 256x64）
        const scaleX = length / MainScene.EFFECT_TEXTURE_SIZE;
        const scaleY = width / MainScene.EFFECT_LINE_HEIGHT;
        sprite.setScale(scaleX, scaleY);

        // 設定顏色
        sprite.setTint(color);
        sprite.setAlpha(0);

        // 快速展開動畫
        this.tweens.add({
            targets: sprite,
            alpha: { from: 0, to: 0.85 },
            scaleY: { from: scaleY * 0.5, to: scaleY },
            duration: 80,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // 較長停留後淡出變細
                this.time.delayedCall(300, () => {
                    this.tweens.add({
                        targets: sprite,
                        alpha: 0,
                        scaleY: scaleY * 0.2,
                        duration: 400,
                        ease: 'Quad.easeIn',
                        onComplete: () => {
                            this.releaseSkillEffectSprite(sprite);
                        }
                    });
                });
            }
        });
    }

    // 移動中的衝擊波特效（穿透波用，使用物件池）
    private flashSkillEffectSectorMoving(
        originX: number, originY: number,
        startRadius: number, angle: number, _halfAngle: number,
        color: number, travelDistance: number
    ) {
        const sprite = this.getSkillEffectSprite();
        if (!sprite) return;

        // 使用衝擊波紋理
        sprite.setTexture(MainScene.TEXTURE_SOULWAVE);

        // 設定大小和旋轉
        const fullScale = (startRadius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        const initialScale = fullScale * 0.1; // 一開始壓扁到 10%
        sprite.setScale(initialScale);
        sprite.setRotation(angle);
        sprite.setTint(color);
        sprite.setAlpha(0.8);

        // 計算起始位置（從玩家位置開始，而非扇形末端）
        sprite.setPosition(originX, originY);

        const duration = 1000;
        const expandDuration = 500; // 0.5 秒內展開到原本尺寸
        const startTime = this.time.now;

        const updateMovement = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            if (progress >= 1) {
                this.releaseSkillEffectSprite(sprite);
                return;
            }

            // 計算展開進度（0.5 秒內從 10% 展開到 100%）
            const expandProgress = Math.min(elapsed / expandDuration, 1);
            const currentScale = initialScale + (fullScale - initialScale) * expandProgress;
            sprite.setScale(currentScale);

            // 計算當前位置（從玩家位置開始往外飛）
            const currentDist = travelDistance * progress;
            const currentX = originX + Math.cos(angle) * currentDist;
            const currentY = originY + Math.sin(angle) * currentDist;
            sprite.setPosition(currentX, currentY);

            // 透明度：逐漸淡出
            const alpha = 0.8 * (1 - progress * 0.7);
            sprite.setAlpha(alpha);

            // 繼續下一幀
            this.time.delayedCall(16, updateMovement);
        };

        updateMovement();
    }

    // 世界座標轉換為螢幕座標（相對於遊玩區域）
    private worldToScreen(worldX: number, worldY: number): { x: number, y: number } {
        return {
            x: worldX - this.cameraOffsetX,
            y: worldY - this.cameraOffsetY
        };
    }

    // 顯示技能範圍預覽（圓形）
    showSkillRangeCircle(centerX: number, centerY: number, radius: number, color: number, alpha: number = 0.3) {
        // 轉換為螢幕座標
        const screen = this.worldToScreen(centerX, centerY);
        const screenCenterX = screen.x;
        const screenCenterY = screen.y;

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        // 計算範圍內的格子
        const minCol = Math.max(0, Math.floor((screenCenterX - radius) / cellTotal));
        const maxCol = Math.min(this.skillGridCols - 1, Math.ceil((screenCenterX + radius) / cellTotal));
        const minRow = Math.max(0, Math.floor((screenCenterY - radius) / cellTotal));
        const maxRow = Math.min(this.skillGridRows - 1, Math.ceil((screenCenterY + radius) / cellTotal));

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellCenterX = col * cellTotal + this.skillGridCellSize / 2;
                const cellCenterY = row * cellTotal + this.skillGridCellSize / 2;

                const dx = cellCenterX - screenCenterX;
                const dy = cellCenterY - screenCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= radius) {
                    const idx = row * this.skillGridCols + col;
                    this.activateSkillGridCell(idx, color, alpha);
                }
            }
        }
    }

    // 顯示技能範圍預覽（扇形）
    showSkillRangeSector(centerX: number, centerY: number, radius: number, angle: number, halfAngle: number, color: number, alpha: number = 0.3) {
        // 轉換為螢幕座標
        const screen = this.worldToScreen(centerX, centerY);
        const screenCenterX = screen.x;
        const screenCenterY = screen.y;

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const minCol = Math.max(0, Math.floor((screenCenterX - radius) / cellTotal));
        const maxCol = Math.min(this.skillGridCols - 1, Math.ceil((screenCenterX + radius) / cellTotal));
        const minRow = Math.max(0, Math.floor((screenCenterY - radius) / cellTotal));
        const maxRow = Math.min(this.skillGridRows - 1, Math.ceil((screenCenterY + radius) / cellTotal));

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellCenterX = col * cellTotal + this.skillGridCellSize / 2;
                const cellCenterY = row * cellTotal + this.skillGridCellSize / 2;

                const dx = cellCenterX - screenCenterX;
                const dy = cellCenterY - screenCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= radius && dist > 0) {
                    // 檢查角度
                    const cellAngle = Math.atan2(dy, dx);
                    let angleDiff = Math.abs(cellAngle - angle);
                    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

                    if (angleDiff <= halfAngle) {
                        const idx = row * this.skillGridCols + col;
                        this.activateSkillGridCell(idx, color, alpha);
                    }
                }
            }
        }
    }

    // 顯示技能範圍預覽（線性/光束）
    showSkillRangeLine(startX: number, startY: number, endX: number, endY: number, width: number, color: number, alpha: number = 0.3) {
        // 轉換為螢幕座標
        const screenStart = this.worldToScreen(startX, startY);
        const screenEnd = this.worldToScreen(endX, endY);

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        // 計算線的方向和長度
        const dx = screenEnd.x - screenStart.x;
        const dy = screenEnd.y - screenStart.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length === 0) return;

        const dirX = dx / length;
        const dirY = dy / length;

        // 法向量
        const normX = -dirY;
        const normY = dirX;

        // 計算包圍盒
        const halfWidth = width / 2;
        const corners = [
            { x: screenStart.x + normX * halfWidth, y: screenStart.y + normY * halfWidth },
            { x: screenStart.x - normX * halfWidth, y: screenStart.y - normY * halfWidth },
            { x: screenEnd.x + normX * halfWidth, y: screenEnd.y + normY * halfWidth },
            { x: screenEnd.x - normX * halfWidth, y: screenEnd.y - normY * halfWidth }
        ];

        const minX = Math.min(...corners.map(c => c.x));
        const maxX = Math.max(...corners.map(c => c.x));
        const minY = Math.min(...corners.map(c => c.y));
        const maxY = Math.max(...corners.map(c => c.y));

        const minCol = Math.max(0, Math.floor(minX / cellTotal));
        const maxCol = Math.min(this.skillGridCols - 1, Math.ceil(maxX / cellTotal));
        const minRow = Math.max(0, Math.floor(minY / cellTotal));
        const maxRow = Math.min(this.skillGridRows - 1, Math.ceil(maxY / cellTotal));

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellCenterX = col * cellTotal + this.skillGridCellSize / 2;
                const cellCenterY = row * cellTotal + this.skillGridCellSize / 2;

                // 點到線段的距離
                const t = Math.max(0, Math.min(1,
                    ((cellCenterX - screenStart.x) * dirX + (cellCenterY - screenStart.y) * dirY) / length
                ));
                const projX = screenStart.x + t * dx;
                const projY = screenStart.y + t * dy;
                const distToLine = Math.sqrt((cellCenterX - projX) ** 2 + (cellCenterY - projY) ** 2);

                if (distToLine <= halfWidth) {
                    const idx = row * this.skillGridCols + col;
                    this.activateSkillGridCell(idx, color, alpha);
                }
            }
        }
    }

    // 清除所有技能範圍格子（保留邊緣紅暈格子）
    clearSkillGrid() {
        // 優化：只清除已啟用的格子，而非遍歷所有格子
        for (const index of this.activeSkillGridCells) {
            // 如果是邊緣格子且有低血量或護盾效果，不清除
            if (this.vignetteEdgeCells.has(index) && (this.isLowHp || this.currentShield > 0)) {
                continue;
            }
            const row = Math.floor(index / this.skillGridCols);
            const col = index % this.skillGridCols;

            // 如果是最外圈邊框（row 0、最後一行、第一列、最後一列），不清除
            if (row === 0 || row === this.skillGridRows - 1 ||
                col === 0 || col === this.skillGridCols - 1) {
                continue;
            }
            // ============================================================
            // ⚠️ 重要：不可刪除！HP/護盾條區域保護（row 1-3）
            // HP 條 3 排 + 護盾重疊在上面 2 排，共用 row 1, 2, 3
            // ============================================================
            if (row >= 1 && row <= 3) {
                continue;
            }
            // 如果是底部經驗條區域（row rows-3, rows-2），不清除
            if (row >= this.skillGridRows - 3) {
                continue;
            }
            const cell = this.skillGridCells[index];
            if (cell) {
                cell.setVisible(false);
            }
        }
        this.activeSkillGridCells.clear();
    }

    // 輔助方法：啟用格子並追蹤
    private activateSkillGridCell(index: number, color: number, alpha: number) {
        if (index < 0 || index >= this.skillGridCells.length) return;
        const cell = this.skillGridCells[index];
        if (cell) {
            cell.setFillStyle(color, alpha);
            cell.setVisible(true);
            this.activeSkillGridCells.add(index);
        }
    }

    // 在指定位置閃爍格子（命中回饋）- 帶高光、停留、漸變淡出
    flashGridAt(worldX: number, worldY: number, color: number, radius: number = 1) {
        // 轉換為螢幕座標
        const screen = this.worldToScreen(worldX, worldY);

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const centerCol = Math.floor(screen.x / cellTotal);
        const centerRow = Math.floor(screen.y / cellTotal);

        const duration = 600; // 總時長 600ms
        const holdTime = 200; // 前 200ms 高亮停留
        const startTime = this.time.now;

        // 收集需要閃爍的格子
        const cellsToFlash: { cell: Phaser.GameObjects.Rectangle, dist: number }[] = [];

        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const col = centerCol + dc;
                const row = centerRow + dr;

                if (col < 0 || col >= this.skillGridCols || row < 0 || row >= this.skillGridRows) continue;

                const dist = Math.sqrt(dr * dr + dc * dc);
                if (dist <= radius) {
                    const idx = row * this.skillGridCols + col;
                    const cell = this.skillGridCells[idx];
                    if (cell) {
                        cellsToFlash.push({ cell, dist });
                    }
                }
            }
        }

        if (cellsToFlash.length === 0) return;

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 計算淡出進度：前 holdTime 維持高亮，之後開始淡出
            let fadeProgress = 0;
            if (elapsed > holdTime) {
                fadeProgress = (elapsed - holdTime) / (duration - holdTime);
            }

            for (const { cell, dist } of cellsToFlash) {
                // 從中心向外漸變：中心最亮，邊緣較暗
                const distRatio = dist / Math.max(radius, 1);
                const baseAlpha = 1 - distRatio * 0.4; // 中心 100%，邊緣 60%

                // 淡出效果
                const currentAlpha = baseAlpha * (1 - fadeProgress);

                if (currentAlpha > 0.01) {
                    // 高亮效果：前 holdTime 顯示白色高光混合
                    if (elapsed < holdTime) {
                        // 中心格子顯示白色高光
                        const highlightRatio = 1 - distRatio;
                        const highlightAlpha = highlightRatio * 0.5;

                        // 先顯示基礎顏色
                        cell.setFillStyle(color, currentAlpha);
                        cell.setVisible(true);

                        // 如果是中心格子，疊加白色（用更亮的混合色模擬）
                        if (dist < radius * 0.5) {
                            // 混合白色：將顏色變亮
                            const r = ((color >> 16) & 0xff);
                            const g = ((color >> 8) & 0xff);
                            const b = (color & 0xff);
                            const brightR = Math.min(255, r + Math.floor((255 - r) * highlightAlpha));
                            const brightG = Math.min(255, g + Math.floor((255 - g) * highlightAlpha));
                            const brightB = Math.min(255, b + Math.floor((255 - b) * highlightAlpha));
                            const brightColor = (brightR << 16) | (brightG << 8) | brightB;
                            cell.setFillStyle(brightColor, currentAlpha);
                        }
                    } else {
                        cell.setFillStyle(color, currentAlpha);
                        cell.setVisible(true);
                    }
                } else {
                    cell.setVisible(false);
                }
            }

            // 動畫結束時清理
            if (progress >= 1) {
                for (const { cell } of cellsToFlash) {
                    cell.setVisible(false);
                    cell.setAlpha(1);
                }
            }
        };

        // 初始繪製
        updateEffect();

        // 使用 time event 持續更新
        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        // 確保清理
        this.time.delayedCall(duration + 50, () => {
            timerEvent.remove();
            for (const { cell } of cellsToFlash) {
                cell.setVisible(false);
                cell.setAlpha(1);
            }
        });
    }

    // 批量閃爍多個位置
    flashGridAtPositions(positions: { x: number, y: number }[], color: number, radius: number = 1) {
        positions.forEach(pos => {
            this.flashGridAt(pos.x, pos.y, color, radius);
        });
    }

    // 怪物死亡擴散特效（3個隨機起點圓形擴散）
    flashDeathEffect(worldX: number, worldY: number) {
        const screen = this.worldToScreen(worldX, worldY);
        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const centerCol = Math.floor(screen.x / cellTotal);
        const centerRow = Math.floor(screen.y / cellTotal);

        const numSeeds = 3; // 3 個擴散起點
        const duration = 400; // 總時長
        const startTime = this.time.now;

        // 隨機選擇 3 個起點（在怪物周邊，距離中心 2~4 格）
        const seeds: { col: number; row: number; radius: number }[] = [];
        for (let i = 0; i < numSeeds; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2 + Math.random() * 2; // 距離中心 2~4 格
            seeds.push({
                col: centerCol + Math.round(Math.cos(angle) * dist),
                row: centerRow + Math.round(Math.sin(angle) * dist),
                radius: 3 + Math.floor(Math.random() * 3) // 半徑 3~5 格（大小不一）
            });
        }

        // 收集所有需要繪製的格子（從各起點圓形擴散）
        const cellsMap = new Map<string, { col: number; row: number; dist: number }>();

        for (const seed of seeds) {
            const maxR = seed.radius;
            for (let r = -maxR; r <= maxR; r++) {
                for (let c = -maxR; c <= maxR; c++) {
                    // 歐幾里得距離（圓形）
                    const dist = Math.sqrt(r * r + c * c);
                    if (dist <= maxR) {
                        const col = seed.col + c;
                        const row = seed.row + r;
                        // 確保在螢幕範圍內
                        if (col >= 0 && col < this.skillGridCols && row >= 0 && row < this.skillGridRows) {
                            const key = `${col},${row}`;
                            const existing = cellsMap.get(key);
                            if (!existing || dist < existing.dist) {
                                cellsMap.set(key, { col, row, dist });
                            }
                        }
                    }
                }
            }
        }

        const cells = Array.from(cellsMap.values());
        if (cells.length === 0) return;

        // 計算最大距離用於動畫
        const maxDist = Math.max(...cells.map(c => c.dist));

        // 建立格子物件
        const flashCells: { rect: Phaser.GameObjects.Rectangle; dist: number }[] = [];
        for (const { col, row, dist } of cells) {
            const x = col * cellTotal + this.skillGridCellSize / 2;
            const y = row * cellTotal + this.skillGridCellSize / 2;
            const rect = this.add.rectangle(x, y, this.skillGridCellSize, this.skillGridCellSize, 0xffffff, 0);
            rect.setVisible(false);
            this.skillGridContainer.add(rect);
            flashCells.push({ rect, dist });
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            for (const { rect, dist } of flashCells) {
                // 格子出現時機：距離越近越早出現（用 maxDist 標準化）
                const appearTime = dist / (maxDist + 1);
                const fadeEnd = appearTime + 0.5;

                let alpha = 0;
                if (progress >= appearTime && progress <= fadeEnd) {
                    if (progress < appearTime + 0.1) {
                        alpha = (progress - appearTime) / 0.1;
                    } else {
                        alpha = 1 - (progress - appearTime - 0.1) / (fadeEnd - appearTime - 0.1);
                    }
                    alpha = Math.max(0, Math.min(0.8, alpha));
                }

                if (alpha > 0.01) {
                    // 隨機灰白色
                    const brightness = 200 + Math.floor(Math.random() * 55);
                    const color = (brightness << 16) | (brightness << 8) | brightness;
                    rect.setFillStyle(color, alpha);
                    rect.setVisible(true);
                } else {
                    rect.setVisible(false);
                }
            }

            if (progress >= 1) {
                for (const { rect } of flashCells) {
                    rect.destroy();
                }
            }
        };

        updateEffect();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            timerEvent.remove();
            for (const { rect } of flashCells) {
                if (rect.active) rect.destroy();
            }
        });
    }

    // 顯示技能打擊區持續特效（扇形）- 帶展開和淡出動畫
    // 特效固定在世界位置，不跟隨玩家移動
    flashSkillAreaSector(centerX: number, centerY: number, radius: number, angle: number, halfAngle: number, color: number) {
        // 使用世界座標為基準（不轉換成螢幕座標）
        const worldCenterX = centerX;
        const worldCenterY = centerY;

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const duration = 500; // 總時長 500ms
        const expandTime = 150; // 前 150ms 展開
        const holdTime = 150; // 中間 150ms 高亮停留
        const startTime = this.time.now;

        // 收集所有在扇形範圍內的格子及其距離（使用世界座標計算）
        const cellsInArea: { worldX: number, worldY: number, dist: number, angleDist: number }[] = [];

        // 計算覆蓋範圍（世界座標）
        const minWorldX = worldCenterX - radius;
        const maxWorldX = worldCenterX + radius;
        const minWorldY = worldCenterY - radius;
        const maxWorldY = worldCenterY + radius;

        // 遍歷網格
        for (let worldY = minWorldY; worldY <= maxWorldY; worldY += cellTotal) {
            for (let worldX = minWorldX; worldX <= maxWorldX; worldX += cellTotal) {
                // 對齊到網格
                const snappedX = Math.round(worldX / cellTotal) * cellTotal;
                const snappedY = Math.round(worldY / cellTotal) * cellTotal;

                const dx = snappedX - worldCenterX;
                const dy = snappedY - worldCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= radius && dist > 0) {
                    const cellAngle = Math.atan2(dy, dx);
                    let angleDiff = Math.abs(cellAngle - angle);
                    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

                    if (angleDiff <= halfAngle) {
                        cellsInArea.push({ worldX: snappedX, worldY: snappedY, dist, angleDist: angleDiff });
                    }
                }
            }
        }

        if (cellsInArea.length === 0) return;

        // 使用獨立的 Rectangle 物件，加到 worldContainer（會隨鏡頭移動，固定在世界位置）
        const flashCells: Phaser.GameObjects.Rectangle[] = [];
        for (const { worldX, worldY } of cellsInArea) {
            const cell = this.add.rectangle(worldX, worldY, this.skillGridCellSize, this.skillGridCellSize, color, 0);
            cell.setVisible(false);
            cell.setDepth(50); // 在地板之上
            this.worldContainer.add(cell);
            flashCells.push(cell);
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 展開進度：從中心向外展開
            const expandProgress = Math.min(elapsed / expandTime, 1);
            const currentExpandRadius = radius * expandProgress;

            // 淡出進度：展開+停留後開始從中心往外淡出
            let fadeProgress = 0;
            if (elapsed > expandTime + holdTime) {
                fadeProgress = (elapsed - expandTime - holdTime) / (duration - expandTime - holdTime);
            }
            // 從中心往外淡出的半徑（內側先消失）
            const fadeRadius = radius * fadeProgress;

            let i = 0;
            for (const { dist, angleDist } of cellsInArea) {
                const cell = flashCells[i++];
                if (!cell) continue;

                // 檢查是否在當前展開範圍內，且尚未被淡出
                if (dist <= currentExpandRadius && dist >= fadeRadius) {
                    const distRatio = dist / radius;
                    const angleRatio = angleDist / halfAngle; // 角度比例（0=中心線，1=邊緣）

                    // 計算到邊緣的距離（0=中心，1=邊緣）
                    const radiusEdgeness = distRatio; // 距離中心的比例
                    const angleEdgeness = angleRatio; // 距離中心線的比例

                    // 綜合邊緣值（取較大者，越接近邊緣值越高）
                    const edgeness = Math.max(radiusEdgeness, angleEdgeness);

                    // 使用平滑的 S 曲線（smoothstep）讓過渡更自然
                    // 從 0.3 開始漸變到 1.0
                    const t = Math.max(0, Math.min(1, (edgeness - 0.3) / 0.7));
                    const smoothT = t * t * (3 - 2 * t); // smoothstep

                    // 透明度：中心 15%，邊緣 75%
                    const baseAlpha = 0.15 + smoothT * 0.60;

                    // 接近淡出邊緣時漸變透明
                    let edgeFade = 1;
                    if (fadeRadius > 0) {
                        const fadeEdgeWidth = radius * 0.15;
                        if (dist < fadeRadius + fadeEdgeWidth) {
                            edgeFade = (dist - fadeRadius) / fadeEdgeWidth;
                        }
                    }

                    const currentAlpha = baseAlpha * edgeFade;

                    if (currentAlpha > 0.01) {
                        // 明度：使用同樣的平滑曲線，中心壓暗，邊緣保持原色
                        // 明度倍率：中心 0.5，邊緣 1.0
                        const brightnessMult = 0.5 + smoothT * 0.5;

                        const r = ((color >> 16) & 0xff);
                        const g = ((color >> 8) & 0xff);
                        const b = (color & 0xff);

                        // 邊緣高光（最外圈稍微提亮）
                        let finalR = r, finalG = g, finalB = b;
                        if (edgeness > 0.85 && elapsed < expandTime + holdTime) {
                            const highlightIntensity = (edgeness - 0.85) / 0.15;
                            finalR = Math.min(255, r + Math.floor((255 - r) * highlightIntensity * 0.3));
                            finalG = Math.min(255, g + Math.floor((255 - g) * highlightIntensity * 0.3));
                            finalB = Math.min(255, b + Math.floor((255 - b) * highlightIntensity * 0.3));
                        } else {
                            finalR = Math.floor(r * brightnessMult);
                            finalG = Math.floor(g * brightnessMult);
                            finalB = Math.floor(b * brightnessMult);
                        }

                        const displayColor = (finalR << 16) | (finalG << 8) | finalB;
                        cell.setFillStyle(displayColor, currentAlpha);
                        cell.setVisible(true);
                    } else {
                        cell.setVisible(false);
                    }
                } else {
                    cell.setVisible(false);
                }
            }

            // 動畫結束時清理
            if (progress >= 1) {
                for (const cell of flashCells) {
                    cell.destroy();
                }
            }
        };

        updateEffect();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            timerEvent.remove();
            for (const cell of flashCells) {
                if (cell.active) cell.destroy();
            }
        });
    }

    // 顯示技能打擊區持續特效（圓形）- 帶展開和淡出動畫
    // 特效固定在世界位置，不跟隨玩家移動
    flashSkillAreaCircle(centerX: number, centerY: number, radius: number, color: number) {
        // 使用世界座標為基準
        const worldCenterX = centerX;
        const worldCenterY = centerY;

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const duration = 500;
        const expandTime = 150;
        const holdTime = 150;
        const startTime = this.time.now;

        const cellsInArea: { worldX: number, worldY: number, dist: number }[] = [];

        // 計算覆蓋範圍（世界座標）
        const minWorldX = worldCenterX - radius;
        const maxWorldX = worldCenterX + radius;
        const minWorldY = worldCenterY - radius;
        const maxWorldY = worldCenterY + radius;

        // 遍歷網格
        for (let worldY = minWorldY; worldY <= maxWorldY; worldY += cellTotal) {
            for (let worldX = minWorldX; worldX <= maxWorldX; worldX += cellTotal) {
                // 對齊到網格
                const snappedX = Math.round(worldX / cellTotal) * cellTotal;
                const snappedY = Math.round(worldY / cellTotal) * cellTotal;

                const dx = snappedX - worldCenterX;
                const dy = snappedY - worldCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= radius) {
                    cellsInArea.push({ worldX: snappedX, worldY: snappedY, dist });
                }
            }
        }

        if (cellsInArea.length === 0) return;

        // 使用獨立的 Rectangle 物件，加到 worldContainer（固定在世界位置）
        const flashCells: Phaser.GameObjects.Rectangle[] = [];
        for (const { worldX, worldY } of cellsInArea) {
            const cell = this.add.rectangle(worldX, worldY, this.skillGridCellSize, this.skillGridCellSize, color, 0);
            cell.setVisible(false);
            cell.setDepth(50);
            this.worldContainer.add(cell);
            flashCells.push(cell);
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const expandProgress = Math.min(elapsed / expandTime, 1);
            const currentExpandRadius = radius * expandProgress;

            // 從中心往外淡出
            let fadeProgress = 0;
            if (elapsed > expandTime + holdTime) {
                fadeProgress = (elapsed - expandTime - holdTime) / (duration - expandTime - holdTime);
            }
            const fadeRadius = radius * fadeProgress;

            let i = 0;
            for (const { dist } of cellsInArea) {
                const cell = flashCells[i++];
                if (!cell) continue;

                if (dist <= currentExpandRadius && dist >= fadeRadius) {
                    const distRatio = dist / radius;

                    // 使用平滑的 S 曲線（smoothstep）讓過渡更自然
                    // 從 0.3 開始漸變到 1.0
                    const t = Math.max(0, Math.min(1, (distRatio - 0.3) / 0.7));
                    const smoothT = t * t * (3 - 2 * t); // smoothstep

                    // 透明度：中心 15%，邊緣 75%
                    const baseAlpha = 0.15 + smoothT * 0.60;

                    // 接近淡出邊緣時漸變透明
                    let edgeFade = 1;
                    if (fadeRadius > 0) {
                        const fadeEdgeWidth = radius * 0.15;
                        if (dist < fadeRadius + fadeEdgeWidth) {
                            edgeFade = (dist - fadeRadius) / fadeEdgeWidth;
                        }
                    }

                    const currentAlpha = baseAlpha * edgeFade;

                    if (currentAlpha > 0.01) {
                        // 明度：使用同樣的平滑曲線，中心壓暗，邊緣保持原色
                        // 明度倍率：中心 0.5，邊緣 1.0
                        const brightnessMult = 0.5 + smoothT * 0.5;

                        const r = ((color >> 16) & 0xff);
                        const g = ((color >> 8) & 0xff);
                        const b = (color & 0xff);

                        // 邊緣高光（最外圈稍微提亮）
                        let finalR = r, finalG = g, finalB = b;
                        if (distRatio > 0.85 && elapsed < expandTime + holdTime) {
                            const highlightIntensity = (distRatio - 0.85) / 0.15;
                            finalR = Math.min(255, r + Math.floor((255 - r) * highlightIntensity * 0.3));
                            finalG = Math.min(255, g + Math.floor((255 - g) * highlightIntensity * 0.3));
                            finalB = Math.min(255, b + Math.floor((255 - b) * highlightIntensity * 0.3));
                        } else {
                            finalR = Math.floor(r * brightnessMult);
                            finalG = Math.floor(g * brightnessMult);
                            finalB = Math.floor(b * brightnessMult);
                        }

                        const displayColor = (finalR << 16) | (finalG << 8) | finalB;
                        cell.setFillStyle(displayColor, currentAlpha);
                        cell.setVisible(true);
                    } else {
                        cell.setVisible(false);
                    }
                } else {
                    cell.setVisible(false);
                }
            }

            if (progress >= 1) {
                for (const cell of flashCells) {
                    cell.destroy();
                }
            }
        };

        updateEffect();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            timerEvent.remove();
            for (const cell of flashCells) {
                if (cell.active) cell.destroy();
            }
        });
    }

    // 顯示技能打擊區持續特效（光束/線性）- 帶展開、延遲、變細和淡出動畫
    // 特效固定在世界位置，不跟隨玩家移動
    flashSkillAreaLine(startX: number, startY: number, endX: number, endY: number, width: number, color: number) {
        // 使用世界座標為基準
        const worldStartX = startX;
        const worldStartY = startY;
        const worldEndX = endX;
        const worldEndY = endY;

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const dx = worldEndX - worldStartX;
        const dy = worldEndY - worldStartY;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length === 0) return;

        const dirX = dx / length;
        const dirY = dy / length;
        const normX = -dirY;
        const normY = dirX;
        const halfWidth = width / 2;

        // 調整時間：更長的延遲和淡出
        const duration = 800; // 總時長 800ms
        const expandTime = 80; // 快速展開 80ms
        const holdTime = 300; // 停留 300ms
        const fadeTime = duration - expandTime - holdTime; // 淡出時間
        const startTime = this.time.now;

        const cellsInArea: { worldX: number, worldY: number, distAlong: number, distToLine: number }[] = [];

        const corners = [
            { x: worldStartX + normX * halfWidth, y: worldStartY + normY * halfWidth },
            { x: worldStartX - normX * halfWidth, y: worldStartY - normY * halfWidth },
            { x: worldEndX + normX * halfWidth, y: worldEndY + normY * halfWidth },
            { x: worldEndX - normX * halfWidth, y: worldEndY - normY * halfWidth }
        ];

        const minX = Math.min(...corners.map(c => c.x));
        const maxX = Math.max(...corners.map(c => c.x));
        const minY = Math.min(...corners.map(c => c.y));
        const maxY = Math.max(...corners.map(c => c.y));

        // 遍歷網格（世界座標）
        for (let worldY = minY; worldY <= maxY; worldY += cellTotal) {
            for (let worldX = minX; worldX <= maxX; worldX += cellTotal) {
                // 對齊到網格
                const snappedX = Math.round(worldX / cellTotal) * cellTotal;
                const snappedY = Math.round(worldY / cellTotal) * cellTotal;

                const toCellX = snappedX - worldStartX;
                const toCellY = snappedY - worldStartY;

                const projLength = toCellX * dirX + toCellY * dirY;
                if (projLength < 0 || projLength > length) continue;

                const projX = worldStartX + dirX * projLength;
                const projY = worldStartY + dirY * projLength;

                const distToLine = Math.sqrt((snappedX - projX) ** 2 + (snappedY - projY) ** 2);

                if (distToLine <= halfWidth) {
                    cellsInArea.push({ worldX: snappedX, worldY: snappedY, distAlong: projLength, distToLine });
                }
            }
        }

        if (cellsInArea.length === 0) return;

        // 使用獨立的 Rectangle 物件，加到 worldContainer（固定在世界位置）
        const flashCells: Phaser.GameObjects.Rectangle[] = [];
        for (const { worldX, worldY } of cellsInArea) {
            const cell = this.add.rectangle(worldX, worldY, this.skillGridCellSize, this.skillGridCellSize, color, 0);
            cell.setVisible(false);
            cell.setDepth(50);
            this.worldContainer.add(cell);
            flashCells.push(cell);
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const expandProgress = Math.min(elapsed / expandTime, 1);
            const currentLength = length * expandProgress;

            // 從起點往終點淡出
            let fadeProgress = 0;
            if (elapsed > expandTime + holdTime) {
                fadeProgress = (elapsed - expandTime - holdTime) / fadeTime;
            }
            const fadeLength = length * fadeProgress;

            // 逐漸變細：寬度從 100% 縮減到 0%
            const currentWidthRatio = 1 - fadeProgress;

            let i = 0;
            for (const { distAlong, distToLine } of cellsInArea) {
                const cell = flashCells[i++];
                if (!cell) continue;

                // 計算當前有效寬度
                const currentHalfWidth = halfWidth * currentWidthRatio;

                // 檢查是否在當前展開範圍內、未被淡出、且在變細後的寬度內
                if (distAlong <= currentLength && distAlong >= fadeLength && distToLine <= currentHalfWidth) {
                    // 根據當前寬度計算比例（0=中心線，1=邊緣）
                    const widthRatio = currentHalfWidth > 0 ? distToLine / currentHalfWidth : 1;

                    // 簡單的光束效果：中心亮，向外漸暗
                    // 使用 1 - widthRatio^2 曲線，讓中心區域更亮
                    const centerFalloff = 1 - widthRatio * widthRatio;

                    // 透明度：邊緣 20%，中心 70%
                    let baseAlpha = 0.20 + centerFalloff * 0.50;

                    // 頭尾漸淡（前 15% 和後 15% 幾近透明）
                    const alongRatio = distAlong / length;
                    const headFade = Math.min(1, alongRatio / 0.15); // 頭部 0~15% 漸入
                    const tailFade = Math.min(1, (1 - alongRatio) / 0.15); // 尾部 85~100% 漸出
                    const headTailFade = Math.min(headFade, tailFade);
                    baseAlpha *= headTailFade * headTailFade; // 平方讓淡出更明顯

                    // 接近淡出邊緣時漸變透明
                    let edgeFade = 1;
                    if (fadeLength > 0) {
                        const fadeEdgeWidth = length * 0.1;
                        if (distAlong < fadeLength + fadeEdgeWidth) {
                            edgeFade = (distAlong - fadeLength) / fadeEdgeWidth;
                        }
                    }

                    const currentAlpha = baseAlpha * edgeFade;

                    if (currentAlpha > 0.01) {
                        // 明度：中心亮，邊緣暗
                        // 明度倍率：邊緣 0.6，中心 1.0
                        const brightnessMult = 0.6 + centerFalloff * 0.4;

                        const r = ((color >> 16) & 0xff);
                        const g = ((color >> 8) & 0xff);
                        const b = (color & 0xff);

                        // 中心高光（最中心 20% 範圍稍微提亮）
                        let finalR, finalG, finalB;
                        if (widthRatio < 0.2 && elapsed < expandTime + holdTime) {
                            const highlightIntensity = 1 - (widthRatio / 0.2);
                            finalR = Math.min(255, r + Math.floor((255 - r) * highlightIntensity * 0.3));
                            finalG = Math.min(255, g + Math.floor((255 - g) * highlightIntensity * 0.3));
                            finalB = Math.min(255, b + Math.floor((255 - b) * highlightIntensity * 0.3));
                        } else {
                            finalR = Math.floor(r * brightnessMult);
                            finalG = Math.floor(g * brightnessMult);
                            finalB = Math.floor(b * brightnessMult);
                        }

                        const displayColor = (finalR << 16) | (finalG << 8) | finalB;
                        cell.setFillStyle(displayColor, currentAlpha);
                        cell.setVisible(true);
                    } else {
                        cell.setVisible(false);
                    }
                } else {
                    cell.setVisible(false);
                }
            }

            if (progress >= 1) {
                for (const cell of flashCells) {
                    cell.destroy();
                }
            }
        };

        updateEffect();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            timerEvent.remove();
            for (const cell of flashCells) {
                if (cell.active) cell.destroy();
            }
        });
    }
}
