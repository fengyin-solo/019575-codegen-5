/**
 * 画布管理器
 */
class CanvasManager {
    constructor() {
        this.canvas = document.getElementById('optics-canvas');
        this.wrapper = document.getElementById('canvas-wrapper');
        this.renderer = new Renderer(this.canvas);
        this.lenses = [];
        this.selectedLens = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.dragMoved = false;
        this.recorder = null;

        this.init();
    }
    
    init() {
        this.bindEvents();
        this.handleResize();
    }
    
    bindEvents() {
        // 窗口大小变化
        window.addEventListener('resize', Utils.debounce(() => {
            this.handleResize();
        }, 100));
        
        // 鼠标事件
        this.canvas.addEventListener('mousedown', (e) => this.handlePointerDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('mouseup', () => this.handlePointerUp());
        this.canvas.addEventListener('mouseleave', () => this.handlePointerUp());
        
        // 触摸事件 - 关键：正确处理触摸
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handlePointerDown(e);
        }, { passive: false });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handlePointerMove(e);
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handlePointerUp();
        }, { passive: false });
        
        this.canvas.addEventListener('touchcancel', () => this.handlePointerUp());
        
        // 拖放事件（桌面端）
        this.wrapper.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.wrapper.addEventListener('dragleave', () => this.handleDragLeave());
        this.wrapper.addEventListener('drop', (e) => this.handleDrop(e));
    }
    
    /**
     * 获取指针位置（兼容鼠标和触摸）
     */
    getPointerPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        // 计算相对于画布的位置
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        return { x, y };
    }
    
    handleResize() {
        this.renderer.resize();
        
        this.lenses.forEach(lens => {
            lens.x = Utils.clamp(lens.x, 50, this.renderer.width - 50);
            lens.y = Utils.clamp(lens.y, 50, this.renderer.height - 50);
        });
        
        this.renderer.setLenses(this.lenses);
    }
    
    handlePointerDown(e) {
        // 回放中锁定画布，不响应任何编辑
        if (this.recorder && this.recorder.isPlaybackActive) return;

        const pos = this.getPointerPos(e);
        const lens = this.renderer.getLensAtPoint(pos.x, pos.y);

        if (lens) {
            this.selectLens(lens);
            this.isDragging = true;
            this.dragMoved = false;
            this.dragOffset = {
                x: pos.x - lens.x,
                y: pos.y - lens.y
            };
        } else {
            this.deselectLens();
        }
    }
    
    handlePointerMove(e) {
        if (!this.isDragging || !this.selectedLens) return;

        const pos = this.getPointerPos(e);

        const newX = Utils.clamp(
            pos.x - this.dragOffset.x,
            50,
            this.renderer.width - 50
        );
        const newY = Utils.clamp(
            pos.y - this.dragOffset.y,
            50,
            this.renderer.height - 50
        );

        if (Math.abs(newX - this.selectedLens.x) > 1 ||
            Math.abs(newY - this.selectedLens.y) > 1) {
            this.dragMoved = true;
        }

        this.selectedLens.x = newX;
        this.selectedLens.y = newY;

        this.renderer.render();
    }

    handlePointerUp() {
        // 一次拖动只记录最终落点（连续位移按同参数合并）
        if (this.isDragging && this.dragMoved && this.recorder && this.selectedLens) {
            this.recorder.recordLensMove(
                this.selectedLens.id,
                this.selectedLens.x,
                this.selectedLens.y
            );
        }
        this.isDragging = false;
        this.dragMoved = false;
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        document.getElementById('canvas-drop-hint').classList.remove('hidden');
    }
    
    handleDragLeave() {
        document.getElementById('canvas-drop-hint').classList.add('hidden');
    }
    
    handleDrop(e) {
        e.preventDefault();
        document.getElementById('canvas-drop-hint').classList.add('hidden');

        // 回放中禁止编辑
        if (this.recorder && this.recorder.isPlaybackActive) return;

        const lensType = e.dataTransfer.getData('lens-type');
        const material = e.dataTransfer.getData('lens-material');

        if (!lensType) return;

        const pos = this.getPointerPos(e);

        const lens = new Lens({
            type: lensType,
            x: pos.x,
            y: pos.y,
            material: material || 'normal'
        });

        this.addLens(lens);
        this.selectLens(lens);
        Utils.showToast('透镜已添加', 'success');
    }

    addLens(lens) {
        this.lenses.push(lens);
        this.renderer.setLenses(this.lenses);
        if (this.recorder) {
            this.recorder.recordLensAdd(lens);
        }
    }

    removeLens(lens) {
        const index = this.lenses.indexOf(lens);
        if (index > -1) {
            this.lenses.splice(index, 1);
            if (this.selectedLens === lens) {
                this.deselectLens();
            }
            this.renderer.setLenses(this.lenses);
            if (this.recorder) {
                this.recorder.recordLensRemove(lens.id);
            }
        }
    }
    
    selectLens(lens) {
        if (this.selectedLens) {
            this.selectedLens.selected = false;
        }
        
        this.selectedLens = lens;
        lens.selected = true;
        this.renderer.render();
        
        window.dispatchEvent(new CustomEvent('lensSelected', { detail: lens }));
    }
    
    deselectLens() {
        if (this.selectedLens) {
            this.selectedLens.selected = false;
            this.selectedLens = null;
            this.renderer.render();
        }
        
        window.dispatchEvent(new CustomEvent('lensDeselected'));
    }
    
    clear() {
        this.lenses = [];
        this.selectedLens = null;
        this.isDragging = false;
        this.dragMoved = false;
        this.renderer.setLenses([]);
        this.renderer.render();
        if (this.recorder) {
            this.recorder.recordCanvasReset();
        }
    }

    /**
     * 序列化当前画布状态（录制快照/回放恢复）
     */
    getStateSnapshot() {
        return {
            lenses: this.lenses.map(lens => lens.toJSON()),
            running: this.renderer.isRunning,
            lightMode: this.renderer.lightMode
        };
    }

    /**
     * 用快照恢复画布状态（回放跳转/结束/退出时调用）
     */
    restoreState(state, options = {}) {
        this.lenses = (state.lenses || []).map(data => Lens.fromJSON(data));
        this.selectedLens = null;
        this.isDragging = false;
        this.dragMoved = false;

        this.renderer.setLenses(this.lenses);
        this.renderer.setLightMode(state.lightMode || CONFIG.LIGHT_DEFAULTS.mode);
        this.renderer.setRunning(!!state.running);

        // 选中当前时刻最后被操作的透镜，使右侧参数面板与画面同步
        if (options.selectLensId) {
            const lens = this.lenses.find(l => l.id === options.selectLensId);
            if (lens) this.selectLens(lens);
        }

        this.renderer.render();
    }

    getRenderer() {
        return this.renderer;
    }
}
