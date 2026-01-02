// 技能類型
export type SkillType = 'active' | 'passive' | 'advanced';

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
    subtitle?: string; // 卡片顯示的簡短名稱（如動畫大師、超級肝）
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

// 進階技能定義
export interface AdvancedSkillDefinition {
    id: string;
    name: string;
    subtitle?: string;
    description: string;
    color: number;
    flashColor?: number;
    cooldown: number;
    maxLevel: number;
    iconPrefix: string;  // 如 'X01' 對應 X0100~X0105
    requiredSkills: string[];  // 需要持有的基礎技能 ID 組合
    levelUpMessages?: string[];
    levelUpQuotes?: string[];
}

// 進階技能庫（根據技能組合解鎖）
export const ADVANCED_SKILL_LIBRARY: AdvancedSkillDefinition[] = [
    {
        id: 'advanced_burning_celluloid',
        name: '燃燒的賽璐珞',
        subtitle: '傳統手繪動畫師、逐幀動畫師',
        description: '【靈魂渲染＋鈦金肝】\n消耗10HP，旋轉一圈30°扇形攻擊',
        color: 0xff6600,  // 橘紅色（燃燒感）
        flashColor: 0xff9933,
        cooldown: 2000,  // 2 秒
        maxLevel: -1,  // 無上限
        iconPrefix: 'SA0',  // SA0.png（固定圖示）
        requiredSkills: ['active_soul_render', 'passive_titanium_liver'],  // 靈魂渲染（動畫大師）+ 鈦金肝
        levelUpQuotes: ['你選擇成為傳統手繪動畫師、逐幀動畫師']
    },
    {
        id: 'advanced_tech_artist',
        name: '技術美術大神',
        subtitle: '一人成軍的遊戲開發者',
        description: '【咒言幻象＋視網膜】\n周圍5單位射下光線，3單位爆炸，敵人暈眩1秒',
        color: 0x9966ff,  // 藍紫色
        flashColor: 0xbb99ff,
        cooldown: 1000,  // 1 秒
        maxLevel: -1,  // 無上限
        iconPrefix: 'SC0',  // SC0.png（固定圖示）
        requiredSkills: ['active_coder', 'passive_retina_module'],  // 咒言幻象（遊戲先知）+ 視網膜增強模組
        levelUpQuotes: ['左手寫 Code，右手畫圖，一人成軍的遊戲開發者']
    },
    {
        id: 'advanced_absolute_defense',
        name: '絕對邏輯防禦',
        subtitle: '無懈可擊的系統架構',
        description: '【靈魂統領＋同步率】\n輪鋸2+每10技能級1個(max6)，滿後-0.1%→回盾',
        color: 0xffdd00,  // 金黃色（防禦感）
        flashColor: 0xffee66,
        cooldown: 100,  // 0.1 秒（持續效果，高頻更新）
        maxLevel: -1,  // 無上限
        iconPrefix: 'SD0',  // SD0.png（固定圖示）
        requiredSkills: ['active_architect', 'passive_sync_rate'],  // 靈魂統領（架構師）+ 精神同步率強化
        levelUpQuotes: ['系統架構固若金湯，邏輯防線無懈可擊']
    },
    {
        id: 'advanced_perfect_pixel',
        name: '完美像素審判',
        subtitle: '構圖之神的鐵律',
        description: '【疾光狙擊＋視網膜】\n井字線四焦點爆炸，敵人暈眩1秒',
        color: 0x66ffcc,  // 青綠色（疾光狙擊系）
        flashColor: 0x88ffee,
        cooldown: 3000,  // 3 秒
        maxLevel: -1,  // 無上限
        iconPrefix: 'SB0',  // SB0.png（固定圖示）
        requiredSkills: ['active_vfx', 'passive_retina_module'],  // 疾光狙擊 + 視網膜增強模組
        levelUpQuotes: ['構圖的黃金法則，像素的完美審判']
    },
    {
        id: 'advanced_vfx_burst',
        name: '爆發的影視特效',
        subtitle: '好萊塢級的視覺轟炸',
        description: '【疾光狙擊＋AI強化】\n每3.5秒發射20枚追蹤導彈',
        color: 0xff4400,  // 橘紅色（爆炸感）
        flashColor: 0xff6633,
        cooldown: 3500,  // 3.5 秒
        maxLevel: -1,  // 無上限
        iconPrefix: 'SB1',  // SB1.png（固定圖示）
        requiredSkills: ['active_vfx', 'passive_ai_enhancement'],  // 疾光狙擊 + AI 賦能強化
        levelUpQuotes: ['好萊塢級的視覺轟炸，每一幀都是藝術']
    },
    {
        id: 'advanced_phantom_iteration',
        name: '幻影迭代模式',
        subtitle: '咒言幻象的創作者',
        description: '【咒言幻象＋AI強化】\n召喚最多3隻強力分身支援戰鬥',
        color: 0x9966ff,  // 紫藍色（幻影感）
        flashColor: 0xbb88ff,
        cooldown: 8000,  // 8 秒
        maxLevel: -1,  // 無上限
        iconPrefix: 'SC1',  // SC1.png（固定圖示）
        requiredSkills: ['active_coder', 'passive_ai_enhancement'],  // 咒言幻象（遊戲先知）+ AI 賦能強化
        levelUpQuotes: ['影分身現身，咒言幻象的創作者']
    },
    {
        id: 'advanced_zero_trust',
        name: '零信任防禦協定',
        subtitle: '絕對安全的系統架構',
        description: '【靈魂統領＋AI強化】\n光束鎖敵每秒+1倍寬&+Lv%傷，減速50%',
        color: 0xffcc00,  // 金黃色
        flashColor: 0xffee66,
        cooldown: 0,  // 持續效果，無冷卻
        maxLevel: -1,  // 無上限
        iconPrefix: 'SD1',  // SD1.png（固定圖示）
        requiredSkills: ['active_architect', 'passive_ai_enhancement'],  // 靈魂統領（架構師）+ AI 賦能強化
        levelUpQuotes: ['零信任，驗證一切，絕不妥協']
    },
    {
        id: 'advanced_soul_slash',
        name: '次元向量疾劃',
        subtitle: '貫穿次元的向量之刃',
        description: '【靈魂渲染＋AI強化】\n全螢幕直線斬擊，每級1%連鎖機率',
        color: 0xff3366,  // 紅紫色（斬擊感）
        flashColor: 0xff6699,
        cooldown: 500,  // 0.5 秒
        maxLevel: -1,  // 無上限
        iconPrefix: 'SA1',  // SA1.png（固定圖示）
        requiredSkills: ['active_soul_render', 'passive_ai_enhancement'],  // 靈魂渲染（動畫大師）+ AI 賦能強化
        levelUpQuotes: ['向量運算，次元切割']
    }
];

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
            '3 向衝擊波（0°/120°/240°）、10 傷害、10 單位射程，已達最大等級！'
        ],
        levelUpQuotes: [
            '你練習了繪畫技法，動畫美術的能力提升了', // LV0
            '你習得了分鏡設計，並獲得了動態腳本製作技術', // LV1
            '你增進了手繪動畫和停格動畫的製作技術', // LV2
            '你苦練了3D角色模型和3D場景的設計', // LV3
            '你完全理解了動畫法則，提升了角色動畫的製作精度', // LV4
            '你成為了動畫大師，解鎖了進階技能組合', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '三向衝擊',
            description: '改為 3 向衝擊波（0°/120°/240°），飛行 10 單位',
            baseValue: 0,
            perLevel: 0,
            unit: '',
            isPercentage: false
        }
    },
    {
        id: 'active_coder',
        name: '咒言幻象',
        subtitle: '遊戲先知',
        description: '對周圍 3 單位敵人造成傷害，每級增加 0.5 單位範圍',
        type: 'active',
        color: 0xaa66ff, // 紫色
        flashColor: 0xcc88ff, // 閃紫光
        cooldown: 2000, // 2 秒
        maxLevel: 5,
        iconPrefix: 'C', // C00.png ~ C05.png
        levelUpMessages: [
            '3 單位範圍、2 傷害',
            '3.5 單位範圍、4 傷害',
            '4 單位範圍、6 傷害',
            '4.5 單位範圍、8 傷害',
            '5 單位範圍、10 傷害',
            '5.5 單位範圍、12 傷害，已達最大等級！'
        ],
        levelUpQuotes: [
            '你參透了互動設計的原理，同時了解遊戲企劃架構', // LV0
            '你習得動作捕捉的技術，將應用到虛擬實境製作', // LV1
            '你增進了程式設計能力和遊戲引擎的創作能力', // LV2
            '你整合了虛擬網紅製作技術，讓自媒體營銷具爆發力', // LV3
            '你導入了人工智慧協作能力，產能提升了數倍', // LV4
            '你成為了遊戲先知，解鎖了進階技能組合', // LV5/MAX
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
            '3 道精準鎖定超粗射線、6 傷害、15 單位射程，已達最大等級！'
        ],
        levelUpQuotes: [
            '你研究了影像美學，劇本編導的能力提升了', // LV0
            '你習得了動靜態攝影的能力，獲得了畫面控制的技術', // LV1
            '你增進了影片剪輯和動態影像的設計能力', // LV2
            '你苦練了數位成音技術影像獲得更多回饋', // LV3
            '你學會應用特效合成後製提升了影像各種可能性', // LV4
            '你成為了超級導演，解鎖了進階技能組合', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '精準',
            description: '改為 3 條精準鎖定超粗射線，射程 15 單位',
            baseValue: 0,
            perLevel: 0,
            unit: '',
            isPercentage: false
        }
    },
    {
        id: 'active_architect',
        name: '靈魂統領',
        subtitle: '架構師',
        description: '產生 30% HP 護盾（霸體），反傷並擊退攻擊者 1 單位',
        type: 'active',
        color: 0xffcc00, // 金色
        flashColor: 0xffdd44, // 閃金光
        cooldown: 10000, // 10 秒
        maxLevel: 5,
        iconPrefix: 'D', // D00.png ~ D05.png
        levelUpMessages: [
            '30% HP 護盾、2 反傷',
            '30% HP 護盾、4 反傷',
            '30% HP 護盾、6 反傷',
            '30% HP 護盾、8 反傷',
            '30% HP 護盾、10 反傷',
            '30% HP 護盾、20 反傷＋擊退，已達最大等級！'
        ],
        levelUpQuotes: [
            '你開始學習系統架構，建立了基礎的防禦機制', // LV0
            '你理解了模組化設計，防禦層級變得更有條理', // LV1
            '你掌握了負載平衡，系統承受能力大幅提升', // LV2
            '你建構了冗餘備援，任何攻擊都能被有效分散', // LV3
            '你精通了高可用架構，防禦系統近乎無懈可擊', // LV4
            '你成為了頂尖架構師，解鎖了進階技能組合', // LV5/MAX
        ],
        maxExtraAbility: {
            name: '八角爆盾',
            description: '冷卻刷新時護盾殘值×10 傷害、4 單位範圍金色八角盾爆炸並擊退',
            baseValue: 1, // 需要 > 0 才能觸發爆盾
            perLevel: 0,
            unit: '',
            isPercentage: false
        }
    },
    // 被動型技能 (4個，但玩家最多持有3個)
    {
        id: 'passive_titanium_liver',
        name: '鈦金屬賽博肝臟',
        subtitle: '超級肝',
        description: '每級 +10% HP，回血間隔 -1 秒',
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
            '驚人無懈可擊的耐力，你的工作時長不斷提升', // LV0
            '驚人無懈可擊的耐力，你的工作時長不斷提升', // LV1
            '驚人無懈可擊的耐力，你的工作時長不斷提升', // LV2
            '驚人無懈可擊的耐力，你的工作時長不斷提升', // LV3
            '驚人無懈可擊的耐力，你的工作時長不斷提升', // LV4
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
        subtitle: '零的領域',
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
            '進入到心流狀態，專注力提升且變的敏捷', // LV0
            '進入到心流狀態，專注力提升且變的敏捷', // LV1
            '進入到心流狀態，專注力提升且變的敏捷', // LV2
            '進入到心流狀態，專注力提升且變的敏捷', // LV3
            '進入到心流狀態，專注力提升且變的敏捷', // LV4
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
        subtitle: '血輪眼',
        description: '提升 30% 經驗獲取與 0.5 單位拾取範圍，每級再 +30%/+0.5',
        type: 'passive',
        color: 0x992233, // 暗紅色
        maxLevel: 5,
        iconPrefix: 'P03', // 固定圖示，不隨等級變換
        levelUpMessages: [
            '+30% 經驗、+0.5 拾取範圍',
            '+60% 經驗、+1 拾取範圍',
            '+90% 經驗、+1.5 拾取範圍',
            '+120% 經驗、+2 拾取範圍',
            '+150% 經驗、+2.5 拾取範圍',
            '+180% 經驗、+3 拾取範圍，已達最大等級！'
        ],
        levelUpQuotes: [
            '敏銳的觀察力，視野範圍擴大了', // LV0
            '敏銳的觀察力，視野範圍擴大了', // LV1
            '敏銳的觀察力，視野範圍擴大了', // LV2
            '敏銳的觀察力，視野範圍擴大了', // LV3
            '敏銳的觀察力，視野範圍擴大了', // LV4
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
        subtitle: '智能輔助',
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
            '攻守兼備，各方面能力全面提升', // LV0
            '攻守兼備，各方面能力全面提升', // LV1
            '攻守兼備，各方面能力全面提升', // LV2
            '攻守兼備，各方面能力全面提升', // LV3
            '攻守兼備，各方面能力全面提升', // LV4
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

// 進階技能實例
export interface PlayerAdvancedSkill {
    definition: AdvancedSkillDefinition;
    level: number;  // 0-5，5 為 MAX
}

// 技能管理系統
export class SkillManager {
    // 玩家擁有的技能（id -> PlayerSkill）
    private playerSkills: Map<string, PlayerSkill> = new Map();

    // 被動技能欄位上限
    private static readonly MAX_PASSIVE_SLOTS = 3;

    // 進階技能系統
    private advancedSkillLevels: Map<string, number> = new Map();  // 所有進階技能的等級記錄（切換後保留）
    private equippedAdvancedSkillId: string | null = null;  // 當前裝備的進階技能 ID

    // 重置所有技能狀態（場景重啟時）
    reset() {
        this.playerSkills.clear();
        this.advancedSkillLevels.clear();
        this.equippedAdvancedSkillId = null;
    }

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

    // 取得混合技能選項（一般技能 + 進階技能）
    getMixedSkillOptions(): { normal: SkillDefinition[], advanced: AdvancedSkillDefinition[] } {
        const upgradeableActive = this.getUpgradeableActiveSkills();
        const upgradeablePassive = this.getUpgradeablePassiveSkills();
        const upgradeableAdvanced = this.getUpgradeableAdvancedSkills();

        const normalOptions: SkillDefinition[] = [];

        // 第一次選擇：固定顯示前 3 個攻擊技能（不隨機），不顯示進階技能
        if (!this.hasAnyActiveSkill()) {
            for (let i = 0; i < Math.min(3, upgradeableActive.length); i++) {
                normalOptions.push(upgradeableActive[i]);
            }
            return { normal: normalOptions, advanced: [] };
        }

        // 目標：2 主動 + 1 被動 = 3 個一般技能

        // 隨機選主動技能（最多 2 個）
        const shuffledActive = this.shuffleArray([...upgradeableActive]);
        for (let i = 0; i < Math.min(2, shuffledActive.length); i++) {
            normalOptions.push(shuffledActive[i]);
        }

        // 隨機選被動技能（最多 1 個）
        const shuffledPassive = this.shuffleArray([...upgradeablePassive]);
        if (shuffledPassive.length > 0) {
            normalOptions.push(shuffledPassive[0]);
        }

        // 返回進階技能選項（如果已裝備，確保它在選項中）
        let advancedOptions: AdvancedSkillDefinition[] = [];
        if (this.equippedAdvancedSkillId) {
            const equipped = upgradeableAdvanced.find(a => a.id === this.equippedAdvancedSkillId);
            if (equipped) {
                // 已裝備的放第一個
                const others = upgradeableAdvanced.filter(a => a.id !== this.equippedAdvancedSkillId);
                const shuffledOthers = this.shuffleArray([...others]);
                advancedOptions = [equipped, ...shuffledOthers];
            } else {
                advancedOptions = this.shuffleArray([...upgradeableAdvanced]);
            }
        } else {
            advancedOptions = this.shuffleArray([...upgradeableAdvanced]);
        }

        return { normal: normalOptions, advanced: advancedOptions };
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

    // 取得視網膜增強模組的拾取範圍加成（每級 +0.5 單位，Lv.0=0.5，Lv.5=3）
    getRetinaModulePickupBonus(): number {
        const skill = this.playerSkills.get('passive_retina_module');
        if (!skill) return 0;
        return (skill.level + 1) * 0.5; // Lv.0=0.5, Lv.5=3
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

        // 暴擊率 = 洞察（視網膜 MAX）+ 技術美術大神加成
        const baseCritChance = this.getRetinaModuleCritChance(playerLevel);
        const techArtistCrit = this.getTechArtistCritBonus();
        const critChance = baseCritChance + techArtistCrit;
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

    // 靈魂統領：堅守（護盾覆蓋時炸開，MAX 時 100% 觸發）
    // 返回值 > 0 表示已達 MAX 等級，可觸發堅守效果
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

    // 技術美術大神：暴擊率加成（每級 +1%）
    getTechArtistCritBonus(): number {
        const level = this.advancedSkillLevels.get('advanced_tech_artist') ?? -1;
        if (level < 0) return 0;
        return (level + 1) * 0.01; // Lv.0=1%, Lv.1=2%, ...
    }

    // ===== 進階技能系統 =====

    // 檢查所有基礎技能是否滿等（4 主動 + 3 被動 = 7 個）
    areAllBasicSkillsMaxed(): boolean {
        // 檢查是否持有所有 4 個主動技能且都滿等
        const activeSkills = this.getActiveSkillDefinitions();
        const allActivesMaxed = activeSkills.every(def => {
            const skill = this.playerSkills.get(def.id);
            return skill && skill.level >= def.maxLevel;
        });

        // 檢查是否持有 3 個被動技能且都滿等
        const passiveCount = this.getOwnedPassiveCount();
        if (passiveCount < SkillManager.MAX_PASSIVE_SLOTS) return false;

        const passiveSkills = this.getPassiveSkillDefinitions();
        let maxedPassiveCount = 0;
        passiveSkills.forEach(def => {
            const skill = this.playerSkills.get(def.id);
            if (skill && skill.level >= def.maxLevel) {
                maxedPassiveCount++;
            }
        });

        return allActivesMaxed && maxedPassiveCount >= SkillManager.MAX_PASSIVE_SLOTS;
    }

    // 取得可選的進階技能（根據持有的基礎技能是否滿等）
    getAvailableAdvancedSkills(): AdvancedSkillDefinition[] {
        return ADVANCED_SKILL_LIBRARY.filter(adv => {
            // 檢查所有必要技能是否都滿等
            const allMaxed = adv.requiredSkills.every(reqId => {
                const skill = this.playerSkills.get(reqId);
                if (!skill) return false;
                return skill.level >= skill.definition.maxLevel;
            });
            return allMaxed;
        });
    }

    // 取得可升級的進階技能（未滿級或無上限）
    getUpgradeableAdvancedSkills(): AdvancedSkillDefinition[] {
        return this.getAvailableAdvancedSkills().filter(adv => {
            // maxLevel < 0 表示無上限，永遠可升級
            if (adv.maxLevel < 0) return true;

            const level = this.advancedSkillLevels.get(adv.id) ?? -1;
            return level < adv.maxLevel;
        });
    }

    // 隨機選取進階技能選項（3選1）
    // 規則：如果已裝備進階技能，至少要有一個是當前裝備的
    getRandomAdvancedSkillOptions(): AdvancedSkillDefinition[] {
        const available = this.getUpgradeableAdvancedSkills();

        // 如果已裝備進階技能，確保它在選項中
        if (this.equippedAdvancedSkillId) {
            const equipped = available.find(a => a.id === this.equippedAdvancedSkillId);
            if (equipped) {
                // 從可選列表中移除已裝備的
                const others = available.filter(a => a.id !== this.equippedAdvancedSkillId);
                const shuffledOthers = this.shuffleArray([...others]);
                // 已裝備的 + 最多 2 個其他的
                return [equipped, ...shuffledOthers.slice(0, 2)];
            }
        }

        // 沒有裝備進階技能，正常隨機
        const shuffled = this.shuffleArray([...available]);
        return shuffled.slice(0, 3);
    }

    // 取得當前裝備的進階技能
    getEquippedAdvancedSkill(): PlayerAdvancedSkill | null {
        if (!this.equippedAdvancedSkillId) return null;

        const def = ADVANCED_SKILL_LIBRARY.find(a => a.id === this.equippedAdvancedSkillId);
        if (!def) return null;

        const level = this.advancedSkillLevels.get(this.equippedAdvancedSkillId) ?? -1;
        return { definition: def, level };
    }

    // 取得當前裝備的進階技能 ID
    getEquippedAdvancedSkillId(): string | null {
        return this.equippedAdvancedSkillId;
    }

    // 設定裝備的進階技能（切換）
    setEquippedAdvancedSkill(skillId: string): boolean {
        const def = ADVANCED_SKILL_LIBRARY.find(a => a.id === skillId);
        if (!def) return false;

        // 檢查是否符合組合條件（所有必要技能都要滿等）
        const canEquip = def.requiredSkills.every(reqId => {
            const skill = this.playerSkills.get(reqId);
            if (!skill) return false;
            return skill.level >= skill.definition.maxLevel;
        });
        if (!canEquip) return false;

        this.equippedAdvancedSkillId = skillId;
        return true;
    }

    // 取得進階技能等級（-1 表示從未學習過）
    getAdvancedSkillLevel(skillId: string): number {
        return this.advancedSkillLevels.get(skillId) ?? -1;
    }

    // 升級進階技能（學習或升級）
    upgradeAdvancedSkill(skillId: string): boolean {
        const def = ADVANCED_SKILL_LIBRARY.find(a => a.id === skillId);
        if (!def) return false;

        // 未擁有時為 -1，學習後從 Lv.0 開始（與一般技能統一）
        const currentLevel = this.advancedSkillLevels.get(skillId) ?? -1;

        // maxLevel < 0 表示無上限
        if (def.maxLevel >= 0 && currentLevel >= def.maxLevel) {
            return false;  // 已滿級
        }

        // 升級：-1 → 0（學習）、0 → 1、...
        this.advancedSkillLevels.set(skillId, currentLevel + 1);
        return true;
    }

    // 檢查進階技能是否已滿級
    isAdvancedSkillMaxLevel(skillId: string): boolean {
        const def = ADVANCED_SKILL_LIBRARY.find(a => a.id === skillId);
        if (!def) return false;

        // maxLevel < 0 表示無上限，永遠不會滿級
        if (def.maxLevel < 0) return false;

        const level = this.advancedSkillLevels.get(skillId) ?? -1;
        return level >= def.maxLevel;
    }

    // 檢查是否有任何進階技能（用於判斷是否顯示進階技能欄位）
    hasAnyAdvancedSkill(): boolean {
        return this.equippedAdvancedSkillId !== null;
    }

    // 取得進階技能定義
    getAdvancedSkillDefinition(skillId: string): AdvancedSkillDefinition | undefined {
        return ADVANCED_SKILL_LIBRARY.find(a => a.id === skillId);
    }

    // 計算進階技能的最終冷卻時間（套用被動減速）
    calculateAdvancedSkillCooldown(baseCooldown: number): number {
        return this.calculateFinalCooldown(baseCooldown);
    }

    // 取得已學習過的進階技能列表（等級 > 0）
    getLearnedAdvancedSkills(): AdvancedSkillDefinition[] {
        const learned: AdvancedSkillDefinition[] = [];
        for (const [skillId, level] of this.advancedSkillLevels.entries()) {
            if (level > 0) {
                const def = ADVANCED_SKILL_LIBRARY.find(a => a.id === skillId);
                if (def) {
                    learned.push(def);
                }
            }
        }
        return learned;
    }

    // 停止所有技能（遊戲結束時）
    stopAllSkills() {
        // 標記遊戲結束狀態（由 MainScene 處理實際停止邏輯）
    }
}
