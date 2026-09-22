/**
 * 交互管理器
 */
class InteractionManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.renderer = canvasManager.getRenderer();
        this.btnToggleLight = null;
        this.recorder = null;

        this.init();
    }
    
    init() {
        this.bindLensLibraryEvents();
        this.bindToolbarEvents();
        this.bindParamPanelEvents();
        this.bindFooterEvents();
        this.bindHelpEvents();
        this.bindLensSelectionEvents();
    }
    
    bindLensLibraryEvents() {
        const lensItems = document.querySelectorAll('.lens-item');
        
        lensItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                item.classList.add('dragging');
                e.dataTransfer.setData('lens-type', item.dataset.lensType);
                e.dataTransfer.setData('lens-material', item.dataset.material || '');
                e.dataTransfer.effectAllowed = 'copy';
            });
            
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });
            
            // 触摸设备点击添加
            if (Utils.isTouchDevice()) {
                item.addEventListener('click', () => {
                    // 回放中禁止编辑
                    if (this.recorder && this.recorder.isPlaybackActive) return;
                    const lens = new Lens({
                        type: item.dataset.lensType,
                        x: this.renderer.width / 2,
                        y: this.renderer.height / 2,
                        material: item.dataset.material || 'normal'
                    });
                    this.canvasManager.addLens(lens);
                    this.canvasManager.selectLens(lens);
                    Utils.showToast('透镜已添加', 'success');
                });
            }
        });
    }
    
    bindToolbarEvents() {
        // 启动/暂停光路
        this.btnToggleLight = document.getElementById('btn-toggle-light');
        this.btnToggleLight.addEventListener('click', () => {
            const isRunning = this.renderer.toggleRunning();
            this.updateLightButtonState(isRunning);
            if (this.recorder) {
                this.recorder.recordLightToggle(isRunning);
            }
        });

        // 重置画布
        document.getElementById('btn-reset-canvas').addEventListener('click', () => {
            // 回放中禁止编辑
            if (this.recorder && this.recorder.isPlaybackActive) return;

            if (this.canvasManager.lenses.length === 0 && !this.renderer.isRunning) {
                Utils.showToast('画布已经是空的了', 'info');
                return;
            }

            // 重置透镜（clear 内部会记录 canvasReset）
            this.canvasManager.clear();

            // 重置光线状态
            this.renderer.setRunning(false);
            this.updateLightButtonState(false);
            if (this.recorder && this.recorder.isRecording) {
                this.recorder.recordLightToggle(false);
            }

            Utils.showToast('画布已重置', 'success');
        });

        // 光源模式选择
        document.getElementById('select-light-mode').addEventListener('change', (e) => {
            this.renderer.setLightMode(e.target.value);
            if (this.recorder) {
                this.recorder.recordLightMode(e.target.value);
            }
        });

        // 切换标注
        const btnToggleLabels = document.getElementById('btn-toggle-labels');
        btnToggleLabels.addEventListener('click', () => {
            const showLabels = this.renderer.toggleLabels();
            btnToggleLabels.classList.toggle('active', showLabels);
        });
    }
    
    /**
     * 更新光线按钮状态
     */
    updateLightButtonState(isRunning) {
        this.btnToggleLight.classList.toggle('active', isRunning);
        this.btnToggleLight.querySelector('span').textContent = isRunning ? '暂停光路' : '启动光路';
        
        const icon = this.btnToggleLight.querySelector('svg');
        if (isRunning) {
            icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        } else {
            icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
        }
    }
    
    bindParamPanelEvents() {
        const riSlider = document.getElementById('param-ri');
        riSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('param-ri-value').textContent = value.toFixed(2);

            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.refractiveIndex = value;
                if (this.recorder) {
                    this.recorder.recordLensParam(
                        this.canvasManager.selectedLens.id, 'refractiveIndex', value
                    );
                }
                this.renderer.render();
            }
        });

        const sizeSlider = document.getElementById('param-size');
        sizeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('param-size-value').textContent = `${value}%`;

            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.size = value;
                if (this.recorder) {
                    this.recorder.recordLensParam(
                        this.canvasManager.selectedLens.id, 'size', value
                    );
                }
                this.renderer.render();
            }
        });

        const curvatureSlider = document.getElementById('param-curvature');
        curvatureSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('param-curvature-value').textContent = `${value}%`;

            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.curvature = value;
                if (this.recorder) {
                    this.recorder.recordLensParam(
                        this.canvasManager.selectedLens.id, 'curvature', value
                    );
                }
                this.renderer.render();
            }
        });

        document.getElementById('param-material').addEventListener('change', (e) => {
            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.applyMaterial(e.target.value);
                riSlider.value = this.canvasManager.selectedLens.refractiveIndex;
                document.getElementById('param-ri-value').textContent =
                    this.canvasManager.selectedLens.refractiveIndex.toFixed(2);
                if (this.recorder) {
                    this.recorder.recordLensMaterial(this.canvasManager.selectedLens);
                }
                this.renderer.render();
            }
        });

        document.getElementById('btn-reset-lens').addEventListener('click', () => {
            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.reset();
                this.updateParamPanel(this.canvasManager.selectedLens);
                if (this.recorder) {
                    this.recorder.recordLensReset(this.canvasManager.selectedLens);
                }
                this.renderer.render();
                Utils.showToast('参数已重置', 'success');
            }
        });

        document.getElementById('btn-delete-lens').addEventListener('click', () => {
            if (this.canvasManager.selectedLens) {
                this.canvasManager.removeLens(this.canvasManager.selectedLens);
                Utils.showToast('透镜已删除', 'success');
            }
        });
    }
    
    bindFooterEvents() {
        // 底部区域已简化，无需绑定事件
    }
    
    bindHelpEvents() {
        document.getElementById('btn-help').addEventListener('click', () => {
            Storage.resetGuide();
            window.dispatchEvent(new CustomEvent('showGuide'));
        });
        
        document.querySelectorAll('.btn-help-small').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                Utils.showHelpTooltip(btn, btn.dataset.help);
            });
            btn.addEventListener('mouseleave', () => {
                Utils.hideHelpTooltip();
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                Utils.showHelpTooltip(btn, btn.dataset.help);
                setTimeout(() => Utils.hideHelpTooltip(), 3000);
            });
        });
    }
    
    bindLensSelectionEvents() {
        window.addEventListener('lensSelected', (e) => {
            this.showParamPanel(e.detail);
        });
        
        window.addEventListener('lensDeselected', () => {
            this.hideParamPanel();
        });
    }
    
    showParamPanel(lens) {
        document.getElementById('panel-empty').classList.add('hidden');
        document.getElementById('panel-params').classList.remove('hidden');
        this.updateParamPanel(lens);
    }
    
    hideParamPanel() {
        document.getElementById('panel-empty').classList.remove('hidden');
        document.getElementById('panel-params').classList.add('hidden');
    }
    
    updateParamPanel(lens) {
        document.getElementById('param-type-value').textContent = lens.getTypeName();
        document.getElementById('param-ri').value = lens.refractiveIndex;
        document.getElementById('param-ri-value').textContent = lens.refractiveIndex.toFixed(2);
        document.getElementById('param-size').value = lens.size;
        document.getElementById('param-size-value').textContent = `${lens.size}%`;
        document.getElementById('param-curvature').value = lens.curvature;
        document.getElementById('param-curvature-value').textContent = `${lens.curvature}%`;
        document.getElementById('param-material').value = lens.material;
        
        const curvatureGroup = document.getElementById('param-curvature-group');
        curvatureGroup.style.display = lens.type === CONFIG.LENS_TYPES.PLANO ? 'none' : 'flex';
    }
}
