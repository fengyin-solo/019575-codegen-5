/**
 * 交互管理器
 */
class InteractionManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.renderer = canvasManager.getRenderer();
        this.btnToggleLight = null;
        
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
                    if (this.canvasManager.playbackLocked) return;
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
            if (this.canvasManager.playbackLocked) return;
            const isRunning = this.renderer.toggleRunning();
            this.updateLightButtonState(isRunning);
            window.dispatchEvent(new CustomEvent('lightToggled', {
                detail: { running: isRunning }
            }));
        });

        // 重置画布
        document.getElementById('btn-reset-canvas').addEventListener('click', () => {
            if (this.canvasManager.playbackLocked) return;
            if (this.canvasManager.lenses.length === 0 && !this.renderer.isRunning) {
                Utils.showToast('画布已经是空的了', 'info');
                return;
            }

            // 重置透镜
            this.canvasManager.clear();

            // 重置光线状态
            this.renderer.setRunning(false);
            this.updateLightButtonState(false);
            window.dispatchEvent(new CustomEvent('lightToggled', {
                detail: { running: false }
            }));

            Utils.showToast('画布已重置', 'success');
        });

        // 光源模式选择
        document.getElementById('select-light-mode').addEventListener('change', (e) => {
            if (this.canvasManager.playbackLocked) {
                // 回放中由回放驱动，撤销用户改动
                e.target.value = this.renderer.lightMode;
                return;
            }
            this.renderer.setLightMode(e.target.value);
            window.dispatchEvent(new CustomEvent('lightModeChanged', {
                detail: { mode: e.target.value }
            }));
        });

        // 切换标注
        const btnToggleLabels = document.getElementById('btn-toggle-labels');
        btnToggleLabels.addEventListener('click', () => {
            if (this.canvasManager.playbackLocked) return;
            const showLabels = this.renderer.toggleLabels();
            btnToggleLabels.classList.toggle('active', showLabels);
            window.dispatchEvent(new CustomEvent('labelsToggled', {
                detail: { show: showLabels }
            }));
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
                const lens = this.canvasManager.selectedLens;
                lens.refractiveIndex = value;
                this.renderer.render();
                this.notifyLensParamChanged(lens, { refractiveIndex: value });
            }
        });

        const sizeSlider = document.getElementById('param-size');
        sizeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('param-size-value').textContent = `${value}%`;

            if (this.canvasManager.selectedLens) {
                const lens = this.canvasManager.selectedLens;
                lens.size = value;
                this.renderer.render();
                this.notifyLensParamChanged(lens, { size: value });
            }
        });

        const curvatureSlider = document.getElementById('param-curvature');
        curvatureSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('param-curvature-value').textContent = `${value}%`;

            if (this.canvasManager.selectedLens) {
                const lens = this.canvasManager.selectedLens;
                lens.curvature = value;
                this.renderer.render();
                this.notifyLensParamChanged(lens, { curvature: value });
            }
        });

        document.getElementById('param-material').addEventListener('change', (e) => {
            if (this.canvasManager.selectedLens) {
                const lens = this.canvasManager.selectedLens;
                lens.applyMaterial(e.target.value);
                riSlider.value = lens.refractiveIndex;
                document.getElementById('param-ri-value').textContent =
                    lens.refractiveIndex.toFixed(2);
                this.renderer.render();
                // 材料切换会同时改变折射率，作为一条整体修改录制
                this.notifyLensParamChanged(lens, {
                    material: lens.material,
                    refractiveIndex: lens.refractiveIndex,
                    dispersion: lens.dispersion
                });
            }
        });

        document.getElementById('btn-reset-lens').addEventListener('click', () => {
            if (this.canvasManager.selectedLens) {
                const lens = this.canvasManager.selectedLens;
                lens.reset();
                this.updateParamPanel(lens);
                this.renderer.render();
                // 重置是一次整体参数修改，只录一条
                this.notifyLensParamChanged(lens, {
                    refractiveIndex: lens.refractiveIndex,
                    size: lens.size,
                    curvature: lens.curvature,
                    material: lens.material,
                    dispersion: lens.dispersion
                });
                Utils.showToast('参数已重置', 'success');
            }
        });

        document.getElementById('btn-delete-lens').addEventListener('click', () => {
            if (this.canvasManager.playbackLocked) return;
            if (this.canvasManager.selectedLens) {
                this.canvasManager.removeLens(this.canvasManager.selectedLens);
                Utils.showToast('透镜已删除', 'success');
            }
        });
    }

    /**
     * 通知透镜参数发生变化（录制器据此做防抖合并，反复拖动滑块只保留最终值）
     */
    notifyLensParamChanged(lens, changes) {
        if (this.canvasManager.playbackLocked) return;
        window.dispatchEvent(new CustomEvent('lensParamChanged', {
            detail: { id: lens.id, changes }
        }));
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

        // 回放跳转后同步工具栏按钮状态
        window.addEventListener('playbackStateChanged', (e) => {
            const { isRunning, lightMode, showLabels } = e.detail;
            this.updateLightButtonState(!!isRunning);

            const modeSelect = document.getElementById('select-light-mode');
            if (modeSelect && lightMode) modeSelect.value = lightMode;

            const btnLabels = document.getElementById('btn-toggle-labels');
            if (btnLabels) btnLabels.classList.toggle('active', !!showLabels);

            // 回放过程中不选中任何透镜，参数面板回到空态
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
