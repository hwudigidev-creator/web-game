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
    graphics: Phaser.GameObjects.Graphics;
    lastDamageTime: number; // 上次造成傷害的時間
    // Q彈動畫參數
    bouncePhase: number; // 彈跳相位 (0 ~ 2π)
    bounceSpeed: number; // 彈跳速度（隨機化讓每隻不同步）
    squashStretch: number; // 當前壓扁/拉伸比例
    // 受傷閃爍狀態
    flashStartTime: number; // 閃爍開始時間，0 表示不閃爍
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
    private container: Phaser.GameObjects.Container;

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
    private static readonly GRID_GAP = 1; // 格子間隔
    private gridScaleMultiplier: number = 3; // 網格倍率（與技能特效一致）

    constructor(
        scene: Phaser.Scene,
        container: Phaser.GameObjects.Container,
        gameBounds: { x: number; y: number; width: number; height: number },
        mapWidth: number,
        mapHeight: number
    ) {
        this.scene = scene;
        this.container = container;
        this.gameBounds = gameBounds;
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.updateGridCellSize();
    }

    // 設定玩家等級（用於怪物血量成長）
    setPlayerLevel(level: number) {
        this.playerLevel = level;
    }

    // 設定網格倍率（與技能特效同步）
    setGridScaleMultiplier(multiplier: number) {
        this.gridScaleMultiplier = multiplier;
        this.updateGridCellSize();
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

        // 更新每隻怪物
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

            // 更新繪製（傳遞 delta 給 Q 彈動畫）
            this.drawMonster(monster, monsterSize, cameraOffsetX, cameraOffsetY, delta);
        });

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

        // 建立怪物
        const definition = MONSTER_TYPES[0]; // 目前只有一種怪物
        const graphics = this.scene.add.graphics();

        // 根據玩家等級計算怪物血量
        const scaledHp = this.calculateMonsterHp(definition.hp);

        const monster: Monster = {
            id: this.nextMonsterId++,
            definition,
            x: spawnX,
            y: spawnY,
            hp: scaledHp,
            graphics,
            lastDamageTime: 0,
            // Q彈動畫參數（隨機化讓每隻史萊姆不同步）
            bouncePhase: Math.random() * Math.PI * 2,
            bounceSpeed: 3 + Math.random() * 2, // 3~5 的隨機速度
            squashStretch: 1,
            flashStartTime: 0
        };

        this.monsters.push(monster);
        this.container.add(graphics);
    }

    // 繪製怪物（網格式 Q 彈史萊姆，底部平坦）
    private drawMonster(
        monster: Monster,
        size: number,
        _cameraOffsetX: number,
        _cameraOffsetY: number,
        delta: number = 16
    ) {
        const graphics = monster.graphics;
        graphics.clear();

        // 更新 Q 彈動畫相位
        monster.bouncePhase += (monster.bounceSpeed * delta) / 1000;
        if (monster.bouncePhase > Math.PI * 2) {
            monster.bouncePhase -= Math.PI * 2;
        }

        // 計算壓扁/拉伸比例（sin 波形：0.92 ~ 1.08）
        const squashAmount = 0.08;
        monster.squashStretch = 1 + Math.sin(monster.bouncePhase) * squashAmount;

        // 怪物在世界座標中的位置
        const screenX = monster.x;
        const screenY = monster.y;

        // 網格參數
        const cellSize = this.gridCellSize;
        const gap = MonsterManager.GRID_GAP;
        const cellTotal = cellSize + gap;

        // 史萊姆形狀的網格尺寸（基於怪物大小）
        const gridRadius = Math.ceil(size / cellTotal / 2);

        // 顏色
        const baseColor = monster.definition.color;
        let r = (baseColor >> 16) & 0xff;
        let g = (baseColor >> 8) & 0xff;
        let b = baseColor & 0xff;

        // 檢查是否正在閃爍
        const flashDuration = 300; // 閃爍持續時間 300ms
        let isFlashing = false;
        let flashPhase = 0; // 0~1 閃爍階段

        if (monster.flashStartTime > 0) {
            const elapsed = this.scene.time.now - monster.flashStartTime;
            if (elapsed < flashDuration) {
                isFlashing = true;
                // 閃爍頻率：每 60ms 切換一次（白→紅→白→紅...）
                flashPhase = Math.floor(elapsed / 60) % 2;

                // 閃爍強度（前半強，後半漸弱）
                const intensity = elapsed < flashDuration / 2 ? 1 : 1 - (elapsed - flashDuration / 2) / (flashDuration / 2);

                if (flashPhase === 0) {
                    // 白色閃光
                    r = Math.min(255, Math.floor(r + (255 - r) * intensity));
                    g = Math.min(255, Math.floor(g + (255 - g) * intensity));
                    b = Math.min(255, Math.floor(b + (255 - b) * intensity));
                } else {
                    // 紅色閃光
                    r = Math.min(255, Math.floor(r + (255 - r) * intensity));
                    g = Math.floor(g * (1 - intensity * 0.8));
                    b = Math.floor(b * (1 - intensity * 0.8));
                }
            } else {
                // 閃爍結束
                monster.flashStartTime = 0;
            }
        }

        // 繪製史萊姆身體（半橢圓形網格，底部平坦，套用 squash/stretch）
        const stretchY = monster.squashStretch; // 垂直方向拉伸
        const stretchX = 1 / monster.squashStretch; // 水平方向壓縮（保持體積）

        // 史萊姆底部對齊地面
        const bottomY = screenY;
        const height = size * stretchY;

        for (let row = -gridRadius; row <= 0; row++) { // 只繪製上半部（row <= 0）
            for (let col = -gridRadius; col <= gridRadius; col++) {
                // 計算格子在半橢圓中的位置
                const normalizedX = col / gridRadius / stretchX;
                // 將 row 映射到 -1 ~ 0 範圍（上半部橢圓）
                const normalizedY = row / gridRadius;

                // 半橢圓方程：x² + y² <= 1（只取上半部）
                const distSq = normalizedX * normalizedX + normalizedY * normalizedY;

                if (distSq <= 1.1) { // 稍微擴大範圍讓邊緣更圓滑
                    // 計算透明度（中心亮、邊緣淡）
                    const edgeFade = 1 - Math.pow(Math.min(1, distSq), 0.5);
                    const alpha = 0.5 + edgeFade * 0.5; // 0.5 ~ 1.0（更不透明）

                    // 計算亮度漸變（上方較亮，模擬光澤）
                    const lightFactor = isFlashing ? 1 : 1 + (1 - normalizedY) * 0.4; // 閃爍時不加亮度
                    const cellR = Math.min(255, Math.floor(r * lightFactor));
                    const cellG = Math.min(255, Math.floor(g * lightFactor));
                    const cellB = Math.min(255, Math.floor(b * lightFactor));
                    const cellColor = (cellR << 16) | (cellG << 8) | cellB;

                    // 繪製格子（從底部往上）
                    const cellX = screenX + col * cellTotal * stretchX;
                    const cellY = bottomY + row * cellTotal * stretchY;

                    graphics.fillStyle(cellColor, alpha * (distSq <= 1 ? 1 : (1.1 - distSq) / 0.1));
                    graphics.fillRect(
                        cellX - cellSize / 2,
                        cellY - cellSize / 2,
                        cellSize,
                        cellSize
                    );
                }
            }
        }

        // 底部平坦部分（填滿底部那一行）
        const bottomRow = 0;
        for (let col = -gridRadius; col <= gridRadius; col++) {
            const normalizedX = col / gridRadius / stretchX;
            if (Math.abs(normalizedX) <= 1) {
                const cellX = screenX + col * cellTotal * stretchX;
                const cellY = bottomY + bottomRow * cellTotal * stretchY;

                // 底部顏色（閃爍時用閃爍色，否則稍暗）
                const darkFactor = isFlashing ? 1 : 0.7;
                const cellR = Math.floor(r * darkFactor);
                const cellG = Math.floor(g * darkFactor);
                const cellB = Math.floor(b * darkFactor);
                const cellColor = (cellR << 16) | (cellG << 8) | cellB;

                graphics.fillStyle(cellColor, 0.9);
                graphics.fillRect(
                    cellX - cellSize / 2,
                    cellY - cellSize / 2,
                    cellSize,
                    cellSize
                );
            }
        }

        // 繪製眼睛（兩個黑色網格格子）
        const eyeOffsetX = size * 0.18 * stretchX;
        const eyeY = bottomY - height * 0.5; // 眼睛在中間偏上

        // 左眼
        graphics.fillStyle(0x000000, 1);
        graphics.fillRect(
            screenX - eyeOffsetX - cellSize / 2,
            eyeY - cellSize / 2,
            cellSize,
            cellSize
        );
        // 右眼
        graphics.fillRect(
            screenX + eyeOffsetX - cellSize / 2,
            eyeY - cellSize / 2,
            cellSize,
            cellSize
        );

        // 高光（左上角的白色小格子）- 閃爍時隱藏
        if (!isFlashing) {
            const highlightX = screenX - size * 0.22 * stretchX;
            const highlightY = bottomY - height * 0.7;
            graphics.fillStyle(0xffffff, 0.8);
            graphics.fillRect(
                highlightX - cellSize / 2,
                highlightY - cellSize / 2,
                cellSize,
                cellSize
            );
        }
    }

    // 移除怪物
    removeMonster(monsterId: number) {
        const index = this.monsters.findIndex(m => m.id === monsterId);
        if (index !== -1) {
            const monster = this.monsters[index];
            monster.graphics.destroy();
            this.monsters.splice(index, 1);
        }
    }

    // 取得所有怪物
    getMonsters(): Monster[] {
        return this.monsters;
    }

    // 清除所有怪物
    clearAllMonsters() {
        this.monsters.forEach(monster => {
            monster.graphics.destroy();
        });
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
