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

    // 技能欄設定（基準值，會根據遊戲區域縮放）
    private static readonly BASE_ICON_SIZE = 100;
    private static readonly BASE_ICON_GAP = 10;
    private static readonly BASE_GROUP_GAP = 30;
    private static readonly BASE_BOTTOM_MARGIN = 20;
    private static readonly ACTIVE_SKILLS = 4;
    private static readonly PASSIVE_SKILLS = 3;
    // 基準遊戲區域寬度（1920px 時使用原始尺寸）
    private static readonly BASE_WIDTH = 1920;

    // 地板格子
    private floorGrid!: Phaser.GameObjects.Graphics;

    // 遊戲世界容器（會隨鏡頭移動的內容）
    private worldContainer!: Phaser.GameObjects.Container;

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
    private expBarFill!: Phaser.GameObjects.Graphics;
    private expBarFlowOffset: number = 0; // 流動效果偏移
    private levelText!: Phaser.GameObjects.Text;

    // HP 系統
    private currentHp: number = 200;
    private maxHp: number = 200;
    private hpBarContainer!: Phaser.GameObjects.Container;
    private hpBarFill!: Phaser.GameObjects.Graphics;
    private hpBarFlowOffset: number = 0; // HP 流動效果偏移
    private hpText!: Phaser.GameObjects.Text;

    // 護盾系統
    private currentShield: number = 0;
    private maxShield: number = 0; // 護盾最大值（用於計算回血）
    private shieldBarFill!: Phaser.GameObjects.Graphics;
    private shieldBarFlowOffset: number = 0; // 護盾流動效果偏移
    private shieldReflectDamage: number = 0; // 護盾反傷傷害值
    private shieldText!: Phaser.GameObjects.Text;

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

    // 低血量紅暈效果
    private lowHpVignette!: Phaser.GameObjects.Graphics;

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

    constructor() {
        super('MainScene');
    }

    create() {
        // MainScene 的背景色
        this.cameras.main.setBackgroundColor('#111111');

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

        // 建立角色 Sprite
        this.character = this.add.sprite(this.characterX, this.characterY, 'char_idle_1');
        this.character.setScale(this.characterSize / this.character.height);
        this.character.setOrigin(0.5, 1); // 底部中央為錨點
        this.character.play('char_idle');
        this.worldContainer.add(this.character);

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

        // 建立技能範圍格子覆蓋層（放在 UI 層）
        this.createSkillGrid();

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

            // 命中回饋：格子閃爍
            this.flashGridAtPositions(hitPositions, skill.definition.flashColor || skill.definition.color, 2);

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

            // 命中回饋：格子閃爍
            this.flashGridAtPositions(hitPositions, skill.definition.flashColor || skill.definition.color, 2);

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

            // 命中回饋：格子閃爍
            this.flashGridAtPositions(hitPositions, skill.definition.flashColor || skill.definition.color, 2);

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

        // A 鍵選擇左邊（索引 0）
        if (Phaser.Input.Keyboard.JustDown(this.cursors.A)) {
            this.setSelectedSkill(0);
        }
        // S 鍵選擇中間（索引 1）
        if (Phaser.Input.Keyboard.JustDown(this.cursors.S)) {
            this.setSelectedSkill(1);
        }
        // D 鍵選擇右邊（索引 2）
        if (Phaser.Input.Keyboard.JustDown(this.cursors.D)) {
            this.setSelectedSkill(2);
        }
        // W 鍵或 Enter 確認選擇
        if (Phaser.Input.Keyboard.JustDown(this.cursors.W)) {
            this.confirmSkillSelection();
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
        // HP 條容器
        this.hpBarContainer = this.add.container(0, 0);
        this.hpBarContainer.setDepth(100);

        // HP 條尺寸（技能欄寬度，高度是 EXP 條的兩倍）
        const expBarHeight = this.gameBounds.height * 0.01;
        const barHeight = expBarHeight * 2; // HP 條高度是 EXP 條兩倍

        // 計算技能欄的總寬度（和 createSkillBar 一致）
        const scale = Math.min(1, this.gameBounds.width / MainScene.BASE_WIDTH);
        const clampedScale = Math.max(0.4, scale);
        const iconSize = Math.floor(MainScene.BASE_ICON_SIZE * clampedScale);
        const iconGap = Math.floor(MainScene.BASE_ICON_GAP * clampedScale);
        const groupGap = Math.floor(MainScene.BASE_GROUP_GAP * clampedScale);
        const bottomMargin = Math.floor(MainScene.BASE_BOTTOM_MARGIN * clampedScale);

        const activeCount = MainScene.ACTIVE_SKILLS;
        const passiveCount = MainScene.PASSIVE_SKILLS;
        const activeGroupWidth = activeCount * iconSize + (activeCount - 1) * iconGap;
        const passiveGroupWidth = passiveCount * iconSize + (passiveCount - 1) * iconGap;
        const barWidth = activeGroupWidth + groupGap + passiveGroupWidth;

        // 起始 X 位置（和技能欄一致，置中）
        const barX = this.gameBounds.x + (this.gameBounds.width - barWidth) / 2;
        // Y 位置：技能欄上方
        const skillBarY = this.gameBounds.y + this.gameBounds.height - iconSize - bottomMargin;
        const barY = skillBarY - barHeight - 8; // 技能欄上方 8 像素間距

        // 黑色背景
        const barBg = this.add.rectangle(
            barX + barWidth / 2,
            barY + barHeight / 2,
            barWidth,
            barHeight,
            0x000000
        );
        barBg.setStrokeStyle(1, 0x333333);
        this.hpBarContainer.add(barBg);

        // HP 條填充（使用 Graphics 繪製流動效果）
        this.hpBarFill = this.add.graphics();
        this.hpBarContainer.add(this.hpBarFill);

        // HP 文字（和等級文字一樣大，可以往上凸出）
        const fontSize = Math.floor(this.gameBounds.height * 0.03);
        this.hpText = this.add.text(
            barX + barWidth / 2,
            barY + barHeight / 2,
            `${this.currentHp} / ${this.maxHp}`,
            {
                fontFamily: 'monospace',
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.hpText.setOrigin(0.5, 0.5);
        this.hpBarContainer.add(this.hpText);

        // 初始繪製
        this.drawHpBarFill();

        // 加入 UI 容器
        this.uiContainer.add(this.hpBarContainer);
    }

    private drawHpBarFill() {
        this.hpBarFill.clear();

        // HP 條尺寸（和 createHpBar 一致）
        const expBarHeight = this.gameBounds.height * 0.01;
        const barHeight = expBarHeight * 2;

        const scale = Math.min(1, this.gameBounds.width / MainScene.BASE_WIDTH);
        const clampedScale = Math.max(0.4, scale);
        const iconSize = Math.floor(MainScene.BASE_ICON_SIZE * clampedScale);
        const iconGap = Math.floor(MainScene.BASE_ICON_GAP * clampedScale);
        const groupGap = Math.floor(MainScene.BASE_GROUP_GAP * clampedScale);
        const bottomMargin = Math.floor(MainScene.BASE_BOTTOM_MARGIN * clampedScale);

        const activeCount = MainScene.ACTIVE_SKILLS;
        const passiveCount = MainScene.PASSIVE_SKILLS;
        const activeGroupWidth = activeCount * iconSize + (activeCount - 1) * iconGap;
        const passiveGroupWidth = passiveCount * iconSize + (passiveCount - 1) * iconGap;
        const barWidth = activeGroupWidth + groupGap + passiveGroupWidth;

        const barX = this.gameBounds.x + (this.gameBounds.width - barWidth) / 2;
        const skillBarY = this.gameBounds.y + this.gameBounds.height - iconSize - bottomMargin;
        const barY = skillBarY - barHeight - 8;

        // 計算填充寬度
        const fillRatio = this.currentHp / this.maxHp;
        const fillWidth = barWidth * fillRatio;

        if (fillWidth <= 0) return;

        // 繪製暗紅暗紫色漸層流動效果
        const numSegments = Math.ceil(fillWidth / 2) + 1;

        for (let i = 0; i < numSegments; i++) {
            const x = barX + i * 2;
            if (x >= barX + fillWidth) break;

            // 計算漸層位置（加入流動偏移）
            const baseT = (x - barX) / barWidth;
            const flowT = this.hpBarFlowOffset;
            const t = (baseT + flowT) % 1;

            // 使用正弦波讓頭尾同色（暗紅→暗紫→暗紅）
            const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;

            // 暗紅色 (0x880022) 到 暗紫色 (0x660088) 漸層
            const r = Math.floor(0x88 - (0x88 - 0x66) * wave);
            const g = Math.floor(0x00 + (0x00 - 0x00) * wave);
            const b = Math.floor(0x22 + (0x88 - 0x22) * wave);

            const color = (r << 16) | (g << 8) | b;
            this.hpBarFill.fillStyle(color, 1);

            const segmentWidth = Math.min(2, barX + fillWidth - x);
            this.hpBarFill.fillRect(x, barY, segmentWidth, barHeight);
        }

        // 頂部高光
        this.hpBarFill.fillStyle(0xffffff, 0.15);
        this.hpBarFill.fillRect(barX, barY, fillWidth, barHeight * 0.4);
    }

    private updateHpBarFlow(delta: number) {
        // 流動速度（緩慢，從左到右）
        const flowSpeed = 0.08; // 每秒移動 8% 的漸層
        this.hpBarFlowOffset += (flowSpeed * delta) / 1000;

        // 保持在 0~1 範圍內循環
        if (this.hpBarFlowOffset >= 1) {
            this.hpBarFlowOffset -= 1;
        }

        // 重繪 HP 條
        this.drawHpBarFill();
    }

    private updateHpText() {
        if (this.hpText) {
            this.hpText.setText(`${this.currentHp} / ${this.maxHp}`);
        }
    }

    // ===== 護盾條系統 =====

    private createShieldBar() {
        // 護盾條填充（使用 Graphics 繪製流動效果）
        // 位置和尺寸在 drawShieldBarFill 中計算
        this.shieldBarFill = this.add.graphics();
        this.shieldBarFill.setDepth(101); // 在 HP 條之上

        // 護盾文字（初始隱藏，有護盾時才顯示）
        const fontSize = Math.floor(this.gameBounds.height * 0.025);
        this.shieldText = this.add.text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: `${fontSize}px`,
            color: '#ffdd44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        });
        this.shieldText.setOrigin(0.5, 0.5);
        this.shieldText.setDepth(102);
        this.shieldText.setVisible(false);

        // 加入 UI 容器
        this.uiContainer.add(this.shieldBarFill);
        this.uiContainer.add(this.shieldText);
    }

    private drawShieldBarFill() {
        this.shieldBarFill.clear();

        // 如果沒有護盾，隱藏文字並不繪製
        if (this.currentShield <= 0) {
            this.shieldText.setVisible(false);
            return;
        }

        // 護盾條尺寸
        const expBarHeight = this.gameBounds.height * 0.01;
        const hpBarHeight = expBarHeight * 2;
        const barHeight = expBarHeight * 1.5;

        const scale = Math.min(1, this.gameBounds.width / MainScene.BASE_WIDTH);
        const clampedScale = Math.max(0.4, scale);
        const iconSize = Math.floor(MainScene.BASE_ICON_SIZE * clampedScale);
        const iconGap = Math.floor(MainScene.BASE_ICON_GAP * clampedScale);
        const groupGap = Math.floor(MainScene.BASE_GROUP_GAP * clampedScale);
        const bottomMargin = Math.floor(MainScene.BASE_BOTTOM_MARGIN * clampedScale);

        const activeCount = MainScene.ACTIVE_SKILLS;
        const passiveCount = MainScene.PASSIVE_SKILLS;
        const activeGroupWidth = activeCount * iconSize + (activeCount - 1) * iconGap;
        const passiveGroupWidth = passiveCount * iconSize + (passiveCount - 1) * iconGap;
        const barWidth = activeGroupWidth + groupGap + passiveGroupWidth;

        const barX = this.gameBounds.x + (this.gameBounds.width - barWidth) / 2;
        const skillBarY = this.gameBounds.y + this.gameBounds.height - iconSize - bottomMargin;
        const hpBarY = skillBarY - hpBarHeight - 8;
        const barY = hpBarY - barHeight;

        // 計算填充寬度（護盾值相對於護盾最大值）
        if (this.maxShield <= 0) return;
        const fillRatio = this.currentShield / this.maxShield;
        const fillWidth = barWidth * Math.min(1, fillRatio);

        if (fillWidth <= 0) return;

        // 繪製黑色背景框
        this.shieldBarFill.fillStyle(0x000000, 0.8);
        this.shieldBarFill.fillRect(barX, barY, barWidth, barHeight);
        this.shieldBarFill.lineStyle(1, 0x333333);
        this.shieldBarFill.strokeRect(barX, barY, barWidth, barHeight);

        // 繪製金色漸層流動效果（架構師主色）
        const numSegments = Math.ceil(fillWidth / 2) + 1;

        for (let i = 0; i < numSegments; i++) {
            const x = barX + i * 2;
            if (x >= barX + fillWidth) break;

            // 計算漸層位置（加入流動偏移）
            const baseT = (x - barX) / barWidth;
            const flowT = this.shieldBarFlowOffset;
            const t = (baseT + flowT) % 1;

            // 使用正弦波讓頭尾同色（金→亮金→金）
            const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;

            // 金色 (0xffcc00) 到 亮金色 (0xffdd44) 漸層
            const r = 0xff;
            const g = Math.floor(0xcc + (0xdd - 0xcc) * wave);
            const b = Math.floor(0x00 + (0x44 - 0x00) * wave);

            const color = (r << 16) | (g << 8) | b;
            this.shieldBarFill.fillStyle(color, 0.9);

            const segmentWidth = Math.min(2, barX + fillWidth - x);
            this.shieldBarFill.fillRect(x, barY, segmentWidth, barHeight);
        }

        // 頂部高光
        this.shieldBarFill.fillStyle(0xffffff, 0.25);
        this.shieldBarFill.fillRect(barX, barY, fillWidth, barHeight * 0.4);

        // 邊框光暈效果（金色）
        this.shieldBarFill.lineStyle(1, 0xffdd44, 0.5);
        this.shieldBarFill.strokeRect(barX, barY, fillWidth, barHeight);

        // 更新護盾文字
        this.shieldText.setText(`${this.currentShield} / ${this.maxShield}`);
        this.shieldText.setPosition(barX + barWidth / 2, barY + barHeight / 2);
        this.shieldText.setVisible(true);
    }

    private updateShieldBarFlow(delta: number) {
        // 如果沒有護盾，不更新
        if (this.currentShield <= 0) return;

        // 流動速度（較快，顯示能量感）
        const flowSpeed = 0.15; // 每秒移動 15% 的漸層
        this.shieldBarFlowOffset += (flowSpeed * delta) / 1000;

        // 保持在 0~1 範圍內循環
        if (this.shieldBarFlowOffset >= 1) {
            this.shieldBarFlowOffset -= 1;
        }

        // 重繪護盾條
        this.drawShieldBarFill();
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
            }

            // 更新護盾條顯示
            this.drawShieldBarFill();

            // 護盾吸收傷害時的視覺效果（舊版，可用 SHIFT+BACKSPACE 切換）
            if (shieldAbsorbed > 0 && this.showLegacySkillEffects) {
                this.flashShieldEffect();
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

    // 建立低血量紅暈效果
    private createLowHpVignette() {
        this.lowHpVignette = this.add.graphics();
        this.lowHpVignette.setDepth(1000); // 在最上層
        this.lowHpVignette.setAlpha(0);
        this.uiContainer.add(this.lowHpVignette);
    }

    // 更新低血量紅暈效果
    private updateLowHpVignette() {
        const hpRatio = this.currentHp / this.maxHp;

        if (hpRatio <= 0.3) {
            // HP 低於 30%，顯示紅暈並閃爍
            this.drawVignette();

            // 閃爍動畫
            this.tweens.killTweensOf(this.lowHpVignette);
            this.lowHpVignette.setAlpha(0.6);
            this.tweens.add({
                targets: this.lowHpVignette,
                alpha: 0.3,
                duration: 300,
                ease: 'Sine.easeInOut'
            });
        } else {
            // HP 高於 30%，隱藏紅暈
            this.tweens.killTweensOf(this.lowHpVignette);
            this.lowHpVignette.setAlpha(0);
        }
    }

    // 繪製邊緣紅暈
    private drawVignette() {
        this.lowHpVignette.clear();

        const width = this.gameBounds.width;
        const height = this.gameBounds.height;
        const x = this.gameBounds.x;
        const y = this.gameBounds.y;
        const edgeSize = Math.min(width, height) * 0.15; // 邊緣寬度

        // 使用多層漸層繪製邊緣紅暈
        const steps = 10;
        for (let i = 0; i < steps; i++) {
            const ratio = i / steps;
            const alpha = (1 - ratio) * 0.5; // 從外到內漸淡
            const offset = edgeSize * ratio;

            this.lowHpVignette.lineStyle(edgeSize / steps, 0xff0000, alpha);
            this.lowHpVignette.strokeRect(
                x + offset,
                y + offset,
                width - offset * 2,
                height - offset * 2
            );
        }
    }

    // ===== 經驗條系統 =====

    private createExpBar() {
        // 經驗條容器
        this.expBarContainer = this.add.container(0, 0);
        this.expBarContainer.setDepth(100); // 在遊戲內容之上，但在技能面板之下

        // 經驗條尺寸（1% 遊戲區域高度）
        const barHeight = this.gameBounds.height * 0.01;
        const barWidth = this.gameBounds.width;
        const barX = this.gameBounds.x;
        const barY = this.gameBounds.y + this.gameBounds.height - barHeight;

        // 黑色背景
        const barBg = this.add.rectangle(
            barX + barWidth / 2,
            barY + barHeight / 2,
            barWidth,
            barHeight,
            0x000000
        );
        this.expBarContainer.add(barBg);

        // 經驗條填充（使用 Graphics 繪製流動效果）
        this.expBarFill = this.add.graphics();
        this.expBarContainer.add(this.expBarFill);

        // 初始繪製
        this.drawExpBarFill();

        // 等級文字（左下角）
        const fontSize = Math.floor(this.gameBounds.height * 0.03);
        this.levelText = this.add.text(
            this.gameBounds.x + 10,
            barY - fontSize - 5,
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
    }

    private drawExpBarFill() {
        this.expBarFill.clear();

        const barHeight = this.gameBounds.height * 0.01;
        const barWidth = this.gameBounds.width;
        const barX = this.gameBounds.x;
        const barY = this.gameBounds.y + this.gameBounds.height - barHeight;

        // 計算填充寬度
        const fillRatio = this.currentExp / this.maxExp;
        const fillWidth = barWidth * fillRatio;

        if (fillWidth <= 0) return;

        // 繪製藍紫色漸層流動效果（只有一次漸層，從左到右）
        const numSegments = Math.ceil(fillWidth / 2) + 1; // 每 2 像素一個段落

        for (let i = 0; i < numSegments; i++) {
            const x = barX + i * 2;
            if (x >= barX + fillWidth) break;

            // 計算漸層位置（整條經驗條為一個漸層週期，加入流動偏移）
            // 流動偏移範圍 0~1，讓顏色在藍紫之間緩慢移動
            const baseT = (x - barX) / barWidth; // 0 到 1（位置比例）
            const flowT = this.expBarFlowOffset; // 流動偏移 0~1
            const t = (baseT + flowT) % 1; // 合併後的漸層位置

            // 使用正弦波讓頭尾同色（藍→紫→藍）
            const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2; // 0→1→0

            // 藍色 (0x4488ff) 到 紫色 (0x8844ff) 漸層
            const r = Math.floor(0x44 + (0x88 - 0x44) * wave);
            const g = Math.floor(0x88 - (0x88 - 0x44) * wave);
            const b = 0xff;

            const color = (r << 16) | (g << 8) | b;
            this.expBarFill.fillStyle(color, 1);

            const segmentWidth = Math.min(2, barX + fillWidth - x);
            this.expBarFill.fillRect(x, barY, segmentWidth, barHeight);
        }

        // 頂部高光
        this.expBarFill.fillStyle(0xffffff, 0.2);
        this.expBarFill.fillRect(barX, barY, fillWidth, barHeight * 0.4);
    }

    private updateExpBarFlow(delta: number) {
        // 流動速度（緩慢，從左到右）
        const flowSpeed = 0.1; // 每秒移動 10% 的漸層
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
        const bounds = this.gameBounds;

        // 根據遊戲區域寬度計算縮放比例
        const scale = Math.min(1, bounds.width / MainScene.BASE_WIDTH);
        // 限制最小縮放，避免太小
        const clampedScale = Math.max(0.4, scale);

        const iconSize = Math.floor(MainScene.BASE_ICON_SIZE * clampedScale);
        const iconGap = Math.floor(MainScene.BASE_ICON_GAP * clampedScale);
        const groupGap = Math.floor(MainScene.BASE_GROUP_GAP * clampedScale);
        const bottomMargin = Math.floor(MainScene.BASE_BOTTOM_MARGIN * clampedScale);
        const strokeWidth = Math.max(1, Math.floor(2 * clampedScale));

        const activeCount = MainScene.ACTIVE_SKILLS;
        const passiveCount = MainScene.PASSIVE_SKILLS;

        // 計算總寬度
        const activeGroupWidth = activeCount * iconSize + (activeCount - 1) * iconGap;
        const passiveGroupWidth = passiveCount * iconSize + (passiveCount - 1) * iconGap;
        const totalWidth = activeGroupWidth + groupGap + passiveGroupWidth;

        // 起始 X 位置（在遊戲區域內置中）
        const startX = bounds.x + (bounds.width - totalWidth) / 2 + iconSize / 2;
        // Y 位置（遊戲區域底部，留一點邊距）
        const y = bounds.y + bounds.height - iconSize / 2 - bottomMargin;

        // 主動技能（4個）
        for (let i = 0; i < activeCount; i++) {
            const x = startX + i * (iconSize + iconGap);
            const container = this.add.container(x, y);

            // 技能框背景
            const icon = this.add.rectangle(0, 0, iconSize, iconSize);
            icon.setStrokeStyle(strokeWidth, 0xffffff);
            icon.setFillStyle(0x000000, 0);
            container.add(icon);

            // 技能顏色指示（預設透明，由 updateSkillBarDisplay 設定）
            const colorBg = this.add.rectangle(0, 0, iconSize - 4, iconSize - 4, 0x333333, 0);
            container.add(colorBg);

            // 等級文字
            const levelText = this.add.text(0, iconSize * 0.3, '', {
                fontFamily: 'monospace',
                fontSize: `${Math.floor(iconSize * 0.25)}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2
            });
            levelText.setOrigin(0.5, 0.5);
            container.add(levelText);

            this.skillIcons.push(icon);
            this.skillIconContainers.push(container);
            this.skillLevelTexts.push(levelText);
            this.uiContainer.add(container);
        }

        // 被動技能（3個）
        const passiveStartX = startX + activeGroupWidth + groupGap;
        for (let i = 0; i < passiveCount; i++) {
            const x = passiveStartX + i * (iconSize + iconGap);
            const container = this.add.container(x, y);

            // 技能框背景
            const icon = this.add.rectangle(0, 0, iconSize, iconSize);
            icon.setStrokeStyle(strokeWidth, 0xffffff);
            icon.setFillStyle(0x000000, 0);
            container.add(icon);

            // 技能顏色指示（預設透明，由 updateSkillBarDisplay 設定）
            const colorBg = this.add.rectangle(0, 0, iconSize - 4, iconSize - 4, 0x333333, 0);
            container.add(colorBg);

            // 等級文字
            const levelText = this.add.text(0, iconSize * 0.3, '', {
                fontFamily: 'monospace',
                fontSize: `${Math.floor(iconSize * 0.25)}px`,
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2
            });
            levelText.setOrigin(0.5, 0.5);
            container.add(levelText);

            this.skillIcons.push(icon);
            this.skillIconContainers.push(container);
            this.skillLevelTexts.push(levelText);
            this.uiContainer.add(container);
        }

        // 建立技能資訊窗格
        this.createSkillInfoPanel();

        // 為技能圖示添加點擊事件
        this.setupSkillIconInteractions();
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
        this.skillInfoPanel.setDepth(200);

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
                lines.push(`護盾: ${shieldAmount}`);
                lines.push(`反傷: ${reflectDamage}`);
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
                lines.push(`HP 加成: +${Math.round(bonus * 100)}%`);
                lines.push(`最大 HP: ${this.maxHp}`);
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
                fontSize: `${Math.floor(this.gameBounds.height * 0.07)}px`,
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
                fontSize: `${Math.floor(this.gameBounds.height * 0.025)}px`,
                color: '#aaaaaa'
            }
        );
        subtitle.setOrigin(0.5, 0.5);
        this.skillPanelContainer.add(subtitle);

        // 建立 3 個技能選項
        this.createSkillOptions();

        // 底部提示文字
        const hintY = this.gameBounds.y + this.gameBounds.height * 0.92;
        const hint = this.add.text(
            this.gameBounds.x + this.gameBounds.width / 2,
            hintY,
            '點選或按 W 確定',
            {
                fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
                fontSize: `${Math.floor(this.gameBounds.height * 0.022)}px`,
                color: '#666666'
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
                fontSize: `${Math.floor(cardHeight * 0.045)}px`,
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
                fontSize: `${Math.floor(cardHeight * 0.08)}px`,
                color: '#ffffff',
                fontStyle: 'bold'
            });
            nameText.setOrigin(0.5, 0.5);
            optionContainer.add(nameText);

            // 副標題（如果有）
            if (skillDef.subtitle) {
                const subtitleText = this.add.text(0, cardHeight * 0.12, skillDef.subtitle, {
                    fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
                    fontSize: `${Math.floor(cardHeight * 0.04)}px`,
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
                fontSize: `${Math.floor(cardHeight * 0.05)}px`,
                color: nextLevel >= skillDef.maxLevel ? '#ffff00' : '#88ff88',
                fontStyle: 'bold'
            });
            levelText.setOrigin(0.5, 0.5);
            optionContainer.add(levelText);

            // 技能描述（固定位置）
            const descText = this.add.text(0, cardHeight * 0.32, skillDef.description, {
                fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
                fontSize: `${Math.floor(cardHeight * 0.04)}px`,
                color: '#aaaaaa',
                wordWrap: { width: cardWidth * 0.85 },
                align: 'center'
            });
            descText.setOrigin(0.5, 0.5);
            optionContainer.add(descText);

            // 按鍵提示標籤
            const keyLabel = this.add.text(0, cardHeight * 0.42, `[ ${keys[i]} ]`, {
                fontFamily: 'monospace',
                fontSize: `${Math.floor(cardHeight * 0.06)}px`,
                color: '#ffff00',
                fontStyle: 'bold'
            });
            keyLabel.setOrigin(0.5, 0.5);
            optionContainer.add(keyLabel);

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
        // 格子大小：與 GridScene 一致的計算方式
        const screenWidth = this.cameras.main.width;
        const baseWidth = 1920;
        const baseCellSize = 10;
        const minCellSize = 4;

        const scale = Math.min(1, screenWidth / baseWidth);
        this.skillGridCellSize = Math.max(minCellSize, Math.floor(baseCellSize * scale));

        const gap = MainScene.SKILL_GRID_GAP;

        // 只覆蓋遊玩區域（gameBounds），不是整個地圖
        this.skillGridCols = Math.ceil((this.gameBounds.width + gap) / (this.skillGridCellSize + gap));
        this.skillGridRows = Math.ceil((this.gameBounds.height + gap) / (this.skillGridCellSize + gap));

        // 建立格子容器（放在 UI 層，固定在螢幕上）
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

        // 放在 uiContainer 中，這樣不會隨鏡頭移動
        this.uiContainer.add(this.skillGridContainer);
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

    // 清除所有技能範圍格子
    clearSkillGrid() {
        this.skillGridCells.forEach(cell => {
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
}
