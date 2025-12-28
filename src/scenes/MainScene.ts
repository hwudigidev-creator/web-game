import Phaser from 'phaser';
import { SkillManager, SkillDefinition, PlayerSkill, SKILL_LIBRARY, AdvancedSkillDefinition, PlayerAdvancedSkill } from '../systems/SkillSystem';
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
    private baseMoveSpeed: number = 0; // 基礎移動速度（像素/秒），在 create 中根據畫面大小初始化
    private moveSpeed: number = 0; // 實際移動速度（套用加成後）

    // 地圖倍率（相對於可視區域的倍數）
    private static readonly MAP_SCALE = 10;

    // 技能欄設定
    private static readonly ACTIVE_SKILLS = 4;
    private static readonly PASSIVE_SKILLS = 3;

    // 地板格子
    private floorGrid!: Phaser.GameObjects.Graphics;

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

    // WASD 鍵盤控制
    private cursors!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };
    private isKeyboardMoving: boolean = false;

    // 技能選擇面板
    private skillPanelContainer!: Phaser.GameObjects.Container;
    private isPaused: boolean = false;
    private isSkillSelecting: boolean = false; // 防止重複點擊
    private skillOptions: Phaser.GameObjects.Container[] = [];
    // 技能選擇按鍵 (1, 2, 3)
    private keyOne!: Phaser.Input.Keyboard.Key;
    private keyTwo!: Phaser.Input.Keyboard.Key;
    private keyThree!: Phaser.Input.Keyboard.Key;
    private skillCardBgs: Phaser.GameObjects.Rectangle[] = [];

    // 遊戲計時器
    private gameTimer: number = 0; // 遊戲進行時間（毫秒）
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

    // 零信任防禦協定：8發從上方落下的持續光束
    private zeroTrustActive: boolean = false; // 是否啟用
    private zeroTrustSprite?: Phaser.GameObjects.Sprite; // 八角矩陣護盾圖
    private zeroTrustTrackedMonsters: Set<number> = new Set(); // 已追蹤的怪物（避免重複鎖定）
    private zeroTrustBeams: {
        targetMonsterId: number; // 鎖定的怪物 ID
        targetX: number;         // 鎖定位置 X（世界座標）
        targetY: number;         // 鎖定位置 Y（世界座標）
        lastDamageTime: number;  // 上次造成傷害的時間
        beamSprite: Phaser.GameObjects.Sprite; // 主光束（line 圖片）
        pulseOffset: number;     // 射線角度偏移（±15°）
    }[] = []; // 最多 8 發光束

    // 幻影迭代模式：影分身系統（支援多個幻影）
    private phantoms: {
        id: number;
        x: number;
        y: number;
        targetX: number;
        targetY: number;
        moving: boolean;
        sprite: Phaser.GameObjects.Sprite;
        skillTimer: Phaser.Time.TimerEvent;
        dismissTimer: Phaser.Time.TimerEvent;
        tauntTimer: Phaser.Time.TimerEvent; // 嘲諷週期計時器
        lastAfterimageTime: number; // 上次殘影時間
    }[] = [];
    private nextPhantomId: number = 0;
    private phantomSawBladeActive: Set<number> = new Set(); // 追蹤哪些分身已有輪鋸
    private globalChainRayTimer?: Phaser.Time.TimerEvent; // 全局彈射射線計時器

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
    private shieldText!: Phaser.GameObjects.Text;
    private shieldAuraGraphics!: Phaser.GameObjects.Graphics; // 護盾光環圖形
    private shieldSparkleTimer: number = 0; // 金光閃點計時器

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
    // 紋理 key（對應 BootScene 載入的圖片）
    private static readonly TEXTURE_SECTOR_PREFIX = 'effect_sector_'; // 扇形紋理前綴 (後綴為角度)
    private static readonly TEXTURE_SECTOR_360 = 'effect_sector_360'; // 360度扇形（爆炸內圈用）
    private static readonly TEXTURE_CIRCLE = 'effect_circle'; // 圓形紋理
    private static readonly TEXTURE_CIRCLE_LINE = 'effect_circle_line'; // 圓形線條紋理（爆炸外圈用）
    private static readonly TEXTURE_LINE = 'effect_line'; // 直線紋理
    private static readonly TEXTURE_SOULWAVE = 'effect_soulwave'; // 衝擊波紋理
    private static readonly TEXTURE_SHIELD = 'effect_shield'; // 護盾紋理
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

        // 根據裝置設定預設網格倍率（手機 2X，電腦 3X）
        this.gridScaleMultiplier = this.isMobile ? 2 : 3;

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

        // 繪製地板格子（測試用）
        this.floorGrid = this.add.graphics();
        this.drawFloorGrid();
        this.worldContainer.add(this.floorGrid);

        // 建立角色動畫
        this.createCharacterAnimations();

        // 建立角色容器（會隨鏡頭移動，但獨立於 worldContainer 以便設定深度）
        this.characterContainer = this.add.container(this.gameBounds.x, this.gameBounds.y);

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

        // 建立技能範圍格子覆蓋層（放在 UI 層）
        this.createSkillGrid();

        // 初始化技能特效物件池（紋理由 BootScene 預載）
        this.initSkillEffectPool();

        // 監聯網格倍率變更事件
        window.addEventListener('gridscalechange', ((e: CustomEvent) => {
            this.gridScaleMultiplier = e.detail.scale;
            this.recreateSkillGrid();
            // 同步更新怪物網格倍率
            this.monsterManager.setGridScaleMultiplier(e.detail.scale);
        }) as EventListener);

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

        // 監聽點擊/觸控事件（按住持續移動）
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);

        // 設定 WASD 鍵盤控制
        if (this.input.keyboard) {
            this.cursors = {
                W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
                A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
                S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
                D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
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
        }

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

        // 注意：技能面板會在轉場完成後自動顯示（見 onRevealComplete）
    }

    update(_time: number, delta: number) {
        // 如果遊戲暫停，只處理技能選擇面板的按鍵和必要的 UI 更新
        if (this.isPaused) {
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

        // 更新遊戲計時器（只在非暫停時累加）
        this.gameTimer += delta;
        this.updateTimerDisplay();

        // 處理測試用 +/- 按鍵
        this.handleExpTestInput();

        // 檢查受傷硬直狀態
        const now = this.time.now;
        if (this.isHurt && now >= this.hurtEndTime) {
            this.isHurt = false;
            // 硬直結束，恢復待機動畫
            this.setCharacterState('idle');
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

        // 嘗試發動技能攻擊
        this.tryActivateSkills(now);
    }


    // 嘗試發動可用的技能
    private tryActivateSkills(now: number) {
        // 如果正在受傷硬直，不能發動技能
        if (this.isHurt) return;

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
    private activateSoulRender(skill: PlayerSkill) {
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
        // 扇形角度：60 度 + 每級 10 度（Lv.0=60度，Lv.5=110度）
        const sectorAngle = 60 + skill.level * 10;
        const halfAngle = (sectorAngle / 2) * (Math.PI / 180);

        // 傷害：2 單位 + 每級 1 單位（Lv.0=2單位，Lv.5=7單位）
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
            const hitPositions = monsters
                .filter(m => hitMonsters.includes(m.id))
                .map(m => ({ x: m.x, y: m.y }));

            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }

            // 命中回饋：白色十字高光（暴擊時使用橙色）
            if (isCrit) {
                this.flashCritCrossAtPositions(hitPositions);
            } else {
                this.flashWhiteCrossAtPositions(hitPositions);
            }


            // 擊中 10 隻以上觸發畫面震動
            this.shakeScreen(hitMonsters.length);
            const critText = isCrit ? ' [CRIT!]' : '';
        }

        // MAX 後額外能力：衝擊波（從扇形末端發射持續前進的扇形波）
        const waveChance = this.skillManager.getSoulRenderWaveChance(this.currentLevel);
        if (waveChance > 0 && Math.random() < waveChance) {
            this.triggerSoulRenderWave(targetAngle, range, halfAngle, finalDamage, skill);
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

    // 繪製圓形邊緣線（白色，每120度一段漸層透明）
    private drawCircleEdge(radius: number, _color: number, customOriginX?: number, customOriginY?: number) {
        const graphics = this.add.graphics();
        // 加到 skillGridContainer 並設定深度在網格之上
        this.skillGridContainer.add(graphics);
        graphics.setDepth(55); // 在網格 (50) 之上

        // 記錄世界座標（每幀重新計算螢幕座標以跟隨鏡頭）
        const worldOriginX = customOriginX ?? this.characterX;
        const worldOriginY = customOriginY ?? this.characterY;

        const duration = 500;
        const holdTime = 300;
        const startTime = this.time.now;

        // 每段 120 度，分成 3 段
        const segmentCount = 3;
        const segmentAngle = (Math.PI * 2) / segmentCount;
        // 每段內分成多個小段來繪製漸層
        const subSegments = 24;

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            graphics.clear();

            // 每幀重新計算螢幕座標以跟隨鏡頭
            const screen = this.worldToScreen(worldOriginX, worldOriginY);
            const originX = screen.x;
            const originY = screen.y;

            let fadeProgress = 0;
            if (elapsed > holdTime) {
                fadeProgress = (elapsed - holdTime) / (duration - holdTime);
            }
            const baseAlpha = 1.0 * (1 - fadeProgress);

            // 順時針旋轉：計算旋轉角度（最後 20% 加速）
            const baseRotationSpeed = Math.PI * 2; // 基礎速度：每秒 1 圈
            let rotationAngle: number;
            if (progress < 0.8) {
                // 前 80%：正常速度
                rotationAngle = progress * duration / 1000 * baseRotationSpeed;
            } else {
                // 最後 20%：加速 3 倍
                const normalPart = 0.8 * duration / 1000 * baseRotationSpeed;
                const acceleratedProgress = (progress - 0.8) / 0.2; // 0~1
                const acceleratedPart = acceleratedProgress * 0.2 * duration / 1000 * baseRotationSpeed * 3;
                rotationAngle = normalPart + acceleratedPart;
            }

            if (baseAlpha > 0.01) {
                // 繪製 3 段，每段 120 度，帶漸層透明（兩端亮、中間暗）
                for (let seg = 0; seg < segmentCount; seg++) {
                    const segStartAngle = seg * segmentAngle - Math.PI / 2 + rotationAngle; // 從頂部開始 + 旋轉

                    for (let i = 0; i < subSegments; i++) {
                        // 計算這個小段的透明度（兩端 1.0，中間 0.2）
                        const t = i / subSegments;
                        // 使用 cos 曲線：0->1->0 對應 兩端亮->中間暗->兩端亮
                        const alphaFactor = 0.2 + 0.8 * Math.abs(Math.cos(t * Math.PI));
                        const segmentAlpha = baseAlpha * alphaFactor;

                        const angle1 = segStartAngle + (i / subSegments) * segmentAngle;
                        const angle2 = segStartAngle + ((i + 1) / subSegments) * segmentAngle;

                        const x1 = originX + Math.cos(angle1) * radius;
                        const y1 = originY + Math.sin(angle1) * radius;
                        const x2 = originX + Math.cos(angle2) * radius;
                        const y2 = originY + Math.sin(angle2) * radius;

                        // 白色圓弧線段（與射線同粗細）
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
    // 起始範圍 2 單位，每級 +0.5 單位（Lv.0=2單位，Lv.5=4.5單位）
    // 起始傷害 1 單位，每級 +1 單位（Lv.0=1單位，Lv.5=6單位）
    private activateCoder(skill: PlayerSkill) {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 1 單位 = 畫面高度 10%
        const unitSize = this.gameBounds.height * 0.1;

        // 範圍：2 單位 + 每級 0.5 單位（Lv.0=2單位，Lv.5=4.5單位）
        const rangeUnits = 2 + skill.level * 0.5;
        const range = unitSize * rangeUnits;

        // 傷害：1 單位 + 每級 1 單位（Lv.0=1單位，Lv.5=6單位）
        const damageUnits = 1 + skill.level;
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
            const hitPositions = monsters
                .filter(m => hitMonsters.includes(m.id))
                .map(m => ({ x: m.x, y: m.y }));

            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }

            // 命中回饋：白色十字高光（暴擊時使用橙色）
            if (isCrit) {
                this.flashCritCrossAtPositions(hitPositions);
            } else {
                this.flashWhiteCrossAtPositions(hitPositions);
            }


            // 擊中 10 隻以上觸發畫面震動
            this.shakeScreen(hitMonsters.length);
            const critText = isCrit ? ' [CRIT!]' : '';

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
                const hitPositions = monsters
                    .filter(m => hitMonsters.includes(m.id))
                    .map(m => ({ x: m.x, y: m.y }));

                const result = this.monsterManager.damageMonsters(hitMonsters, damage);
                if (result.totalExp > 0) {
                    this.addExp(result.totalExp);
                }

                this.flashWhiteCrossAtPositions(hitPositions);
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

                this.flashWhiteCrossAtPositions(burstHitPositions);
            }
        }
    }

    // 視效師：投射貫穿光束，對直線 10 單位範圍敵人造成傷害
    // 每級多發射一道隨機方向的光束（Lv.0=1道，Lv.5=6道）
    // 傷害：1 單位 + 每級 1 單位（Lv.0=1單位，Lv.5=6單位）
    private activateVfx(skill: PlayerSkill) {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 光束數量 = 技能等級 + 1（Lv.0=1道，Lv.5=6道）
        const beamCount = skill.level + 1;

        // 光束參數
        const range = this.gameBounds.height * 1.0; // 10 個單位（畫面高度 10% * 10）
        const beamWidth = this.gameBounds.height * 0.05; // 光束寬度（0.5 單位）

        // 傷害：1 單位 + 每級 1 單位（Lv.0=1單位，Lv.5=6單位）
        const damageUnits = 1 + skill.level;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        // 收集所有被命中的怪物（使用 Set 避免重複）
        const allHitMonsters = new Set<number>();

        // 隨機選擇不重複的目標怪物
        const availableIndices = monsters.map((_, i) => i);
        const targetAngles: number[] = [];

        for (let beam = 0; beam < beamCount; beam++) {
            let targetAngle: number;

            if (availableIndices.length > 0) {
                // 從可用的怪物中隨機選一個
                const pickIndex = Math.floor(Math.random() * availableIndices.length);
                const monsterIndex = availableIndices[pickIndex];
                availableIndices.splice(pickIndex, 1); // 移除已選的索引

                const targetMonster = monsters[monsterIndex];
                targetAngle = Math.atan2(
                    targetMonster.y - this.characterY,
                    targetMonster.x - this.characterX
                );
            } else {
                // 怪物不夠時，隨機角度
                targetAngle = Math.random() * Math.PI * 2;
            }

            targetAngles.push(targetAngle);

            // 檢查哪些怪物在這道光束範圍內
            for (const monster of monsters) {
                // 計算怪物碰撞半徑（體型的一半）
                const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

                const dx = monster.x - this.characterX;
                const dy = monster.y - this.characterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // 檢查距離（扣除怪物半徑）
                if (dist - monsterRadius > range) continue;

                // 計算怪物到光束中心線的垂直距離
                const dirX = Math.cos(targetAngle);
                const dirY = Math.sin(targetAngle);

                // 投影長度
                const projLength = dx * dirX + dy * dirY;

                // 只考慮在角色前方的怪物（扣除怪物半徑）
                if (projLength < -monsterRadius) continue;

                // 垂直距離
                const perpDist = Math.abs(dx * dirY - dy * dirX);

                // 檢查是否在光束寬度內（加上怪物半徑）
                if (perpDist <= beamWidth / 2 + monsterRadius) {
                    allHitMonsters.add(monster.id);
                }
            }

            // 繪製光束邊緣線（60% 透明度）
            this.drawBeamEdge(targetAngle, range, beamWidth, skill.definition.color);

            // 繪製光束特效（預設使用物件池版本，SHIFT+BACKSPACE 切換為網格版）
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
            // 取得命中怪物的位置（在造成傷害前）
            const hitMonsters = monsters.filter(m => hitMonsterIds.includes(m.id));
            const hitPositions = hitMonsters.map(m => ({ x: m.x, y: m.y }));

            const result = this.monsterManager.damageMonsters(hitMonsterIds, finalDamage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }

            // 命中回饋：白色十字高光（暴擊時使用橙色）
            if (isCrit) {
                this.flashCritCrossAtPositions(hitPositions);
            } else {
                this.flashWhiteCrossAtPositions(hitPositions);
            }


            // 擊中 10 隻以上觸發畫面震動
            this.shakeScreen(hitMonsterIds.length);
            const critText = isCrit ? ' [CRIT!]' : '';

            // MAX 後額外能力：連鎖（從擊中位置再發射）
            const chainChance = this.skillManager.getVfxChainChance(this.currentLevel);
            if (chainChance > 0 && hitPositions.length > 0) {
                this.triggerVfxChain(hitPositions, finalDamage, chainChance, skill);
            }
        }
    }

    // 超級導演連鎖效果：從擊中位置產生 X 型射線（4 條，長度為原本一半）
    private triggerVfxChain(
        hitPositions: { x: number; y: number }[],
        damage: number,
        chainChance: number,
        skill: PlayerSkill
    ) {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        const range = this.gameBounds.height * 0.5; // 長度減半
        const beamWidth = this.gameBounds.height * 0.05;
        const chainFlashColor = skill.definition.flashColor || skill.definition.color;

        // X 型的 4 個角度（45°、135°、225°、315°）
        const xAngles = [
            Math.PI / 4,        // 45° 右上
            Math.PI * 3 / 4,    // 135° 左上
            Math.PI * 5 / 4,    // 225° 左下
            Math.PI * 7 / 4     // 315° 右下
        ];

        for (const pos of hitPositions) {
            // 每個擊中位置獨立判定機率
            if (Math.random() >= chainChance) continue;

            // 收集所有 X 型射線命中的怪物
            const chainHitMonsters: Set<number> = new Set();

            for (const angle of xAngles) {
                // 檢測這條射線命中的怪物
                for (const monster of monsters) {
                    const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;
                    const dx = monster.x - pos.x;
                    const dy = monster.y - pos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist - monsterRadius > range) continue;

                    const dirX = Math.cos(angle);
                    const dirY = Math.sin(angle);
                    const projLength = dx * dirX + dy * dirY;

                    // 只檢測射線方向（不檢測反方向）
                    if (projLength < -monsterRadius || projLength > range + monsterRadius) continue;

                    const perpDist = Math.abs(dx * dirY - dy * dirX);
                    if (perpDist <= beamWidth / 2 + monsterRadius) {
                        chainHitMonsters.add(monster.id);
                    }
                }

                // 繪製連鎖光束邊緣線
                this.drawBeamEdge(angle, range, beamWidth, skill.definition.color, pos.x, pos.y);

                // 繪製連鎖光束特效
                const endX = pos.x + Math.cos(angle) * range;
                const endY = pos.y + Math.sin(angle) * range;
                if (this.showGridSkillEffects) {
                    this.flashSkillAreaLine(pos.x, pos.y, endX, endY, beamWidth, chainFlashColor);
                } else {
                    this.flashSkillEffectLine(pos.x, pos.y, endX, endY, beamWidth, chainFlashColor);
                }
            }

            // 對連鎖命中的怪物造成傷害
            const hitMonsterIds = Array.from(chainHitMonsters);
            if (hitMonsterIds.length > 0) {
                const chainHitPositions = monsters
                    .filter(m => chainHitMonsters.has(m.id))
                    .map(m => ({ x: m.x, y: m.y }));

                const chainResult = this.monsterManager.damageMonsters(hitMonsterIds, damage);
                if (chainResult.totalExp > 0) {
                    this.addExp(chainResult.totalExp);
                }

                this.flashWhiteCrossAtPositions(chainHitPositions);
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

    // 架構師：產生護盾，護盾吸收傷害並反傷（含擊退）給攻擊者
    // 反傷傷害：1 單位 + 每級 1.5 單位（Lv.0=1單位，Lv.5=8.5單位）
    // MAX 額外能力：堅守 - 護盾覆蓋時 100% 炸開並擊退敵人
    private activateArchitect(skill: PlayerSkill) {
        // MAX 後額外能力：堅守 - 護盾覆蓋時 100% 炸開並擊退
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

        // 反傷傷害：1 單位 + 每級 1.5 單位（Lv.0=1單位，Lv.5=8.5單位）
        const reflectUnits = 1 + skill.level * 1.5;
        this.shieldReflectDamage = MainScene.DAMAGE_UNIT * reflectUnits;

        // 繪製護盾條
        this.drawShieldBarFill();

        // 繪製護盾特效（使用護盾圖片）
        const shieldRadius = this.gameBounds.height * 0.18;
        const shieldFlashColor = skill.definition.flashColor || skill.definition.color;
        this.flashShieldEffect(this.characterX, this.characterY, shieldRadius, shieldFlashColor);

    }

    // 護盾堅守效果：向外 3 單位圓形攻擊 + 擊退
    private triggerShieldExplosion(skill: PlayerSkill) {
        const unitSize = this.gameBounds.height * 0.1;
        const explosionRadius = unitSize * 3; // 3 單位範圍
        const color = skill.definition.color;
        const flashColor = skill.definition.flashColor || color;

        // 傷害：使用當前護盾反傷值
        const damage = this.shieldReflectDamage;

        // 繪製圓形邊緣線
        this.drawCircleEdge(explosionRadius, color);

        // 繪製護盾爆炸特效（使用護盾圖片）
        this.flashShieldEffect(this.characterX, this.characterY, explosionRadius, flashColor);

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
            const hitPositions = monsters
                .filter(m => hitMonsters.includes(m.id))
                .map(m => ({ x: m.x, y: m.y }));

            const result = this.monsterManager.damageMonsters(hitMonsters, damage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }

            // 擊退命中的怪物 1 單位距離
            const knockbackDistance = this.gameBounds.height * 0.1; // 1 單位
            this.monsterManager.knockbackMonsters(hitMonsters, this.characterX, this.characterY, knockbackDistance);

            this.flashWhiteCrossAtPositions(hitPositions);
            this.shakeScreen(hitMonsters.length);
        }
    }

    // 繪製護盾啟動特效（帶高亮漸層和長殘留）
    private _drawShieldActivateEffect() {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        // 在角色周圍繪製一個擴散的圓形護盾效果
        const centerX = this.characterX;
        const centerY = this.characterY - this.characterSize / 2;
        const maxRadius = this.characterSize * 1.2; // 增大範圍

        // 使用金色
        const shieldColor = 0xffcc00;
        const duration = 800; // 800ms 殘留
        const startTime = this.time.now;

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            graphics.clear();

            // 前 20% 快速擴張，後 80% 淡出
            const expandProgress = progress < 0.2 ? progress / 0.2 : 1;
            const fadeProgress = progress < 0.2 ? 0 : (progress - 0.2) / 0.8;

            const currentRadius = maxRadius * (0.3 + 0.7 * expandProgress);
            const alpha = 1 - fadeProgress;

            if (alpha > 0.01) {
                // 繪製多層同心圓（從外到內）
                const rings = 8;
                for (let i = rings; i >= 1; i--) {
                    const ringRadius = currentRadius * i / rings;
                    const ringAlpha = alpha * (1 - (i - 1) / rings) * 0.6;

                    if (ringAlpha > 0.01) {
                        graphics.fillStyle(shieldColor, ringAlpha);
                        graphics.fillCircle(centerX, centerY, ringRadius);
                    }
                }

                // 中心白色高亮
                const highlightRings = 4;
                for (let i = highlightRings; i >= 1; i--) {
                    const highlightRadius = currentRadius * 0.4 * i / highlightRings;
                    const highlightAlpha = alpha * (1 - (i - 1) / highlightRings) * 0.9;

                    if (highlightAlpha > 0.01) {
                        graphics.fillStyle(0xffffff, highlightAlpha);
                        graphics.fillCircle(centerX, centerY, highlightRadius);
                    }
                }

                // 外圈邊框
                graphics.lineStyle(5, shieldColor, alpha * 0.9);
                graphics.strokeCircle(centerX, centerY, currentRadius);

                // 白色高亮邊框
                graphics.lineStyle(2, 0xffffff, alpha * 0.7);
                graphics.strokeCircle(centerX, centerY, currentRadius * 0.95);

                // 六角形裝飾線
                const hexRadius = currentRadius * 0.7;
                graphics.lineStyle(3, 0xffffff, alpha * 0.5);
                graphics.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (i * Math.PI) / 3;
                    const x = centerX + Math.cos(angle) * hexRadius;
                    const y = centerY + Math.sin(angle) * hexRadius;
                    if (i === 0) {
                        graphics.moveTo(x, y);
                    } else {
                        graphics.lineTo(x, y);
                    }
                }
                graphics.closePath();
                graphics.strokePath();
            }

            if (progress >= 1) {
                graphics.destroy();
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
            if (graphics.active) graphics.destroy();
            timerEvent.remove();
        });
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

        // 計算新的最大 HP（套用被動技能加成）
        this.recalculateMaxHp();
        // 升級時回滿 HP
        this.currentHp = this.maxHp;
        this.displayedHp = this.maxHp; // 同步顯示 HP

        // 更新怪物管理器的玩家等級（影響新生成怪物的血量）
        const shouldSpawnBoss = this.monsterManager.setPlayerLevel(this.currentLevel);
        if (shouldSpawnBoss) {
            // 每 10 級生成 BOSS
            this.monsterManager.spawnBoss(this.cameraOffsetX, this.cameraOffsetY);
        }

        // 更新等級顯示
        this.levelText.setText(`Lv.${this.currentLevel}`);

        // 更新 HP 條
        this.drawHpBarFill();
        this.updateHpText();

        // 更新低血量紅暈效果（回滿血後應消失）
        this.updateLowHpVignette();

        // 顯示技能選擇面板
        this.showSkillPanel();

        // 更新經驗條
        this.drawExpBarFill();

    }

    // 重新計算最大 HP（基礎 + 等級成長 + 被動技能加成）
    private recalculateMaxHp() {
        const baseMaxHp = MainScene.BASE_HP + MainScene.HP_PER_LEVEL * this.currentLevel;
        const oldMaxHp = this.maxHp;
        this.maxHp = this.skillManager.calculateFinalMaxHp(baseMaxHp);

        // 如果最大 HP 增加，按比例增加當前 HP
        if (this.maxHp > oldMaxHp && oldMaxHp > 0) {
            const hpRatio = this.currentHp / oldMaxHp;
            this.currentHp = Math.floor(this.maxHp * hpRatio);
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

        let dx = 0;
        let dy = 0;

        if (this.cursors.W.isDown) dy = -1;
        if (this.cursors.S.isDown) dy = 1;
        if (this.cursors.A.isDown) dx = -1;
        if (this.cursors.D.isDown) dx = 1;

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

            // 更新角色位置
            this.characterX += dx * moveDistance;
            this.characterY += dy * moveDistance;

            // 限制在地圖範圍內
            this.characterX = Phaser.Math.Clamp(
                this.characterX,
                this.characterSize,
                this.mapWidth - this.characterSize
            );
            this.characterY = Phaser.Math.Clamp(
                this.characterY,
                this.characterSize,
                this.mapHeight - this.characterSize
            );

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
        // 如果遊戲暫停，不處理點擊移動
        if (this.isPaused) return;

        // 檢查點擊是否在遊戲區域內
        if (!this.isPointerInGameArea(pointer)) {
            return;
        }

        this.isPointerDown = true;
        this.updateMoveDirectionFromPointer(pointer);
    }

    private onPointerMove(pointer: Phaser.Input.Pointer) {
        // 只有在按住時才更新方向
        if (!this.isPointerDown || this.isPaused) return;

        // 檢查是否仍在遊戲區域內
        if (this.isPointerInGameArea(pointer)) {
            this.updateMoveDirectionFromPointer(pointer);
        }
    }

    private onPointerUp() {
        this.isPointerDown = false;
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

    private updateMoveDirectionFromPointer(pointer: Phaser.Input.Pointer) {
        // 將螢幕座標轉換為地圖座標
        const localX = pointer.x - this.gameBounds.x;
        const localY = pointer.y - this.gameBounds.y;

        // 加上鏡頭偏移得到地圖座標
        const mapX = localX + this.cameraOffsetX;
        const mapY = localY + this.cameraOffsetY;

        // 計算從角色到點擊位置的方向向量
        const dx = mapX - this.characterX;
        const dy = mapY - this.characterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 標準化方向向量
        if (distance > 0) {
            this.moveDirX = dx / distance;
            this.moveDirY = dy / distance;
        } else {
            this.moveDirX = 0;
            this.moveDirY = 0;
        }
    }

    private moveCharacter(delta: number) {
        // 計算移動距離
        const moveDistance = (this.moveSpeed * delta) / 1000;

        // 根據方向移動
        const newX = this.characterX + this.moveDirX * moveDistance;
        const newY = this.characterY + this.moveDirY * moveDistance;

        // 限制在地圖範圍內
        this.characterX = Phaser.Math.Clamp(newX, this.characterSize, this.mapWidth - this.characterSize);
        this.characterY = Phaser.Math.Clamp(newY, this.characterSize, this.mapHeight - this.characterSize);

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

        // 轉場完成後顯示技能選擇面板
        this.showSkillPanel();

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
        if (this.currentShield <= 0) return;

        const originX = this.characterX;
        const originY = this.characterY;

        // 橢圓尺寸（角色周圍）
        const ellipseWidth = this.characterSize * 0.8;
        const ellipseHeight = this.characterSize * 0.35;
        // 橢圓中心在角色腳底往上一點
        const ellipseCenterY = originY - this.characterSize * 0.15;

        // 繪製暈開的橢圓光暈（多層疊加模擬模糊效果）
        for (let i = 5; i >= 0; i--) {
            const scale = 1 + i * 0.08;
            const alpha = 0.12 - i * 0.018;
            const lineWidth = 3 + i * 2;
            this.shieldAuraGraphics.lineStyle(lineWidth, 0xffffff, alpha);
            this.shieldAuraGraphics.strokeEllipse(
                originX,
                ellipseCenterY,
                ellipseWidth * scale,
                ellipseHeight * scale
            );
        }

        // 更新閃點計時器
        this.shieldSparkleTimer += delta;

        // 每 80ms 產生一個金光閃點
        const sparkleInterval = 80;
        if (this.shieldSparkleTimer >= sparkleInterval) {
            this.shieldSparkleTimer -= sparkleInterval;
            this.createShieldSparkle(originX, ellipseCenterY, ellipseWidth, ellipseHeight);
        }
    }

    // 在橢圓上隨機位置產生金光閃點（網格方塊，小到大擴散放大上升淡出）
    private createShieldSparkle(centerX: number, centerY: number, width: number, height: number) {
        // 隨機角度
        const angle = Math.random() * Math.PI * 2;
        // 橢圓上的點（起始位置）
        const startX = centerX + Math.cos(angle) * (width / 2);
        const startY = centerY + Math.sin(angle) * (height / 2);

        // 建立閃點圖形
        const sparkle = this.add.graphics();
        this.characterContainer.add(sparkle);

        // 網格大小（使用與地板網格相同的比例）
        const gridSize = this.gameBounds.height / 10;
        const baseCellSize = gridSize * 0.08; // 起始較小
        const maxCellSize = gridSize * 0.2; // 最大尺寸
        const riseDistance = gridSize * 0.5; // 上升距離
        const duration = 600 + Math.random() * 200;
        const startTime = this.time.now;

        const updateSparkle = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            sparkle.clear();

            // 計算當前位置（垂直上升）
            const currentY = startY - riseDistance * progress;

            // 小到大擴散放大
            const sizeProgress = Math.pow(progress, 0.5); // 快速變大後緩慢
            const cellSize = baseCellSize + (maxCellSize - baseCellSize) * sizeProgress;

            // 淡出效果
            const alpha = 1 - progress;

            if (alpha > 0.01) {
                // 金色網格方塊
                sparkle.fillStyle(0xffdd44, alpha * 0.9);
                sparkle.fillRect(startX - cellSize / 2, currentY - cellSize / 2, cellSize, cellSize);

                // 白色邊框
                sparkle.lineStyle(1, 0xffffff, alpha * 0.6);
                sparkle.strokeRect(startX - cellSize / 2, currentY - cellSize / 2, cellSize, cellSize);
            }

            if (progress >= 1) {
                sparkle.destroy();
            }
        };

        updateSparkle();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateSparkle,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            if (sparkle.active) sparkle.destroy();
            timerEvent.remove();
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

    // 顯示 HP 回復特效（藍紫色網格方塊閃白上升淡出，同 HP 色系）
    private showHpHealEffect(amount: number) {
        const originX = this.characterX;
        const originY = this.characterY - this.characterSize * 0.3;

        // 根據回復量產生多個粒子（最少 3 個，最多 8 個）
        const particleCount = Math.min(8, Math.max(3, Math.floor(amount / 10) + 3));

        for (let i = 0; i < particleCount; i++) {
            this.time.delayedCall(i * 40, () => {
                this.createHpHealParticle(originX, originY);
            });
        }
    }

    // 產生單個 HP 回復粒子（藍紫色網格方塊，閃白上升淡出）
    private createHpHealParticle(centerX: number, centerY: number) {
        // 角色周圍隨機位置（橢圓分布）
        const angle = Math.random() * Math.PI * 2;
        const radiusX = this.characterSize * 0.4;
        const radiusY = this.characterSize * 0.25;
        const startX = centerX + Math.cos(angle) * radiusX * (0.3 + Math.random() * 0.7);
        const startY = centerY + Math.sin(angle) * radiusY * (0.3 + Math.random() * 0.7);

        const sparkle = this.add.graphics();
        this.characterContainer.add(sparkle);

        // 網格大小
        const gridSize = this.gameBounds.height / 10;
        const cellSize = gridSize * (0.1 + Math.random() * 0.08);
        const riseDistance = gridSize * (0.5 + Math.random() * 0.3);
        const duration = 700 + Math.random() * 300;
        const startTime = this.time.now;

        // 隨機選擇藍紫色系（HP 條色系）
        const colors = [0x6644ff, 0x8866ff, 0x7755ee, 0x9977ff];
        const baseColor = colors[Math.floor(Math.random() * colors.length)];

        const updateParticle = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            sparkle.clear();

            const currentY = startY - riseDistance * progress;

            // 先閃白再淡出
            let alpha: number;
            let whiteBlend: number;
            if (progress < 0.2) {
                // 閃白階段
                alpha = 0.6 + progress * 2; // 0.6 -> 1.0
                whiteBlend = 1 - progress * 5; // 1.0 -> 0
            } else {
                // 淡出階段
                alpha = 1 - (progress - 0.2) / 0.8;
                whiteBlend = 0;
            }

            if (alpha > 0.01) {
                // 混合白色
                const r = ((baseColor >> 16) & 0xff);
                const g = ((baseColor >> 8) & 0xff);
                const b = (baseColor & 0xff);
                const blendR = Math.round(r + (255 - r) * whiteBlend);
                const blendG = Math.round(g + (255 - g) * whiteBlend);
                const blendB = Math.round(b + (255 - b) * whiteBlend);
                const blendColor = (blendR << 16) | (blendG << 8) | blendB;

                // 藍紫色網格方塊
                sparkle.fillStyle(blendColor, alpha * 0.9);
                sparkle.fillRect(startX - cellSize / 2, currentY - cellSize / 2, cellSize, cellSize);

                // 白色邊框
                sparkle.lineStyle(1, 0xffffff, alpha * 0.7);
                sparkle.strokeRect(startX - cellSize / 2, currentY - cellSize / 2, cellSize, cellSize);
            }

            if (progress >= 1) {
                sparkle.destroy();
            }
        };

        updateParticle();

        const timerEvent = this.time.addEvent({
            delay: 16,
            callback: updateParticle,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        this.time.delayedCall(duration + 50, () => {
            if (sparkle.active) sparkle.destroy();
            timerEvent.remove();
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

                // 擊退攻擊者 1 單位距離
                const knockbackDistance = this.gameBounds.height * 0.1; // 1 單位
                this.monsterManager.knockbackMonsters(monsterIds, this.characterX, this.characterY, knockbackDistance);
            }
        }

        // 扣除剩餘傷害到 HP
        if (remainingDamage > 0) {
            this.currentHp -= remainingDamage;

            // 確保 HP 不低於 0
            if (this.currentHp < 0) {
                this.currentHp = 0;
            }

            // 設定損傷延遲計時器（白色區塊 1 秒後靠攏）
            this.hpDamageDelay = MainScene.HP_DAMAGE_DELAY;

            // 更新 HP 顯示
            this.drawHpBarFill();
            this.updateHpText();

            // 進入受傷硬直狀態
            this.isHurt = true;
            this.hurtEndTime = this.time.now + MainScene.HURT_DURATION;
            this.isPointerDown = false; // 停止移動
            this.isKeyboardMoving = false;

            // 播放受傷動畫
            this.setCharacterState('hurt');
            this.updateCharacterSprite();

            // 角色閃紅白效果
            this.flashCharacter();

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
                // TODO: 遊戲結束處理
            }
        }
    }

    // 護盾吸收傷害時的視覺效果（帶高亮漸層和長殘留）
    private _flashShieldEffect() {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        // 在角色周圍繪製一個閃爍的護盾效果
        const centerX = this.characterX;
        const centerY = this.characterY - this.characterSize / 2;
        const maxRadius = this.characterSize * 1.0;

        // 使用金色
        const shieldColor = 0xffdd44;
        const duration = 600;

        // 使用 time event 來更新動畫
        let startTime = this.time.now;

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            graphics.clear();

            // 前 30% 保持高亮，後 70% 淡出
            const holdPhase = 0.3;
            const fadeProgress = progress < holdPhase ? 0 : (progress - holdPhase) / (1 - holdPhase);
            const alpha = 1 - fadeProgress;

            if (alpha > 0.01) {
                // 繪製多層同心圓
                const rings = 6;
                for (let i = rings; i >= 1; i--) {
                    const ringRadius = maxRadius * i / rings;
                    const ringAlpha = alpha * (1 - (i - 1) / rings) * 0.5;

                    if (ringAlpha > 0.01) {
                        graphics.fillStyle(shieldColor, ringAlpha);
                        graphics.fillCircle(centerX, centerY, ringRadius);
                    }
                }

                // 中心白色高亮
                const highlightRadius = maxRadius * 0.4;
                graphics.fillStyle(0xffffff, alpha * 0.8);
                graphics.fillCircle(centerX, centerY, highlightRadius);

                // 外圈邊框
                graphics.lineStyle(5, shieldColor, alpha * 0.9);
                graphics.strokeCircle(centerX, centerY, maxRadius);

                // 白色高亮邊框
                graphics.lineStyle(2, 0xffffff, alpha * 0.7);
                graphics.strokeCircle(centerX, centerY, maxRadius * 0.95);
            }

            if (progress >= 1) {
                graphics.destroy();
            }
        };

        // 使用 time event 持續更新
        const timerEvent = this.time.addEvent({
            delay: 16, // 約 60fps
            callback: updateEffect,
            callbackScope: this,
            repeat: Math.ceil(duration / 16)
        });

        // 確保最後清理
        this.time.delayedCall(duration + 50, () => {
            if (graphics.active) {
                graphics.destroy();
            }
            timerEvent.remove();
        });
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

    private drawFloorGrid() {
        this.floorGrid.clear();

        // 格子大小（根據視窗大小調整）
        const gridSize = this.gameBounds.height / 10;

        // 計算格子數量
        const cols = Math.ceil(this.mapWidth / gridSize);
        const rows = Math.ceil(this.mapHeight / gridSize);

        // 繪製格子
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * gridSize;
                const y = row * gridSize;

                // 交錯顏色（棋盤格）
                if ((row + col) % 2 === 0) {
                    this.floorGrid.fillStyle(0x333333, 1);
                } else {
                    this.floorGrid.fillStyle(0x444444, 1);
                }

                this.floorGrid.fillRect(x, y, gridSize, gridSize);

                // 繪製格線
                this.floorGrid.lineStyle(1, 0x555555, 0.5);
                this.floorGrid.strokeRect(x, y, gridSize, gridSize);
            }
        }

        // 繪製地圖邊界（紅色框線）
        this.floorGrid.lineStyle(4, 0xff4444, 1);
        this.floorGrid.strokeRect(0, 0, this.mapWidth, this.mapHeight);

        // 繪製中心標記（方便測試）
        this.floorGrid.lineStyle(2, 0xffff00, 1);
        const centerX = this.mapWidth / 2;
        const centerY = this.mapHeight / 2;
        const markerSize = gridSize;
        this.floorGrid.strokeRect(
            centerX - markerSize / 2,
            centerY - markerSize / 2,
            markerSize,
            markerSize
        );

        // 繪製座標標記（每 5 格標記一次）
        for (let row = 0; row < rows; row += 5) {
            for (let col = 0; col < cols; col += 5) {
                const x = col * gridSize + gridSize / 2;
                const y = row * gridSize + gridSize / 2;

                // 繪製小圓點標記
                this.floorGrid.fillStyle(0x666666, 1);
                this.floorGrid.fillCircle(x, y, 4);
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

        // 更新圖示
        const iconKey = `skill_${def.iconPrefix}0${equipped.level}`;
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

        // 冷卻完成且不是暫停中，發動進階技能
        if (progress >= 1 && !this.isPaused && !this.isHurt) {
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

        // 旋轉一圈 = 12 次 30° 扇形攻擊
        const rotationSteps = 12;
        const rotationDuration = 600; // 總旋轉時間 0.6 秒
        const stepDelay = rotationDuration / rotationSteps;

        // 記錄已經被擊中的怪物（每次發動只能被打一次）
        const hitMonsterSet = new Set<number>();

        for (let i = 0; i < rotationSteps; i++) {
            this.time.delayedCall(i * stepDelay, () => {
                // 計算當前扇形角度（從 0 開始逆時針旋轉）
                const currentAngle = (i / rotationSteps) * Math.PI * 2;

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

                    // 命中回饋
                    if (isCrit) {
                        this.flashCritCrossAtPositions(hitPositions);
                    } else {
                        this.flashWhiteCrossAtPositions(hitPositions);
                    }
                }

                // 顯示旋轉扇形特效（使用和分身相同的圖片特效）
                const halfAngleDeg = sectorAngle / 2;
                this.flashSkillEffectSector(this.characterX, this.characterY, range, currentAngle, halfAngleDeg, 0xff6600);
            });
        }

        // 震動效果（旋轉結束時）
        this.time.delayedCall(rotationDuration, () => {
            this.shakeScreen(hitMonsterSet.size);
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

        // 計算光束角度（用於爆炸線條方向）
        const beamOffsetX = (Math.random() - 0.5) * 2 * unitSize;
        const targetScreen = this.worldToScreen(targetX, targetY);
        const beamAngle = Math.atan2(targetScreen.y - (-50), targetScreen.x - (targetScreen.x + beamOffsetX));

        // 顯示光線落下特效（藍紫色）
        const techArtistColor = 0x9966ff; // 藍紫色
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

                // 命中回饋
                if (isCrit) {
                    this.flashCritCrossAtPositions(hitPositions);
                } else {
                    this.flashWhiteCrossAtPositions(hitPositions);
                }

                // 震動效果
                this.shakeScreen(hitMonsters.length);
            }

            // 顯示爆炸特效（藍紫色），含線條噴發
            this.showExplosionEffect(targetX, targetY, explosionRadiusPx, techArtistColor, beamAngle);
        });
    }

    // 顯示光線落下特效（使用 line 圖片瞬間射下，隨機角度）
    private showLightBeamEffect(worldX: number, worldY: number, radius: number, color: number, beamOffsetX?: number) {
        const targetScreen = this.worldToScreen(worldX, worldY);
        const unitSize = this.gameBounds.height / 10;

        // 使用傳入的偏移或隨機生成（正上方螢幕邊緣 ±1 單位）
        const offsetX = beamOffsetX !== undefined ? beamOffsetX : (Math.random() - 0.5) * 2 * unitSize;
        const startX = targetScreen.x + offsetX;
        const startY = -50; // 從畫面外開始
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

        // 設定縮放
        const beamWidth = 96; // 8倍粗線條
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
    private showExplosionEffect(worldX: number, worldY: number, radius: number, color: number, beamAngle?: number) {
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

        // 線條噴發：限制在射擊線左右 20 度內
        if (beamAngle !== undefined) {
            const lineCount = 6;
            const lineLength = unitSize * 1.5;
            const lineWidth = 32;
            const spreadAngle = 20 * (Math.PI / 180); // 20 度轉弧度
            // 漸層色：從亮紫到淡紫白
            const lineColors = [0xcc99ff, 0xbb88ff, 0xaa77ff, 0x9966ff, 0xddaaff, 0xeeccff];

            for (let i = 0; i < lineCount; i++) {
                // 在 beamAngle ±20 度內隨機分布
                const angleOffset = (Math.random() - 0.5) * 2 * spreadAngle;
                const angle = beamAngle + angleOffset;

                const lineSprite = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_LINE);
                this.skillGridContainer.add(lineSprite);
                lineSprite.setDepth(57);
                lineSprite.setTint(lineColors[i % lineColors.length]);
                lineSprite.setRotation(angle);
                const scaleX = lineLength / MainScene.EFFECT_TEXTURE_SIZE;
                const scaleY = lineWidth / MainScene.EFFECT_LINE_HEIGHT;
                lineSprite.setScale(scaleX, scaleY);
                lineSprite.setAlpha(1);

                // 線條向外飛散動畫
                const flyDist = radius * 1.5;
                const endX = screen.x + Math.cos(angle) * flyDist;
                const endY = screen.y + Math.sin(angle) * flyDist;
                this.tweens.add({
                    targets: lineSprite,
                    x: endX,
                    y: endY,
                    alpha: 0,
                    scaleX: scaleX * 0.3,
                    duration: 300,
                    ease: 'Power2',
                    onComplete: () => {
                        lineSprite.destroy();
                    }
                });
            }
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

        // 輪鋸數量根據護盾比例：滿盾 6 個，按比例減少
        const shieldRatio = this.currentShield / this.maxShield;
        const maxBladeCount = 6;
        const bladeCount = Math.max(1, Math.ceil(shieldRatio * maxBladeCount)); // 至少 1 個

        // 固定轉速：2 秒一圈
        const rotationTime = 2000;
        const angularSpeed = (Math.PI * 2) / rotationTime; // 弧度/毫秒

        // 更新輪鋸公轉角度（每次發動都更新一點）
        const deltaAngle = angularSpeed * 100; // cooldown 是 100ms
        this.sawBladeAngle += deltaAngle;
        if (this.sawBladeAngle > Math.PI * 2) {
            this.sawBladeAngle -= Math.PI * 2;
        }

        // 計算傷害（含暴擊）
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

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
            // 造成傷害
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.addExp(result.totalExp);

            // 擊退被掃中的目標（從角色位置向外推 1 單位）
            this.monsterManager.knockbackMonsters(hitMonsters, this.characterX, this.characterY, 1);

            // 每次命中消耗護盾值（每隻怪物消耗 2% 最大護盾）
            const shieldCostPerHit = Math.ceil(this.maxShield * 0.02);
            const shieldCost = shieldCostPerHit * hitMonsters.length;
            this.currentShield = Math.max(0, this.currentShield - shieldCost);
            this.drawShieldBarFill();

            // 輪鋸火花效果（金色）
            for (const pos of hitPositions) {
                this.showSawBladeSparkEffect(pos.x, pos.y);
            }

            // 命中回饋
            if (isCrit) {
                this.flashCritCrossAtPositions(hitPositions);
            } else {
                this.flashWhiteCrossAtPositions(hitPositions);
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

    // 輪鋸火花效果（金色線條噴發）
    private showSawBladeSparkEffect(worldX: number, worldY: number) {
        const screen = this.worldToScreen(worldX, worldY);
        const unitSize = this.gameBounds.height / 10;

        const sparkCount = 5;
        const sparkLength = unitSize * 0.4;
        const sparkWidth = 16;
        // 金色漸層
        const sparkColors = [0xffee00, 0xffdd00, 0xffcc00, 0xffbb00, 0xffaa00];

        for (let i = 0; i < sparkCount; i++) {
            // 隨機方向噴發
            const angle = Math.random() * Math.PI * 2;
            const sparkSprite = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_LINE);
            this.skillGridContainer.add(sparkSprite);
            sparkSprite.setDepth(58);
            sparkSprite.setTint(sparkColors[i % sparkColors.length]);
            sparkSprite.setRotation(angle);
            const scaleX = sparkLength / MainScene.EFFECT_TEXTURE_SIZE;
            const scaleY = sparkWidth / MainScene.EFFECT_LINE_HEIGHT;
            sparkSprite.setScale(scaleX, scaleY);
            sparkSprite.setAlpha(1);

            // 火花向外飛散動畫
            const flyDist = unitSize * (0.5 + Math.random() * 0.5);
            const endX = screen.x + Math.cos(angle) * flyDist;
            const endY = screen.y + Math.sin(angle) * flyDist;
            this.tweens.add({
                targets: sparkSprite,
                x: endX,
                y: endY,
                alpha: 0,
                scaleX: scaleX * 0.2,
                scaleY: scaleY * 0.5,
                duration: 200,
                ease: 'Power2',
                onComplete: () => {
                    sparkSprite.destroy();
                }
            });
        }
    }

    // 輪鋸向外飛出（護盾重新填充時觸發）
    private launchSawBladesOutward() {
        const bladeCount = this.currentSawBladePositions.length;
        if (bladeCount === 0) return;

        const radius = this.sawBladeRadius || this.gameBounds.height * 0.05;

        // 取得進階技能等級計算傷害
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const skillLevel = equipped ? equipped.level : 1;
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 每個輪鋸向外飛出（使用當前的公轉角度）
        for (let i = 0; i < bladeCount; i++) {
            const startOrbitAngle = this.sawBladeAngle + (i / bladeCount) * Math.PI * 2;
            this.launchSingleSawBlade(radius, baseDamage, startOrbitAngle);
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

                        // 擊退
                        this.monsterManager.knockbackMonsters([monster.id], this.characterX, this.characterY, 1);

                        // 輪鋸火花效果（金色）
                        this.showSawBladeSparkEffect(monster.x, monster.y);

                        // 命中特效
                        if (isCrit) {
                            this.flashCritCrossAtPositions([{ x: monster.x, y: monster.y }]);
                        } else {
                            this.flashWhiteCrossAtPositions([{ x: monster.x, y: monster.y }]);
                        }
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

        // 輪鋸數量根據護盾比例：滿盾 6 個，按比例減少
        const shieldRatio = this.currentShield / this.maxShield;
        const maxBladeCount = 6;
        const bladeCount = Math.max(1, Math.ceil(shieldRatio * maxBladeCount));

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
    }

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

    // 爆發的影視特效：1.5秒內發射20枚追蹤導彈
    private executeVfxBurst(skillLevel: number) {
        // 傷害單位 = 角色等級 + 技能等級
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 找到最近的敵人
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 1.5秒內發射20枚導彈（每75ms一枚）
        const missileCount = 20;
        const missileInterval = 75;

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
                this.launchMissile(target.id, baseDamage);
            });
        }
    }

    // 發射單枚追蹤導彈
    private launchMissile(targetId: number, baseDamage: number) {
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

        // 飛散線條：使用 line 紋理，8條向外射出
        const lineCount = 8;
        const lineSprites: Phaser.GameObjects.Sprite[] = [];
        const lineLength = unitSize * 1.5;
        const lineWidth = 32; // 4倍粗
        // 漸層色：從橘紅到亮黃
        const lineColors = [0xff4400, 0xff5500, 0xff7700, 0xff9900, 0xffbb00, 0xffcc00, 0xffdd00, 0xffff66];

        for (let i = 0; i < lineCount; i++) {
            const angle = (i / lineCount) * Math.PI * 2 + Math.random() * 0.3;
            const lineSprite = this.add.sprite(x, y, MainScene.TEXTURE_LINE);
            this.skillGridContainer.add(lineSprite);
            lineSprite.setDepth(102);
            lineSprite.setTint(lineColors[i]);
            lineSprite.setRotation(angle);
            const scaleX = lineLength / MainScene.EFFECT_TEXTURE_SIZE;
            const scaleY = lineWidth / MainScene.EFFECT_LINE_HEIGHT;
            lineSprite.setScale(scaleX, scaleY);
            lineSprite.setAlpha(1);
            lineSprites.push(lineSprite);

            // 線條向外飛散動畫
            const endX = x + Math.cos(angle) * radius * 1.2;
            const endY = y + Math.sin(angle) * radius * 1.2;
            this.tweens.add({
                targets: lineSprite,
                x: endX,
                y: endY,
                alpha: 0,
                scaleX: scaleX * 0.3,
                duration: 300,
                ease: 'Power2',
                onComplete: () => {
                    lineSprite.destroy();
                }
            });
        }

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

        // 建立八角矩陣護盾圖
        if (!this.zeroTrustSprite) {
            this.zeroTrustSprite = this.add.sprite(0, 0, MainScene.TEXTURE_SHIELD);
            this.skillGridContainer.add(this.zeroTrustSprite);
            this.zeroTrustSprite.setDepth(49);
            this.zeroTrustSprite.setAlpha(0.15); // 透明度降低
        }

        // 設定減速區域（5 單位半徑，速度減半）
        this.monsterManager.setSlowZone(this.characterX, this.characterY, 5, 0.5);
    }

    // 零信任防禦協定：更新邏輯（在 update 中呼叫）
    private updateZeroTrust(skillLevel: number, _delta: number) {
        if (!this.zeroTrustActive) return;

        // 更新減速區域中心（跟隨玩家）
        this.monsterManager.setSlowZone(this.characterX, this.characterY, 5, 0.5);

        const unitSize = this.gameBounds.height / 10;
        const radius = 5; // 5 單位半徑
        const radiusPx = radius * unitSize;
        const damageInterval = 200; // 0.2 秒
        const damageRadius = 1; // 1 單位傷害範圍
        const damageRadiusPx = damageRadius * unitSize;
        const now = this.time.now;
        const beamColor = 0xffcc00; // 金黃色

        // 更新八角矩陣護盾圖位置、大小與旋轉
        const screen = this.worldToScreen(this.characterX, this.characterY);
        if (this.zeroTrustSprite) {
            this.zeroTrustSprite.setPosition(screen.x, screen.y);
            const scale = (radiusPx * 2) / MainScene.EFFECT_TEXTURE_SIZE;
            this.zeroTrustSprite.setScale(scale);
            this.zeroTrustSprite.setTint(beamColor);
            this.zeroTrustSprite.setAlpha(0.15); // 透明度降低
            // 加快旋轉（每秒約 54 度）
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
        const monstersInRangeIds = new Set(monstersInRange.map(m => m.id));

        // 處理光束：死亡或離開範圍的怪物
        for (let i = this.zeroTrustBeams.length - 1; i >= 0; i--) {
            const beam = this.zeroTrustBeams[i];
            const isDead = !aliveMonsterIds.has(beam.targetMonsterId);
            const isOutOfRange = !monstersInRangeIds.has(beam.targetMonsterId);

            if (isDead || isOutOfRange) {
                // 嘗試轉移到其他範圍內未被鎖定的敵人
                const availableMonster = monstersInRange.find(m => !this.zeroTrustTrackedMonsters.has(m.id));

                if (availableMonster) {
                    // 轉移光束到新目標
                    this.zeroTrustTrackedMonsters.delete(beam.targetMonsterId);
                    this.zeroTrustTrackedMonsters.add(availableMonster.id);
                    beam.targetMonsterId = availableMonster.id;
                    beam.targetX = availableMonster.x;
                    beam.targetY = availableMonster.y;
                    // 新目標給新的隨機起點偏移（±1 單位）
                    beam.pulseOffset = (Math.random() - 0.5) * 2 * unitSize;
                } else {
                    // 沒有可轉移的目標，移除光束
                    beam.beamSprite.destroy();
                    this.zeroTrustBeams.splice(i, 1);
                    this.zeroTrustTrackedMonsters.delete(beam.targetMonsterId);
                }
            }
        }

        // 計算最大光束數量：4 + 每5級+1
        const maxBeams = 4 + Math.floor(skillLevel / 5);

        // 檢測新進入範圍的怪物，建立新光束
        for (const monster of monstersInRange) {
            if (this.zeroTrustBeams.length >= maxBeams) break; // 已達上限
            if (this.zeroTrustTrackedMonsters.has(monster.id)) continue; // 已鎖定

            // 新怪物進入範圍，建立光束（使用 line 圖片）
            this.zeroTrustTrackedMonsters.add(monster.id);

            // 主光束（持續顯示）
            const beamSprite = this.add.sprite(0, 0, MainScene.TEXTURE_LINE);
            this.skillGridContainer.add(beamSprite);
            beamSprite.setDepth(55);
            beamSprite.setTint(beamColor); // 金黃色
            beamSprite.setAlpha(0); // 一開始隱藏

            // 計算射線（正上方直下）
            const targetScreen = this.worldToScreen(monster.x, monster.y);
            const startY = -50; // 螢幕上方外
            const beamLength = targetScreen.y - startY;

            // 瞬間射下的閃光效果
            const flashSprite = this.add.sprite(0, 0, MainScene.TEXTURE_LINE);
            this.skillGridContainer.add(flashSprite);
            flashSprite.setDepth(57);
            flashSprite.setTint(0xffffff); // 白色閃光
            flashSprite.setRotation(Math.PI / 2); // 垂直向下
            const flashScaleX = beamLength / MainScene.EFFECT_TEXTURE_SIZE;
            const flashScaleY = 40 / MainScene.EFFECT_LINE_HEIGHT; // 4倍粗
            flashSprite.setScale(flashScaleX, flashScaleY);
            flashSprite.setPosition(targetScreen.x, (startY + targetScreen.y) / 2);
            flashSprite.setAlpha(1);

            // 閃光淡出後顯示持續光束
            this.tweens.add({
                targets: flashSprite,
                alpha: 0,
                scaleY: flashScaleY * 0.3,
                duration: 150,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    flashSprite.destroy();
                    // 顯示持續光束
                    beamSprite.setAlpha(0.6);
                }
            });

            this.zeroTrustBeams.push({
                targetMonsterId: monster.id,
                targetX: monster.x,
                targetY: monster.y,
                lastDamageTime: 0,
                beamSprite: beamSprite,
                pulseOffset: 0 // 不再需要偏移
            });
        }

        // 更新每個光束
        for (const beam of this.zeroTrustBeams) {
            // 找到目標怪物，更新位置
            const targetMonster = monsters.find(m => m.id === beam.targetMonsterId);
            if (targetMonster) {
                beam.targetX = targetMonster.x;
                beam.targetY = targetMonster.y;
            }

            // 計算射線起點和終點（正上方直下）
            const beamScreen = this.worldToScreen(beam.targetX, beam.targetY);
            const startY = -50; // 螢幕上方外
            const beamLength = beamScreen.y - startY;

            // 設定主光束 sprite 位置和旋轉（垂直向下）
            beam.beamSprite.setPosition(beamScreen.x, (startY + beamScreen.y) / 2);
            beam.beamSprite.setRotation(Math.PI / 2);

            // 設定縮放（紋理尺寸 256x64）
            const beamWidth = 16; // 4倍粗光束寬度
            const scaleX = beamLength / MainScene.EFFECT_TEXTURE_SIZE;
            const scaleY = beamWidth / MainScene.EFFECT_LINE_HEIGHT;
            beam.beamSprite.setScale(scaleX, scaleY);

            // 每 0.2 秒造成範圍傷害
            if (now - beam.lastDamageTime >= damageInterval) {
                beam.lastDamageTime = now;

                // 檢測傷害範圍內的怪物
                const hitMonsterIds: number[] = [];
                for (const monster of monsters) {
                    const dx = monster.x - beam.targetX;
                    const dy = monster.y - beam.targetY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= damageRadius) {
                        hitMonsterIds.push(monster.id);
                    }
                }

                if (hitMonsterIds.length > 0) {
                    const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
                    const result = this.monsterManager.damageMonsters(hitMonsterIds, finalDamage);
                    if (result.totalExp > 0) this.addExp(result.totalExp);

                    // 命中時顯示小爆炸效果
                    this.showZeroTrustHitEffect(beam.targetX, beam.targetY, isCrit);
                }
            }
        }
    }

    // 零信任防禦協定：命中 8 角形擴散效果（雙層逆轉設計）
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

        // 清理光束
        for (const beam of this.zeroTrustBeams) {
            beam.beamSprite.destroy();
        }
        this.zeroTrustBeams = [];
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

        // 造成傷害
        if (hitMonsters.length > 0) {
            const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.addExp(result.totalExp);

            // 命中回饋
            if (isCrit) {
                this.flashCritCrossAtPositions(hitPositions);
            } else {
                this.flashWhiteCrossAtPositions(hitPositions);
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
                        this.time.delayedCall(50, () => {
                            this.performSoulSlash(hitPos.x, hitPos.y, newAngle, baseDamage, skillLevel, true);
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

    // 幻影迭代模式：召喚影分身（可同時存在多個）
    private executePhantomIteration(skillLevel: number) {
        // 可施放的進階技能（不包含自己、零信任、次元斬、絕對邏輯、爆發特效）
        // 彈射射線改為獨立計時器，每 0.5 秒自動觸發
        const availableSkillIds = [
            'advanced_burning_celluloid',
            'advanced_tech_artist',
            'advanced_perfect_pixel'
        ];

        const unitSize = this.gameBounds.height / 10;

        // 初始位置（玩家周圍 3 單位內）
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 3 * unitSize; // 0~3 單位內
        const startX = this.characterX + Math.cos(angle) * distance;
        const startY = this.characterY + Math.sin(angle) * distance;

        // 創建分身 Sprite（半透明玩家圖像）
        const sprite = this.add.sprite(0, 0, 'char_idle_1');
        sprite.setOrigin(0.5, 1);
        sprite.setScale(this.character.scaleX, this.character.scaleY);
        sprite.setAlpha(0.5);
        sprite.setTint(0x9966ff);
        sprite.play('char_idle');
        this.skillGridContainer.add(sprite);
        sprite.setDepth(55);

        const phantomId = this.nextPhantomId++;

        // 持續時間 = 技能等級/5 + 10 秒
        const totalDuration = (Math.floor(skillLevel / 5) + 10) * 1000;
        const skillInterval = 1000; // 每 1 秒施放一次（移動頻率降半）
        const repeatCount = Math.max(0, Math.floor(totalDuration / skillInterval) - 1);

        // 每 1 秒施放一個隨機進階技能
        const skillTimer = this.time.addEvent({
            delay: skillInterval,
            repeat: repeatCount,
            callback: () => {
                if (this.isPaused) return; // 暫停時不執行
                const phantom = this.phantoms.find(p => p.id === phantomId);
                if (!phantom) return;

                // 隨機選一個進階技能施放
                const randomSkillId = availableSkillIds[Math.floor(Math.random() * availableSkillIds.length)];
                this.executePhantomSkillAt(randomSkillId, skillLevel, phantom.x, phantom.y, phantomId);

                // 施放後設定新的移動目標（玩家附近 1~5 單位內）
                this.setPhantomMoveTargetFor(phantom);
            }
        });

        // 持續時間後分身消失
        const dismissTimer = this.time.delayedCall(totalDuration, () => {
            this.dismissPhantomById(phantomId);
        });

        // 嘲諷機制：每 5 秒啟動嘲諷，持續 2 秒
        const tauntCycle = 5000; // 5 秒週期
        const tauntDuration = 2000; // 嘲諷持續 2 秒
        const tauntTimer = this.time.addEvent({
            delay: tauntCycle,
            repeat: Math.floor(totalDuration / tauntCycle),
            callback: () => {
                if (this.isPaused) return; // 暫停時不執行
                const phantom = this.phantoms.find(p => p.id === phantomId);
                if (!phantom) return;

                // 啟動嘲諷（吸引怪物到分身位置）
                this.monsterManager.setTauntTarget(phantom.x, phantom.y, true);

                // 2 秒後關閉嘲諷
                this.time.delayedCall(tauntDuration, () => {
                    if (this.isPaused) return; // 暫停時不執行
                    // 只有當這個分身還存在時才清除嘲諷
                    const stillExists = this.phantoms.find(p => p.id === phantomId);
                    if (stillExists) {
                        this.monsterManager.clearTauntTarget();
                    }
                });
            }
        });

        // 加入幻影列表（先加入，再啟動全局計時器）
        const phantom = {
            id: phantomId,
            x: startX,
            y: startY,
            targetX: startX,
            targetY: startY,
            moving: false,
            sprite: sprite,
            skillTimer: skillTimer,
            dismissTimer: dismissTimer,
            tauntTimer: tauntTimer,
            lastAfterimageTime: 0
        };
        this.phantoms.push(phantom);

        // 全局彈射射線計時器：只在第一個分身出現時啟動
        if (!this.globalChainRayTimer) {
            this.globalChainRayTimer = this.time.addEvent({
                delay: 500, // 0.5 秒
                loop: true,
                callback: () => {
                    if (this.isPaused) return;
                    if (this.phantoms.length === 0) return;

                    // 計算傷害
                    const equipped = this.skillManager.getEquippedAdvancedSkill();
                    const level = equipped ? equipped.level : skillLevel;
                    const damageUnits = this.currentLevel + level;
                    const damage = MainScene.DAMAGE_UNIT * damageUnits;

                    // 從本尊位置發射
                    this.phantomCastChainRay(damage, this.characterX, this.characterY);
                }
            });
        }

        // 分身出現特效
        this.showPhantomSpawnEffectAt(startX, startY);
    }

    // 設定指定幻影的移動目標
    private setPhantomMoveTargetFor(phantom: typeof this.phantoms[0]) {
        const unitSize = this.gameBounds.height / 10;
        const angle = Math.random() * Math.PI * 2;
        const distance = (1 + Math.random() * 4) * unitSize; // 1~5 單位內（更大範圍）

        phantom.targetX = this.characterX + Math.cos(angle) * distance;
        phantom.targetY = this.characterY + Math.sin(angle) * distance;
        phantom.moving = true;

        // 播放跑步動畫
        if (phantom.sprite && phantom.sprite.anims) {
            phantom.sprite.play('char_run', true);
        }
    }

    // 分身在指定位置施放技能
    private executePhantomSkillAt(skillId: string, skillLevel: number, phantomX: number, phantomY: number, phantomId?: number) {
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const level = equipped ? equipped.level : skillLevel;

        // 傷害單位 = 角色等級 + 技能等級
        const damageUnits = this.currentLevel + level;
        const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;

        // 顯示分身施放特效
        this.showPhantomCastEffectAt(phantomX, phantomY);

        switch (skillId) {
            case 'advanced_burning_celluloid':
                this.phantomCastBurningCelluloidAt(baseDamage, phantomX, phantomY);
                break;
            case 'advanced_tech_artist':
                this.phantomCastTechArtistAt(baseDamage, phantomX, phantomY);
                break;
            case 'advanced_perfect_pixel':
                this.phantomCastPerfectPixelAt(baseDamage, phantomX, phantomY);
                break;
            case 'advanced_vfx_burst':
                this.phantomCastVfxBurstAt(baseDamage, phantomX, phantomY);
                break;
            case 'advanced_absolute_logic':
                this.phantomCastAbsoluteLogicAt(baseDamage, phantomId);
                break;
            case 'phantom_chain_ray':
                this.phantomCastChainRay(baseDamage, phantomX, phantomY);
                break;
        }
    }

    // 分身版燃燒的賽璐珞（指定座標，範圍 3 單位）
    private phantomCastBurningCelluloidAt(baseDamage: number, phantomX: number, phantomY: number) {
        const range = this.gameBounds.height * 0.3; // 3 單位（本尊 7 單位 -2）
        const halfAngleDeg = 15; // 30 度扇形
        const halfAngle = halfAngleDeg * Math.PI / 180;
        const color = 0x9966ff; // 分身用紫色

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
                }

                // 視覺效果
                this.flashSkillEffectSector(phantomX, phantomY, range, targetAngle, halfAngleDeg, color);
            });
        }
    }

    // 分身版技術美術大神（指定座標，每次 2 發）
    private phantomCastTechArtistAt(baseDamage: number, phantomX: number, phantomY: number) {
        const unitSize = this.gameBounds.height / 10;
        const range = unitSize * 5;
        const explosionRadius = unitSize * 3;
        const beamCount = 2; // 分身版每次 2 發

        for (let b = 0; b < beamCount; b++) {
            // 每發稍微延遲以區分視覺
            this.time.delayedCall(b * 100, () => {
                // 隨機位置
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * range;
                const targetX = phantomX + Math.cos(angle) * dist;
                const targetY = phantomY + Math.sin(angle) * dist;

                // 計算光束角度（用於爆炸線條方向）
                const beamOffsetX = (Math.random() - 0.5) * 2 * unitSize;
                const targetScreen = this.worldToScreen(targetX, targetY);
                const beamAngle = Math.atan2(targetScreen.y - (-50), targetScreen.x - (targetScreen.x + beamOffsetX));

                // 光線效果
                this.showLightBeamEffect(targetX, targetY, explosionRadius, 0x9966ff, beamOffsetX);

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

                        if (distUnits - monsterRadiusUnits <= 3) { // 3 單位爆炸範圍
                            hitMonsters.push(monster.id);
                        }
                    }

                    if (hitMonsters.length > 0) {
                        // 先暈眩，再造成傷害
                        this.monsterManager.stunMonsters(hitMonsters, 1000);

                        const { damage: finalDamage } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
                        const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                        if (result.totalExp > 0) this.addExp(result.totalExp);
                    }

                    this.showExplosionEffect(targetX, targetY, explosionRadius, 0x9966ff, beamAngle);
                });
            });
        }
    }

    // 分身版完美像素審判（指定座標）
    private phantomCastPerfectPixelAt(baseDamage: number, phantomX: number, phantomY: number) {
        const unitSize = this.gameBounds.height / 10;
        const explosionRadius = unitSize * 3; // 3 單位爆炸範圍（與主版本一致）

        // 4 個焦點位置（分身位置 ±2 單位）
        const offset = unitSize * 2;
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

                    if (distUnits - monsterRadiusUnits <= 3) { // 3 單位爆炸範圍
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

                this.showExplosionEffect(point.x, point.y, explosionRadius, 0x66ffcc);
            });
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
            const colors = [0x6633cc, 0x7744dd, 0x8855ee, 0x9966ff, 0xaa77ff, 0xbb88ff];
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

    // 分身版絕對邏輯防禦 - 輪鋸跟隨分身移動（分身存在期間持續）
    private phantomCastAbsoluteLogicAt(baseDamage: number, phantomId?: number) {
        if (phantomId === undefined) return;

        // 如果該分身已經有輪鋸，不重複產生
        if (this.phantomSawBladeActive.has(phantomId)) return;
        this.phantomSawBladeActive.add(phantomId);

        const unitSize = this.gameBounds.height / 10;
        const orbitRadiusWorld = 2; // 2 單位距離（世界座標）
        const orbitRadiusPx = unitSize * orbitRadiusWorld;
        const bladeRadiusPx = unitSize * 0.5; // 0.5 單位範圍
        const bladeRadiusWorld = 0.5;
        const bladeCount = 3; // 分身產生 3 個輪鋸

        // 公轉 2 倍速（數量只有一半，視覺上看起來轉速一樣）
        const orbitSpeed = (Math.PI * 2) / 1000; // 公轉：1 秒一圈（玩家 2 秒）
        const spinSpeed = (Math.PI * 2) / 150;   // 自轉：0.15 秒一圈（與玩家相同）

        // 建立輪鋸圖形
        const graphics = this.add.graphics();
        this.skillGridContainer.add(graphics);
        graphics.setDepth(100);

        // 輪鋸狀態
        const state = {
            angle: 0,
            spinAngle: 0
        };

        // 追蹤已擊中的怪物（每隻怪物 0.5 秒只能被擊中一次）
        const hitCooldown: Map<number, number> = new Map();

        // 取得分身當前位置的函數
        const getPhantomPosition = (): { x: number; y: number } | null => {
            const phantom = this.phantoms.find(p => p.id === phantomId);
            return phantom ? { x: phantom.x, y: phantom.y } : null;
        };

        // 繪製輪鋸
        const drawBlades = (phantomPos: { x: number; y: number }) => {
            graphics.clear();

            const phantomScreen = this.worldToScreen(phantomPos.x, phantomPos.y);

            for (let i = 0; i < bladeCount; i++) {
                const bladeAngle = state.angle + (i / bladeCount) * Math.PI * 2;
                const bladeScreenX = phantomScreen.x + Math.cos(bladeAngle) * orbitRadiusPx;
                const bladeScreenY = phantomScreen.y + Math.sin(bladeAngle) * orbitRadiusPx;

                // 輪鋸主體（紫色，分身專用）
                graphics.fillStyle(0x9966ff, 0.6);
                graphics.fillCircle(bladeScreenX, bladeScreenY, bladeRadiusPx);

                // 輪鋸邊緣
                graphics.lineStyle(3, 0xcc99ff, 0.8);
                graphics.strokeCircle(bladeScreenX, bladeScreenY, bladeRadiusPx);

                // 鋸齒
                const teethCount = 8;
                for (let t = 0; t < teethCount; t++) {
                    const toothAngle = state.spinAngle + (t / teethCount) * Math.PI * 2;
                    const innerRadius = bladeRadiusPx * 0.6;
                    const outerRadius = bladeRadiusPx * 1.2;

                    const x1 = bladeScreenX + Math.cos(toothAngle) * innerRadius;
                    const y1 = bladeScreenY + Math.sin(toothAngle) * innerRadius;
                    const x2 = bladeScreenX + Math.cos(toothAngle + 0.15) * outerRadius;
                    const y2 = bladeScreenY + Math.sin(toothAngle + 0.15) * outerRadius;
                    const x3 = bladeScreenX + Math.cos(toothAngle + 0.3) * innerRadius;
                    const y3 = bladeScreenY + Math.sin(toothAngle + 0.3) * innerRadius;

                    graphics.lineStyle(2, 0xcc99ff, 0.8);
                    graphics.beginPath();
                    graphics.moveTo(x1, y1);
                    graphics.lineTo(x2, y2);
                    graphics.lineTo(x3, y3);
                    graphics.strokePath();
                }
            }
        };

        // 更新輪鋸
        const updateBlades = () => {
            // 檢查分身是否還存在（分身消失則輪鋸也消失）
            const phantomPos = getPhantomPosition();
            if (!phantomPos) {
                graphics.destroy();
                this.phantomSawBladeActive.delete(phantomId);
                return;
            }

            const delta = 16;
            state.angle += orbitSpeed * delta;
            state.spinAngle -= spinSpeed * delta; // 自轉（負值=反向旋轉）

            // 角度歸一化
            if (state.angle > Math.PI * 2) state.angle -= Math.PI * 2;
            if (state.spinAngle < -Math.PI * 2) state.spinAngle += Math.PI * 2;

            // 檢測碰撞（使用分身當前位置）
            const monsters = this.monsterManager.getMonsters();
            const now = this.time.now;
            const hitMonsters: number[] = [];
            const hitPositions: { x: number; y: number }[] = [];

            for (let i = 0; i < bladeCount; i++) {
                const bladeAngle = state.angle + (i / bladeCount) * Math.PI * 2;
                // 使用像素單位計算輪鋸位置
                const bladeWorldX = phantomPos.x + Math.cos(bladeAngle) * orbitRadiusPx;
                const bladeWorldY = phantomPos.y + Math.sin(bladeAngle) * orbitRadiusPx;

                for (const monster of monsters) {
                    const dx = monster.x - bladeWorldX;
                    const dy = monster.y - bladeWorldY;
                    const distPixels = Math.sqrt(dx * dx + dy * dy);
                    // 轉換成世界單位
                    const distUnits = distPixels / unitSize;
                    const monsterRadiusUnits = monster.definition.size * 0.5;

                    // 0.5 單位輪鋸範圍 + 怪物半徑
                    if (distUnits <= 0.5 + monsterRadiusUnits) {
                        const lastHit = hitCooldown.get(monster.id) || 0;
                        if (now - lastHit >= 500) {
                            hitMonsters.push(monster.id);
                            hitPositions.push({ x: monster.x, y: monster.y });
                            hitCooldown.set(monster.id, now);
                        }
                    }
                }
            }

            // 造成傷害
            if (hitMonsters.length > 0) {
                const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
                const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                if (result.totalExp > 0) {
                    this.addExp(result.totalExp);
                }

                // 輪鋸火花效果（金色）
                for (const pos of hitPositions) {
                    this.showSawBladeSparkEffect(pos.x, pos.y);
                }

                // 擊中特效
                if (isCrit) {
                    this.flashCritCrossAtPositions(hitPositions);
                } else {
                    this.flashWhiteCrossAtPositions(hitPositions);
                }
            }

            drawBlades(phantomPos);
        };

        // 開始輪鋸動畫（持續到分身消失）
        const initialPos = getPhantomPosition();
        if (initialPos) {
            drawBlades(initialPos);
            this.time.addEvent({
                callback: updateBlades,
                loop: true,
                delay: 16
            });
        }
    }

    // 分身版靈魂斬擊（指定座標）
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

            if (isCrit) {
                this.flashCritCrossAtPositions(hitPositions);
            } else {
                this.flashWhiteCrossAtPositions(hitPositions);
            }
        }
    }

    // 分身版靈魂斬擊視覺效果（紫色）
    private drawPhantomSoulSlashEffect(startX: number, startY: number, endX: number, endY: number, angle: number, phantomX: number, phantomY: number) {
        const screenStart = this.worldToScreen(startX, startY);
        const screenEnd = this.worldToScreen(endX, endY);

        const graphics = this.add.graphics();
        this.skillGridContainer.add(graphics);
        graphics.setDepth(60);

        // 斬擊線（紫色）
        const slashColor = 0x9966ff;

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

    // 分身斬擊閃光效果（紫色）
    private showPhantomSlashFlashEffect(x: number, y: number, angle: number) {
        const graphics = this.add.graphics();
        this.skillGridContainer.add(graphics);
        graphics.setDepth(61);

        const flashSize = this.gameBounds.height * 0.1;

        graphics.lineStyle(4, 0x9966ff, 0.8);
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

    // 分身專屬：彈射射線（在本尊與所有分身之間來回彈射）
    private phantomCastChainRay(baseDamage: number, phantomX: number, phantomY: number) {
        // 收集所有彈射點：本尊 + 所有分身
        const points: { x: number; y: number }[] = [];

        // 加入本尊位置
        points.push({ x: this.characterX, y: this.characterY });

        // 加入所有分身位置
        for (const phantom of this.phantoms) {
            points.push({ x: phantom.x, y: phantom.y });
        }

        // 至少需要 2 個點才能形成射線
        if (points.length < 2) return;

        // 從施放者位置開始，找到施放者在 points 中的索引
        let startIndex = 0;
        let minDist = Infinity;
        for (let i = 0; i < points.length; i++) {
            const dx = points[i].x - phantomX;
            const dy = points[i].y - phantomY;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                startIndex = i;
            }
        }

        // 建立彈射順序：從施放者開始，依序連接所有點，最後回到起點
        const chainOrder: number[] = [startIndex];
        const visited = new Set<number>([startIndex]);

        // 依距離順序連接剩餘的點
        while (chainOrder.length < points.length) {
            const lastIdx = chainOrder[chainOrder.length - 1];
            const lastPoint = points[lastIdx];

            let nearestIdx = -1;
            let nearestDist = Infinity;

            for (let i = 0; i < points.length; i++) {
                if (visited.has(i)) continue;
                const dx = points[i].x - lastPoint.x;
                const dy = points[i].y - lastPoint.y;
                const dist = dx * dx + dy * dy;
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIdx = i;
                }
            }

            if (nearestIdx !== -1) {
                chainOrder.push(nearestIdx);
                visited.add(nearestIdx);
            }
        }

        // 回到起點形成閉環
        chainOrder.push(startIndex);

        // 收集所有怪物
        const monsters = this.monsterManager.getMonsters();
        const hitMonsterIds = new Set<number>();

        // 射線寬度（用於碰撞檢測和視覺）
        const rayWidth = this.gameBounds.height * 0.02; // 0.2 單位寬
        const lineWidth = 24; // 線條粗度（像素）

        // 用於收集所有 sprites 以便統一淡出
        const allSprites: Phaser.GameObjects.Sprite[] = [];

        // 依序繪製每段射線（使用 LINE 紋理）
        for (let i = 0; i < chainOrder.length - 1; i++) {
            const p1 = points[chainOrder[i]];
            const p2 = points[chainOrder[i + 1]];

            const screen1 = this.worldToScreen(p1.x, p1.y);
            const screen2 = this.worldToScreen(p2.x, p2.y);

            // 計算長度和角度
            const dx = screen2.x - screen1.x;
            const dy = screen2.y - screen1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            // 外層紫色射線
            const outerLine = this.add.sprite((screen1.x + screen2.x) / 2, (screen1.y + screen2.y) / 2, MainScene.TEXTURE_LINE);
            this.skillGridContainer.add(outerLine);
            outerLine.setDepth(58);
            outerLine.setTint(0xbb66ff);
            outerLine.setRotation(angle);
            outerLine.setScale(length / MainScene.EFFECT_TEXTURE_SIZE, lineWidth / MainScene.EFFECT_LINE_HEIGHT);
            outerLine.setAlpha(0.9);
            allSprites.push(outerLine);

            // 內層亮線
            const innerLine = this.add.sprite((screen1.x + screen2.x) / 2, (screen1.y + screen2.y) / 2, MainScene.TEXTURE_LINE);
            this.skillGridContainer.add(innerLine);
            innerLine.setDepth(59);
            innerLine.setTint(0xeeccff);
            innerLine.setRotation(angle);
            innerLine.setScale(length / MainScene.EFFECT_TEXTURE_SIZE, (lineWidth * 0.5) / MainScene.EFFECT_LINE_HEIGHT);
            innerLine.setAlpha(1);
            allSprites.push(innerLine);

            // 檢測這段射線經過的怪物
            for (const monster of monsters) {
                if (hitMonsterIds.has(monster.id)) continue;

                const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

                // 計算怪物到線段的距離
                const dist = this.pointToSegmentDistance(
                    monster.x, monster.y,
                    p1.x, p1.y,
                    p2.x, p2.y
                );

                if (dist <= monsterRadius + rayWidth) {
                    hitMonsterIds.add(monster.id);
                }
            }
        }

        // 在每個節點繪製光點（使用 CIRCLE）
        for (let i = 0; i < points.length; i++) {
            const screen = this.worldToScreen(points[i].x, points[i].y);

            // 外圈光點
            const outerDot = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_CIRCLE);
            this.skillGridContainer.add(outerDot);
            outerDot.setDepth(60);
            outerDot.setTint(0xeeccff);
            outerDot.setScale(16 / MainScene.EFFECT_TEXTURE_SIZE);
            allSprites.push(outerDot);

            // 內圈白點
            const innerDot = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_CIRCLE);
            this.skillGridContainer.add(innerDot);
            innerDot.setDepth(61);
            innerDot.setTint(0xffffff);
            innerDot.setScale(8 / MainScene.EFFECT_TEXTURE_SIZE);
            innerDot.setAlpha(0.8);
            allSprites.push(innerDot);
        }

        // 對命中的怪物造成傷害
        if (hitMonsterIds.size > 0) {
            const monsterIdArray = Array.from(hitMonsterIds);
            const hitPositions = monsters
                .filter(m => hitMonsterIds.has(m.id))
                .map(m => ({ x: m.x, y: m.y }));

            const result = this.monsterManager.damageMonsters(monsterIdArray, baseDamage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }

            this.flashWhiteCrossAtPositions(hitPositions);
            this.shakeScreen(Math.min(hitMonsterIds.size, 3));
        }

        // 所有 sprites 統一淡出動畫
        for (const sprite of allSprites) {
            this.tweens.add({
                targets: sprite,
                alpha: 0,
                duration: 300,
                onComplete: () => sprite.destroy()
            });
        }
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
    private dismissPhantomById(phantomId: number) {
        const index = this.phantoms.findIndex(p => p.id === phantomId);
        if (index === -1) return;

        const phantom = this.phantoms[index];

        // 停止計時器
        phantom.skillTimer.destroy();
        phantom.dismissTimer.destroy();
        phantom.tauntTimer.destroy();

        // 清除嘲諷目標
        this.monsterManager.clearTauntTarget();

        // 從列表移除（先移除再檢查是否要停止全局計時器）
        this.phantoms.splice(index, 1);

        // 如果沒有分身了，停止全局彈射射線計時器
        if (this.phantoms.length === 0 && this.globalChainRayTimer) {
            this.globalChainRayTimer.destroy();
            this.globalChainRayTimer = undefined;
        }

        // 消失特效（使用 LINE 紋理）
        const screen = this.worldToScreen(phantom.x, phantom.y);
        const unitSize = this.gameBounds.height / 10;
        const targetSize = unitSize * 0.5; // 0.5 單位

        const lineSprite = this.add.sprite(screen.x, screen.y, MainScene.TEXTURE_LINE);
        lineSprite.setOrigin(0.5, 1); // 底部中心對齊
        lineSprite.setTint(0x9966ff); // 消失用較暗的紫色
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

        // 清除輪鋸追蹤
        this.phantomSawBladeActive.delete(phantomId);
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
        afterimage.setTint(0x9966ff);
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
            const shieldRatio = this.currentShield / this.maxShield;
            const bladeCount = Math.max(1, Math.ceil(shieldRatio * 6));
            const shieldCost = Math.ceil(this.maxShield * 0.02);

            infoLines.push(`傷害: ${damageUnits} 單位（${finalDamage}）`);
            infoLines.push(`輪鋸數量: ${bladeCount} / 6`);
            infoLines.push(`旋轉速度: 2 秒/圈`);
            infoLines.push(`撞敵耗盾: ${shieldCost} (2%)`);
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
            const dps = finalDamage * 5; // 每 0.2 秒一次 = 每秒 5 次
            const maxBeams = 4 + Math.floor(level / 5);

            infoLines.push(`傷害: ${damageUnits} 單位（${finalDamage}）`);
            infoLines.push(`每秒傷害: ${dps}（0.2秒/次）`);
            infoLines.push(`光束數量: ${maxBeams} 發（4+Lv/5）`);
            infoLines.push(`傷害範圍: 1 單位`);
            infoLines.push(`矩陣半徑: 5 單位`);
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
                lines.push(`傷害: ${finalDamage}`);
                lines.push(`冷卻: ${finalCd}s`);
                break;
            }
            case 'active_coder': {
                const rangeUnits = 2 + level * 0.5;
                const damageUnits = 1 + level;
                const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
                const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
                const baseCd = skill.definition.cooldown || 1500;
                const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);
                lines.push(`範圍: ${rangeUnits} 單位`);
                lines.push(`傷害: ${finalDamage}`);
                lines.push(`冷卻: ${finalCd}s`);
                break;
            }
            case 'active_vfx': {
                const beamCount = level + 1;
                const damageUnits = 1 + level;
                const baseDamage = MainScene.DAMAGE_UNIT * damageUnits;
                const finalDamage = Math.floor(baseDamage * (1 + damageBonus));
                const baseCd = skill.definition.cooldown || 2500;
                const finalCd = (baseCd * (1 - cdReduction) / 1000).toFixed(1);
                lines.push(`光束數: ${beamCount} 道`);
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
                lines.push(`反傷: ${reflectDamage}`);
                lines.push(`回血: ${shieldAmount}`);
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
                lines.push(`經驗加成: +${Math.round(expBonus * 100)}%`);
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

    private showSkillPanel() {
        // 檢查是否有可升級的技能（包含進階技能）
        const hasNormalSkills = this.skillManager.hasUpgradeableSkills();
        const hasAdvancedSkills = this.skillManager.getUpgradeableAdvancedSkills().length > 0;

        if (!hasNormalSkills && !hasAdvancedSkills) {
            // 技能全滿後不暫停遊戲，但仍享有升級帶來的 HP 成長
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
        // 選完技能卡後立即恢復遊戲（CUT IN 期間不暫停）
        this.isPaused = false;

        // 淡出動畫
        this.tweens.add({
            targets: this.skillPanelContainer,
            alpha: 0,
            duration: 200,
            onComplete: () => {
                this.skillPanelContainer.setVisible(false);
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
            const isNew = currentLevel === 0;
            const displayCurrentLevel = isNew ? '-' : currentLevel;
            const nextLevel = isNew ? 1 : currentLevel + 1;
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

            // 如果有技能圖示
            if (advSkillDef.iconPrefix) {
                const iconKey = `skill_${advSkillDef.iconPrefix}0${Math.min(nextLevel, advSkillDef.maxLevel)}`;
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
                const isNew = currentLevel === 0;
                const displayCurrentLevel = isNew ? '-' : currentLevel;
                const nextLevel = isNew ? 1 : currentLevel + 1;

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

                // 如果有技能圖示
                if (advSkillDef.iconPrefix) {
                    const iconKey = `skill_${advSkillDef.iconPrefix}0${Math.min(nextLevel, advSkillDef.maxLevel < 0 ? nextLevel : advSkillDef.maxLevel)}`;
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

    // 護盾特效（雙層逆轉設計）- 靈魂統領及相關組合技專用
    private flashShieldEffect(
        centerX: number, centerY: number,
        radius: number,
        color: number
    ) {
        // 外層
        const outer = this.getSkillEffectSprite();
        if (!outer) return;

        // 內層
        const inner = this.getSkillEffectSprite();
        if (!inner) {
            this.releaseSkillEffectSprite(outer);
            return;
        }

        const scale = (radius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        const targetScale = scale;
        const rotations = Math.PI * 4; // 兩圈
        const duration = 500; // 總動畫時間

        // 設定外層
        outer.setTexture(MainScene.TEXTURE_SHIELD);
        outer.setPosition(centerX, centerY);
        outer.setScale(scale * 0.1);
        outer.setTint(color);
        outer.setAlpha(0);
        outer.setRotation(0);
        outer.setDepth(200);

        // 設定內層（1/2 大小，較亮顏色）
        inner.setTexture(MainScene.TEXTURE_SHIELD);
        inner.setPosition(centerX, centerY);
        inner.setScale(scale * 0.05);
        inner.setTint(0xffffff); // 白色高光
        inner.setAlpha(0);
        inner.setRotation(0);
        inner.setDepth(201);

        // 外層動畫：展開 + 順時針旋轉兩圈 + 淡出
        this.tweens.add({
            targets: outer,
            alpha: { from: 0, to: 0.8 },
            scale: { from: scale * 0.1, to: targetScale * 1.2 },
            rotation: rotations, // 順時針兩圈
            duration: duration,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.releaseSkillEffectSprite(outer);
            }
        });

        // 內層動畫：展開 + 逆時針旋轉兩圈 + 淡出
        this.tweens.add({
            targets: inner,
            alpha: { from: 0, to: 0.9 },
            scale: { from: scale * 0.05, to: targetScale * 0.6 },
            rotation: -rotations * 1.5, // 逆時針，稍快
            duration: duration,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.releaseSkillEffectSprite(inner);
            }
        });
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
        const scale = (startRadius * 2) / MainScene.EFFECT_TEXTURE_SIZE;
        sprite.setScale(scale);
        sprite.setRotation(angle);
        sprite.setTint(color);
        sprite.setAlpha(0.6);

        // 計算起始位置（從扇形末端開始）
        const startX = originX + Math.cos(angle) * startRadius;
        const startY = originY + Math.sin(angle) * startRadius;
        sprite.setPosition(startX, startY);

        const duration = 1000;
        const startTime = this.time.now;

        const updateMovement = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            if (progress >= 1) {
                this.releaseSkillEffectSprite(sprite);
                return;
            }

            // 計算當前位置（直接飛出去）
            const currentDist = startRadius + travelDistance * progress;
            const currentX = originX + Math.cos(angle) * currentDist;
            const currentY = originY + Math.sin(angle) * currentDist;
            sprite.setPosition(currentX, currentY);

            // 透明度：逐漸淡出
            const alpha = 0.6 * (1 - progress * 0.7);
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

    // 在擊中位置顯示白色十字高光（邊擴散邊旋轉）
    flashWhiteCrossAt(worldX: number, worldY: number) {
        const screen = this.worldToScreen(worldX, worldY);
        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const centerCol = Math.floor(screen.x / cellTotal);
        const centerRow = Math.floor(screen.y / cellTotal);
        const centerX = centerCol * cellTotal + this.skillGridCellSize / 2;
        const centerY = centerRow * cellTotal + this.skillGridCellSize / 2;

        const crossLength = 3; // 十字臂長度（格子數）
        const duration = 300; // 總時長 300ms
        const startTime = this.time.now;

        // 隨機旋轉方向和角度（20~50度）
        const rotateDirection = Math.random() < 0.5 ? 1 : -1;
        const rotateAngle = (Math.PI / 9 + Math.random() * Math.PI / 6) * rotateDirection; // 20~50度

        // 收集十字形狀的格子（中心 + 四個方向），記錄相對中心的偏移
        const crossCells: { offsetX: number, offsetY: number, dist: number }[] = [];

        // 中心格子
        crossCells.push({ offsetX: 0, offsetY: 0, dist: 0 });

        // 四個方向
        const directions = [
            { dc: 1, dr: 0 },  // 右
            { dc: -1, dr: 0 }, // 左
            { dc: 0, dr: 1 },  // 下
            { dc: 0, dr: -1 }  // 上
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

        // 建立十字格子
        const flashCells: Phaser.GameObjects.Rectangle[] = [];
        for (let i = 0; i < crossCells.length; i++) {
            const cell = this.add.rectangle(centerX, centerY, this.skillGridCellSize, this.skillGridCellSize, 0xffffff, 0);
            cell.setVisible(false);
            this.skillGridContainer.add(cell);
            flashCells.push(cell);
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 當前旋轉角度
            const currentAngle = rotateAngle * progress;
            const cos = Math.cos(currentAngle);
            const sin = Math.sin(currentAngle);

            // 從中心往外淡出
            const fadeDistance = crossLength * progress;

            for (let i = 0; i < crossCells.length; i++) {
                const { offsetX, offsetY, dist } = crossCells[i];
                const cell = flashCells[i];
                if (!cell) continue;

                // 旋轉後的位置
                const rotatedX = centerX + offsetX * cos - offsetY * sin;
                const rotatedY = centerY + offsetX * sin + offsetY * cos;
                cell.setPosition(rotatedX, rotatedY);

                if (dist >= fadeDistance) {
                    // 距離越遠透明度越低
                    const distRatio = dist / crossLength;
                    const baseAlpha = 1 - distRatio * 0.5; // 中心 100%，邊緣 50%

                    // 接近淡出邊緣時漸變透明
                    let edgeFade = 1;
                    if (fadeDistance > 0 && dist < fadeDistance + 1) {
                        edgeFade = (dist - fadeDistance);
                    }

                    const currentAlpha = baseAlpha * Math.max(0, edgeFade);

                    if (currentAlpha > 0.01) {
                        cell.setFillStyle(0xffffff, currentAlpha);
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

    // 在擊中位置顯示暴擊十字高光（橙色，更大更亮）
    flashCritCrossAt(worldX: number, worldY: number) {
        const screen = this.worldToScreen(worldX, worldY);
        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const centerCol = Math.floor(screen.x / cellTotal);
        const centerRow = Math.floor(screen.y / cellTotal);
        const centerX = centerCol * cellTotal + this.skillGridCellSize / 2;
        const centerY = centerRow * cellTotal + this.skillGridCellSize / 2;

        const crossLength = 4; // 十字臂長度（比普通攻擊長）
        const duration = 400; // 總時長 400ms（比普通攻擊長）
        const startTime = this.time.now;

        // 隨機旋轉方向和角度（30~60度）
        const rotateDirection = Math.random() < 0.5 ? 1 : -1;
        const rotateAngle = (Math.PI / 6 + Math.random() * Math.PI / 6) * rotateDirection; // 30~60度

        // 收集十字形狀的格子（中心 + 四個方向），記錄相對中心的偏移
        const crossCells: { offsetX: number, offsetY: number, dist: number }[] = [];

        // 中心格子
        crossCells.push({ offsetX: 0, offsetY: 0, dist: 0 });

        // 四個方向
        const directions = [
            { dc: 1, dr: 0 },  // 右
            { dc: -1, dr: 0 }, // 左
            { dc: 0, dr: 1 },  // 下
            { dc: 0, dr: -1 }  // 上
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

        // 暴擊顏色（橙色）
        const critColor = 0xff8800;

        // 建立十字格子
        const flashCells: Phaser.GameObjects.Rectangle[] = [];
        for (let i = 0; i < crossCells.length; i++) {
            const cell = this.add.rectangle(centerX, centerY, this.skillGridCellSize, this.skillGridCellSize, critColor, 0);
            cell.setVisible(false);
            this.skillGridContainer.add(cell);
            flashCells.push(cell);
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 當前旋轉角度
            const currentAngle = rotateAngle * progress;
            const cos = Math.cos(currentAngle);
            const sin = Math.sin(currentAngle);

            // 從中心往外淡出
            const fadeDistance = crossLength * progress;

            for (let i = 0; i < crossCells.length; i++) {
                const { offsetX, offsetY, dist } = crossCells[i];
                const cell = flashCells[i];
                if (!cell) continue;

                // 旋轉後的位置
                const rotatedX = centerX + offsetX * cos - offsetY * sin;
                const rotatedY = centerY + offsetX * sin + offsetY * cos;
                cell.setPosition(rotatedX, rotatedY);

                if (dist >= fadeDistance) {
                    // 距離越遠透明度越低
                    const distRatio = dist / crossLength;
                    const baseAlpha = 1 - distRatio * 0.3; // 中心 100%，邊緣 70%（比普通更亮）

                    // 接近淡出邊緣時漸變透明
                    let edgeFade = 1;
                    if (fadeDistance > 0 && dist < fadeDistance + 1) {
                        edgeFade = (dist - fadeDistance);
                    }

                    const currentAlpha = baseAlpha * Math.max(0, edgeFade);

                    if (currentAlpha > 0.01) {
                        cell.setFillStyle(critColor, currentAlpha);
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

    // 批量顯示白色十字高光
    flashWhiteCrossAtPositions(positions: { x: number, y: number }[]) {
        positions.forEach(pos => {
            this.flashWhiteCrossAt(pos.x, pos.y);
        });
    }

    // 批量顯示暴擊十字高光（橙色）
    flashCritCrossAtPositions(positions: { x: number, y: number }[]) {
        positions.forEach(pos => {
            this.flashCritCrossAt(pos.x, pos.y);
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
