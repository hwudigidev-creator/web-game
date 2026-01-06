/**
 * 音效管理器
 * - 統一管理 UI 音效和遊戲音效
 * - 防爆音機制：限制同一音效短時間內重複播放
 * - 支援音量控制
 */

export interface SoundConfig {
    key: string;           // 音效 key
    volume?: number;       // 音量 (0-1)
    minInterval?: number;  // 最小播放間隔 (ms)，防爆音用
}

// 預設音效配置
export const SOUND_CONFIGS: Record<string, SoundConfig> = {
    // UI 音效
    ui_click: { key: 'se_ui_click', volume: 0.5, minInterval: 50 },
    ui_confirm: { key: 'se_ui_confirm', volume: 0.6, minInterval: 100 },
    ui_popup: { key: 'se_ui_popup', volume: 0.5, minInterval: 200 },
    ui_close: { key: 'se_ui_close', volume: 0.4, minInterval: 200 },
    ui_start: { key: 'se_ui_start', volume: 0.7, minInterval: 500 },

    // 打擊音效（一般攻擊隨機 1-3，音量 30%）
    hit_normal_1: { key: 'se_hit_normal_1', volume: 0.12, minInterval: 50 },
    hit_normal_2: { key: 'se_hit_normal_2', volume: 0.12, minInterval: 50 },
    hit_normal_3: { key: 'se_hit_normal_3', volume: 0.12, minInterval: 50 },
    hit_crit: { key: 'se_hit_crit', volume: 0.25, minInterval: 100 },  // 震動時播放，音量降低
    // 技能命中（隨機 1-3）
    hit_skill_1: { key: 'se_hit_skill_1', volume: 0.5, minInterval: 80 },
    hit_skill_2: { key: 'se_hit_skill_2', volume: 0.5, minInterval: 80 },
    hit_skill_3: { key: 'se_hit_skill_3', volume: 0.5, minInterval: 80 },
};

export class SoundManager {
    private scene: Phaser.Scene;
    private lastPlayTime: Map<string, number> = new Map();
    private masterVolume: number = 1.0;
    private sfxVolume: number = 1.0;
    private enabled: boolean = true;

    // 單例模式
    private static instance: SoundManager | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        SoundManager.instance = this;
    }

    // 取得單例實例
    static getInstance(): SoundManager | null {
        return SoundManager.instance;
    }

    // 更新場景引用（場景切換時使用）
    updateScene(scene: Phaser.Scene) {
        this.scene = scene;
    }

    // 設定主音量
    setMasterVolume(volume: number) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }

    // 設定音效音量
    setSfxVolume(volume: number) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }

    // 啟用/禁用音效
    setEnabled(enabled: boolean) {
        this.enabled = enabled;
    }

    /**
     * 播放音效
     * @param soundId 音效 ID（對應 SOUND_CONFIGS 的 key）
     * @param overrideConfig 覆蓋預設配置
     */
    play(soundId: string, overrideConfig?: Partial<SoundConfig>): boolean {
        if (!this.enabled) return false;

        const config = SOUND_CONFIGS[soundId];
        if (!config) {
            console.warn(`SoundManager: Unknown sound ID "${soundId}"`);
            return false;
        }

        const key = overrideConfig?.key ?? config.key;
        const volume = (overrideConfig?.volume ?? config.volume ?? 1) * this.masterVolume * this.sfxVolume;
        const minInterval = overrideConfig?.minInterval ?? config.minInterval ?? 0;

        // 檢查是否在最小間隔內
        if (minInterval > 0) {
            const now = Date.now();
            const lastTime = this.lastPlayTime.get(soundId) ?? 0;
            if (now - lastTime < minInterval) {
                return false; // 跳過，防止爆音
            }
            this.lastPlayTime.set(soundId, now);
        }

        // 檢查音效是否已載入
        if (!this.scene.cache.audio.exists(key)) {
            console.warn(`SoundManager: Audio "${key}" not loaded`);
            return false;
        }

        // 播放音效
        this.scene.sound.play(key, { volume });
        return true;
    }

    /**
     * 播放打擊音效（帶防爆音機制）
     * @param type 打擊類型：normal/skill 隨機 1-3，crit 固定一個
     * @param count 同時命中的數量，用於調整音量
     */
    playHit(type: 'normal' | 'crit' | 'skill' = 'normal', count: number = 1) {
        let soundId: string;
        if (type === 'normal' || type === 'skill') {
            // 一般攻擊和技能命中都隨機選擇 1-3
            const randomIndex = Math.floor(Math.random() * 3) + 1;
            soundId = `hit_${type}_${randomIndex}`;
        } else {
            soundId = `hit_${type}`;
        }
        // 多重命中時稍微降低音量，避免疊加過大
        const volumeMultiplier = count > 1 ? 0.7 + 0.3 / count : 1;
        this.play(soundId, { volume: (SOUND_CONFIGS[soundId]?.volume ?? 0.5) * volumeMultiplier });
    }

    // UI 音效快捷方法
    playClick() { this.play('ui_click'); }
    playConfirm() { this.play('ui_confirm'); }
    playPopup() { this.play('ui_popup'); }
    playClose() { this.play('ui_close'); }
    playStart() { this.play('ui_start'); }
}

// 全域音效播放函數（供 HTML 使用）
export function playSoundEffect(soundId: string): boolean {
    const manager = SoundManager.getInstance();
    if (manager) {
        return manager.play(soundId);
    }
    return false;
}

// 全域 UI 音效函數
export function playUIClick() { playSoundEffect('ui_click'); }
export function playUIConfirm() { playSoundEffect('ui_confirm'); }
export function playUIPopup() { playSoundEffect('ui_popup'); }
export function playUIClose() { playSoundEffect('ui_close'); }
export function playUIStart() { playSoundEffect('ui_start'); }
