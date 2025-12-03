import Phaser from 'phaser';
import { SkillManager, SkillDefinition, PlayerSkill, SKILL_LIBRARY } from '../systems/SkillSystem';
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
    private isMoving: boolean = false; // 是否正在移動
    private isPointerDown: boolean = false; // 是否按住滑鼠/觸控
    private targetX!: number; // 目標 X
    private targetY!: number; // 目標 Y
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
    private skillOptions: Phaser.GameObjects.Container[] = [];
    private skillCardBgs: Phaser.GameObjects.Rectangle[] = [];
    private selectedSkillIndex: number = 0; // 當前選中的技能索引
    private currentSkillChoices: SkillDefinition[] = []; // 當前可選的技能

    // 技能系統
    private skillManager: SkillManager = new SkillManager();
    private skillIconContainers: Phaser.GameObjects.Container[] = []; // 技能欄圖示容器
    private skillLevelTexts: Phaser.GameObjects.Text[] = []; // 技能等級文字

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
    private maxShield: number = 0; // 護盾最大值（用於計算回血）
    private shieldBarFlowOffset: number = 0; // 護盾流動效果偏移
    private shieldReflectDamage: number = 0; // 護盾反傷傷害值
    private shieldText!: Phaser.GameObjects.Text;
    private shieldAuraGraphics!: Phaser.GameObjects.Graphics; // 護盾光環圖形
    private shieldSparkleTimer: number = 0; // 金光閃點計時器

    // HP 自動回復計時器（鈦金肝被動技能）
    private hpRegenTimer: number = 0;

    // HP 損傷顯示（白色區塊延遲靠攏）
    private displayedHp: number = 200; // 顯示的 HP（延遲跟隨實際 HP）
    private hpDamageDelay: number = 0; // 損傷延遲計時器（毫秒）
    private static readonly HP_DAMAGE_DELAY = 1000; // 1 秒延遲
    private static readonly HP_DAMAGE_LERP_SPEED = 3; // 靠攏速度（每秒倍率）

    // RWD 最小字級（手機可讀性）
    private static readonly MIN_FONT_SIZE_LARGE = 14; // 大字（標題、等級）
    private static readonly MIN_FONT_SIZE_MEDIUM = 12; // 中字（HP、描述）
    private static readonly MIN_FONT_SIZE_SMALL = 10; // 小字（副標、數值）

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

    // 測試用：顯示原本的技能特效（SHIFT+BACKSPACE 切換）
    private showLegacySkillEffects: boolean = false;

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

        // 建立怪物管理系統
        this.monsterManager = new MonsterManager(
            this,
            this.worldContainer,
            this.gameBounds,
            this.mapWidth,
            this.mapHeight
        );

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
        this.uiContainer.setDepth(10); // 在遊戲區域之上

        // 建立技能範圍格子覆蓋層（放在 UI 層）
        this.createSkillGrid();

        // 監聽網格倍率變更事件
        window.addEventListener('gridscalechange', ((e: CustomEvent) => {
            this.gridScaleMultiplier = e.detail.scale;
            this.recreateSkillGrid();
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

        // 建立低血量紅暈效果
        this.createLowHpVignette();

        // 注意：技能面板會在轉場完成後自動顯示（見 onRevealComplete）
    }

    update(_time: number, delta: number) {
        // 更新 HP 條、護盾條和經驗條流動效果
        this.updateHpBarFlow(delta);
        this.updateShieldBarFlow(delta);
        this.updateExpBarFlow(delta);
        this.updateShieldAura(delta);
        this.updateHpRegen(delta);
        this.updateLowHpVignetteBreathing(delta);
        this.updateSkillCooldownDisplay();

        // 如果遊戲暫停，處理技能選擇面板的按鍵
        if (this.isPaused) {
            this.handleSkillPanelInput();
            return;
        }

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
            if (this.isMoving || this.isKeyboardMoving) {
                this.setCharacterState('run', true);
            } else {
                this.setCharacterState('idle', true);
            }
        }

        // 受傷硬直中不能移動
        if (!this.isHurt) {
            // 處理鍵盤移動
            this.handleKeyboardInput(delta);

            // 處理點擊移動
            if (this.isMoving && !this.isKeyboardMoving) {
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

        // 更新技能範圍預覽
        this.updateSkillRangePreview(now);

        // 嘗試發動技能攻擊
        this.tryActivateSkills(now);
    }

    // 更新技能範圍預覽
    private updateSkillRangePreview(now: number) {
        // 清除之前的格子
        this.clearSkillGrid();

        // 如果正在受傷硬直，不顯示範圍
        if (this.isHurt) return;

        // 取得玩家擁有的主動技能
        const activeSkills = this.skillManager.getPlayerActiveSkills();

        for (const skill of activeSkills) {
            if (!skill) continue;

            const def = skill.definition;
            let baseCooldown = def.cooldown || 1000;
            if (def.id === 'active_architect') {
                baseCooldown = baseCooldown - skill.level * 500;
            }
            const cooldown = this.skillManager.calculateFinalCooldown(baseCooldown);
            const lastActivation = this.skillCooldowns.get(def.id) || 0;

            // 只有當技能 CD 好時才顯示範圍
            if (now - lastActivation >= cooldown) {
                this.showSkillPreview(skill);
            }
        }
    }

    // 顯示單個技能的範圍預覽
    private showSkillPreview(skill: PlayerSkill) {
        const def = skill.definition;
        const color = def.color;
        const alpha = 0.2; // 淡淡的預覽

        switch (def.id) {
            case 'active_soul_render': {
                // 扇形：朝最近怪物方向
                const monsters = this.monsterManager.getMonsters();
                if (monsters.length === 0) return;

                // 找最近的怪物
                let nearestAngle = 0;
                let nearestDist = Infinity;
                for (const monster of monsters) {
                    const dx = monster.x - this.characterX;
                    const dy = monster.y - this.characterY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestAngle = Math.atan2(dy, dx);
                    }
                }

                const range = this.gameBounds.height * 0.3;
                const sectorAngle = 60 + skill.level * 10;
                const halfAngle = (sectorAngle / 2) * (Math.PI / 180);
                this.showSkillRangeSector(this.characterX, this.characterY, range, nearestAngle, halfAngle, color, alpha);
                break;
            }
            case 'active_coder': {
                // 圓形 AOE
                const unitSize = this.gameBounds.height * 0.1;
                const rangeUnits = 2 + skill.level * 0.5;
                const range = unitSize * rangeUnits;
                this.showSkillRangeCircle(this.characterX, this.characterY, range, color, alpha);
                break;
            }
            case 'active_vfx': {
                // 多道光束：朝隨機怪物方向（預覽時顯示所有可能的目標方向）
                const monsters = this.monsterManager.getMonsters();
                if (monsters.length === 0) return;

                const beamCount = Math.min(skill.level + 1, monsters.length);
                const range = this.gameBounds.height * 1.0;
                const beamWidth = this.gameBounds.height * 0.05;

                // 顯示到最近 beamCount 隻怪物的光束預覽
                const sortedMonsters = [...monsters].sort((a, b) => {
                    const distA = Math.sqrt((a.x - this.characterX) ** 2 + (a.y - this.characterY) ** 2);
                    const distB = Math.sqrt((b.x - this.characterX) ** 2 + (b.y - this.characterY) ** 2);
                    return distA - distB;
                });

                for (let i = 0; i < beamCount; i++) {
                    const monster = sortedMonsters[i];
                    const dx = monster.x - this.characterX;
                    const dy = monster.y - this.characterY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 0) {
                        const endX = this.characterX + (dx / dist) * range;
                        const endY = this.characterY + (dy / dist) * range;
                        this.showSkillRangeLine(this.characterX, this.characterY, endX, endY, beamWidth, color, alpha);
                    }
                }
                break;
            }
            case 'active_architect': {
                // 護盾：以自己為中心的小圓圈
                const shieldRadius = this.gameBounds.height * 0.15;
                this.showSkillRangeCircle(this.characterX, this.characterY, shieldRadius, color, alpha);
                break;
            }
        }
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
                console.log(`Skill activated: ${def.name}`);
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
        const finalDamage = this.skillManager.calculateFinalDamage(baseDamage);

        // 檢查哪些怪物在扇形範圍內
        const hitMonsters: number[] = [];
        for (const monster of monsters) {
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // 檢查距離
            if (dist > range) continue;

            // 計算怪物相對於玩家的角度
            const monsterAngle = Math.atan2(dy, dx);

            // 計算角度差（處理角度環繞）
            let angleDiff = monsterAngle - targetAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // 檢查是否在扇形內
            if (Math.abs(angleDiff) <= halfAngle) {
                hitMonsters.push(monster.id);
            }
        }

        // 繪製扇形特效（舊版，可用 SHIFT+BACKSPACE 切換）
        if (this.showLegacySkillEffects) {
            this.drawSectorEffect(targetAngle, range, halfAngle, skill.definition.color);
        }

        // 繪製扇形邊緣線（60% 透明度）
        this.drawSectorEdge(targetAngle, range, halfAngle, skill.definition.color);

        // 繪製打擊區網格特效（展開+淡出動畫）
        this.flashSkillAreaSector(this.characterX, this.characterY, range, targetAngle, halfAngle, skill.definition.flashColor || skill.definition.color);

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

            // 命中回饋：白色十字高光
            this.flashWhiteCrossAtPositions(hitPositions);

            // 舊版特效：十字星芒效果
            if (this.showLegacySkillEffects) {
                this.drawCrossStarBurst(hitPositions, skill.definition.flashColor || skill.definition.color);
            }

            // 擊中 10 隻以上觸發畫面震動
            this.shakeScreen(hitMonsters.length);
            console.log(`Soul Render hit ${hitMonsters.length} monsters for ${finalDamage} damage, killed ${result.killCount}, exp +${result.totalExp}`);
        }
    }

    // 繪製扇形攻擊特效（從發射點漸漸淡出到外圍，帶高亮漸層）
    private drawSectorEffect(angle: number, radius: number, halfAngle: number, color: number) {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        // 扇形起始和結束角度
        const startAngle = angle - halfAngle;
        const endAngle = angle + halfAngle;

        // 記錄發射點位置
        const originX = this.characterX;
        const originY = this.characterY;

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

            // 繪製多層扇形，從內到外透明度遞減
            for (let i = segments; i >= 1; i--) {
                const segmentRadius = (radius * i) / segments;
                const baseAlpha = 0.8 * (1 - (i - 1) / segments);
                const alpha = baseAlpha * (1 - fadeProgress);

                if (alpha > 0.01) {
                    graphics.fillStyle(color, alpha);
                    graphics.beginPath();
                    graphics.moveTo(originX, originY);
                    graphics.arc(originX, originY, segmentRadius, startAngle, endAngle, false);
                    graphics.closePath();
                    graphics.fillPath();
                }
            }

            // 繪製中心高亮（白色漸層）
            const highlightSegments = 8;
            for (let i = highlightSegments; i >= 1; i--) {
                const highlightRadius = (radius * 0.6 * i) / highlightSegments;
                const highlightAlpha = 0.95 * (1 - (i - 1) / highlightSegments) * (1 - fadeProgress);
                if (highlightAlpha > 0.01) {
                    graphics.fillStyle(0xffffff, highlightAlpha);
                    graphics.beginPath();
                    graphics.moveTo(originX, originY);
                    graphics.arc(originX, originY, highlightRadius, startAngle, endAngle, false);
                    graphics.closePath();
                    graphics.fillPath();
                }
            }

            // 繪製邊框
            const borderAlpha = 1.0 * (1 - fadeProgress);
            if (borderAlpha > 0.01) {
                graphics.lineStyle(6, color, borderAlpha);
                graphics.beginPath();
                graphics.moveTo(originX, originY);
                graphics.arc(originX, originY, radius, startAngle, endAngle, false);
                graphics.closePath();
                graphics.strokePath();

                // 白色高亮邊框
                graphics.lineStyle(3, 0xffffff, borderAlpha * 0.8);
                graphics.beginPath();
                graphics.moveTo(originX, originY);
                graphics.arc(originX, originY, radius * 0.97, startAngle, endAngle, false);
                graphics.closePath();
                graphics.strokePath();

                // 中央放射線
                graphics.lineStyle(4, 0xffffff, borderAlpha * 0.9);
                graphics.beginPath();
                graphics.moveTo(originX, originY);
                graphics.lineTo(originX + Math.cos(angle) * radius, originY + Math.sin(angle) * radius);
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

    // 繪製扇形邊緣線（60% 透明度，與網格特效同時顯示）
    private drawSectorEdge(angle: number, radius: number, halfAngle: number, color: number) {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        const startAngle = angle - halfAngle;
        const endAngle = angle + halfAngle;
        const originX = this.characterX;
        const originY = this.characterY;

        const duration = 500; // 與網格特效同步
        const holdTime = 300;
        const startTime = this.time.now;

        // 分段數量
        const segments = 15;

        // 繪製漸淡線段的輔助函數
        const drawFadedLine = (lineAngle: number, lineColor: number, lineWidth: number, baseAlpha: number, lengthMult: number = 1) => {
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
                    const r1 = radius * t1 * lengthMult;
                    const r2 = radius * t2 * lengthMult;
                    const x1 = originX + Math.cos(lineAngle) * r1;
                    const y1 = originY + Math.sin(lineAngle) * r1;
                    const x2 = originX + Math.cos(lineAngle) * r2;
                    const y2 = originY + Math.sin(lineAngle) * r2;

                    graphics.lineStyle(lineWidth, lineColor, segmentAlpha);
                    graphics.beginPath();
                    graphics.moveTo(x1, y1);
                    graphics.lineTo(x2, y2);
                    graphics.strokePath();
                }
            }
        };

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            graphics.clear();

            // 淡出進度
            let fadeProgress = 0;
            if (elapsed > holdTime) {
                fadeProgress = (elapsed - holdTime) / (duration - holdTime);
            }
            const alpha = 0.6 * (1 - fadeProgress);

            if (alpha > 0.01) {
                // 兩條切線（從原點到弧線兩端）- 頭尾漸淡
                drawFadedLine(startAngle, color, 3, alpha);
                drawFadedLine(endAngle, color, 3, alpha);

                // 白色高光切線 - 頭尾漸淡
                drawFadedLine(startAngle, 0xffffff, 1.5, alpha * 0.5, 0.98);
                drawFadedLine(endAngle, 0xffffff, 1.5, alpha * 0.5, 0.98);
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

    // 繪製圓形邊緣線（60% 透明度，與網格特效同時顯示）
    private drawCircleEdge(radius: number, color: number) {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        const originX = this.characterX;
        const originY = this.characterY;

        const duration = 500;
        const holdTime = 300;
        const startTime = this.time.now;

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            graphics.clear();

            let fadeProgress = 0;
            if (elapsed > holdTime) {
                fadeProgress = (elapsed - holdTime) / (duration - holdTime);
            }
            const alpha = 0.6 * (1 - fadeProgress);

            if (alpha > 0.01) {
                // 外圈圓線
                graphics.lineStyle(3, color, alpha);
                graphics.strokeCircle(originX, originY, radius);

                // 白色高光邊緣
                graphics.lineStyle(1.5, 0xffffff, alpha * 0.5);
                graphics.strokeCircle(originX, originY, radius * 0.98);
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
    private drawBeamEdge(angle: number, length: number, _width: number, _color: number) {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        const originX = this.characterX;
        const originY = this.characterY;
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
        const finalDamage = this.skillManager.calculateFinalDamage(baseDamage);

        // 檢查哪些怪物在範圍內
        const hitMonsters: number[] = [];
        for (const monster of monsters) {
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= range) {
                hitMonsters.push(monster.id);
            }
        }

        // 繪製圓形範圍特效（舊版，可用 SHIFT+BACKSPACE 切換）
        if (this.showLegacySkillEffects) {
            this.drawCircleEffect(range, skill.definition.color);
        }

        // 繪製圓形邊緣線（60% 透明度）
        this.drawCircleEdge(range, skill.definition.color);

        // 繪製打擊區網格特效（展開+淡出動畫）
        this.flashSkillAreaCircle(this.characterX, this.characterY, range, skill.definition.flashColor || skill.definition.color);

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

            // 命中回饋：白色十字高光
            this.flashWhiteCrossAtPositions(hitPositions);

            // 舊版特效：十字星芒效果
            if (this.showLegacySkillEffects) {
                this.drawCrossStarBurst(hitPositions, skill.definition.flashColor || skill.definition.color);
            }

            // 擊中 10 隻以上觸發畫面震動
            this.shakeScreen(hitMonsters.length);
            console.log(`Coder hit ${hitMonsters.length} monsters for ${finalDamage} damage, killed ${result.killCount}, exp +${result.totalExp}`);
        }
    }

    // 繪製圓形範圍特效（從發射點漸漸淡出到外圍，帶高亮漸層）
    private drawCircleEffect(radius: number, color: number) {
        const graphics = this.add.graphics();
        this.worldContainer.add(graphics);

        // 記錄發射點位置
        const originX = this.characterX;
        const originY = this.characterY;

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

            // 繪製多層同心圓，從內到外透明度遞減
            for (let i = segments; i >= 1; i--) {
                const segmentRadius = (radius * i) / segments;
                const innerRadius = (radius * (i - 1)) / segments;
                const baseAlpha = 0.7 * (1 - (i - 1) / segments);
                const alpha = baseAlpha * (1 - fadeProgress);

                if (alpha > 0.01) {
                    graphics.fillStyle(color, alpha);
                    graphics.beginPath();
                    graphics.arc(originX, originY, segmentRadius, 0, Math.PI * 2, false);
                    if (innerRadius > 0) {
                        graphics.arc(originX, originY, innerRadius, 0, Math.PI * 2, true);
                    }
                    graphics.closePath();
                    graphics.fillPath();
                }
            }

            // 繪製中心高亮（白色漸層）
            const highlightSegments = 8;
            for (let i = highlightSegments; i >= 1; i--) {
                const highlightRadius = (radius * 0.5 * i) / highlightSegments;
                const innerHighlightRadius = (radius * 0.5 * (i - 1)) / highlightSegments;
                const highlightAlpha = 0.95 * (1 - (i - 1) / highlightSegments) * (1 - fadeProgress);
                if (highlightAlpha > 0.01) {
                    graphics.fillStyle(0xffffff, highlightAlpha);
                    graphics.beginPath();
                    graphics.arc(originX, originY, highlightRadius, 0, Math.PI * 2, false);
                    if (innerHighlightRadius > 0) {
                        graphics.arc(originX, originY, innerHighlightRadius, 0, Math.PI * 2, true);
                    }
                    graphics.closePath();
                    graphics.fillPath();
                }
            }

            // 繪製邊框
            const borderAlpha = 1.0 * (1 - fadeProgress);
            if (borderAlpha > 0.01) {
                graphics.lineStyle(6, color, borderAlpha);
                graphics.strokeCircle(originX, originY, radius);

                // 白色高亮邊框
                graphics.lineStyle(3, 0xffffff, borderAlpha * 0.8);
                graphics.strokeCircle(originX, originY, radius * 0.96);

                // 向外擴散的環
                graphics.lineStyle(2, 0xffffff, borderAlpha * 0.5);
                graphics.strokeCircle(originX, originY, radius * 0.7);
                graphics.strokeCircle(originX, originY, radius * 0.4);
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
        const finalDamage = this.skillManager.calculateFinalDamage(baseDamage);

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
                const dx = monster.x - this.characterX;
                const dy = monster.y - this.characterY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // 檢查距離
                if (dist > range) continue;

                // 計算怪物到光束中心線的垂直距離
                const dirX = Math.cos(targetAngle);
                const dirY = Math.sin(targetAngle);

                // 投影長度
                const projLength = dx * dirX + dy * dirY;

                // 只考慮在角色前方的怪物
                if (projLength < 0) continue;

                // 垂直距離
                const perpDist = Math.abs(dx * dirY - dy * dirX);

                // 檢查是否在光束寬度內
                if (perpDist <= beamWidth / 2) {
                    allHitMonsters.add(monster.id);
                }
            }

            // 繪製光束特效（舊版，可用 SHIFT+BACKSPACE 切換）
            if (this.showLegacySkillEffects) {
                this.drawBeamEffect(targetAngle, range, beamWidth, skill.definition.color);
            }

            // 繪製光束邊緣線（60% 透明度）
            this.drawBeamEdge(targetAngle, range, beamWidth, skill.definition.color);

            // 繪製光束打擊區網格特效（展開+淡出動畫）
            const endX = this.characterX + Math.cos(targetAngle) * range;
            const endY = this.characterY + Math.sin(targetAngle) * range;
            this.flashSkillAreaLine(this.characterX, this.characterY, endX, endY, beamWidth, skill.definition.flashColor || skill.definition.color);
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
            const hitPositions = monsters
                .filter(m => hitMonsterIds.includes(m.id))
                .map(m => ({ x: m.x, y: m.y }));

            const result = this.monsterManager.damageMonsters(hitMonsterIds, finalDamage);
            if (result.totalExp > 0) {
                this.addExp(result.totalExp);
            }

            // 命中回饋：白色十字高光
            this.flashWhiteCrossAtPositions(hitPositions);

            // 舊版特效：十字星芒效果
            if (this.showLegacySkillEffects) {
                this.drawCrossStarBurst(hitPositions, skill.definition.flashColor || skill.definition.color);
            }

            // 擊中 10 隻以上觸發畫面震動
            this.shakeScreen(hitMonsterIds.length);
            console.log(`VFX (${beamCount} beams) hit ${hitMonsterIds.length} monsters for ${finalDamage} damage, killed ${result.killCount}, exp +${result.totalExp}`);
        }
    }

    // 繪製光束特效（從發射點漸漸淡出到外圍，帶高亮漸層）
    private drawBeamEffect(angle: number, length: number, width: number, color: number) {
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
    private drawCrossStarBurst(positions: { x: number; y: number }[], color: number) {
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
    // 反傷傷害：1 單位 + 每級 1.5 單位（Lv.0=1單位，Lv.5=8.5單位）
    // 護盾消失時恢復等值 HP
    private activateArchitect(skill: PlayerSkill) {
        // 護盾值為最大 HP 的 30%
        const shieldAmount = Math.floor(this.maxHp * 0.3);

        // 設定護盾值（不疊加，直接設定）
        this.currentShield = shieldAmount;
        this.maxShield = shieldAmount; // 記錄護盾最大值用於回血計算

        // 反傷傷害：1 單位 + 每級 1.5 單位（Lv.0=1單位，Lv.5=8.5單位）
        const reflectUnits = 1 + skill.level * 1.5;
        this.shieldReflectDamage = MainScene.DAMAGE_UNIT * reflectUnits;

        // 繪製護盾條
        this.drawShieldBarFill();

        // 護盾啟動視覺效果（舊版，可用 SHIFT+BACKSPACE 切換）
        if (this.showLegacySkillEffects) {
            this.drawShieldActivateEffect();
        }

        // 繪製護盾打擊區網格特效（展開+淡出動畫）
        const shieldRadius = this.gameBounds.height * 0.15;
        this.flashSkillAreaCircle(this.characterX, this.characterY, shieldRadius, skill.definition.flashColor || skill.definition.color);

        console.log(`Architect activated: Shield ${shieldAmount}, Reflect damage ${this.shieldReflectDamage} (${reflectUnits} units)`);
    }

    // 繪製護盾啟動特效（帶高亮漸層和長殘留）
    private drawShieldActivateEffect() {
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

        // Shift + Backspace：切換舊版技能特效顯示
        if (this.keyShift.isDown && Phaser.Input.Keyboard.JustDown(this.keyBackspace)) {
            this.showLegacySkillEffects = !this.showLegacySkillEffects;
            console.log(`Legacy skill effects: ${this.showLegacySkillEffects ? 'ON' : 'OFF'}`);
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
            console.log(`Test: ${def.name} is already MAX`);
            return;
        }

        // 被動技能：檢查欄位是否已滿（未擁有時）
        if (isPassive && currentSkillLevel < 0 && this.skillManager.isPassiveSlotsFull()) {
            console.log(`Test: Passive slots full, cannot add ${def.name}`);
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

        console.log(`Test: ${def.name} maxed! Player level: ${this.currentLevel}`);
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

        console.log(`Test: Jumped to level ${targetLevel} with all active skills maxed!`);
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
        this.monsterManager.setPlayerLevel(this.currentLevel);

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

        console.log(`Level up! Lv.${this.currentLevel}, MaxHP: ${this.maxHp}, NextExp: ${this.maxExp}`);
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
        if (!this.cursors) return;

        // A 鍵選擇左邊（索引 0），重複按確認
        if (Phaser.Input.Keyboard.JustDown(this.cursors.A)) {
            if (this.selectedSkillIndex === 0) {
                this.confirmSkillSelection();
            } else {
                this.setSelectedSkill(0);
            }
        }
        // S 鍵選擇中間（索引 1），重複按確認
        if (Phaser.Input.Keyboard.JustDown(this.cursors.S)) {
            if (this.selectedSkillIndex === 1) {
                this.confirmSkillSelection();
            } else {
                this.setSelectedSkill(1);
            }
        }
        // D 鍵選擇右邊（索引 2），重複按確認
        if (Phaser.Input.Keyboard.JustDown(this.cursors.D)) {
            if (this.selectedSkillIndex === 2) {
                this.confirmSkillSelection();
            } else {
                this.setSelectedSkill(2);
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
            this.isMoving = false; // 取消點擊移動

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
            if (!this.isMoving) {
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
        this.updateTargetFromPointer(pointer);
        this.isMoving = true;
    }

    private onPointerMove(pointer: Phaser.Input.Pointer) {
        // 只有在按住時才更新目標
        if (!this.isPointerDown || this.isPaused) return;

        // 檢查是否仍在遊戲區域內
        if (this.isPointerInGameArea(pointer)) {
            this.updateTargetFromPointer(pointer);
        }
    }

    private onPointerUp() {
        this.isPointerDown = false;
    }

    private isPointerInGameArea(pointer: Phaser.Input.Pointer): boolean {
        return (
            pointer.x >= this.gameBounds.x &&
            pointer.x <= this.gameBounds.x + this.gameBounds.width &&
            pointer.y >= this.gameBounds.y &&
            pointer.y <= this.gameBounds.y + this.gameBounds.height
        );
    }

    private updateTargetFromPointer(pointer: Phaser.Input.Pointer) {
        // 將螢幕座標轉換為地圖座標
        const localX = pointer.x - this.gameBounds.x;
        const localY = pointer.y - this.gameBounds.y;

        // 加上鏡頭偏移得到地圖座標
        const mapX = localX + this.cameraOffsetX;
        const mapY = localY + this.cameraOffsetY;

        // 設定目標位置（限制在地圖範圍內）
        this.targetX = Phaser.Math.Clamp(mapX, this.characterSize, this.mapWidth - this.characterSize);
        this.targetY = Phaser.Math.Clamp(mapY, this.characterSize, this.mapHeight - this.characterSize);
    }

    private moveCharacter(delta: number) {
        const dx = this.targetX - this.characterX;
        const dy = this.targetY - this.characterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 更新角色面向
        this.updateCharacterFacing(this.targetX);

        // 到達目標點（容差 5 像素）
        if (distance < 5) {
            this.characterX = this.targetX;
            this.characterY = this.targetY;
            this.isMoving = false;
            // 到達後切換到待機
            this.setCharacterState('idle');
        } else {
            // 計算移動距離
            const moveDistance = (this.moveSpeed * delta) / 1000;

            if (moveDistance >= distance) {
                // 一步到位
                this.characterX = this.targetX;
                this.characterY = this.targetY;
                this.isMoving = false;
                // 到達後切換到待機
                this.setCharacterState('idle');
            } else {
                // 朝目標方向移動
                const ratio = moveDistance / distance;
                this.characterX += dx * ratio;
                this.characterY += dy * ratio;
                // 移動中切換到跑步動畫
                this.setCharacterState('run');
            }
        }

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

        // HP 文字位置（頂部網格上方）
        const cellHeight = this.skillGridCellSize;
        const barY = this.gameBounds.y + cellHeight * 2;
        const fontSize = Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(this.gameBounds.height * 0.03));

        this.hpText = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            barY + cellHeight / 2,
            `${this.currentHp} / ${this.maxHp}`,
            {
                fontFamily: 'monospace',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4 // 黑邊加粗 1px
            }
        );
        this.hpText.setOrigin(0.5, 0.5);
        this.hpText.setDepth(1002);
        this.hpBarContainer.add(this.hpText);

        // 初始繪製（HP 條現在使用網格格子繪製）
        this.drawHpBarFill();

        // 加入 UI 容器
        this.uiContainer.add(this.hpBarContainer);
    }

    private drawHpBarFill() {
        // HP 條使用頂部 2 行網格格子（row 0 和 row 1）
        const hpRows = [0, 1];
        const totalCells = this.skillGridCols;

        // 計算各種 HP 填充格子數
        const fillRatio = this.currentHp / this.maxHp;
        const fillCells = Math.floor(totalCells * fillRatio);

        const displayedRatio = this.displayedHp / this.maxHp;
        const displayedCells = Math.floor(totalCells * displayedRatio);

        // 先繪製所有頂部格子為黑底
        for (const row of hpRows) {
            for (let col = 0; col < this.skillGridCols; col++) {
                const index = row * this.skillGridCols + col;
                const cell = this.skillGridCells[index];
                if (!cell) continue;

                // 設置黑底並顯示
                cell.setFillStyle(0x000000, 0.9);
                cell.setVisible(true);
                cell.setDepth(1000);
            }
        }

        // 繪製白色損傷區塊（displayedHp 到 currentHp 之間）
        if (displayedCells > fillCells) {
            for (const row of hpRows) {
                for (let col = fillCells; col < displayedCells; col++) {
                    const index = row * this.skillGridCols + col;
                    const cell = this.skillGridCells[index];
                    if (!cell) continue;

                    // 白色損傷區塊，上排亮一點
                    const alpha = row === 0 ? 0.85 : 0.7;
                    cell.setFillStyle(0xffffff, alpha);
                }
            }
        }

        if (fillCells <= 0) return;

        // 繪製 HP 格子（頂部 2 行，暗紅暗紫漸層流動效果）
        for (const row of hpRows) {
            for (let col = 0; col < fillCells; col++) {
                const index = row * this.skillGridCols + col;
                const cell = this.skillGridCells[index];
                if (!cell) continue;

                // 計算漸層位置（加入流動偏移）
                const baseT = col / totalCells;
                const flowT = this.hpBarFlowOffset;
                const t = (baseT + flowT) % 1;

                // 使用正弦波讓頭尾同色（暗紅→暗紫→暗紅）
                const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;

                // 暗紅色 (0x880022) 到 暗紫色 (0x660088) 漸層
                const r = Math.floor(0x88 - (0x88 - 0x66) * wave);
                const g = 0x00;
                const b = Math.floor(0x22 + (0x88 - 0x22) * wave);
                const color = (r << 16) | (g << 8) | b;

                // 上排稍微亮一點（高光效果）
                const alpha = row === 0 ? 0.95 : 0.8;

                cell.setFillStyle(color, alpha);
            }
        }

        // 護盾覆蓋在上半部（row 0），不額外繪製新格子
        if (this.currentShield > 0 && this.maxShield > 0) {
            const shieldRatio = this.currentShield / this.maxShield;
            const shieldCells = Math.floor(totalCells * shieldRatio);

            for (let col = 0; col < shieldCells; col++) {
                const index = 0 * this.skillGridCols + col; // row 0
                const cell = this.skillGridCells[index];
                if (!cell) continue;

                // 計算金色漸層位置（加入流動偏移）
                const baseT = col / totalCells;
                const flowT = this.shieldBarFlowOffset;
                const t = (baseT + flowT) % 1;

                // 使用正弦波（金→白金→金）- 淡的地方更白
                const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;

                // 金色 (0xffcc00) 到 白金色 (0xffffcc) 漸層
                const r = 0xff;
                const g = Math.floor(0xcc + (0xff - 0xcc) * wave);
                const b = Math.floor(0x00 + (0xcc - 0x00) * wave);
                const color = (r << 16) | (g << 8) | b;

                cell.setFillStyle(color, 0.95);
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
                // 有護盾時顯示：HP(+盾) / MaxHP
                this.hpText.setText(`${this.currentHp}(+${this.currentShield}) / ${this.maxHp}`);
            } else {
                this.hpText.setText(`${this.currentHp} / ${this.maxHp}`);
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

            console.log(`HP Regen: +${healAmount} HP (${this.currentHp}/${this.maxHp})`);
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

            // 護盾剛被打破時，恢復護盾最大值等值的 HP
            if (hadShield && this.currentShield === 0 && this.maxShield > 0) {
                const healAmount = this.maxShield;
                this.currentHp = Math.min(this.currentHp + healAmount, this.maxHp);
                console.log(`Shield broken! Healed ${healAmount} HP, current HP: ${this.currentHp}/${this.maxHp}`);

                // 更新 HP 顯示
                this.drawHpBarFill();
                this.updateHpText();
                this.updateLowHpVignette();

                // 顯示 HP 回復特效
                this.showHpHealEffect(healAmount);
            }

            // 更新護盾條顯示
            this.drawShieldBarFill();

            // 護盾吸收傷害時的視覺效果
            if (shieldAbsorbed > 0) {
                // 舊版特效
                if (this.showLegacySkillEffects) {
                    this.flashShieldEffect();
                }
                // 金色擴散光圈網格特效
                this.flashShieldHitEffect();
            }

            // 反傷給攻擊者
            if (this.shieldReflectDamage > 0 && attackingMonsters.length > 0) {
                const monsterIds = attackingMonsters.map(m => m.id);
                const reflectResult = this.monsterManager.damageMonsters(monsterIds, this.shieldReflectDamage);
                if (reflectResult.totalExp > 0) {
                    this.addExp(reflectResult.totalExp);
                }
                console.log(`Shield reflected ${this.shieldReflectDamage} damage to ${attackingMonsters.length} monsters, killed ${reflectResult.killCount}`);
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
            this.isMoving = false; // 停止移動
            this.isKeyboardMoving = false;

            // 播放受傷動畫
            this.setCharacterState('hurt');
            this.updateCharacterSprite();

            // 角色閃紅白效果
            this.flashCharacter();

            // 更新低血量紅暈效果
            this.updateLowHpVignette();

            console.log(`Player took ${remainingDamage} damage (${shieldAbsorbed} absorbed by shield), HP: ${this.currentHp}/${this.maxHp}`);
        } else {
            console.log(`Shield absorbed all ${shieldAbsorbed} damage, Shield: ${this.currentShield}`);
        }

        // 如果 HP 歸零，可以在這裡處理遊戲結束
        if (this.currentHp <= 0) {
            console.log('Player died!');
            // TODO: 遊戲結束處理
        }
    }

    // 護盾吸收傷害時的視覺效果（帶高亮漸層和長殘留）
    private flashShieldEffect() {
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
        // 閃白（80% 覆蓋，混合淺白色）
        this.character.setTint(0xffcccc);

        // 50ms 後閃紅（80% 覆蓋，混合淺紅色）
        this.time.delayedCall(50, () => {
            this.character.setTint(0xff6666);
        });

        // 100ms 後恢復正常
        this.time.delayedCall(100, () => {
            this.character.clearTint();
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
        console.log(`Vignette initialized (grid: ${this.skillGridCols}x${this.skillGridRows})`);
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

        // 遍歷所有格子（跳過頂部 2 行 HP 條和底部 2 行經驗條區域）
        const hpBarEndRow = 2;
        const expBarStartRow = this.skillGridRows - 2;
        for (let row = hpBarEndRow; row < expBarStartRow; row++) {
            for (let col = 0; col < this.skillGridCols; col++) {
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
                fontFamily: 'monospace',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.levelText.setOrigin(0, 1);
        this.expBarContainer.add(this.levelText);
        // 經驗條現在使用網格格子繪製

        // 加入 UI 容器
        this.uiContainer.add(this.expBarContainer);
    }

    private drawExpBarFill() {
        // 經驗條現在使用底部 2 行網格格子
        const expRows = [this.skillGridRows - 2, this.skillGridRows - 1];

        // 先繪製所有底部格子為黑底（優先渲染）
        for (const row of expRows) {
            for (let col = 0; col < this.skillGridCols; col++) {
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
        const totalExpCells = this.skillGridCols; // 一行的格子數
        const fillCells = Math.floor(totalExpCells * fillRatio);

        if (fillCells <= 0) return;

        // 繪製經驗格子（底部 2 行，漸層流動效果）
        for (const row of expRows) {
            for (let col = 0; col < fillCells; col++) {
                const index = row * this.skillGridCols + col;
                const cell = this.skillGridCells[index];
                if (!cell) continue;

                // 計算漸層位置（加入流動偏移）
                const baseT = col / totalExpCells;
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

        // 計算總寬度（格子數）
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

            // 等級文字
            const fontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(iconPixelSize * 0.2));
            const levelText = this.add.text(0, iconPixelSize * 0.3, '', {
                fontFamily: 'monospace',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            });
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

            // 等級文字
            const fontSize = Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(iconPixelSize * 0.2));
            const levelText = this.add.text(0, iconPixelSize * 0.3, '', {
                fontFamily: 'monospace',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            });
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

    // 建立技能資訊窗格
    private createSkillInfoPanel() {
        const bounds = this.gameBounds;
        const panelWidth = 200;
        const panelHeight = 80;
        const padding = 10;

        // 窗格位置：左下角
        const x = bounds.x + padding;
        const y = bounds.y + bounds.height - panelHeight - padding - 60; // 在技能欄上方

        this.skillInfoPanel = this.add.container(x, y);
        this.skillInfoPanel.setDepth(1003); // 在網格和技能欄之上

        // 半透明黑色背景
        this.skillInfoBg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x000000, 0.7);
        this.skillInfoBg.setOrigin(0, 0);
        this.skillInfoBg.setStrokeStyle(1, 0x666666);
        this.skillInfoPanel.add(this.skillInfoBg);

        // 技能資訊文字
        this.skillInfoText = this.add.text(padding, padding, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ffffff',
            wordWrap: { width: panelWidth - padding * 2 }
        });
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
                const shieldAmount = Math.floor(this.maxHp * 0.3);
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
    }

    // 更新技能欄顯示
    private updateSkillBarDisplay() {
        const activeSkills = this.skillManager.getPlayerActiveSkills();
        const passiveSkills = this.skillManager.getPlayerPassiveSkills();
        const allSkills = [...activeSkills, ...passiveSkills];

        for (let i = 0; i < this.skillIconContainers.length; i++) {
            const container = this.skillIconContainers[i];
            const levelText = this.skillLevelTexts[i];
            const skill = allSkills[i];

            // 取得顏色背景（container 的第二個子元素）
            const colorBg = container.list[1] as Phaser.GameObjects.Rectangle;

            if (skill) {
                // 有技能，使用技能本身的顏色和等級
                colorBg.setFillStyle(skill.definition.color, 0.5);
                levelText.setText(SkillManager.formatLevel(skill.level, skill.definition.maxLevel));
            } else {
                // 無技能
                colorBg.setFillStyle(0x333333, 0);
                levelText.setText('');
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
                fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_LARGE, Math.floor(this.gameBounds.height * 0.07))}px`,
                color: '#ffffff',
                fontStyle: 'bold'
            }
        );
        title.setOrigin(0.5, 0.5);
        this.skillPanelContainer.add(title);

        // 副標題文字
        const subtitleY = titleY + this.gameBounds.height * 0.06;
        const subtitle = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            subtitleY,
            '提升你的數位能力',
            {
                fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(this.gameBounds.height * 0.025))}px`,
                color: '#cccccc'
            }
        );
        subtitle.setOrigin(0.5, 0.5);
        this.skillPanelContainer.add(subtitle);

        // 建立 3 個技能選項
        this.createSkillOptions();

        // 底部提示文字（手機版簡化）
        const hintY = this.gameBounds.y + this.gameBounds.height * 0.92;
        const hintText = this.isMobile ? '點選選擇' : '重複按同一鍵確認';
        const hint = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            hintY,
            hintText,
            {
                fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(this.gameBounds.height * 0.022))}px`,
                color: '#888888'
            }
        );
        hint.setOrigin(0.5, 0.5);
        this.skillPanelContainer.add(hint);
    }

    private createSkillOptions() {
        // 清除舊的選項
        this.skillOptions.forEach(option => option.destroy());
        this.skillOptions = [];
        this.skillCardBgs = [];

        // 取得隨機技能選項（2 攻擊 + 1 被動）
        this.currentSkillChoices = this.skillManager.getRandomSkillOptions();

        // 如果沒有可選技能，不顯示面板
        if (this.currentSkillChoices.length === 0) {
            return;
        }

        // 選項卡片設定
        const cardWidth = this.gameBounds.width * 0.25;
        const cardHeight = this.gameBounds.height * 0.5;
        const cardGap = this.gameBounds.width * 0.05;
        const numCards = this.currentSkillChoices.length;
        const totalWidth = cardWidth * numCards + cardGap * (numCards - 1);
        const startX = this.gameBounds.x + (this.gameBounds.width - totalWidth) / 2 + cardWidth / 2;
        const centerY = this.gameBounds.y + this.gameBounds.height * 0.55;

        const keys = ['A', 'S', 'D'];

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
                fontFamily: 'monospace',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.045))}px`,
                color: skillDef.type === 'active' ? '#ff6666' : '#66ffff',
                fontStyle: 'bold'
            });
            typeLabel.setOrigin(0.5, 0.5);
            optionContainer.add(typeLabel);

            // 技能圖示區域（上半部）
            const iconSize = cardWidth * 0.5;
            const iconY = -cardHeight * 0.18;
            const iconBg = this.add.rectangle(0, iconY, iconSize, iconSize, skillDef.color, 0.3);
            iconBg.setStrokeStyle(2, skillDef.color);
            optionContainer.add(iconBg);

            // 技能名稱（固定位置）
            const nameY = cardHeight * 0.06;
            const nameText = this.add.text(0, nameY, skillDef.name, {
                fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(cardHeight * 0.08))}px`,
                color: '#ffffff',
                fontStyle: 'bold'
            });
            nameText.setOrigin(0.5, 0.5);
            optionContainer.add(nameText);

            // 副標題（如果有）
            if (skillDef.subtitle) {
                const subtitleText = this.add.text(0, cardHeight * 0.12, skillDef.subtitle, {
                    fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.04))}px`,
                    color: '#999999'
                });
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
                fontFamily: 'monospace',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.05))}px`,
                color: nextLevel >= skillDef.maxLevel ? '#ffff00' : '#88ff88',
                fontStyle: 'bold'
            });
            levelText.setOrigin(0.5, 0.5);
            optionContainer.add(levelText);

            // 技能描述（固定位置，手機版下移利用更多空間）
            const descY = this.isMobile ? cardHeight * 0.36 : cardHeight * 0.32;
            const descText = this.add.text(0, descY, skillDef.description, {
                fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
                fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_SMALL, Math.floor(cardHeight * 0.04))}px`,
                color: '#dddddd', // 提亮顏色以便閱讀
                wordWrap: { width: cardWidth * 0.85 },
                align: 'center'
            });
            descText.setOrigin(0.5, 0.5);
            optionContainer.add(descText);

            // 按鍵提示標籤（手機版隱藏）
            if (!this.isMobile) {
                const keyLabel = this.add.text(0, cardHeight * 0.42, `[ ${keys[i]} ]`, {
                    fontFamily: 'monospace',
                    fontSize: `${Math.max(MainScene.MIN_FONT_SIZE_MEDIUM, Math.floor(cardHeight * 0.06))}px`,
                    color: '#ffff00',
                    fontStyle: 'bold'
                });
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

            // 點擊選擇（直接確認）
            cardBg.on('pointerdown', () => {
                this.setSelectedSkill(skillIndex);
                this.confirmSkillSelection();
            });

            this.skillPanelContainer.add(optionContainer);
            this.skillOptions.push(optionContainer);
            this.skillCardBgs.push(cardBg);
        }

        // 預設選中第一個（索引 0，對應 A 鍵）
        this.selectedSkillIndex = 0;
    }

    private showSkillPanel() {
        // 檢查是否有可升級的技能
        if (!this.skillManager.hasUpgradeableSkills()) {
            console.log('All skills are maxed out! Continue leveling for HP growth.');
            // 技能全滿後不暫停遊戲，但仍享有升級帶來的 HP 成長
            return;
        }

        // 重新生成技能選項
        this.createSkillOptions();

        // 如果沒有選項可選，不顯示面板
        if (this.currentSkillChoices.length === 0) {
            return;
        }

        this.isPaused = true;
        this.isMoving = false; // 停止移動
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
        // 淡出動畫
        this.tweens.add({
            targets: this.skillPanelContainer,
            alpha: 0,
            duration: 200,
            onComplete: () => {
                this.skillPanelContainer.setVisible(false);
                this.isPaused = false;
            }
        });
    }

    private selectSkill(index: number, skillId: string) {
        // 學習或升級技能
        const success = this.skillManager.learnOrUpgradeSkill(skillId);
        if (!success) {
            console.warn(`Failed to learn/upgrade skill: ${skillId}`);
            return;
        }

        const skill = this.skillManager.getPlayerSkill(skillId);
        console.log(`Skill upgraded: ${skillId} -> Lv.${skill?.level}`);

        // 更新技能欄顯示
        this.updateSkillBarDisplay();

        // 如果是被動技能，重新計算屬性並更新顯示
        if (skill?.definition.type === 'passive') {
            this.recalculateMaxHp();
            this.recalculateMoveSpeed();
            this.drawHpBarFill();
            this.updateHpText();
            console.log(`Passive skill effect applied. MaxHP: ${this.maxHp}, MoveSpeed: ${this.moveSpeed}`);
        }

        // 選中動畫
        const selectedOption = this.skillOptions[index];
        this.tweens.add({
            targets: selectedOption,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 100,
            yoyo: true,
            onComplete: () => {
                this.hideSkillPanel();
            }
        });
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

        // 建立格子容器（固定在螢幕上）
        this.skillGridContainer = this.add.container(this.gameBounds.x, this.gameBounds.y);
        this.skillGridContainer.setDepth(50);

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

        // 放在 uiContainer 中（加到最前面，讓其他 UI 在上層）
        this.uiContainer.addAt(this.skillGridContainer, 0);
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

        // 清除技能資訊面板
        if (this.skillInfoPanel) {
            this.skillInfoPanel.destroy();
        }

        // 重新建立技能欄
        this.createSkillBar();
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
                    const cell = this.skillGridCells[idx];
                    if (cell) {
                        cell.setFillStyle(color, alpha);
                        cell.setVisible(true);
                    }
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
                        const cell = this.skillGridCells[idx];
                        if (cell) {
                            cell.setFillStyle(color, alpha);
                            cell.setVisible(true);
                        }
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
                    const cell = this.skillGridCells[idx];
                    if (cell) {
                        cell.setFillStyle(color, alpha);
                        cell.setVisible(true);
                    }
                }
            }
        }
    }

    // 清除所有技能範圍格子（保留邊緣紅暈格子）
    clearSkillGrid() {
        this.skillGridCells.forEach((cell, index) => {
            // 如果是邊緣格子且有低血量或護盾效果，不清除
            if (this.vignetteEdgeCells.has(index) && (this.isLowHp || this.currentShield > 0)) {
                return;
            }
            const row = Math.floor(index / this.skillGridCols);
            // 如果是頂部 2 行（HP/護盾條），不清除
            if (row < 2) {
                return;
            }
            // 如果是底部 2 行（經驗條），不清除
            if (row >= this.skillGridRows - 2) {
                return;
            }
            cell.setVisible(false);
        });
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

    // 在擊中位置顯示白色十字高光
    flashWhiteCrossAt(worldX: number, worldY: number) {
        const screen = this.worldToScreen(worldX, worldY);
        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const centerCol = Math.floor(screen.x / cellTotal);
        const centerRow = Math.floor(screen.y / cellTotal);

        const crossLength = 3; // 十字臂長度（格子數）
        const duration = 300; // 總時長 300ms
        const startTime = this.time.now;

        // 收集十字形狀的格子（中心 + 四個方向）
        const crossCells: { col: number, row: number, dist: number }[] = [];

        // 中心格子
        if (centerCol >= 0 && centerCol < this.skillGridCols && centerRow >= 0 && centerRow < this.skillGridRows) {
            crossCells.push({ col: centerCol, row: centerRow, dist: 0 });
        }

        // 四個方向
        const directions = [
            { dc: 1, dr: 0 },  // 右
            { dc: -1, dr: 0 }, // 左
            { dc: 0, dr: 1 },  // 下
            { dc: 0, dr: -1 }  // 上
        ];

        for (const { dc, dr } of directions) {
            for (let i = 1; i <= crossLength; i++) {
                const col = centerCol + dc * i;
                const row = centerRow + dr * i;
                if (col >= 0 && col < this.skillGridCols && row >= 0 && row < this.skillGridRows) {
                    crossCells.push({ col, row, dist: i });
                }
            }
        }

        if (crossCells.length === 0) return;

        // 建立十字格子
        const flashCells: Phaser.GameObjects.Rectangle[] = [];
        for (const { col, row } of crossCells) {
            const x = col * cellTotal + this.skillGridCellSize / 2;
            const y = row * cellTotal + this.skillGridCellSize / 2;
            const cell = this.add.rectangle(x, y, this.skillGridCellSize, this.skillGridCellSize, 0xffffff, 0);
            cell.setVisible(false);
            this.skillGridContainer.add(cell);
            flashCells.push(cell);
        }

        const updateEffect = () => {
            const elapsed = this.time.now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 從中心往外淡出
            const fadeProgress = progress;
            const fadeDistance = crossLength * fadeProgress;

            let i = 0;
            for (const { dist } of crossCells) {
                const cell = flashCells[i++];
                if (!cell) continue;

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

    // 批量顯示白色十字高光
    flashWhiteCrossAtPositions(positions: { x: number, y: number }[]) {
        positions.forEach(pos => {
            this.flashWhiteCrossAt(pos.x, pos.y);
        });
    }

    // 顯示技能打擊區持續特效（扇形）- 帶展開和淡出動畫
    flashSkillAreaSector(centerX: number, centerY: number, radius: number, angle: number, halfAngle: number, color: number) {
        const screen = this.worldToScreen(centerX, centerY);
        const screenCenterX = screen.x;
        const screenCenterY = screen.y;

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const duration = 500; // 總時長 500ms
        const expandTime = 150; // 前 150ms 展開
        const holdTime = 150; // 中間 150ms 高亮停留
        const startTime = this.time.now;

        // 收集所有在扇形範圍內的格子及其距離
        const cellsInArea: { col: number, row: number, dist: number, angleDist: number }[] = [];

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
                    const cellAngle = Math.atan2(dy, dx);
                    let angleDiff = Math.abs(cellAngle - angle);
                    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

                    if (angleDiff <= halfAngle) {
                        cellsInArea.push({ col, row, dist, angleDist: angleDiff });
                    }
                }
            }
        }

        if (cellsInArea.length === 0) return;

        // 使用獨立的 Rectangle 物件來避免與預覽衝突
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
    flashSkillAreaCircle(centerX: number, centerY: number, radius: number, color: number) {
        const screen = this.worldToScreen(centerX, centerY);
        const screenCenterX = screen.x;
        const screenCenterY = screen.y;

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const duration = 500;
        const expandTime = 150;
        const holdTime = 150;
        const startTime = this.time.now;

        const cellsInArea: { col: number, row: number, dist: number }[] = [];

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
                    cellsInArea.push({ col, row, dist });
                }
            }
        }

        if (cellsInArea.length === 0) return;

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
    flashSkillAreaLine(startX: number, startY: number, endX: number, endY: number, width: number, color: number) {
        const screenStart = this.worldToScreen(startX, startY);
        const screenEnd = this.worldToScreen(endX, endY);

        const gap = MainScene.SKILL_GRID_GAP;
        const cellTotal = this.skillGridCellSize + gap;

        const dx = screenEnd.x - screenStart.x;
        const dy = screenEnd.y - screenStart.y;
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

        const cellsInArea: { col: number, row: number, distAlong: number, distToLine: number }[] = [];

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

                const toCellX = cellCenterX - screenStart.x;
                const toCellY = cellCenterY - screenStart.y;

                const projLength = toCellX * dirX + toCellY * dirY;
                if (projLength < 0 || projLength > length) continue;

                const projX = screenStart.x + dirX * projLength;
                const projY = screenStart.y + dirY * projLength;

                const distToLine = Math.sqrt((cellCenterX - projX) ** 2 + (cellCenterY - projY) ** 2);

                if (distToLine <= halfWidth) {
                    cellsInArea.push({ col, row, distAlong: projLength, distToLine });
                }
            }
        }

        if (cellsInArea.length === 0) return;

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
