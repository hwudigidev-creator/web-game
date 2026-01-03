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

    /** 呼叫 MainScene 的私有方法（暫時方案） */
    private call(method: string, ...args: any[]): any {
        return (this.scene as any)[method](...args);
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

        // 傷害：2 單位 + 每級 1 單位
        const damageUnits = 2 + skill.level;
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

        // 傷害：2 單位 + 每級 2 單位（Lv.0=2單位，Lv.5=12單位）
        const damageUnits = (1 + skill.level) * 2;
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

        // 傷害：1 單位 + 每級 1 單位（Lv.0=1單位，Lv.5=6單位）
        const damageUnits = 1 + skill.level;
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

        // 反傷傷害：2/4/6/8/10/20（Lv.0=2, Lv.5=20）
        const reflectDamageTable = [2, 4, 6, 8, 10, 20];
        const reflectUnits = reflectDamageTable[skill.level] || 2;
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

    // ==================== 進階技能 ====================

    /** 燃燒賽璐珞 */
    public executeBurningCelluloid(_skillLevel: number): void {
        // TODO: 從 MainScene 搬移
    }

    /** 技術美術大神 */
    public executeTechArtist(_skillLevel: number): void {
        // TODO: 從 MainScene 搬移
    }

    /** 絕對邏輯防禦 */
    public executeAbsoluteDefense(_skillLevel: number): void {
        // TODO: 從 MainScene 搬移
    }

    /** 完美像素審判 */
    public executePerfectPixel(_skillLevel: number): void {
        // TODO: 從 MainScene 搬移
    }

    /** 疾光爆發 */
    public executeVfxBurst(_skillLevel: number): void {
        // TODO: 從 MainScene 搬移
    }

    /** 次元向量疾劃 */
    public executeSoulSlash(_skillLevel: number): void {
        // TODO: 從 MainScene 搬移
    }

    /** 零信任邊界 */
    public activateZeroTrust(_skillLevel: number): void {
        // TODO: 從 MainScene 搬移
    }

    // ==================== 分身系統 ====================

    /** 幻影迭代 */
    public executePhantomIteration(_skillLevel: number): void {
        // TODO: 從 MainScene 搬移
    }

    /** 在指定位置執行分身技能 */
    public executePhantomSkillAt(_skillId: string, _skillLevel: number, _phantomX: number, _phantomY: number): void {
        // TODO: 從 MainScene 搬移
    }

    /** 分身跟隨咒言圈 */
    public activatePhantomFollowingCurseCircles(_skillLevel: number): void {
        // TODO: 從 MainScene 搬移
    }
}
