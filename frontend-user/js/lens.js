/**
 * 透镜类
 */
class Lens {
    constructor(options = {}) {
        this.id = options.id || Utils.generateId();
        this.type = options.type || CONFIG.LENS_TYPES.CONVEX;
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.refractiveIndex = options.refractiveIndex || CONFIG.LENS_DEFAULTS.refractiveIndex;
        this.size = options.size || CONFIG.LENS_DEFAULTS.size;
        this.curvature = options.curvature || CONFIG.LENS_DEFAULTS.curvature;
        this.material = options.material || CONFIG.LENS_DEFAULTS.material;
        this.selected = false;
        
        // 根据材料设置默认参数
        this.applyMaterial(this.material);
    }
    
    /**
     * 应用材料预设
     */
    applyMaterial(materialId) {
        const materials = CONFIG.MATERIALS;
        let material;
        
        switch (materialId) {
            case 'highIndex':
                material = materials.HIGH_INDEX;
                break;
            case 'lowDispersion':
                material = materials.LOW_DISPERSION;
                break;
            default:
                material = materials.NORMAL;
        }
        
        this.material = materialId;
        this.dispersion = material.dispersion;
        
        // 只在初始化时设置折射率
        if (!this._initialized) {
            this.refractiveIndex = material.refractiveIndex;
            this._initialized = true;
        }
    }
    
    /**
     * 获取透镜高度
     */
    getHeight() {
        return 80 * (this.size / 100);
    }
    
    /**
     * 获取透镜宽度
     */
    getWidth() {
        const baseWidth = this.type === CONFIG.LENS_TYPES.PLANO ? 8 : 30;
        return baseWidth * (this.size / 100) * (this.curvature / 50);
    }
    
    /**
     * 获取焦距
     */
    getFocalLength() {
        if (this.type === CONFIG.LENS_TYPES.PLANO) {
            return Infinity;
        }
        
        const sign = this.type === CONFIG.LENS_TYPES.CONCAVE ? -1 : 1;
        return sign * Physics.calculateFocalLength(this.refractiveIndex, this.curvature, this.getHeight());
    }
    
    /**
     * 检测点是否在透镜内
     */
    containsPoint(px, py) {
        const halfWidth = this.getWidth() / 2 + 10; // 增加点击区域
        const halfHeight = this.getHeight() / 2 + 10;
        
        return px >= this.x - halfWidth && 
               px <= this.x + halfWidth &&
               py >= this.y - halfHeight && 
               py <= this.y + halfHeight;
    }
    
    /**
     * 获取透镜类型名称
     */
    getTypeName() {
        const names = {
            [CONFIG.LENS_TYPES.CONVEX]: '凸透镜',
            [CONFIG.LENS_TYPES.CONCAVE]: '凹透镜',
            [CONFIG.LENS_TYPES.PLANO]: '平面透镜',
            [CONFIG.LENS_TYPES.ASPHERIC]: '非球面透镜'
        };
        return names[this.type] || '透镜';
    }
    
    /**
     * 获取材料名称
     */
    getMaterialName() {
        const names = {
            normal: '普通玻璃',
            highIndex: '高折射率镜片',
            lowDispersion: '低色散镜片'
        };
        return names[this.material] || '普通玻璃';
    }
    
    /**
     * 重置为默认参数
     */
    reset() {
        this.refractiveIndex = CONFIG.LENS_DEFAULTS.refractiveIndex;
        this.size = CONFIG.LENS_DEFAULTS.size;
        this.curvature = CONFIG.LENS_DEFAULTS.curvature;
        this.material = CONFIG.LENS_DEFAULTS.material;
        this.dispersion = CONFIG.MATERIALS.NORMAL.dispersion;
    }
    
    /**
     * 序列化为JSON
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            refractiveIndex: this.refractiveIndex,
            size: this.size,
            curvature: this.curvature,
            material: this.material,
            dispersion: this.dispersion
        };
    }

    /**
     * 从JSON创建透镜（按录制内容还原折射率与色散，而非材料默认值）
     */
    static fromJSON(json) {
        const lens = new Lens(json);
        if (typeof json.refractiveIndex === 'number') {
            lens.refractiveIndex = json.refractiveIndex;
        }
        if (typeof json.dispersion === 'number') {
            lens.dispersion = json.dispersion;
        }
        return lens;
    }
}
