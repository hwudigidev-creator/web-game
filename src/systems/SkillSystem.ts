// 技能類型
export type SkillType = 'active' | 'passive';

// MAX 後額外能力定義
export interface MaxExtraAbility {
    name: string;           // 額外能力名稱
    description: string;    // 描述（包含 {value} 佔位符）
    baseValue: number;      // 基礎數值（42 級時的值）
    perLevel: number;       // 每級增加的數值
    unit: string;           // 單位（如 %、點、秒）
    isPercentage?: boolean; // 是否為百分比（顯示時 *100）
    triggerQuote?: string;  // 觸發時的 CUT IN 訊息
}

// 技能定義（技能庫中的基礎資料）
export interface SkillDefinition {
    id: string;
    name: string;
    subtitle?: string; // 副標題（小字顯示在名稱下方）
    description: string;
    type: SkillType;
    color: number; // 技能顏色
    flashColor?: number; // 發動時的閃光顏色
    cooldown?: number; // 冷卻時間（毫秒）
    maxLevel: number; // 最大等級，預設為 5
    iconPrefix?: string; // 技能圖示前綴（如 'A' 對應 A00.png ~ A05.png）
    levelUpMessages?: string[]; // 每級升級時的自訂描述（索引 0 = Lv.0，索引 5 = Lv.5/MAX）
    levelUpQuotes?: string[]; // 每級升級時的角色對話（CUT IN 大字副標題）
    maxExtraAbility?: MaxExtraAbility; // MAX 後的額外能力
}

// 玩家持有的技能實例
export interface PlayerSkill {
    definition: SkillDefinition;
    level: number; // 0-5，5 為 MAX
}

// 技能庫：4 個攻擊技能 + 4 個被動技能
export const SKILL_LIBRARY: SkillDefinition[] = [
    // 攻擊型技能 (4個)
    {
        id: 'active_soul_render',
        name: '靈魂渲染',
        subtitle: '動畫大師',
        description: '朝最近敵人發射 3 單位扇形攻擊，每級擴大 10°',
        type: 'active',
        color: 0x6699ff, // 藍色
        flashColor: 0x66ccff, // 閃藍光
        cooldown: 1000, // 1 秒
        maxLevel: 5,
        iconPrefix: 'A', // A00.png ~ A05.png
        levelUpMessages: [
            '60° 扇形、2 傷害',
            '70° 扇形、3 傷害',
            '80° 扇形、4 傷害',
            '90° 扇形、5 傷害',
            '100° 扇形、6 傷害',
            '110° 扇形、7 傷害，已達最大等級！'
        ],
        levelUpQuotes: [
            '你練習了繪畫技法，動畫美術的能力提升了', // LV0
            '你習得了分鏡設計，並獲得了動態腳本製作技術', // LV1
            '你增進了手繪動畫和停格動畫的製作技術', // LV2
            '你苦練了3D角色模型和3D場景的設計', // LV3
            '你完全理解了動畫法則，提升了角色動畫的製作精度', // LV4
            '你成為了動畫大師，即將解鎖驚人的能力', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '穿透',
            description: '攻擊後 {value} 機率發射扇形波（每 0.3 秒傷害一次）',
            baseValue: 0,
            perLevel: 0.007, // 每級 +0.7%
            unit: '%',
            isPercentage: true
        }
    },
    {
        id: 'active_coder',
        name: '咒言幻象',
        subtitle: '遊戲先知',
        description: '對周圍 2 單位敵人造成傷害，每級增加 0.5 單位範圍',
        type: 'active',
        color: 0xaa66ff, // 紫色
        flashColor: 0xcc88ff, // 閃紫光
        cooldown: 1500, // 1.5 秒
        maxLevel: 5,
        iconPrefix: 'C', // C00.png ~ C05.png
        levelUpMessages: [
            '2 單位範圍、1 傷害',
            '2.5 單位範圍、2 傷害',
            '3 單位範圍、3 傷害',
            '3.5 單位範圍、4 傷害',
            '4 單位範圍、5 傷害',
            '4.5 單位範圍、6 傷害，已達最大等級！'
        ],
        levelUpQuotes: [
            '你參透了互動設計的原理，同時了解遊戲企劃架構', // LV0
            '你習得動作捕捉的技術，將應用到虛擬實境製作', // LV1
            '你增進了程式設計能力和遊戲引擎的創作能力', // LV2
            '你整合了虛擬網紅製作技術，讓自媒體營銷具爆發力', // LV3
            '你導入了人工智慧協作能力，產能提升了數倍', // LV4
            '你成為了遊戲先知，即將解鎖驚人的能力', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '爆發',
            description: '擊殺時 {value} 機率再發動（可連鎖）',
            baseValue: 0,
            perLevel: 0.01, // 每級 +1%
            unit: '%',
            isPercentage: true
        }
    },
    {
        id: 'active_vfx',
        name: '疾光狙擊',
        subtitle: '超級導演',
        description: '朝隨機敵人發射 10 單位貫穿光束，每級增加 1 道',
        type: 'active',
        color: 0x66ff66, // 綠色
        flashColor: 0x88ff88, // 閃綠光
        cooldown: 2500, // 2.5 秒
        maxLevel: 5,
        iconPrefix: 'B', // B00.png ~ B05.png
        levelUpMessages: [
            '1 道光束、1 傷害',
            '2 道光束、2 傷害',
            '3 道光束、3 傷害',
            '4 道光束、4 傷害',
            '5 道光束、5 傷害',
            '6 道光束、6 傷害，已達最大等級！'
        ],
        levelUpQuotes: [
            '你研究了影像美學，劇本編導的能力提升了', // LV0
            '你習得了動靜態攝影的能力，獲得了畫面控制的技術', // LV1
            '你增進了影片剪輯和動態影像的設計能力', // LV2
            '你苦練了數位成音技術影像獲得更多回饋', // LV3
            '你學會應用特效合成後製提升了影像各種可能性', // LV4
            '你成為了超級導演，即將解鎖驚人的能力', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '連鎖',
            description: '擊中時 {value} 機率產生 X 型射線',
            baseValue: 0,
            perLevel: 0.0005, // 每級 +0.05%
            unit: '%',
            isPercentage: true
        }
    },
    {
        id: 'active_architect',
        name: '靈魂統領',
        subtitle: '架構師',
        description: '產生 30% HP 護盾（霸體）並反傷攻擊者，護盾消失時回復等值 HP',
        type: 'active',
        color: 0xffcc00, // 金色
        flashColor: 0xffdd44, // 閃金光
        cooldown: 10000, // 10 秒
        maxLevel: 5,
        levelUpMessages: [
            '30% HP 護盾、1 反傷',
            '30% HP 護盾、2.5 反傷',
            '30% HP 護盾、4 反傷',
            '30% HP 護盾、5.5 反傷',
            '30% HP 護盾、7 反傷',
            '30% HP 護盾、8.5 反傷，已達最大等級！'
        ],
        maxExtraAbility: {
            name: '堅守',
            description: '護盾覆蓋時 {value} 機率炸開',
            baseValue: 0,
            perLevel: 0.01, // 每級 +1%
            unit: '%',
            isPercentage: true
        }
    },
    // 被動型技能 (4個，但玩家最多持有3個)
    {
        id: 'passive_titanium_liver',
        name: '鈦金屬賽博肝臟',
        description: '提升 10% HP 總量並每 15 秒回復 1% 最大 HP，每級再 +10% HP、回復間隔 -1 秒',
        type: 'passive',
        color: 0xaabbcc, // 銀灰色
        maxLevel: 5,
        iconPrefix: 'P01', // 固定圖示，不隨等級變換
        levelUpMessages: [
            '+10% HP、每 15 秒回血',
            '+20% HP、每 14 秒回血',
            '+30% HP、每 13 秒回血',
            '+40% HP、每 12 秒回血',
            '+50% HP、每 11 秒回血',
            '+60% HP、每 10 秒回血，已達最大等級！'
        ],
        levelUpQuotes: [
            '', // LV0
            '', // LV1
            '', // LV2
            '', // LV3
            '', // LV4
            '千錘百鍊的鈦金肝再也不怕熬夜', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '不死',
            description: '抵銷一次死亡，觸發暗影爆炸',
            triggerQuote: '不知何處湧上的力量將你推回現實...', // 不死觸發時的 CUT IN 訊息
            baseValue: 1, // 固定值：1次復活機會
            perLevel: 0,
            unit: '次',
            isPercentage: false
        }
    },
    {
        id: 'passive_sync_rate',
        name: '精神同步率強化',
        description: '提升 10% 移速、減少 8% 冷卻，每級再疊加',
        type: 'passive',
        color: 0xdd8844, // 暗橘色
        maxLevel: 5,
        iconPrefix: 'P02', // 固定圖示，不隨等級變換
        levelUpMessages: [
            '+10% 移速、-8% 冷卻',
            '+20% 移速、-16% 冷卻',
            '+30% 移速、-24% 冷卻',
            '+40% 移速、-32% 冷卻',
            '+50% 移速、-40% 冷卻',
            '+60% 移速、-48% 冷卻，已達最大等級！'
        ],
        levelUpQuotes: [
            '', // LV0
            '', // LV1
            '', // LV2
            '', // LV3
            '', // LV4
            '你已進入無限心流狀態，感覺身手異常敏捷迅速', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '迅捷',
            description: '閃避機率 +{value}',
            baseValue: 0,
            perLevel: 0.002, // 每級 +0.2%
            unit: '%',
            isPercentage: true
        }
    },
    {
        id: 'passive_retina_module',
        name: '視網膜增強模組',
        description: '提升 30% 經驗取得，每級再 +30%',
        type: 'passive',
        color: 0x992233, // 暗紅色
        maxLevel: 5,
        iconPrefix: 'P03', // 固定圖示，不隨等級變換
        levelUpMessages: [
            '+30% 經驗',
            '+60% 經驗',
            '+90% 經驗',
            '+120% 經驗',
            '+150% 經驗',
            '+180% 經驗，已達最大等級！'
        ],
        levelUpQuotes: [
            '', // LV0
            '', // LV1
            '', // LV2
            '', // LV3
            '', // LV4
            '千錘百鍊的敏銳觀察，再沒什麼看不穿、看不清', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '洞察',
            description: '暴擊率 +{value}',
            baseValue: 0,
            perLevel: 0.005, // 每級 +0.5%
            unit: '%',
            isPercentage: true
        }
    },
    {
        id: 'passive_ai_enhancement',
        name: 'AI賦能強化',
        description: '提升 25% 攻擊、15% 防禦，每級再疊加',
        type: 'passive',
        color: 0x6688aa, // 灰藍色
        maxLevel: 5,
        iconPrefix: 'P04', // 固定圖示，不隨等級變換
        levelUpMessages: [
            '+25% 攻擊、+15% 防禦',
            '+50% 攻擊、+30% 防禦',
            '+75% 攻擊、+45% 防禦',
            '+100% 攻擊、+60% 防禦',
            '+125% 攻擊、+75% 防禦',
            '+150% 攻擊、+90% 防禦，已達最大等級！'
        ],
        levelUpQuotes: [
            '', // LV0
            '', // LV1
            '', // LV2
            '', // LV3
            '', // LV4
            '熟練的AI操作，讓你無論做任何事情效率提高數十倍', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '超載',
            description: '暴擊傷害 +{value}',
            baseValue: 0,
            perLevel: 0.005, // 每級 +0.5%
            unit: '%',
            isPercentage: true
        }
    }
];

// 技能管理系統
export class SkillManager {
    // 玩家擁有的技能（id -> PlayerSkill）
    private playerSkills: Map<string, PlayerSkill> = new Map();

    // 被動技能欄位上限
    private static readonly MAX_PASSIVE_SLOTS = 3;

    // 取得所有攻擊型技能定義
    getActiveSkillDefinitions(): SkillDefinition[] {
        return SKILL_LIBRARY.filter(skill => skill.type === 'active');
    }

    // 取得所有被動型技能定義
    getPassiveSkillDefinitions(): SkillDefinition[] {
        return SKILL_LIBRARY.filter(skill => skill.type === 'passive');
    }

    // 取得玩家的技能
    getPlayerSkill(skillId: string): PlayerSkill | undefined {
        return this.playerSkills.get(skillId);
    }

    // 取得玩家持有的攻擊技能（不按定義順序，按持有順序排列，最多4個）
    getPlayerActiveSkills(): (PlayerSkill | null)[] {
        const ownedActives: PlayerSkill[] = [];
        this.playerSkills.forEach(skill => {
            if (skill.definition.type === 'active') {
                ownedActives.push(skill);
            }
        });

        // 填滿到 4 個欄位
        const result: (PlayerSkill | null)[] = [];
        for (let i = 0; i < 4; i++) {
            result.push(ownedActives[i] || null);
        }
        return result;
    }

    // 取得玩家持有的被動技能（不按定義順序，按持有順序排列，最多3個）
    getPlayerPassiveSkills(): (PlayerSkill | null)[] {
        const ownedPassives: PlayerSkill[] = [];
        this.playerSkills.forEach(skill => {
            if (skill.definition.type === 'passive') {
                ownedPassives.push(skill);
            }
        });

        // 填滿到 3 個欄位
        const result: (PlayerSkill | null)[] = [];
        for (let i = 0; i < SkillManager.MAX_PASSIVE_SLOTS; i++) {
            result.push(ownedPassives[i] || null);
        }
        return result;
    }

    // 取得玩家持有的被動技能數量
    getOwnedPassiveCount(): number {
        let count = 0;
        this.playerSkills.forEach(skill => {
            if (skill.definition.type === 'passive') {
                count++;
            }
        });
        return count;
    }

    // 檢查被動技能欄位是否已滿（3個）
    isPassiveSlotsFull(): boolean {
        return this.getOwnedPassiveCount() >= SkillManager.MAX_PASSIVE_SLOTS;
    }

    // 取得技能等級（未擁有返回 -1）
    getSkillLevel(skillId: string): number {
        const skill = this.playerSkills.get(skillId);
        return skill ? skill.level : -1;
    }

    // 檢查技能是否已滿級
    isSkillMaxLevel(skillId: string): boolean {
        const skill = this.playerSkills.get(skillId);
        if (!skill) return false;
        return skill.level >= skill.definition.maxLevel;
    }

    // 學習或升級技能
    learnOrUpgradeSkill(skillId: string): boolean {
        const definition = SKILL_LIBRARY.find(s => s.id === skillId);
        if (!definition) return false;

        const existingSkill = this.playerSkills.get(skillId);

        if (existingSkill) {
            // 已有技能，嘗試升級
            if (existingSkill.level >= definition.maxLevel) {
                return false; // 已滿級
            }
            existingSkill.level++;
        } else {
            // 新學技能，等級從 0 開始
            this.playerSkills.set(skillId, {
                definition,
                level: 0
            });
        }

        return true;
    }

    // 取得可升級的攻擊技能（未滿級）
    getUpgradeableActiveSkills(): SkillDefinition[] {
        return this.getActiveSkillDefinitions().filter(def => {
            const skill = this.playerSkills.get(def.id);
            // 未擁有或未滿級都可以選
            return !skill || skill.level < def.maxLevel;
        });
    }

    // 取得可升級的被動技能（未滿級）
    // 如果被動欄位已滿（3個），只能選擇已擁有且未滿級的
    getUpgradeablePassiveSkills(): SkillDefinition[] {
        const isSlotsFull = this.isPassiveSlotsFull();

        return this.getPassiveSkillDefinitions().filter(def => {
            const skill = this.playerSkills.get(def.id);

            if (isSlotsFull) {
                // 欄位已滿，只能升級已擁有且未滿級的技能
                return skill && skill.level < def.maxLevel;
            } else {
                // 欄位未滿，未擁有或未滿級都可以選
                return !skill || skill.level < def.maxLevel;
            }
        });
    }

    // 檢查玩家是否擁有任何攻擊技能
    hasAnyActiveSkill(): boolean {
        const activeDefinitions = this.getActiveSkillDefinitions();
        return activeDefinitions.some(def => this.playerSkills.has(def.id));
    }

    // 隨機選取技能選項
    // 第一次選擇：只顯示 3 個攻擊技能（確保有傷害手段）
    // 之後：2 攻擊 + 1 被動
    getRandomSkillOptions(): SkillDefinition[] {
        const upgradeableActive = this.getUpgradeableActiveSkills();
        const upgradeablePassive = this.getUpgradeablePassiveSkills();

        const options: SkillDefinition[] = [];

        // 第一次選擇：固定顯示前 3 個攻擊技能（不隨機）
        if (!this.hasAnyActiveSkill()) {
            for (let i = 0; i < Math.min(3, upgradeableActive.length); i++) {
                options.push(upgradeableActive[i]);
            }
            return options;
        }

        // 之後：隨機選 2 個攻擊技能
        const shuffledActive = this.shuffleArray([...upgradeableActive]);
        for (let i = 0; i < Math.min(2, shuffledActive.length); i++) {
            options.push(shuffledActive[i]);
        }

        // 隨機選 1 個被動技能
        const shuffledPassive = this.shuffleArray([...upgradeablePassive]);
        if (shuffledPassive.length > 0) {
            options.push(shuffledPassive[0]);
        }

        return options;
    }

    // 檢查是否還有可升級的技能
    hasUpgradeableSkills(): boolean {
        return this.getUpgradeableActiveSkills().length > 0 ||
               this.getUpgradeablePassiveSkills().length > 0;
    }

    // Fisher-Yates 洗牌算法
    private shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // 格式化等級顯示
    static formatLevel(level: number, maxLevel: number = 5): string {
        if (level <= 0) return 'Lv.0';
        if (level >= maxLevel) return 'MAX';
        return `Lv.${level}`;
    }

    // ===== 被動技能效果計算 =====

    // 取得鈦金肝的 HP 加成百分比（每級 10%，Lv.0 也有效果）
    getTitaniumLiverHpBonus(): number {
        const skill = this.playerSkills.get('passive_titanium_liver');
        if (!skill) return 0;
        return (skill.level + 1) * 0.10; // Lv.0=10%, Lv.5=60%
    }

    // 取得鈦金肝的 HP 回復間隔（基礎 15 秒，每級 -1 秒）
    // 回傳 0 表示未持有此技能
    getTitaniumLiverRegenInterval(): number {
        const skill = this.playerSkills.get('passive_titanium_liver');
        if (!skill) return 0;
        return (15 - skill.level) * 1000; // Lv.0=15s, Lv.5=10s (毫秒)
    }

    // 檢查是否擁有鈦金肝技能
    hasTitaniumLiver(): boolean {
        return this.playerSkills.has('passive_titanium_liver');
    }

    // 取得精神同步率強化的移動速度加成百分比（每級 10%，Lv.0 也有效果）
    getSyncRateSpeedBonus(): number {
        const skill = this.playerSkills.get('passive_sync_rate');
        if (!skill) return 0;
        return (skill.level + 1) * 0.10; // Lv.0=10%, Lv.5=60%
    }

    // 取得精神同步率強化的冷卻減少百分比（每級 8%，Lv.0 也有效果）
    getSyncRateCooldownReduction(): number {
        const skill = this.playerSkills.get('passive_sync_rate');
        if (!skill) return 0;
        return (skill.level + 1) * 0.08; // Lv.0=8%, Lv.5=48%
    }

    // 取得視網膜增強模組的經驗加成百分比（每級 30%，Lv.0 也有效果）
    getRetinaModuleExpBonus(): number {
        const skill = this.playerSkills.get('passive_retina_module');
        if (!skill) return 0;
        return (skill.level + 1) * 0.30; // Lv.0=30%, Lv.5=180%
    }

    // 取得AI賦能強化的攻擊傷害加成百分比（每級 25%，Lv.0 也有效果）
    getAiEnhancementDamageBonus(): number {
        const skill = this.playerSkills.get('passive_ai_enhancement');
        if (!skill) return 0;
        return (skill.level + 1) * 0.25; // Lv.0=25%, Lv.5=150%
    }

    // 取得AI賦能強化的防禦加成百分比（每級 15%，Lv.0 也有效果）
    getAiEnhancementDefenseBonus(): number {
        const skill = this.playerSkills.get('passive_ai_enhancement');
        if (!skill) return 0;
        return (skill.level + 1) * 0.15; // Lv.0=15%, Lv.5=90%
    }

    // 計算最終 HP（套用所有被動加成）
    calculateFinalMaxHp(baseMaxHp: number): number {
        const hpBonus = this.getTitaniumLiverHpBonus();
        return Math.floor(baseMaxHp * (1 + hpBonus));
    }

    // 計算最終移動速度（套用所有被動加成）
    calculateFinalMoveSpeed(baseMoveSpeed: number): number {
        const speedBonus = this.getSyncRateSpeedBonus();
        return baseMoveSpeed * (1 + speedBonus);
    }

    // 計算最終技能冷卻時間（套用所有被動加成）
    calculateFinalCooldown(baseCooldown: number): number {
        const cdReduction = this.getSyncRateCooldownReduction();
        return baseCooldown * (1 - cdReduction);
    }

    // 計算最終經驗取得量（套用所有被動加成）
    calculateFinalExp(baseExp: number): number {
        const expBonus = this.getRetinaModuleExpBonus();
        return Math.floor(baseExp * (1 + expBonus));
    }

    // 計算最終攻擊傷害（套用所有被動加成）
    calculateFinalDamage(baseDamage: number): number {
        const damageBonus = this.getAiEnhancementDamageBonus();
        return Math.floor(baseDamage * (1 + damageBonus));
    }

    // 計算最終攻擊傷害（含暴擊判定）
    // playerLevel: 玩家當前等級，用於計算暴擊率和暴擊傷害
    calculateFinalDamageWithCrit(baseDamage: number, playerLevel: number): { damage: number; isCrit: boolean } {
        const damageBonus = this.getAiEnhancementDamageBonus();
        let finalDamage = Math.floor(baseDamage * (1 + damageBonus));

        // 洞察：暴擊率判定（視網膜增強模組 MAX 後啟用）
        const critChance = this.getRetinaModuleCritChance(playerLevel);
        let isCrit = false;

        if (critChance > 0 && Math.random() < critChance) {
            isCrit = true;
            // 超載：暴擊傷害加成（AI賦能強化 MAX 後啟用）
            // 基礎暴擊傷害 = 1.5x，超載額外加成
            const baseCritMultiplier = 1.5;
            const extraCritDamage = this.getAiEnhancementCritDamage(playerLevel);
            const totalCritMultiplier = baseCritMultiplier + extraCritDamage;
            finalDamage = Math.floor(finalDamage * totalCritMultiplier);
        }

        return { damage: finalDamage, isCrit };
    }

    // 計算最終受到傷害（套用防禦減免）
    calculateFinalDamageTaken(incomingDamage: number): number {
        const defenseBonus = this.getAiEnhancementDefenseBonus();
        return Math.floor(incomingDamage * (1 - defenseBonus));
    }

    // ===== MAX 後額外能力系統 =====

    // 計算 MAX 後額外能力的數值
    // playerLevel: 玩家當前等級
    // 技能滿級後立即生效，隨玩家等級成長
    getMaxExtraAbilityValue(skillId: string, playerLevel: number): number {
        const skill = this.playerSkills.get(skillId);
        if (!skill) return 0;

        // 未滿級不啟用額外能力
        if (skill.level < skill.definition.maxLevel) return 0;

        const extra = skill.definition.maxExtraAbility;
        if (!extra) return 0;

        // 從技能滿級時開始，每級玩家等級增加 perLevel
        // baseValue 是基礎值，perLevel 是每級成長
        return extra.baseValue + extra.perLevel * playerLevel;
    }

    // 取得格式化的額外能力顯示文字
    getMaxExtraAbilityText(skillId: string, playerLevel: number): string | null {
        const skill = this.playerSkills.get(skillId);
        if (!skill) return null;

        // 未滿級不顯示
        if (skill.level < skill.definition.maxLevel) return null;

        const extra = skill.definition.maxExtraAbility;
        if (!extra) return null;

        const value = this.getMaxExtraAbilityValue(skillId, playerLevel);
        const displayValue = extra.isPercentage
            ? (value * 100).toFixed(1)
            : value.toFixed(1);

        return `【${extra.name}】${extra.description.replace('{value}', displayValue + extra.unit)}`;
    }

    // 取得所有已滿級技能的額外能力資訊
    getAllMaxExtraAbilities(playerLevel: number): { skillId: string; text: string }[] {
        const results: { skillId: string; text: string }[] = [];

        this.playerSkills.forEach((_skill, skillId) => {
            const text = this.getMaxExtraAbilityText(skillId, playerLevel);
            if (text) {
                results.push({ skillId, text });
            }
        });

        return results;
    }

    // ===== 具體額外能力數值取得 =====

    // 靈魂渲染：衝擊波（發射扇形波機率）
    getSoulRenderWaveChance(playerLevel: number): number {
        return this.getMaxExtraAbilityValue('active_soul_render', playerLevel);
    }

    // 遊戲先知：爆發（擊殺時再發動機率）
    getCoderBurstChance(playerLevel: number): number {
        return this.getMaxExtraAbilityValue('active_coder', playerLevel);
    }

    // 超級導演：連鎖（命中時再發射機率）
    getVfxChainChance(playerLevel: number): number {
        return this.getMaxExtraAbilityValue('active_vfx', playerLevel);
    }

    // 靈魂統領：堅守（護盾覆蓋時炸開機率）
    getArchitectExplosionChance(playerLevel: number): number {
        return this.getMaxExtraAbilityValue('active_architect', playerLevel);
    }

    // 鈦金肝：不死（是否可觸發復活）
    hasTitaniumLiverRevive(): boolean {
        const skill = this.playerSkills.get('passive_titanium_liver');
        if (!skill) return false;
        return skill.level >= skill.definition.maxLevel;
    }

    // 精神同步率強化：迅捷（閃避機率）
    getSyncRateDodgeChance(playerLevel: number): number {
        return this.getMaxExtraAbilityValue('passive_sync_rate', playerLevel);
    }

    // 視網膜增強模組：洞察（暴擊率）
    getRetinaModuleCritChance(playerLevel: number): number {
        return this.getMaxExtraAbilityValue('passive_retina_module', playerLevel);
    }

    // AI賦能強化：超載（暴擊傷害加成）
    getAiEnhancementCritDamage(playerLevel: number): number {
        return this.getMaxExtraAbilityValue('passive_ai_enhancement', playerLevel);
    }
}
