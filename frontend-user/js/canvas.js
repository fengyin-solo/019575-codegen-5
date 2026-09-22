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
        // 回放中禁止一切画布编辑操作
        this.playbackLocked = false;

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
        if (this.playbackLocked) {
            // 回放中允许点击但不允许选择/拖拽，避免误改画布
            return;
        }
        const pos = this.getPointerPos(e);
        const lens = this.renderer.getLensAtPoint(pos.x, pos.y);

        if (lens) {
            this.selectLens(lens);
            this.isDragging = true;
            this.dragOffset = {
                x: pos.x - lens.x,
                y: pos.y - lens.y
            };
            // 记录拖拽前的位置，松手时一次性录制最终位置
            this._dragStartPos = { x: lens.x, y: lens.y };
        } else {
            this.deselectLens();
        }
    }
    
    handlePointerMove(e) {
        if (!this.isDragging || !this.selectedLens) return;
        
        const pos = this.getPointerPos(e);
        
        this.selectedLens.x = Utils.clamp(
            pos.x - this.dragOffset.x,
            50,
            this.renderer.width - 50
        );
        this.selectedLens.y = Utils.clamp(
            pos.y - this.dragOffset.y,
            50,
            this.renderer.height - 50
        );
        
        this.renderer.render();
    }
    
    handlePointerUp() {
        // 拖拽结束：只录制最终停留位置（反复拖动也只记一次）
        if (this.isDragging && this.selectedLens && this._dragStartPos) {
            const start = this._dragStartPos;
            if (start.x !== this.selectedLens.x || start.y !== this.selectedLens.y) {
                window.dispatchEvent(new CustomEvent('lensMoved', {
                    detail: {
                        id: this.selectedLens.id,
                        x: this.selectedLens.x,
                        y: this.selectedLens.y
                    }
                }));
            }
            this._dragStartPos = null;
        }
        this.isDragging = false;
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (this.playbackLocked) return;
        document.getElementById('canvas-drop-hint').classList.remove('hidden');
    }
    
    handleDragLeave() {
        document.getElementById('canvas-drop-hint').classList.add('hidden');
    }
    
    handleDrop(e) {
        e.preventDefault();
        document.getElementById('canvas-drop-hint').classList.add('hidden');

        if (this.playbackLocked) return;

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

        if (!this.playbackLocked) {
            window.dispatchEvent(new CustomEvent('lensAdded', {
                detail: lens.toJSON()
            }));
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

            if (!this.playbackLocked) {
                window.dispatchEvent(new CustomEvent('lensRemoved', {
                    detail: { id: lens.id }
                }));
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
        const hadContent = this.lenses.length > 0 || this.renderer.isRunning;
        this.lenses = [];
        this.selectedLens = null;
        this.isDragging = false;
        this.renderer.setLenses([]);
        this.renderer.render();

        if (hadContent && !this.playbackLocked) {
            window.dispatchEvent(new CustomEvent('canvasCleared'));
        }
    }

    /**
     * 获取当前实验状态快照（录制起点）
     */
    getStateSnapshot() {
        // 深拷贝透镜数据，避免录制开始后对画布的修改反向污染快照
        return {
            lenses: Utils.deepClone(this.lenses.map(l => l.toJSON())),
            isRunning: this.renderer.isRunning,
            lightMode: this.renderer.lightMode,
            showLabels: this.renderer.showLabels
        };
    }

    /**
     * 应用一条录制操作（供回放使用，不触发录制事件）
     */
    applyRecordedEvent(evt) {
        switch (evt.type) {
            case 'addLens': {
                // 避免重复添加（seek 重建时）
                if (!this.lenses.some(l => l.id === evt.data.id)) {
                    const lens = Lens.fromJSON(evt.data);
                    this.lenses.push(lens);
                }
                break;
            }
            case 'removeLens': {
                const idx = this.lenses.findIndex(l => l.id === evt.data.id);
                if (idx > -1) this.lenses.splice(idx, 1);
                break;
            }
            case 'moveLens':
            case 'updateLens': {
                const lens = this.lenses.find(l => l.id === evt.data.id);
                if (lens) {
                    const d = evt.data;
                    if (typeof d.x === 'number') lens.x = d.x;
                    if (typeof d.y === 'number') lens.y = d.y;
                    if (typeof d.refractiveIndex === 'number') lens.refractiveIndex = d.refractiveIndex;
                    if (typeof d.size === 'number') lens.size = d.size;
                    if (typeof d.curvature === 'number') lens.curvature = d.curvature;
                    if (d.material !== undefined) {
                        lens.material = d.material;
                        lens.applyMaterial(d.material);
                        if (typeof d.refractiveIndex === 'number') lens.refractiveIndex = d.refractiveIndex;
                        if (typeof d.dispersion === 'number') lens.dispersion = d.dispersion;
                    }
                }
                break;
            }
            case 'lightToggle':
                this.renderer.isRunning = !!evt.data.running;
                break;
            case 'lightMode':
                this.renderer.lightMode = evt.data.mode;
                break;
            case 'toggleLabels':
                this.renderer.showLabels = !!evt.data.show;
                break;
            case 'clear':
                // 重置操作只清空透镜，光路启停由 lightToggle 事件单独表达
                this.lenses = [];
                break;
        }
    }

    /**
     * 用快照 + 事件重建到指定状态（回放/跳转时间点）
     */
    restoreState(snapshot, events, currentTime) {
        this.playbackLocked = true;
        this.selectedLens = null;
        this.isDragging = false;

        // 从初始快照开始
        this.lenses = (snapshot.lenses || []).map(data => Lens.fromJSON(data));
        this.renderer.isRunning = !!snapshot.isRunning;
        this.renderer.lightMode = snapshot.lightMode || CONFIG.LIGHT_DEFAULTS.mode;
        this.renderer.showLabels = snapshot.showLabels !== false;

        // 依次应用时间点之前（含）的事件
        (events || []).forEach(evt => {
            if (evt.t <= currentTime) {
                this.applyRecordedEvent(evt);
            }
        });

        this.renderer.setLenses(this.lenses);
        this.renderer.render();

        // 同步右侧参数面板与工具栏显示
        window.dispatchEvent(new CustomEvent('playbackStateChanged', {
            detail: {
                isRunning: this.renderer.isRunning,
                lightMode: this.renderer.lightMode,
                showLabels: this.renderer.showLabels
            }
        }));
    }

    /**
     * 退出回放：保持当前画布状态，恢复可编辑
     */
    unlockAfterPlayback() {
        this.playbackLocked = false;
    }

    getRenderer() {
        return this.renderer;
    }
}
