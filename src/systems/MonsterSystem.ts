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
        size: 0.08, // 畫面高度的 8%
        hp: 30,
        exp: 20
    }
];

// 生成點類型
export type SpawnPoint = 'top' | 'left' | 'right';

// 怪物管理系統
export class MonsterManager {
    private scene: Phaser.Scene;
    private monsters: Monster[] = [];
    private nextMonsterId: number = 0;
    private gameAreaContainer: Phaser.GameObjects.Container;
    private clipMask: Phaser.Display.Masks.GeometryMask | null = null;

    // 生成設定
    private spawnInterval: number = 2000; // 每 2 秒生成一隻
    private lastSpawnTime: number = 0;
    private isSpawning: boolean = false;

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
        gameAreaContainer: Phaser.GameObjects.Container, // 遊戲區域容器，用於正確層級
        gameBounds: { x: number; y: number; width: number; height: number },
        mapWidth: number,
        mapHeight: number
    ) {
        this.scene = scene;
        this.gameAreaContainer = gameAreaContainer;
        this.gameBounds = gameBounds;
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.updateGridCellSize();
        this.createMonsterGrid();
    }

    // 設定玩家等級（用於怪物血量成長）
    setPlayerLevel(level: number) {
        this.playerLevel = level;
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
        // 加到 gameAreaContainer，位置固定在遊戲區域，層級在 UI 之下
        this.monsterGridContainer = this.scene.add.container(this.gameBounds.x, this.gameBounds.y);
        this.monsterGridContainer.setDepth(58); // 在技能網格(50)、邊線(55)之上，角色(60)之下
        this.gameAreaContainer.add(this.monsterGridContainer);

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

    // 計算怪物傷害（玩家等級單位，最低 1 單位）
    private calculateMonsterDamage(): number {
        const damageUnits = Math.max(1, this.playerLevel);
        return MonsterManager.DAMAGE_UNIT * damageUnits;
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

        // 怪物大小（畫面高度的 10%）
        const monsterSize = this.gameBounds.height * 0.10;
        // 玩家碰撞範圍（1 個單位 = 畫面高度 10%）
        const collisionRange = this.gameBounds.height * 0.10;

        // 更新每隻怪物的位置和動畫狀態
        this.monsters.forEach(monster => {
            // 計算方向向量
            const dx = playerX - monster.x;
            const dy = playerY - monster.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 如果距離玩家超過碰撞範圍，繼續移動
            if (distance > collisionRange) {
                // 正規化方向並移動
                // 速度單位轉換：單位/秒 → 像素/秒（1 單位 = 畫面高度 10%）
                const speedInPixels = monster.definition.speed * this.gameBounds.height * 0.1;
                const moveDistance = (speedInPixels * delta) / 1000;
                const ratio = moveDistance / distance;
                monster.x += dx * ratio;
                monster.y += dy * ratio;
            } else {
                // 在碰撞範圍內，每 3 秒造成傷害
                if (now - monster.lastDamageTime >= 3000) {
                    // 傷害 = 玩家等級 / 10 單位（最低 1 單位）
                    totalDamage += this.calculateMonsterDamage();
                    monster.lastDamageTime = now;
                    hitMonsters.push(monster);
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

        // 使用共用網格渲染所有怪物
        this.renderMonstersToGrid(monsterSize, cameraOffsetX, cameraOffsetY);

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

    // 使用畫面固定網格渲染所有怪物（馬賽克拼貼風格）
    private renderMonstersToGrid(
        monsterSize: number,
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

            // 繪製半橢圓形身體（選擇畫面上的哪些格子要顯示）
            for (let row = -gridRadiusY; row <= 0; row++) {
                for (let col = -gridRadiusX; col <= gridRadiusX; col++) {
                    // 正規化座標（根據當前的 stretch 範圍）
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

                        // 畫面網格座標
                        const targetCol = centerCol + col;
                        const targetRow = bottomRow + row;

                        // 只處理在畫面範圍內的格子
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
            const exp = this.calculateMonsterExp(monster.definition.exp);
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
}
