// 怪物定義
export interface MonsterDefinition {
    id: string;
    name: string;
    color: number;
    speed: number; // 移動速度（單位/秒，1 單位 = 畫面高度 10%）
    damage: number; // 每秒傷害
    size: number; // 相對於畫面高度的比例
    hp: number; // 血量
    exp: number; // 擊殺經驗值
}

// 怪物實例
export interface Monster {
    id: number;
    definition: MonsterDefinition;
    x: number;
    y: number;
    hp: number; // 當前血量
    lastDamageTime: number; // 上次造成傷害的時間
    // Q彈動畫參數
    bouncePhase: number; // 彈跳相位 (0 ~ 2π)
    bounceSpeed: number; // 彈跳速度（隨機化讓每隻不同步）
    squashStretch: number; // 當前壓扁/拉伸比例
    // 受傷閃爍狀態
    flashStartTime: number; // 閃爍開始時間，0 表示不閃爍
    // 蝙蝠專用：固定移動方向（直線衝過畫面）
    isBat?: boolean;
    directionX?: number; // 移動方向 X（單位向量）
    directionY?: number; // 移動方向 Y（單位向量）
    // BOSS 專用
    isBoss?: boolean;
    bossHpMultiplier?: number; // BOSS HP 倍率（等於生成時的玩家等級）
    // 暈眩/癱瘓狀態
    stunEndTime?: number; // 暈眩結束時間，0 或 undefined 表示未暈眩
}

// 怪物網格格子資料（畫面固定位置）
interface MonsterGridCell {
    rect: Phaser.GameObjects.Rectangle;
    screenCol: number;
    screenRow: number;
}

// 預設怪物類型
export const MONSTER_TYPES: MonsterDefinition[] = [
    {
        id: 'slime',
        name: '史萊姆',
        color: 0x66ff66,
        speed: 1, // 每秒 1 單位
        damage: 1,
        size: 0.05, // 畫面高度的 5%（縮小）
        hp: 30,
        exp: 20
    },
    {
        id: 'boss_slime',
        name: 'BOSS 史萊姆',
        color: 0x4a1a6b, // 暗紫色
        speed: 0.6, // 較慢
        damage: 3, // 3 倍傷害
        size: 0.15, // 3 倍大（5% * 3）
        hp: 30, // 基礎 HP（會根據等級倍數計算）
        exp: 200 // 高經驗
    },
    {
        id: 'bat',
        name: '蝙蝠',
        color: 0x8844aa, // 紫色
        speed: 8, // 每秒 8 單位（非常快）
        damage: 0.5, // 低傷害
        size: 0.025, // 很小體型
        hp: 10, // 固定 1 單位 HP（會被覆蓋為固定值）
        exp: 5 // 固定經驗
    }
];

// 生成點類型
export type SpawnPoint = 'top' | 'left' | 'right';

// 怪物管理系統
export class MonsterManager {
    private scene: Phaser.Scene;
    private monsters: Monster[] = [];
    private nextMonsterId: number = 0;
    private clipMask: Phaser.Display.Masks.GeometryMask | null = null;

    // 生成設定
    private spawnInterval: number = 2000; // 每 2 秒生成一隻
    private lastSpawnTime: number = 0;
    private isSpawning: boolean = false;

    // 蝙蝠群生成設定
    private batSwarmInterval: number = 30000; // 每 30 秒生成一批
    private lastBatSwarmTime: number = 0;
    private batSwarmCount: number = 8; // 每批蝙蝠數量
    private static readonly BAT_FIXED_HP = 10; // 固定 1 單位 HP
    private static readonly BAT_FIXED_EXP = 5; // 固定經驗

    // BOSS 生成追蹤（記錄已生成 BOSS 的等級）
    private bossSpawnedAtLevels: Set<number> = new Set();

    // 遊戲區域
    private gameBounds: { x: number; y: number; width: number; height: number };
    private mapWidth: number;
    private mapHeight: number;

    // 玩家等級（用於計算怪物血量）
    private playerLevel: number = 0;

    // 怪物成長曲線常數
    private static readonly HP_GROWTH_RATE = 1.10; // 每級血量成長 10%

    // 基礎攻擊單位（1 單位 = 10 傷害）
    private static readonly DAMAGE_UNIT = 10;

    // 網格繪製設定
    private gridCellSize: number = 4; // 怪物網格格子大小
    private gridScaleMultiplier: number = 3; // 網格倍率（與技能特效一致）

    // 怪物網格層（畫面固定網格）
    private monsterGridContainer!: Phaser.GameObjects.Container;
    private monsterGridCells: MonsterGridCell[] = [];
    private screenGridCols: number = 0;
    private screenGridRows: number = 0;

    constructor(
        scene: Phaser.Scene,
        gameBounds: { x: number; y: number; width: number; height: number },
        mapWidth: number,
        mapHeight: number
    ) {
        this.scene = scene;
        this.gameBounds = gameBounds;
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.updateGridCellSize();
        this.createMonsterGrid();
    }

    // 設定玩家等級（用於怪物血量成長）
    // 返回是否需要生成 BOSS
    setPlayerLevel(level: number): boolean {
        this.playerLevel = level;

        // 檢查是否達到 BOSS 生成等級（每 10 級：10, 20, 30...）
        if (level >= 10 && level % 10 === 0 && !this.bossSpawnedAtLevels.has(level)) {
            // 標記已生成，避免重複
            this.bossSpawnedAtLevels.add(level);
            return true;
        }
        return false;
    }

    // 生成 BOSS（由外部呼叫，傳入生成位置）
    spawnBoss(cameraOffsetX: number, cameraOffsetY: number) {
        const bossLevel = this.playerLevel;
        const bossDef = MONSTER_TYPES.find(m => m.id === 'boss_slime');
        if (!bossDef) return;

        // 隨機選擇生成點（畫面外的 3 個方向：上、左、右）
        const spawnPoints: SpawnPoint[] = ['top', 'left', 'right'];
        const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

        let spawnX: number;
        let spawnY: number;
        const margin = 150; // BOSS 較大，需要更大的間距

        const viewLeft = cameraOffsetX;
        const viewRight = cameraOffsetX + this.gameBounds.width;
        const viewTop = cameraOffsetY;

        switch (spawnPoint) {
            case 'top':
                spawnX = viewLeft + Math.random() * this.gameBounds.width;
                spawnY = viewTop - margin;
                break;
            case 'left':
                spawnX = viewLeft - margin;
                spawnY = viewTop + Math.random() * this.gameBounds.height;
                break;
            case 'right':
                spawnX = viewRight + margin;
                spawnY = viewTop + Math.random() * this.gameBounds.height;
                break;
        }

        // BOSS HP = 基礎 HP * 等級成長 * 等級倍率
        // 例如：10 級 BOSS HP = 基礎 * 成長^10 * 10
        const baseHp = this.calculateMonsterHp(bossDef.hp);
        const bossHp = baseHp * bossLevel;

        const monster: Monster = {
            id: this.nextMonsterId++,
            definition: bossDef,
            x: spawnX,
            y: spawnY,
            hp: bossHp,
            lastDamageTime: 0,
            bouncePhase: Math.random() * Math.PI * 2,
            bounceSpeed: 1.5 + Math.random() * 0.5, // BOSS 彈跳較慢但更穩重
            squashStretch: 1,
            flashStartTime: 0,
            isBoss: true,
            bossHpMultiplier: bossLevel
        };

        this.monsters.push(monster);
        console.log(`BOSS Slime spawned at level ${bossLevel}! HP: ${bossHp}`);
    }

    // 設定網格倍率（與技能特效同步）
    setGridScaleMultiplier(multiplier: number) {
        this.gridScaleMultiplier = multiplier;
        this.updateGridCellSize();
        this.recreateMonsterGrid();
    }

    // 更新網格格子大小（根據倍率和螢幕寬度）
    private updateGridCellSize() {
        const screenWidth = this.scene.cameras.main.width;
        const baseWidth = 1920;
        // 與 MainScene 的 createSkillGrid 使用相同的計算方式
        const baseCellSize = 20 / this.gridScaleMultiplier;
        const minCellSize = 6 / this.gridScaleMultiplier;
        const scale = Math.min(1, screenWidth / baseWidth);
        this.gridCellSize = Math.max(minCellSize, Math.floor(baseCellSize * scale));
    }

    // 設定遮罩（限制渲染在遊戲區域內）
    setClipMask(mask: Phaser.Display.Masks.GeometryMask) {
        this.clipMask = mask;
        if (this.monsterGridContainer) {
            this.monsterGridContainer.setMask(mask);
        }
    }

    // 建立怪物網格層（畫面固定網格，緊密排列無間隙）
    private createMonsterGrid() {
        // 直接加到場景（不是 uiContainer），用場景級別深度控制
        this.monsterGridContainer = this.scene.add.container(this.gameBounds.x, this.gameBounds.y);
        // 深度 5：在 gameAreaContainer(0) 之上，技能網格(3) 之上，uiContainer(100) 之下
        this.monsterGridContainer.setDepth(5);

        // 套用遮罩（如果已設定）
        if (this.clipMask) {
            this.monsterGridContainer.setMask(this.clipMask);
        }

        // 計算覆蓋整個畫面需要的網格數量
        this.screenGridCols = Math.ceil(this.gameBounds.width / this.gridCellSize) + 1;
        this.screenGridRows = Math.ceil(this.gameBounds.height / this.gridCellSize) + 1;

        // 建立網格格子（固定在畫面位置，緊密排列）
        for (let row = 0; row < this.screenGridRows; row++) {
            for (let col = 0; col < this.screenGridCols; col++) {
                // 格子位置固定在畫面上（origin 0,0 讓格子從左上角開始緊密排列）
                const x = col * this.gridCellSize;
                const y = row * this.gridCellSize;
                const rect = this.scene.add.rectangle(
                    x, y,
                    this.gridCellSize,
                    this.gridCellSize,
                    0x000000, 0
                );
                rect.setOrigin(0, 0);
                rect.setVisible(false);
                this.monsterGridContainer.add(rect);
                this.monsterGridCells.push({
                    rect,
                    screenCol: col,
                    screenRow: row
                });
            }
        }
    }

    // 重建怪物網格（當倍率變更時）
    private recreateMonsterGrid() {
        // 清除舊網格
        this.monsterGridCells.forEach(cell => cell.rect.destroy());
        this.monsterGridCells = [];
        if (this.monsterGridContainer) {
            this.monsterGridContainer.destroy();
        }
        // 重新建立
        this.createMonsterGrid();
    }

    // 計算怪物血量（根據玩家等級）
    private calculateMonsterHp(baseHp: number): number {
        return Math.floor(baseHp * Math.pow(MonsterManager.HP_GROWTH_RATE, this.playerLevel));
    }

    // 計算怪物傷害（玩家等級單位，最低 1 單位，乘以怪物傷害倍率）
    private calculateMonsterDamage(monster: Monster): number {
        const damageUnits = Math.max(1, this.playerLevel);
        const baseDamage = MonsterManager.DAMAGE_UNIT * damageUnits;
        // 套用怪物傷害倍率（例如 BOSS 的 3 倍傷害）
        return baseDamage * monster.definition.damage;
    }

    // 計算怪物經驗值（每 5 級翻倍）
    private calculateMonsterExp(baseExp: number): number {
        const doubleCount = Math.floor(this.playerLevel / 5);
        return baseExp * Math.pow(2, doubleCount);
    }

    // 開始生成怪物
    startSpawning() {
        this.isSpawning = true;
        this.lastSpawnTime = this.scene.time.now;
        this.lastBatSwarmTime = this.scene.time.now; // 蝙蝠群也從現在開始計時
    }

    // 停止生成怪物
    stopSpawning() {
        this.isSpawning = false;
    }

    // 更新（每幀呼叫）
    update(
        delta: number,
        playerX: number,
        playerY: number,
        cameraOffsetX: number,
        cameraOffsetY: number
    ): { damage: number; hitMonsters: Monster[] } {
        const now = this.scene.time.now;
        let totalDamage = 0;
        const hitMonsters: Monster[] = [];

        // 檢查是否需要生成新怪物
        if (this.isSpawning && now - this.lastSpawnTime >= this.spawnInterval) {
            // 每5級多生成1隻怪物（等級0-4生成1隻，5-9生成2隻，10-14生成3隻...）
            const spawnCount = 1 + Math.floor(this.playerLevel / 5);
            for (let i = 0; i < spawnCount; i++) {
                this.spawnMonster(playerX, playerY, cameraOffsetX, cameraOffsetY);
            }
            this.lastSpawnTime = now;
        }

        // 檢查是否需要生成蝙蝠群
        if (this.isSpawning && now - this.lastBatSwarmTime >= this.batSwarmInterval) {
            this.spawnBatSwarm(cameraOffsetX, cameraOffsetY);
            this.lastBatSwarmTime = now;
        }

        // 玩家碰撞範圍（1 個單位 = 畫面高度 10%）
        const collisionRange = this.gameBounds.height * 0.10;

        // 更新每隻怪物的位置和動畫狀態
        const monstersToRemove: number[] = [];

        this.monsters.forEach(monster => {
            // 檢查暈眩狀態（暈眩中不移動、不攻擊）
            const isStunned = this.isMonsterStunned(monster);

            // 蝙蝠：沿固定方向直線移動，穿過畫面後消滅
            if (monster.isBat && monster.directionX !== undefined && monster.directionY !== undefined) {
                // 暈眩中不移動
                if (!isStunned) {
                    // 速度單位轉換：單位/秒 → 像素/秒
                    const speedInPixels = monster.definition.speed * this.gameBounds.height * 0.1;
                    const moveDistance = (speedInPixels * delta) / 1000;

                    // 沿固定方向移動（始終保持同一方向）
                    monster.x += monster.directionX * moveDistance;
                    monster.y += monster.directionY * moveDistance;
                }

                // 檢查是否離開畫面（加上緩衝區）
                const buffer = this.gameBounds.height * 0.3;
                const screenLeft = cameraOffsetX - buffer;
                const screenRight = cameraOffsetX + this.gameBounds.width + buffer;
                const screenTop = cameraOffsetY - buffer;
                const screenBottom = cameraOffsetY + this.gameBounds.height + buffer;

                if (monster.x < screenLeft || monster.x > screenRight ||
                    monster.y < screenTop || monster.y > screenBottom) {
                    monstersToRemove.push(monster.id);
                }

                // 蝙蝠碰到玩家也造成傷害（暈眩中不攻擊）
                if (!isStunned) {
                    const batDx = playerX - monster.x;
                    const batDy = playerY - monster.y;
                    const batDist = Math.sqrt(batDx * batDx + batDy * batDy);
                    if (batDist <= collisionRange && now - monster.lastDamageTime >= 3000) {
                        totalDamage += this.calculateMonsterDamage(monster);
                        monster.lastDamageTime = now;
                        hitMonsters.push(monster);
                    }
                }
            } else {
                // 普通怪物：朝玩家移動（暈眩中不移動）
                if (!isStunned) {
                    const dx = playerX - monster.x;
                    const dy = playerY - monster.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > collisionRange) {
                        const speedInPixels = monster.definition.speed * this.gameBounds.height * 0.1;
                        const moveDistance = (speedInPixels * delta) / 1000;
                        const ratio = moveDistance / distance;
                        monster.x += dx * ratio;
                        monster.y += dy * ratio;
                    } else {
                        // 在碰撞範圍內，每 3 秒造成傷害
                        if (now - monster.lastDamageTime >= 3000) {
                            totalDamage += this.calculateMonsterDamage(monster);
                            monster.lastDamageTime = now;
                            hitMonsters.push(monster);
                        }
                    }
                }
            }

            // 更新 Q 彈動畫相位
            monster.bouncePhase += (monster.bounceSpeed * delta) / 1000;
            if (monster.bouncePhase > Math.PI * 2) {
                monster.bouncePhase -= Math.PI * 2;
            }
            // 計算壓扁/拉伸比例（sin 波形：0.92 ~ 1.08）
            const squashAmount = 0.08;
            monster.squashStretch = 1 + Math.sin(monster.bouncePhase) * squashAmount;
        });

        // 移除離開畫面的蝙蝠
        monstersToRemove.forEach(id => {
            this.monsters = this.monsters.filter(m => m.id !== id);
        });

        // 使用共用網格渲染所有怪物
        this.renderMonstersToGrid(cameraOffsetX, cameraOffsetY);

        return { damage: totalDamage, hitMonsters };
    }

    // 生成怪物
    private spawnMonster(
        _playerX: number,
        _playerY: number,
        cameraOffsetX: number,
        cameraOffsetY: number
    ) {
        // 隨機選擇生成點（畫面外的 3 個方向：上、左、右）
        const spawnPoints: SpawnPoint[] = ['top', 'left', 'right'];
        const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

        // 計算生成位置（在可視範圍外）
        let spawnX: number;
        let spawnY: number;
        const margin = 100; // 畫面外的距離

        // 可視範圍
        const viewLeft = cameraOffsetX;
        const viewRight = cameraOffsetX + this.gameBounds.width;
        const viewTop = cameraOffsetY;

        switch (spawnPoint) {
            case 'top':
                // 從上方生成
                spawnX = viewLeft + Math.random() * this.gameBounds.width;
                spawnY = viewTop - margin;
                break;
            case 'left':
                // 從左方生成
                spawnX = viewLeft - margin;
                spawnY = viewTop + Math.random() * this.gameBounds.height;
                break;
            case 'right':
                // 從右方生成
                spawnX = viewRight + margin;
                spawnY = viewTop + Math.random() * this.gameBounds.height;
                break;
        }

        // 限制在地圖範圍內
        spawnX = Phaser.Math.Clamp(spawnX, 0, this.mapWidth);
        spawnY = Phaser.Math.Clamp(spawnY, 0, this.mapHeight);

        // 建立怪物（不再使用個別的 graphics）
        const definition = MONSTER_TYPES[0]; // 目前只有一種怪物

        // 根據玩家等級計算怪物血量
        const scaledHp = this.calculateMonsterHp(definition.hp);

        const monster: Monster = {
            id: this.nextMonsterId++,
            definition,
            x: spawnX,
            y: spawnY,
            hp: scaledHp,
            lastDamageTime: 0,
            // Q彈動畫參數（隨機化讓每隻史萊姆不同步）
            bouncePhase: Math.random() * Math.PI * 2,
            bounceSpeed: 3 + Math.random() * 2, // 3~5 的隨機速度
            squashStretch: 1,
            flashStartTime: 0
        };

        this.monsters.push(monster);
    }

    // 生成蝙蝠群（從斜對角衝向對角，穿過整個畫面）
    private spawnBatSwarm(cameraOffsetX: number, cameraOffsetY: number) {
        // 隨機選擇生成角落（四個角落之一）
        const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
        const corner = corners[Math.floor(Math.random() * corners.length)];

        // 畫面邊界
        const viewLeft = cameraOffsetX;
        const viewRight = cameraOffsetX + this.gameBounds.width;
        const viewTop = cameraOffsetY;
        const viewBottom = cameraOffsetY + this.gameBounds.height;

        // 分散半徑（1.5 個單位 = 畫面高度 15%）
        const spreadRadius = this.gameBounds.height * 0.15;

        // 角落基準點（畫面外）
        let baseX: number;
        let baseY: number;
        let targetX: number;
        let targetY: number;

        switch (corner) {
            case 'topLeft':
                baseX = viewLeft - spreadRadius;
                baseY = viewTop - spreadRadius;
                targetX = viewRight + spreadRadius * 2;
                targetY = viewBottom + spreadRadius * 2;
                break;
            case 'topRight':
                baseX = viewRight + spreadRadius;
                baseY = viewTop - spreadRadius;
                targetX = viewLeft - spreadRadius * 2;
                targetY = viewBottom + spreadRadius * 2;
                break;
            case 'bottomLeft':
                baseX = viewLeft - spreadRadius;
                baseY = viewBottom + spreadRadius;
                targetX = viewRight + spreadRadius * 2;
                targetY = viewTop - spreadRadius * 2;
                break;
            case 'bottomRight':
            default:
                baseX = viewRight + spreadRadius;
                baseY = viewBottom + spreadRadius;
                targetX = viewLeft - spreadRadius * 2;
                targetY = viewTop - spreadRadius * 2;
                break;
        }

        // 取得蝙蝠定義
        const batDef = MONSTER_TYPES.find(m => m.id === 'bat') || MONSTER_TYPES[0];

        // 生成 8 隻蝙蝠，在圓形範圍內隨機分散（不重疊）
        const spawnedPositions: { x: number; y: number }[] = [];
        const minDistance = this.gameBounds.height * 0.04; // 最小間距，避免重疊

        for (let i = 0; i < this.batSwarmCount; i++) {
            let spawnX: number;
            let spawnY: number;
            let attempts = 0;
            const maxAttempts = 50;

            // 嘗試找到不重疊的位置
            do {
                // 在圓形範圍內隨機生成（極座標轉換）
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * spreadRadius;
                spawnX = baseX + Math.cos(angle) * radius;
                spawnY = baseY + Math.sin(angle) * radius;
                attempts++;

                // 檢查是否與已生成的蝙蝠重疊
                const tooClose = spawnedPositions.some(pos => {
                    const dx = pos.x - spawnX;
                    const dy = pos.y - spawnY;
                    return Math.sqrt(dx * dx + dy * dy) < minDistance;
                });

                if (!tooClose || attempts >= maxAttempts) {
                    break;
                }
            } while (true);

            spawnedPositions.push({ x: spawnX, y: spawnY });

            // 計算方向向量（單位向量）- 都朝向對角
            const dx = targetX - spawnX;
            const dy = targetY - spawnY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const dirX = dx / distance;
            const dirY = dy / distance;

            const monster: Monster = {
                id: this.nextMonsterId++,
                definition: batDef,
                x: spawnX,
                y: spawnY,
                hp: MonsterManager.BAT_FIXED_HP, // 固定 HP
                lastDamageTime: 0,
                bouncePhase: Math.random() * Math.PI * 2,
                bounceSpeed: 5 + Math.random() * 3, // 蝙蝠彈跳更快
                squashStretch: 1,
                flashStartTime: 0,
                // 蝙蝠專用屬性（使用方向向量）
                isBat: true,
                directionX: dirX,
                directionY: dirY
            };

            this.monsters.push(monster);
        }

        console.log(`Bat swarm spawned from ${corner}! Count: ${this.batSwarmCount}`);
    }

    // 使用畫面固定網格渲染所有怪物（馬賽克拼貼風格）
    private renderMonstersToGrid(
        cameraOffsetX: number,
        cameraOffsetY: number
    ) {
        const cellSize = this.gridCellSize;
        const now = this.scene.time.now;

        // 建立一個 Map 來儲存每個畫面網格格子的渲染資料
        // key: "screenCol,screenRow", value: { color, alpha }
        const gridData = new Map<string, { color: number; alpha: number }>();

        // 為每隻怪物計算要渲染到哪些畫面格子
        this.monsters.forEach(monster => {
            // 每個怪物使用自己的 size
            const monsterSize = this.gameBounds.height * monster.definition.size;

            // Q彈效果：用 squashStretch 調整形狀範圍
            const stretchY = monster.squashStretch;
            const stretchX = 1 / monster.squashStretch;

            // 怪物在畫面上的位置（世界座標轉畫面座標）
            const screenX = monster.x - cameraOffsetX;
            const screenY = monster.y - cameraOffsetY;

            // 怪物中心對應的畫面網格座標
            const centerCol = Math.floor(screenX / cellSize);
            const bottomRow = Math.floor(screenY / cellSize);

            // 計算怪物的網格半徑（基礎值）
            const baseGridRadius = Math.ceil(monsterSize / cellSize / 2);
            // 根據 stretch 調整實際顯示的格子數量
            const gridRadiusX = Math.ceil(baseGridRadius * stretchX);
            const gridRadiusY = Math.ceil(baseGridRadius * stretchY);

            // 計算顏色（含閃爍效果）
            const baseColor = monster.definition.color;
            let r = (baseColor >> 16) & 0xff;
            let g = (baseColor >> 8) & 0xff;
            let b = baseColor & 0xff;

            let isFlashing = false;
            const flashDuration = 300;

            if (monster.flashStartTime > 0) {
                const elapsed = now - monster.flashStartTime;
                if (elapsed < flashDuration) {
                    isFlashing = true;
                    const flashPhase = Math.floor(elapsed / 60) % 2;
                    const intensity = elapsed < flashDuration / 2 ? 1 : 1 - (elapsed - flashDuration / 2) / (flashDuration / 2);

                    if (flashPhase === 0) {
                        r = Math.min(255, Math.floor(r + (255 - r) * intensity));
                        g = Math.min(255, Math.floor(g + (255 - g) * intensity));
                        b = Math.min(255, Math.floor(b + (255 - b) * intensity));
                    } else {
                        r = Math.min(255, Math.floor(r + (255 - r) * intensity));
                        g = Math.floor(g * (1 - intensity * 0.8));
                        b = Math.floor(b * (1 - intensity * 0.8));
                    }
                } else {
                    monster.flashStartTime = 0;
                }
            }

            // 蝙蝠使用特殊造型（翅膀形狀）
            if (monster.isBat) {
                // 蝙蝠翅膀拍打效果（更明顯的拍動）
                const wingFlap = Math.sin(monster.bouncePhase * 3) * 0.5 + 0.5; // 0~1，更快拍動
                const wingAngle = wingFlap * 0.8 - 0.2; // -0.2 ~ 0.6 的角度變化

                // 蝙蝠尺寸參數
                const bodyWidth = Math.max(2, Math.ceil(gridRadiusX * 0.6));
                const bodyHeight = Math.max(2, Math.ceil(gridRadiusY * 0.8));
                const wingSpan = Math.max(3, Math.ceil(gridRadiusX * 3)); // 翅膀展開很寬
                const wingMaxHeight = Math.max(2, Math.ceil(gridRadiusY * 1.5));

                // 輔助函數：設定格子
                const setCell = (col: number, row: number, color: number, alpha: number) => {
                    if (col >= 0 && col < this.screenGridCols &&
                        row >= 0 && row < this.screenGridRows) {
                        const key = `${col},${row}`;
                        const existing = gridData.get(key);
                        if (!existing || alpha > existing.alpha) {
                            gridData.set(key, { color, alpha });
                        }
                    }
                };

                const bodyColor = (r << 16) | (g << 8) | b;
                const wingColor = (Math.floor(r * 0.7) << 16) | (Math.floor(g * 0.7) << 8) | Math.floor(b * 0.7);
                const darkWingColor = (Math.floor(r * 0.5) << 16) | (Math.floor(g * 0.5) << 8) | Math.floor(b * 0.5);

                // 繪製蝙蝠身體（小橢圓）
                for (let row = -bodyHeight; row <= bodyHeight; row++) {
                    for (let col = -bodyWidth; col <= bodyWidth; col++) {
                        const normalizedX = col / bodyWidth;
                        const normalizedY = row / bodyHeight;
                        const distSq = normalizedX * normalizedX + normalizedY * normalizedY;
                        if (distSq <= 1) {
                            setCell(centerCol + col, bottomRow + row, bodyColor, 0.95);
                        }
                    }
                }

                // 繪製小耳朵（身體上方兩個三角形）
                const earOffset = Math.max(1, Math.floor(bodyWidth * 0.6));
                const earHeight = Math.max(1, Math.floor(bodyHeight * 0.6));
                // 左耳
                for (let i = 0; i <= earHeight; i++) {
                    const earWidth = Math.max(1, earHeight - i);
                    for (let j = 0; j < earWidth; j++) {
                        setCell(centerCol - earOffset + j, bottomRow - bodyHeight - i - 1, bodyColor, 0.9);
                    }
                }
                // 右耳
                for (let i = 0; i <= earHeight; i++) {
                    const earWidth = Math.max(1, earHeight - i);
                    for (let j = 0; j < earWidth; j++) {
                        setCell(centerCol + earOffset - j, bottomRow - bodyHeight - i - 1, bodyColor, 0.9);
                    }
                }

                // 繪製翅膀（三角形 + 波浪邊緣，隨拍動改變形狀）
                // 左翅膀
                for (let i = 1; i <= wingSpan; i++) {
                    const progress = i / wingSpan; // 0~1
                    // 翅膀高度（三角形 + 拍動角度）
                    const baseHeight = Math.floor(wingMaxHeight * progress * (1 - progress * 0.3));
                    const flapOffset = Math.floor(wingAngle * progress * wingMaxHeight);
                    const wingTopY = -baseHeight + flapOffset;
                    const wingBottomY = Math.floor(baseHeight * 0.3) + flapOffset;

                    // 填充翅膀（從上到下）
                    for (let y = wingTopY; y <= wingBottomY; y++) {
                        // 波浪邊緣效果
                        const waveOffset = Math.floor(Math.sin(progress * Math.PI * 2 + monster.bouncePhase) * 0.5);
                        const alpha = 0.85 - progress * 0.3;
                        const color = y < (wingTopY + wingBottomY) / 2 ? wingColor : darkWingColor;
                        setCell(centerCol - bodyWidth - i, bottomRow + y + waveOffset, color, alpha);
                    }

                    // 翅膀骨架線（較亮的線條）
                    if (i % 2 === 0 && i < wingSpan - 1) {
                        const boneY = Math.floor((wingTopY + wingBottomY) / 2 + flapOffset);
                        setCell(centerCol - bodyWidth - i, bottomRow + boneY, bodyColor, 0.9);
                    }
                }

                // 右翅膀（鏡像）
                for (let i = 1; i <= wingSpan; i++) {
                    const progress = i / wingSpan;
                    const baseHeight = Math.floor(wingMaxHeight * progress * (1 - progress * 0.3));
                    const flapOffset = Math.floor(wingAngle * progress * wingMaxHeight);
                    const wingTopY = -baseHeight + flapOffset;
                    const wingBottomY = Math.floor(baseHeight * 0.3) + flapOffset;

                    for (let y = wingTopY; y <= wingBottomY; y++) {
                        const waveOffset = Math.floor(Math.sin(progress * Math.PI * 2 + monster.bouncePhase) * 0.5);
                        const alpha = 0.85 - progress * 0.3;
                        const color = y < (wingTopY + wingBottomY) / 2 ? wingColor : darkWingColor;
                        setCell(centerCol + bodyWidth + i, bottomRow + y + waveOffset, color, alpha);
                    }

                    if (i % 2 === 0 && i < wingSpan - 1) {
                        const boneY = Math.floor((wingTopY + wingBottomY) / 2 + flapOffset);
                        setCell(centerCol + bodyWidth + i, bottomRow + boneY, bodyColor, 0.9);
                    }
                }

                // 蝙蝠的小眼睛（紅色）
                const eyeY = bottomRow - Math.floor(bodyHeight * 0.3);
                const eyeOffset = Math.max(1, Math.floor(bodyWidth * 0.4));
                setCell(centerCol - eyeOffset, eyeY, 0xff0000, 1);
                setCell(centerCol + eyeOffset, eyeY, 0xff0000, 1);

                // 跳過通用眼睛/高光渲染（return 相當於 forEach 中的 continue）
                return;
            } else {
                // 普通怪物：繪製半橢圓形身體
                for (let row = -gridRadiusY; row <= 0; row++) {
                    for (let col = -gridRadiusX; col <= gridRadiusX; col++) {
                        const normalizedX = col / gridRadiusX;
                        const normalizedY = row / gridRadiusY;
                        const distSq = normalizedX * normalizedX + normalizedY * normalizedY;

                        if (distSq <= 1.1) {
                            const edgeFade = 1 - Math.pow(Math.min(1, distSq), 0.5);
                            const alpha = (0.5 + edgeFade * 0.5) * (distSq <= 1 ? 1 : (1.1 - distSq) / 0.1);

                            const lightFactor = isFlashing ? 1 : 1 + (1 - normalizedY) * 0.4;
                            const cellR = Math.min(255, Math.floor(r * lightFactor));
                            const cellG = Math.min(255, Math.floor(g * lightFactor));
                            const cellB = Math.min(255, Math.floor(b * lightFactor));
                            const cellColor = (cellR << 16) | (cellG << 8) | cellB;

                            const targetCol = centerCol + col;
                            const targetRow = bottomRow + row;

                            if (targetCol >= 0 && targetCol < this.screenGridCols &&
                                targetRow >= 0 && targetRow < this.screenGridRows) {
                                const key = `${targetCol},${targetRow}`;
                                const existing = gridData.get(key);
                                if (!existing || alpha > existing.alpha) {
                                    gridData.set(key, { color: cellColor, alpha });
                                }
                            }
                        }
                    }
                }

                // 底部平坦部分
                for (let col = -gridRadiusX; col <= gridRadiusX; col++) {
                    const normalizedX = col / gridRadiusX;
                    if (Math.abs(normalizedX) <= 1) {
                        const darkFactor = isFlashing ? 1 : 0.7;
                        const cellR = Math.floor(r * darkFactor);
                        const cellG = Math.floor(g * darkFactor);
                        const cellB = Math.floor(b * darkFactor);
                        const cellColor = (cellR << 16) | (cellG << 8) | cellB;

                        const targetCol = centerCol + col;
                        const targetRow = bottomRow;

                        if (targetCol >= 0 && targetCol < this.screenGridCols &&
                            targetRow >= 0 && targetRow < this.screenGridRows) {
                            const key = `${targetCol},${targetRow}`;
                            gridData.set(key, { color: cellColor, alpha: 0.9 });
                        }
                    }
                }
            }

            // 眼睛位置（根據當前範圍調整）
            const eyeOffsetCols = Math.max(1, Math.floor(gridRadiusX * 0.35));
            const eyeRowOffset = Math.floor(gridRadiusY * 0.5);

            const leftEyeCol = centerCol - eyeOffsetCols;
            const rightEyeCol = centerCol + eyeOffsetCols;
            const eyeRow = bottomRow - eyeRowOffset;

            if (leftEyeCol >= 0 && leftEyeCol < this.screenGridCols &&
                eyeRow >= 0 && eyeRow < this.screenGridRows) {
                gridData.set(`${leftEyeCol},${eyeRow}`, { color: 0x000000, alpha: 1 });
            }
            if (rightEyeCol >= 0 && rightEyeCol < this.screenGridCols &&
                eyeRow >= 0 && eyeRow < this.screenGridRows) {
                gridData.set(`${rightEyeCol},${eyeRow}`, { color: 0x000000, alpha: 1 });
            }

            // 高光
            if (!isFlashing) {
                const highlightColOffset = Math.floor(gridRadiusX * 0.4);
                const highlightRowOffset = Math.floor(gridRadiusY * 0.7);
                const highlightCol = centerCol - highlightColOffset;
                const highlightRow = bottomRow - highlightRowOffset;
                if (highlightCol >= 0 && highlightCol < this.screenGridCols &&
                    highlightRow >= 0 && highlightRow < this.screenGridRows) {
                    gridData.set(`${highlightCol},${highlightRow}`, { color: 0xffffff, alpha: 0.8 });
                }
            }
        });

        // 遍歷所有畫面固定格子，根據 gridData 決定顯示與否
        for (const cell of this.monsterGridCells) {
            const key = `${cell.screenCol},${cell.screenRow}`;
            const data = gridData.get(key);

            if (data) {
                cell.rect.setFillStyle(data.color, data.alpha);
                cell.rect.setVisible(true);
            } else {
                cell.rect.setVisible(false);
            }
        }
    }

    // 移除怪物
    removeMonster(monsterId: number) {
        const index = this.monsters.findIndex(m => m.id === monsterId);
        if (index !== -1) {
            this.monsters.splice(index, 1);
        }
    }

    // 取得所有怪物
    getMonsters(): Monster[] {
        return this.monsters;
    }

    // 清除所有怪物
    clearAllMonsters() {
        this.monsters = [];
    }

    // 設定生成間隔
    setSpawnInterval(interval: number) {
        this.spawnInterval = interval;
    }

    // 對怪物造成傷害，返回是否死亡和經驗值
    damageMonster(monsterId: number, damage: number): { killed: boolean; exp: number } {
        const monster = this.monsters.find(m => m.id === monsterId);
        if (!monster) return { killed: false, exp: 0 };

        monster.hp -= damage;

        // 怪物受傷閃白效果
        this.flashMonster(monster);

        if (monster.hp <= 0) {
            // 蝙蝠使用固定經驗，其他怪物根據等級計算
            const exp = monster.isBat
                ? MonsterManager.BAT_FIXED_EXP
                : this.calculateMonsterExp(monster.definition.exp);
            // 播放死亡煙霧效果
            this.playDeathSmoke(monster.x, monster.y);
            this.removeMonster(monsterId);
            return { killed: true, exp };
        }

        return { killed: false, exp: 0 };
    }

    // 怪物受傷閃紅白效果（設定閃爍開始時間，由 drawMonster 處理動畫）
    private flashMonster(monster: Monster) {
        monster.flashStartTime = this.scene.time.now;
    }

    // 播放死亡擴散效果（呼叫 MainScene 的網格特效）
    private playDeathSmoke(x: number, y: number) {
        // 呼叫 MainScene 的死亡特效方法
        const mainScene = this.scene as any;
        if (mainScene.flashDeathEffect) {
            mainScene.flashDeathEffect(x, y);
        }
    }

    // 批量對多個怪物造成傷害
    damageMonsters(monsterIds: number[], damage: number): { totalExp: number; killCount: number; killedPositions: { x: number; y: number }[] } {
        let totalExp = 0;
        let killCount = 0;
        const killedPositions: { x: number; y: number }[] = [];

        for (const id of monsterIds) {
            // 先取得怪物位置（在造成傷害前）
            const monster = this.monsters.find(m => m.id === id);
            const posBeforeDamage = monster ? { x: monster.x, y: monster.y } : null;

            const result = this.damageMonster(id, damage);
            if (result.killed && posBeforeDamage) {
                totalExp += result.exp;
                killCount++;
                killedPositions.push(posBeforeDamage);
            }
        }

        return { totalExp, killCount, killedPositions };
    }

    // 使怪物暈眩（停止活動）
    stunMonsters(monsterIds: number[], duration: number) {
        const now = this.scene.time.now;
        const stunEndTime = now + duration;

        for (const id of monsterIds) {
            const monster = this.monsters.find(m => m.id === id);
            if (monster) {
                // 設定暈眩結束時間（如果已經暈眩中，取較長的結束時間）
                monster.stunEndTime = Math.max(monster.stunEndTime || 0, stunEndTime);
            }
        }
    }

    // 檢查怪物是否暈眩中
    isMonsterStunned(monster: Monster): boolean {
        if (!monster.stunEndTime) return false;
        return this.scene.time.now < monster.stunEndTime;
    }
}
