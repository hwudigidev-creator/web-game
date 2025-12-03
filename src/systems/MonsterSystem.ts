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
}

// 預設怪物類型
export const MONSTER_TYPES: MonsterDefinition[] = [
    {
        id: 'slime',
        name: '史萊姆',
        color: 0x66ff66,
        speed: 1.5, // 每秒 1.5 單位
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
    }

    // 設定玩家等級（用於怪物血量成長）
    setPlayerLevel(level: number) {
        this.playerLevel = level;
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

            // 更新繪製
            this.drawMonster(monster, monsterSize, cameraOffsetX, cameraOffsetY);
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
            lastDamageTime: 0
        };

        this.monsters.push(monster);
        this.container.add(graphics);
    }

    // 繪製怪物
    private drawMonster(
        monster: Monster,
        size: number,
        _cameraOffsetX: number,
        _cameraOffsetY: number
    ) {
        const graphics = monster.graphics;
        graphics.clear();

        // 怪物在世界座標中的位置（直接使用世界座標，因為 graphics 在 worldContainer 中）
        const screenX = monster.x;
        const screenY = monster.y;

        // 繪製簡單的圓形怪物
        graphics.fillStyle(monster.definition.color, 0.8);
        graphics.fillCircle(screenX, screenY - size / 2, size / 2);

        // 繪製眼睛
        graphics.fillStyle(0x000000, 1);
        graphics.fillCircle(screenX - size * 0.15, screenY - size * 0.6, size * 0.08);
        graphics.fillCircle(screenX + size * 0.15, screenY - size * 0.6, size * 0.08);
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
            this.removeMonster(monsterId);
            return { killed: true, exp };
        }

        return { killed: false, exp: 0 };
    }

    // 怪物受傷閃白效果
    private flashMonster(monster: Monster) {
        const originalColor = monster.definition.color;

        // 暫時改變顏色為白色
        // 由於我們用 graphics 繪製，需要在下一幀恢復
        // 這裡用一個簡單的方式：設定一個臨時標記
        const graphics = monster.graphics;

        // 清除並繪製白色
        const monsterSize = this.gameBounds.height * 0.10;
        graphics.clear();
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(monster.x, monster.y - monsterSize / 2, monsterSize / 2);

        // 50ms 後恢復原色
        this.scene.time.delayedCall(50, () => {
            if (monster.hp > 0) {
                graphics.clear();
                graphics.fillStyle(originalColor, 0.8);
                graphics.fillCircle(monster.x, monster.y - monsterSize / 2, monsterSize / 2);
                // 重繪眼睛
                graphics.fillStyle(0x000000, 1);
                graphics.fillCircle(monster.x - monsterSize * 0.15, monster.y - monsterSize * 0.6, monsterSize * 0.08);
                graphics.fillCircle(monster.x + monsterSize * 0.15, monster.y - monsterSize * 0.6, monsterSize * 0.08);
            }
        });
    }

    // 批量對多個怪物造成傷害
    damageMonsters(monsterIds: number[], damage: number): { totalExp: number; killCount: number } {
        let totalExp = 0;
        let killCount = 0;

        for (const id of monsterIds) {
            const result = this.damageMonster(id, damage);
            if (result.killed) {
                totalExp += result.exp;
                killCount++;
            }
        }

        return { totalExp, killCount };
    }
}
