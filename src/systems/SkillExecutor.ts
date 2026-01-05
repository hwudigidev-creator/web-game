import { PlayerSkill, PlayerAdvancedSkill, SparkColors } from './SkillSystem';
import type { Monster } from './MonsterSystem';
import type MainScene from '../scenes/MainScene';

// MainScene 的 DAMAGE_UNIT 常數
const DAMAGE_UNIT = 10;

/**
 * 技能執行器
 * 負責所有技能的具體執行邏輯，從 MainScene 分離出來以便管理
 */
export class SkillExecutor {
    private scene: MainScene;

    // 輪鋸環繞狀態
    private sawBladeLastHitTime = new Map<number, number>();
    private sawBladeAngle = 0;

    constructor(scene: MainScene) {
        this.scene = scene;
    }

    // ==================== 輔助存取器 ====================

    private get characterX(): number { return this.scene.getCharacterX(); }
    private get characterY(): number { return this.scene.getCharacterY(); }
    private get currentLevel(): number { return this.scene.getCurrentLevel(); }
    private get gameBounds() { return this.scene.getGameBounds(); }
    private get monsterManager() { return this.scene.getMonsterManager(); }
    private get skillManager() { return this.scene.getSkillManager(); }
    private get showGridSkillEffects(): boolean { return this.scene.getShowGridSkillEffects(); }
    private get cameraOffsetX(): number { return this.scene.getCameraOffsetX(); }
    private get cameraOffsetY(): number { return this.scene.getCameraOffsetY(); }

    /** 呼叫 MainScene 的私有方法（暫時方案） */
    private call(method: string, ...args: any[]): any {
        return (this.scene as any)[method](...args);
    }

    // ==================== 公開存取器 ====================

    /** 取得輪鋸公轉角度（供 MainScene 視覺更新用） */
    public getSawBladeAngle(): number { return this.sawBladeAngle; }

    /** 清除輪鋸擊中記錄（切換技能時） */
    public clearSawBladeHitTime(): void { this.sawBladeLastHitTime.clear(); }

    /** 重置輪鋸狀態 */
    public resetSawBladeState(): void {
        this.sawBladeAngle = 0;
        this.sawBladeLastHitTime.clear();
    }

    // ==================== 基礎技能 ====================

    /**
     * 靈魂渲染：朝最近敵人方向打出扇形傷害
     * MAX：改為三向衝擊波（0°/120°/240°）、10 傷害、10 單位射程
     */
    public activateSoulRender(skill: PlayerSkill): void {
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
        this.scene.setFacingRight(Math.cos(targetAngle) >= 0);

        // 扇形參數
        const range = this.gameBounds.height * 0.3; // 3 個單位
        const sectorAngle = 60 + skill.level * 10;
        const halfAngle = (sectorAngle / 2) * (Math.PI / 180);

        // 傷害：2 單位 + 每級 1 單位 + 進階技能等級加成
        const advancedBonus = this.skillManager.getAdvancedSkillBonusForActiveSkill(skill.definition.id);
        const damageUnits = 2 + skill.level + advancedBonus;
        const baseDamage = DAMAGE_UNIT * damageUnits;
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        // 檢查哪些怪物在扇形範圍內
        const hitMonsters: number[] = [];
        for (const monster of monsters) {
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist - monsterRadius > range) continue;

            const monsterAngle = Math.atan2(dy, dx);
            let angleDiff = monsterAngle - targetAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const angleOffset = dist > 0 ? Math.atan2(monsterRadius, dist) : Math.PI;
            if (Math.abs(angleDiff) <= halfAngle + angleOffset) {
                hitMonsters.push(monster.id);
            }
        }

        // 繪製扇形邊緣線
        this.call('drawSectorEdge', targetAngle, range, halfAngle, skill.definition.color);

        // 繪製打擊區特效
        const flashColor = skill.definition.flashColor || skill.definition.color;
        if (this.showGridSkillEffects) {
            this.call('flashSkillAreaSector', this.characterX, this.characterY, range, targetAngle, halfAngle, flashColor);
        } else {
            const halfAngleDeg = halfAngle * (180 / Math.PI);
            this.call('flashSkillEffectSector', this.characterX, this.characterY, range, targetAngle, halfAngleDeg, flashColor);
        }

        // 對命中的怪物造成傷害
        if (hitMonsters.length > 0) {
            const hitMonstersData = monsters.filter(m => hitMonsters.includes(m.id));
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) {
                this.call('addExp', result.totalExp);
            }

            this.call('shakeScreen', hitMonsters.length);

            // 打擊火花
            for (const m of hitMonstersData) {
                const hitDir = Math.atan2(m.y - this.characterY, m.x - this.characterX);
                this.call('showHitSparkEffect', m.x, m.y, isCrit ? SparkColors.SOUL_RENDER_CRIT : SparkColors.SOUL_RENDER, hitDir, 4);
            }
        }
    }

    /**
     * 靈魂渲染 MAX：三向衝擊波
     */
    private triggerSoulRenderTripleWave(skill: PlayerSkill): void {
        // 暫時委託給 MainScene
        this.call('triggerSoulRenderTripleWave', skill);
    }

    /**
     * 工程師：圓形範圍傷害
     * 起始範圍 3 單位，每級 +0.5 單位（Lv.0=3單位，Lv.5=5.5單位）
     * 起始傷害 2 單位，每級 +2 單位（Lv.0=2單位，Lv.5=12單位）
     */
    public activateCoder(skill: PlayerSkill): void {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 1 單位 = 畫面高度 10%
        const unitSize = this.gameBounds.height * 0.1;

        // 範圍：3 單位 + 每級 0.5 單位（Lv.0=3單位，Lv.5=5.5單位）
        const rangeUnits = 3 + skill.level * 0.5;
        const range = unitSize * rangeUnits;

        // 傷害：2 單位 + 每級 2 單位（Lv.0=2單位，Lv.5=12單位）+ 進階技能等級加成
        const advancedBonus = this.skillManager.getAdvancedSkillBonusForActiveSkill(skill.definition.id);
        const damageUnits = (1 + skill.level) * 2 + advancedBonus;
        const baseDamage = DAMAGE_UNIT * damageUnits;
        const { damage: finalDamage } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        // 檢查哪些怪物在範圍內
        const hitMonsters: number[] = [];
        for (const monster of monsters) {
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;
            const dx = monster.x - this.characterX;
            const dy = monster.y - this.characterY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist - monsterRadius <= range) {
                hitMonsters.push(monster.id);
            }
        }

        // 繪製圓形邊緣線
        this.call('drawCircleEdge', range, skill.definition.color);

        // 繪製打擊區特效
        const flashColor = skill.definition.flashColor || skill.definition.color;
        if (this.showGridSkillEffects) {
            this.call('flashSkillAreaCircle', this.characterX, this.characterY, range, flashColor);
        } else {
            this.call('flashSkillEffectCircle', this.characterX, this.characterY, range, flashColor);
        }

        // 對命中的怪物造成傷害
        if (hitMonsters.length > 0) {
            const hitMonstersData = monsters.filter(m => hitMonsters.includes(m.id));
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) {
                this.call('addExp', result.totalExp);
            }

            this.call('shakeScreen', hitMonsters.length);

            // 爆炸火花（紫色，圓形擴散效果）
            for (const m of hitMonstersData) {
                const screenPos = this.call('worldToScreen', m.x, m.y);
                this.call('showExplosionSparkEffect', screenPos.x, screenPos.y, 0xaa66ff, 0.8);
            }

            // MAX 後額外能力：爆發（從擊殺位置再次發動）
            const burstChance = this.skillManager.getCoderBurstChance(this.currentLevel);
            if (burstChance > 0 && result.killedPositions.length > 0) {
                this.call('triggerCoderBurst', result.killedPositions, range, finalDamage, skill, burstChance);
            }
        }
    }

    /**
     * 視效師：投射貫穿光束，對直線 10 單位範圍敵人造成傷害
     * 每級多發射一道隨機方向的光束（Lv.0=1道，Lv.5=6道）
     * 傷害：1 單位 + 每級 1 單位（Lv.0=1單位，Lv.5=6單位）
     */
    public activateVfx(skill: PlayerSkill): void {
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

        // 傷害：1 單位 + 每級 1 單位（Lv.0=1單位，Lv.5=6單位）+ 進階技能等級加成
        const advancedBonus = this.skillManager.getAdvancedSkillBonusForActiveSkill(skill.definition.id);
        const damageUnits = 1 + skill.level + advancedBonus;
        const baseDamage = DAMAGE_UNIT * damageUnits;
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
            this.call('drawBeamEdge', targetAngle, range, beamWidth, skill.definition.color);

            // 繪製光束特效
            const endX = this.characterX + Math.cos(targetAngle) * range;
            const endY = this.characterY + Math.sin(targetAngle) * range;
            const beamFlashColor = skill.definition.flashColor || skill.definition.color;
            if (this.showGridSkillEffects) {
                this.call('flashSkillAreaLine', this.characterX, this.characterY, endX, endY, beamWidth, beamFlashColor);
            } else {
                this.call('flashSkillEffectLine', this.characterX, this.characterY, endX, endY, beamWidth, beamFlashColor);
            }
        }

        // 更新角色面向（朝第一道光束方向）
        if (targetAngles.length > 0) {
            this.scene.setFacingRight(Math.cos(targetAngles[0]) >= 0);
        }

        // 對命中的怪物造成傷害
        const hitMonsterIds = Array.from(allHitMonsters);
        if (hitMonsterIds.length > 0) {
            const hitMonstersData = monsters.filter(m => hitMonsterIds.includes(m.id));
            const hitPositions = hitMonstersData.map(m => ({ x: m.x, y: m.y }));

            const result = this.monsterManager.damageMonsters(hitMonsterIds, finalDamage);
            if (result.totalExp > 0) {
                this.call('addExp', result.totalExp);
            }

            this.call('shakeScreen', hitMonsterIds.length);

            // 打擊火花（綠色，爆擊更亮，5 條，光束方向）
            for (const m of hitMonstersData) {
                const hitDir = Math.atan2(m.y - this.characterY, m.x - this.characterX);
                this.call('showHitSparkEffect', m.x, m.y, isCrit ? SparkColors.VFX_SNIPE_CRIT : SparkColors.VFX_SNIPE, hitDir, 5);
            }

            // MAX 後額外能力：連鎖（再發射一次）
            const chainChance = this.skillManager.getVfxChainChance(this.currentLevel);
            if (chainChance > 0 && hitPositions.length > 0) {
                this.call('triggerVfxChain', hitPositions, finalDamage, chainChance, skill, isCrit);
            }
        }
    }

    /**
     * 架構師：產生護盾，護盾吸收傷害並反傷給攻擊者
     * 反傷傷害：2/4/6/8/10/20（Lv.0~5），擊退只有 MAX 才有
     * MAX 額外能力：八角爆盾 - 護盾殘值×10 傷害、4 單位範圍爆炸並擊退
     */
    public activateArchitect(skill: PlayerSkill): void {
        // 記錄技能等級（用於反傷擊退判斷）
        this.scene.setArchitectSkillLevel(skill.level);

        // MAX 後額外能力：八角爆盾 - 護盾有殘值時觸發爆炸
        const explosionChance = this.skillManager.getArchitectExplosionChance(this.currentLevel);
        if (explosionChance > 0 && this.scene.getCurrentShield() > 0) {
            this.call('triggerShieldExplosion', skill);
        }

        // 絕對邏輯防禦：護盾重新填充時，剩餘輪鋸向外飛出
        const sawBladePositions = this.scene.getCurrentSawBladePositions();
        if (sawBladePositions && sawBladePositions.length > 0) {
            this.call('launchSawBladesOutward');
        }

        // 護盾值為最大 HP 的 30%
        const maxHp = this.scene.getMaxHp();
        const shieldAmount = Math.floor(maxHp * 0.3);

        // 設定護盾值（不疊加，直接設定）
        this.scene.setCurrentShield(shieldAmount);
        this.scene.setMaxShield(shieldAmount);

        // 反傷傷害：2/4/6/8/10/20（Lv.0=2, Lv.5=20）+ 進階技能等級加成
        const reflectDamageTable = [2, 4, 6, 8, 10, 20];
        const advancedBonus = this.skillManager.getAdvancedSkillBonusForActiveSkill(skill.definition.id);
        const reflectUnits = (reflectDamageTable[skill.level] || 2) + advancedBonus;
        this.scene.setShieldReflectDamage(DAMAGE_UNIT * reflectUnits);

        // 繪製護盾條
        this.call('drawShieldBarFill');

        // 繪製護盾特效（使用護盾圖片）
        const shieldRadius = this.gameBounds.height * 0.18;
        const shieldFlashColor = skill.definition.flashColor || skill.definition.color;
        this.call('flashShieldEffect', this.characterX, this.characterY, shieldRadius, shieldFlashColor);

        // 地面文字金色呼吸掃光
        this.call('triggerShieldBreathScan');
    }

    // ==================== 進階技能（委託給 MainScene）====================

    /**
     * 燃燒賽璐珞：消耗 10 HP，7 單位距離 30° 扇形旋轉一圈攻擊
     * 傷害單位 = 角色等級 + 技能等級
     * 燃燒機率：10% + 每級 1%
     */
    public executeBurningCelluloid(skillLevel: number): void {
        // 消耗 10 HP
        const hpCost = 10;
        const currentHp = this.scene.getCurrentHp();
        if (currentHp > hpCost) {
            this.scene.setCurrentHp(currentHp - hpCost);
            this.call('drawHpBarFill');
            this.call('updateHpText');
            // 顯示 HP 消耗效果（角色閃紅）
            const character = this.scene.getCharacter();
            character.setTint(0xff6600);
            this.scene.getTime().delayedCall(100, () => {
                character.clearTint();
            });
        } else {
            return; // HP 不足
        }

        // 傷害單位 = 角色等級 + 技能等級
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = DAMAGE_UNIT * damageUnits;
        const range = this.gameBounds.height * 0.7; // 7 單位距離
        const sectorAngle = 30;
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
            this.scene.setFacingRight(Math.cos(startAngle) >= 0);
        }

        // 旋轉一圈 = 12 次 30° 扇形攻擊
        const rotationSteps = 12;
        const rotationDuration = 600;
        const stepDelay = rotationDuration / rotationSteps;
        const hitMonsterSet = new Set<number>();
        const time = this.scene.getTime();

        for (let i = 0; i < rotationSteps; i++) {
            time.delayedCall(i * stepDelay, () => {
                const currentAngle = startAngle + (i / rotationSteps) * Math.PI * 2;
                const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

                const monsters = this.monsterManager.getMonsters();
                const hitMonsters: number[] = [];
                const hitPositions: { x: number; y: number }[] = [];

                for (const monster of monsters) {
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
                    if (result.totalExp > 0) this.call('addExp', result.totalExp);

                    for (const pos of hitPositions) {
                        this.call('showHitSparkEffect', pos.x, pos.y, isCrit ? SparkColors.CELLULOID_CRIT : SparkColors.CELLULOID, currentAngle);
                    }

                    // 燃燒機率：10% + 每級 1%
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

                this.call('flashSlashEffect', this.characterX, this.characterY, range, currentAngle, 0xff6600);
            });
        }

        // 震動效果
        time.delayedCall(rotationDuration, () => {
            this.call('shakeScreen', hitMonsterSet.size);
        });
    }

    /**
     * 技術美術大神：在角色周圍 5 單位隨機地點射下光線
     * 0.5 秒內連發 5 道光線，3 單位爆炸範圍，命中敵人癱瘓 1 秒
     * 傷害單位 = 角色等級 + 技能等級
     */
    public executeTechArtist(skillLevel: number): void {
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = DAMAGE_UNIT * damageUnits;

        const unitSize = this.gameBounds.height / 10;
        const spawnRadiusUnits = 5;
        const explosionRadiusUnits = 3;
        const stunDuration = 1000;
        const beamCount = 5;
        const burstDuration = 500; // 0.5 秒內發射完畢
        const beamInterval = burstDuration / beamCount; // 每發間隔 100ms

        const techArtistColor = SparkColors.TECH_ARTIST;
        const explosionRadiusPx = explosionRadiusUnits * unitSize;
        const time = this.scene.getTime();

        for (let i = 0; i < beamCount; i++) {
            time.delayedCall(i * beamInterval, () => {
                // 每發隨機選擇落點
                const randomAngle = Math.random() * Math.PI * 2;
                const randomDist = Math.random() * spawnRadiusUnits * unitSize;
                const targetX = this.characterX + Math.cos(randomAngle) * randomDist;
                const targetY = this.characterY + Math.sin(randomAngle) * randomDist;

                // 計算光束角度
                const beamOffsetX = (Math.random() - 0.5) * 2 * unitSize;
                const targetScreen = this.call('worldToScreen', targetX, targetY);
                const beamAngle = -Math.PI / 2 - Math.atan2(beamOffsetX, targetScreen.y + 50);

                this.call('showLightBeamEffect', targetX, targetY, explosionRadiusPx, techArtistColor, beamOffsetX);

                // 延遲 200ms 後造成傷害
                time.delayedCall(200, () => {
                    const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

                    const monsters = this.monsterManager.getMonsters();
                    const hitMonsters: number[] = [];
                    const hitPositions: { x: number; y: number }[] = [];

                    for (const monster of monsters) {
                        const dx = monster.x - targetX;
                        const dy = monster.y - targetY;
                        const distPixels = Math.sqrt(dx * dx + dy * dy);
                        const distUnits = distPixels / unitSize;
                        const monsterRadiusUnits = monster.definition.size * 0.5;

                        if (distUnits - monsterRadiusUnits <= explosionRadiusUnits) {
                            hitMonsters.push(monster.id);
                            hitPositions.push({ x: monster.x, y: monster.y });
                        }
                    }

                    if (hitMonsters.length > 0) {
                        this.monsterManager.stunMonsters(hitMonsters, stunDuration);
                        const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
                        if (result.totalExp > 0) this.call('addExp', result.totalExp);

                        for (const pos of hitPositions) {
                            const screenPos = this.call('worldToScreen', pos.x, pos.y);
                            this.call('showExplosionSparkEffect', screenPos.x, screenPos.y, isCrit ? SparkColors.TECH_ARTIST_CRIT : SparkColors.TECH_ARTIST, 1.0);
                        }

                        this.call('shakeScreen', hitMonsters.length);
                    }

                    this.call('showExplosionEffect', targetX, targetY, explosionRadiusPx, techArtistColor, beamAngle, isCrit);
                });
            });
        }
    }

    /** 絕對邏輯防禦：有護盾時產生繞角色旋轉的輪鋸（最多8個） */
    public executeAbsoluteDefense(skillLevel: number): void {
        const currentShield = this.scene.getCurrentShield();
        const maxShield = this.scene.getMaxShield();

        // 只在有護盾時才發動
        if (currentShield <= 0) {
            this.call('hideSawBlades');
            return;
        }

        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = DAMAGE_UNIT * damageUnits;

        // 範圍參數（世界單位）
        const unitSize = this.gameBounds.height / 10;
        const orbitRadiusUnits = 2;
        const bladeRadiusUnits = 0.5;
        const orbitRadius = orbitRadiusUnits * unitSize;
        const bladeRadius = bladeRadiusUnits * unitSize;

        // 輪鋸數量：基本 3 個，每 5 技能等級 +1，最多 8 個
        const maxBladeCount = 8;
        const bladeCount = Math.min(maxBladeCount, 3 + Math.floor(skillLevel / 5));

        // 固定轉速：2 秒一圈
        const rotationTime = 2000;
        const angularSpeed = (Math.PI * 2) / rotationTime;

        // 更新輪鋸公轉角度
        const deltaAngle = angularSpeed * 100;
        this.sawBladeAngle += deltaAngle;
        if (this.sawBladeAngle > Math.PI * 2) {
            this.sawBladeAngle -= Math.PI * 2;
        }

        // 計算護盾相關加成
        const shieldPercent = maxShield > 0 ? currentShield / maxShield : 0;
        const lostShieldPercent = 1 - shieldPercent;
        const critChance = shieldPercent;
        const damageMultiplier = 1 + lostShieldPercent * 10;

        // 計算最終傷害
        const isCrit = Math.random() < critChance;
        let finalDamage = Math.floor(baseDamage * damageMultiplier);
        if (isCrit) {
            finalDamage = Math.floor(finalDamage * 1.5);
        }

        // 輪鋸等距分布
        const bladePositions: { x: number; y: number }[] = [];
        for (let i = 0; i < bladeCount; i++) {
            const angle = this.sawBladeAngle + (i / bladeCount) * Math.PI * 2;
            const bladeX = this.characterX + Math.cos(angle) * orbitRadius;
            const bladeY = this.characterY + Math.sin(angle) * orbitRadius;
            bladePositions.push({ x: bladeX, y: bladeY });
        }

        // 檢測輪鋸範圍內的怪物
        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];
        const hitPositions: { x: number; y: number }[] = [];
        const now = Date.now();
        const hitCooldown = 500;

        for (const monster of monsters) {
            for (const bladePos of bladePositions) {
                const dx = monster.x - bladePos.x;
                const dy = monster.y - bladePos.y;
                const distPixels = Math.sqrt(dx * dx + dy * dy);
                const distUnits = distPixels / unitSize;
                const monsterRadiusUnits = monster.definition.size * 0.5;

                if (distUnits - monsterRadiusUnits <= bladeRadiusUnits) {
                    const lastHit = this.sawBladeLastHitTime.get(monster.id) || 0;
                    if (now - lastHit >= hitCooldown) {
                        hitMonsters.push(monster.id);
                        hitPositions.push({ x: monster.x, y: monster.y });
                        this.sawBladeLastHitTime.set(monster.id, now);
                        break;
                    }
                }
            }
        }

        if (hitMonsters.length > 0) {
            // 先擊退
            const knockbackDistance = this.gameBounds.height * 0.1;
            this.monsterManager.knockbackMonsters(hitMonsters, this.characterX, this.characterY, knockbackDistance);

            // 再造成傷害
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.call('addExp', result.totalExp);

            // 每次命中消耗/回復護盾
            let costRate = 0.01;
            if (bladeCount >= maxBladeCount) {
                const levelsAbove25 = skillLevel - 25;
                costRate = 0.01 - levelsAbove25 * 0.001;
            }
            const shieldChangePerHit = Math.ceil(maxShield * Math.abs(costRate));
            const totalChange = shieldChangePerHit * hitMonsters.length;
            let newShield = currentShield;
            if (costRate >= 0) {
                newShield = Math.max(0, currentShield - totalChange);
            } else {
                newShield = Math.min(maxShield, currentShield + totalChange);
            }
            this.scene.setCurrentShield(newShield);
            this.call('drawShieldBarFill');
        }

        // 繪製輪鋸視覺效果
        this.call('drawSawBladesWithParams', {
            bladePositions,
            bladeRadius,
            hitPositions,
            isCrit
        });

        // 儲存當前輪鋸位置（用於護盾填充時飛出）
        this.call('setCurrentSawBladePositions', bladePositions);
        this.call('setSawBladeRadius', bladeRadius);
    }

    /** 執行飛行輪鋸命中傷害 */
    public performSawBladeHit(
        monsterId: number,
        monsterX: number,
        monsterY: number,
        baseDamage: number,
        knockbackOriginX: number,
        knockbackOriginY: number
    ): { isCrit: boolean } {
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);
        const result = this.monsterManager.damageMonsters([monsterId], finalDamage);
        if (result.totalExp > 0) this.call('addExp', result.totalExp);

        // 擊退（1 單位）
        const knockbackDistance = this.gameBounds.height * 0.1;
        this.monsterManager.knockbackMonsters([monsterId], knockbackOriginX, knockbackOriginY, knockbackDistance);

        // 輪鋸火花效果
        this.call('showHitSparkEffect', monsterX, monsterY, isCrit ? SparkColors.SAWBLADE_CRIT : SparkColors.SAWBLADE);

        return { isCrit };
    }

    /** 完美像素審判：井字線 + 四焦點隨機輪流爆炸 */
    public executePerfectPixel(skillLevel: number): void {
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = DAMAGE_UNIT * damageUnits;

        // 計算井字線位置（畫面 1/3 和 2/3 處）
        const x1 = this.gameBounds.x + this.gameBounds.width / 3;
        const x2 = this.gameBounds.x + this.gameBounds.width * 2 / 3;
        const y1 = this.gameBounds.y + this.gameBounds.height / 3;
        const y2 = this.gameBounds.y + this.gameBounds.height * 2 / 3;

        // 四個焦點位置（井字線交叉點）
        const focusPoints = [
            { x: x1, y: y1 }, // 左上
            { x: x2, y: y1 }, // 右上
            { x: x1, y: y2 }, // 左下
            { x: x2, y: y2 }  // 右下
        ];

        // 爆炸範圍
        const explosionRadius = this.gameBounds.height * 0.3;
        const unitSize = this.gameBounds.height / 10;
        const explosionRadiusUnits = 3;

        // 隨機打亂四個焦點的順序
        const shuffledIndices = [0, 1, 2, 3];
        for (let i = shuffledIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
        }

        // 傳遞所有參數給 MainScene 處理時序
        this.call('startPerfectPixelSequence', {
            focusPoints,
            shuffledIndices,
            baseDamage,
            explosionRadius,
            unitSize,
            explosionRadiusUnits
        });
    }

    /** 執行單次完美像素爆炸（傷害邏輯） */
    public performPerfectPixelExplosion(
        focusX: number,
        focusY: number,
        baseDamage: number,
        unitSize: number,
        explosionRadiusUnits: number
    ): { hitMonsters: number[]; isCrit: boolean; finalDamage: number } {
        // 轉換螢幕座標到世界座標
        const worldX = focusX + this.cameraOffsetX - this.gameBounds.x;
        const worldY = focusY + this.cameraOffsetY - this.gameBounds.y;

        // 計算傷害（暴擊獨立計算）
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        // 檢測爆炸範圍內的怪物
        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];

        for (const monster of monsters) {
            const dx = monster.x - worldX;
            const dy = monster.y - worldY;
            const distPixels = Math.sqrt(dx * dx + dy * dy);
            const distUnits = distPixels / unitSize;
            const monsterRadiusUnits = monster.definition.size * 0.5;

            if (distUnits - monsterRadiusUnits <= explosionRadiusUnits) {
                hitMonsters.push(monster.id);
            }
        }

        if (hitMonsters.length > 0) {
            // 先暈眩（1秒），再造成傷害
            this.monsterManager.stunMonsters(hitMonsters, 1000);
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.call('addExp', result.totalExp);
        }

        return { hitMonsters, isCrit, finalDamage };
    }

    /** 疾光爆發：2秒內發射30枚追蹤導彈 */
    public executeVfxBurst(skillLevel: number): void {
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = DAMAGE_UNIT * damageUnits;

        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 傳遞參數給 MainScene 處理導彈發射時序
        this.call('startVfxBurstSequence', {
            baseDamage,
            skillLevel,
            characterX: this.characterX,
            characterY: this.characterY
        });
    }

    /** 選擇導彈目標（最近5隻中隨機一隻） */
    public selectMissileTarget(): number | null {
        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return null;

        // 計算所有怪物距離並排序
        const monstersWithDist = monsters.map(monster => {
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
        return nearestMonsters[targetIndex].monster.id;
    }

    /** 執行導彈命中傷害（直擊 + 範圍爆炸 + 燃燒） */
    public performMissileHit(
        targetId: number,
        missileX: number,
        missileY: number,
        baseDamage: number,
        skillLevel: number
    ): { hitMonsterIds: number[]; isCrit: boolean } {
        const unitSize = this.gameBounds.height / 10;
        const monsters = this.monsterManager.getMonsters();
        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        // 第一段：命中目標傷害
        const hitTarget = monsters.find(m => m.id === targetId);
        if (hitTarget) {
            const result = this.monsterManager.damageMonsters([hitTarget.id], finalDamage);
            if (result.totalExp > 0) this.call('addExp', result.totalExp);

            // 燃燒 DOT 機率觸發（技能等級%）
            const burnChance = skillLevel * 0.01;
            if (Math.random() < burnChance) {
                const burnDamage = Math.floor(baseDamage * 0.2);
                this.monsterManager.burnMonsters([hitTarget.id], 5000, burnDamage);
            }
        }

        // 第二段：3 單位範圍爆炸傷害
        const explosionRadius = 3;
        const hitMonsterIds: number[] = [];

        // 將導彈螢幕座標轉換為世界座標
        const missileWorldX = missileX + this.cameraOffsetX - this.gameBounds.x;
        const missileWorldY = missileY + this.cameraOffsetY - this.gameBounds.y;

        for (const monster of monsters) {
            const dx = monster.x - missileWorldX;
            const dy = monster.y - missileWorldY;
            const distUnits = Math.sqrt(dx * dx + dy * dy) / unitSize;
            if (distUnits <= explosionRadius) {
                hitMonsterIds.push(monster.id);
            }
        }

        if (hitMonsterIds.length > 0) {
            const result = this.monsterManager.damageMonsters(hitMonsterIds, finalDamage);
            if (result.totalExp > 0) this.call('addExp', result.totalExp);

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
        }

        return { hitMonsterIds, isCrit };
    }

    /** 次元向量疾劃：朝最近敵人揮出貫穿全螢幕的直線斬擊 */
    public executeSoulSlash(skillLevel: number): void {
        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = DAMAGE_UNIT * damageUnits;

        const monsters = this.monsterManager.getMonsters();
        if (monsters.length === 0) return;

        // 找最近的敵人
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

        // 計算斬擊方向
        const dx = nearestMonster.x - this.characterX;
        const dy = nearestMonster.y - this.characterY;
        const angle = Math.atan2(dy, dx);

        this.performSoulSlash(this.characterX, this.characterY, angle, baseDamage, skillLevel, false);
    }

    /** 執行單次斬擊（可遞迴觸發連鎖） */
    private performSoulSlash(originX: number, originY: number, angle: number, baseDamage: number, skillLevel: number, isChain: boolean): void {
        const maxDist = Math.max(this.gameBounds.width, this.gameBounds.height) * 2;
        const startX = originX - Math.cos(angle) * maxDist;
        const startY = originY - Math.sin(angle) * maxDist;
        const endX = originX + Math.cos(angle) * maxDist;
        const endY = originY + Math.sin(angle) * maxDist;

        // 繪製斬擊線視覺效果
        if (isChain) {
            this.call('drawChainSlashEffect', startX, startY, endX, endY, angle, originX, originY);
        } else {
            this.call('drawSoulSlashEffect', startX, startY, endX, endY, angle, originX, originY);
        }

        // 檢測斬擊線上的所有怪物
        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];
        const hitPositions: { x: number; y: number }[] = [];
        const slashWidth = this.gameBounds.height * 0.05;

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

        if (hitMonsters.length > 0) {
            const critChance = this.skillManager.getCritChance(this.currentLevel);
            const isCrit = Math.random() < critChance;
            const critMultiplier = isCrit ? 3.0 : 1.0;
            const finalDamage = Math.floor(baseDamage * critMultiplier);
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.call('addExp', result.totalExp);

            // 打擊火花
            for (const pos of hitPositions) {
                this.call('showHitSparkEffect', pos.x, pos.y, isCrit ? SparkColors.SOUL_SLASH_CRIT : SparkColors.SOUL_SLASH, angle);
            }

            // 連鎖斬擊機率：10% 基礎 + 每級 1%
            if (!isChain) {
                const chainChance = 0.10 + skillLevel * 0.01;
                for (const hitPos of hitPositions) {
                    if (Math.random() < chainChance) {
                        const offsetDeg = 30 + Math.random() * 30;
                        const offsetRad = offsetDeg * Math.PI / 180;
                        const newAngle = angle + (Math.random() < 0.5 ? offsetRad : -offsetRad);
                        this.performSoulSlash(hitPos.x, hitPos.y, newAngle, baseDamage * 2, skillLevel, true);
                    }
                }
            }
        }
    }

    /** 計算點到線段的距離 */
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
            xx = x1; yy = y1;
        } else if (param > 1) {
            xx = x2; yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const ddx = px - xx;
        const ddy = py - yy;
        return Math.sqrt(ddx * ddx + ddy * ddy);
    }

    /** 零信任邊界：啟用結界 */
    public activateZeroTrust(_skillLevel: number): void {
        if (this.scene.getZeroTrustActive()) return;
        this.scene.setZeroTrustActive(true);

        const unitSize = this.gameBounds.height / 10;
        const radius = 5; // 5 單位半徑
        const radiusPx = radius * unitSize;

        // 建立護盾 Sprite
        this.call('createZeroTrustShieldSprite');

        // 建立 8 個光點
        for (let i = 0; i < 8; i++) {
            this.call('createZeroTrustPoint', i, radiusPx);
        }

        // 設定減速區域（5 單位半徑，速度減半）
        this.monsterManager.setSlowZone(this.characterX, this.characterY, 5, 0.5);
    }

    // ==================== 分身系統 ====================

    /** 幻影迭代：召喚分身（最多 3 個，滿 3 個後啟動咒言圈） */
    public executePhantomIteration(skillLevel: number): void {
        // 如果已有 3 個分身，啟動每個分身的跟隨咒言圈
        if (this.scene.getPhantomCount() >= this.scene.getPhantomMaxCount()) {
            this.activatePhantomFollowingCurseCircles(skillLevel);
            return;
        }

        // 建立新分身
        this.call('createPhantom', skillLevel);
    }

    /**
     * 在指定位置執行分身技能
     * 分身可施放：燃燒賽璐珞、技術美術大神、像素審判
     */
    public executePhantomSkillAt(skillId: string, skillLevel: number, phantomX: number, phantomY: number): void {
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const level = equipped ? equipped.level : skillLevel;

        const damageUnits = this.currentLevel + level;
        const baseDamage = DAMAGE_UNIT * damageUnits;

        // 顯示分身施放特效
        this.call('showPhantomCastEffectAt', phantomX, phantomY);

        switch (skillId) {
            case 'advanced_burning_celluloid':
                this.call('startPhantomBurningCelluloid', { baseDamage, phantomX, phantomY, skillLevel: level });
                break;
            case 'advanced_tech_artist':
                this.call('startPhantomTechArtist', { baseDamage, phantomX, phantomY });
                break;
            case 'advanced_perfect_pixel':
                this.call('startPhantomPerfectPixel', { baseDamage, phantomX, phantomY });
                break;
        }
    }

    /** 分身燃燒賽璐珞 - 單步傷害邏輯 */
    public performPhantomBurningCelluloidStep(
        phantomX: number, phantomY: number, targetAngle: number,
        range: number, halfAngle: number, baseDamage: number, skillLevel: number
    ): number[] {
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
            if (result.totalExp > 0) this.call('addExp', result.totalExp);

            // 燃燒機率：10% + 每級 1%
            const burnChance = 0.10 + skillLevel * 0.01;
            const burnDamage = Math.floor(baseDamage * 0.2);
            const monstersToBurn: number[] = [];

            for (const monsterId of hitMonsters) {
                if (Math.random() < burnChance) {
                    monstersToBurn.push(monsterId);
                }
            }

            if (monstersToBurn.length > 0) {
                this.monsterManager.burnMonsters(monstersToBurn, 5000, burnDamage);
            }
        }

        return hitMonsters;
    }

    /** 分身技術美術 - 單發傷害邏輯 */
    public performPhantomTechArtistHit(
        targetX: number, targetY: number, explosionRadius: number, baseDamage: number
    ): { hitMonsters: number[]; isCrit: boolean } {
        const unitSize = this.gameBounds.height / 10;
        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];

        for (const monster of monsters) {
            const dx = monster.x - targetX;
            const dy = monster.y - targetY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const monsterRadius = unitSize * monster.definition.size * 0.5;

            if (dist - monsterRadius <= explosionRadius) {
                hitMonsters.push(monster.id);
            }
        }

        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        if (hitMonsters.length > 0) {
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.call('addExp', result.totalExp);
        }

        return { hitMonsters, isCrit };
    }

    /** 分身完美像素 - 單次爆炸傷害邏輯 */
    public performPhantomPerfectPixelExplosion(
        focusX: number, focusY: number, baseDamage: number, explosionRadiusUnits: number
    ): { hitMonsters: number[]; isCrit: boolean } {
        const unitSize = this.gameBounds.height / 10;
        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];

        for (const monster of monsters) {
            const dx = monster.x - focusX;
            const dy = monster.y - focusY;
            const distPixels = Math.sqrt(dx * dx + dy * dy);
            const distUnits = distPixels / unitSize;
            const monsterRadiusUnits = monster.definition.size * 0.5;

            if (distUnits - monsterRadiusUnits <= explosionRadiusUnits) {
                hitMonsters.push(monster.id);
            }
        }

        const { damage: finalDamage, isCrit } = this.skillManager.calculateFinalDamageWithCrit(baseDamage, this.currentLevel);

        if (hitMonsters.length > 0) {
            this.monsterManager.stunMonsters(hitMonsters, 500); // 分身版暈眩 0.5 秒
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.call('addExp', result.totalExp);
        }

        return { hitMonsters, isCrit };
    }

    /** 分身跟隨咒言圈：計算傷害並啟動視覺效果 */
    public activatePhantomFollowingCurseCircles(skillLevel: number): void {
        const equipped = this.skillManager.getEquippedAdvancedSkill();
        const level = equipped ? equipped.level : skillLevel;
        const damageUnits = this.currentLevel + level;
        const baseDamage = DAMAGE_UNIT * damageUnits;

        // 啟動視覺效果
        this.call('startPhantomCurseCircles', baseDamage, level);
    }

    /** 咒言圈傷害邏輯 - 每 0.2 秒造成一次傷害 */
    public performCurseCircleDamage(
        centerX: number,
        centerY: number,
        radius: number,
        baseDamage: number,
        skillLevel: number
    ): { hitMonsters: number[] } {
        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];

        for (const monster of monsters) {
            const dx = monster.x - centerX;
            const dy = monster.y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const monsterRadius = this.gameBounds.height * monster.definition.size * 0.5;

            if (dist - monsterRadius <= radius) {
                hitMonsters.push(monster.id);
            }
        }

        if (hitMonsters.length > 0) {
            // 咒言圈傷害減半
            const halfDamage = Math.floor(baseDamage * 0.5);
            const { damage: finalDamage } = this.skillManager.calculateFinalDamageWithCrit(halfDamage, this.currentLevel);
            const result = this.monsterManager.damageMonsters(hitMonsters, finalDamage);
            if (result.totalExp > 0) this.call('addExp', result.totalExp);

            // 燃燒 DOT 機率觸發（與燃燒賽璐珞相同：10% + 每級 1%）
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

        return { hitMonsters };
    }

    /** 零信任光點傷害邏輯 - 每 0.5 秒造成範圍傷害 */
    public performZeroTrustPointDamage(
        pointX: number,
        pointY: number,
        beamMultiplier: number,
        skillLevel: number
    ): { hitMonsters: number[]; isCrit: boolean; killCount: number; shouldResetShield: boolean } {
        const unitSize = this.gameBounds.height / 10;
        const baseDamageRadius = 1; // 基礎 1 單位傷害範圍
        const actualDamageRadius = baseDamageRadius + (beamMultiplier - 1) * 0.5; // 每倍 +0.5 單位
        const damageRadiusPx = actualDamageRadius * unitSize;

        const damageUnits = this.currentLevel + skillLevel;
        const baseDamage = DAMAGE_UNIT * damageUnits;

        const monsters = this.monsterManager.getMonsters();
        const hitMonsters: number[] = [];

        for (const monster of monsters) {
            const dx = monster.x - pointX;
            const dy = monster.y - pointY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= damageRadiusPx) {
                hitMonsters.push(monster.id);
            }
        }

        let isCrit = false;
        let killCount = 0;
        let shouldResetShield = false;

        if (hitMonsters.length > 0) {
            // 傷害加成：每秒 +技能等級% 傷害
            const damageBonus = (beamMultiplier - 1) * skillLevel * 0.01;
            const boostedDamage = Math.floor(baseDamage * (1 + damageBonus));
            const critResult = this.skillManager.calculateFinalDamageWithCrit(boostedDamage, this.currentLevel);
            isCrit = critResult.isCrit;
            const result = this.monsterManager.damageMonsters(hitMonsters, critResult.damage);
            if (result.totalExp > 0) this.call('addExp', result.totalExp);
            killCount = result.killCount;

            // 在減速範圍內殺死敵人時，機率重置靈魂統領（護盾）冷卻
            // 機率 = 技能等級 × 1%（每擊殺一隻判定一次）
            if (killCount > 0) {
                const resetChance = skillLevel * 0.01;
                for (let i = 0; i < killCount; i++) {
                    if (Math.random() < resetChance) {
                        shouldResetShield = true;
                        break;
                    }
                }
            }
        }

        return { hitMonsters, isCrit, killCount, shouldResetShield };
    }

    /** 解除零信任護盾 */
    public deactivateZeroTrust(): void {
        this.scene.setZeroTrustActive(false);

        // 清理光點和射線
        const points = this.scene.getZeroTrustPoints();
        for (const point of points) {
            point.pointSprite.destroy();
            point.beamSprite.destroy();
        }
        this.scene.clearZeroTrustPoints();
        this.scene.clearZeroTrustTrackedMonsters();

        // 清理八角矩陣護盾圖
        const sprite = this.scene.getZeroTrustSprite();
        if (sprite) {
            sprite.destroy();
            this.scene.clearZeroTrustSprite();
        }

        // 清除減速區域
        this.monsterManager.clearSlowZone();
    }
}
