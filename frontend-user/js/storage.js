/**
 * 本地存储管理（简化版）
 */
const Storage = {
    GUIDE_KEY: 'optics_guide_completed',
    
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
     * 读取 JSON 数据
     */
    getJSON(key, defaultValue = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? defaultValue : JSON.parse(raw);
        } catch (e) {
            return defaultValue;
        }
    },

    /**
     * 写入 JSON 数据
     */
    setJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            // 存储已满或被禁用时静默失败
            return false;
        }
    },

    /**
     * 删除指定键
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            // 忽略存储错误
        }
    }
};
