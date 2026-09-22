/**
 * 本地存储管理
 */
const Storage = {
    GUIDE_KEY: 'optics_guide_completed',
    RECORDING_KEY: 'optics_experiment_recording',
    PLAYBACK_KEY: 'optics_experiment_playback',

    /**
     * 检查引导是否完成
     */
    isGuideCompleted() {
        try {
            return localStorage.getItem(this.GUIDE_KEY) === 'true';
        } catch (e) {
            return false;
        }
    },

    /**
     * 标记引导完成
     */
    setGuideCompleted() {
        try {
            localStorage.setItem(this.GUIDE_KEY, 'true');
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 重置引导状态
     */
    resetGuide() {
        try {
            localStorage.removeItem(this.GUIDE_KEY);
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 保存实验录制（录制过程中会反复写入，确保中断不丢内容）
     */
    saveRecording(recording) {
        try {
            localStorage.setItem(this.RECORDING_KEY, JSON.stringify(recording));
        } catch (e) {
            // 存储满或不可用时忽略，内存中的录制仍可继续
        }
    },

    /**
     * 读取实验录制
     */
    loadRecording() {
        try {
            const raw = localStorage.getItem(this.RECORDING_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * 删除实验录制
     */
    removeRecording() {
        try {
            localStorage.removeItem(this.RECORDING_KEY);
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 保存回放位置与状态（与录制内容分开存储，保持同步）
     */
    savePlaybackState(state) {
        try {
            localStorage.setItem(this.PLAYBACK_KEY, JSON.stringify(state));
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 读取回放位置与状态
     */
    loadPlaybackState() {
        try {
            const raw = localStorage.getItem(this.PLAYBACK_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * 清除回放位置与状态
     */
    removePlaybackState() {
        try {
            localStorage.removeItem(this.PLAYBACK_KEY);
        } catch (e) {
            // 忽略存储错误
        }
    }
};
