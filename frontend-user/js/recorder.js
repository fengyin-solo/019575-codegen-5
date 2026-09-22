/**
 * 实验录制与回放管理器
 *
 * 功能：
 * - 录制一次实验中的启动光路、参数调整、增删透镜等操作
 * - 同一参数在连续调整中反复修改时，只保留关键的几次与最终生效值
 * - 按时间轴回放，支持播放/暂停/跳到任意时间点
 * - 回放结束后画布恢复到录制结束时的状态
 * - 录制内容与回放位置持久化到 localStorage：
 *   刷新页面后内容保留、回放位置同步、录制中断不丢内容、初始化即可看出是否在回放中
 */
class RecorderManager {
    // 连续修改同一参数时的合并参数
    static COALESCE_IDLE = 400;       // 停顿多久后把“最终生效值”落入时间轴
    static COALESCE_CHECKPOINT = 700; // 连续拖动时，每隔多久保留一个中间点

    constructor(canvasManager, interactionManager) {
        this.canvasManager = canvasManager;
        this.interactionManager = interactionManager;
        this.canvasManager.recorder = this;
        this.interactionManager.recorder = this;

        // 模式：idle（未录制也未回放）/ recording / playing / paused
        this.mode = 'idle';
        this.recording = null;
        this.playback = { active: false, position: 0, finished: false };

        // 录制内部状态
        this.startTime = 0;
        this.coalescers = new Map();
        this._tickTimer = null;
        this._lastPersistTick = 0;

        // 回放内部状态
        this.appliedIndex = 0;
        this._lastLensId = null;
        this._raf = null;
        this.lastFrameTime = 0;
        this._lastPersistFrame = 0;

        this.init();
    }

    get isRecording() {
        return this.mode === 'recording';
    }

    get isPlaybackActive() {
        return this.playback.active;
    }

    /**
     * 初始化：读取持久化内容，恢复录制/回放现场
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.recover();

        // 恢复回放现场（构造时画布已就绪）
        if (this.playback.active) {
            this.setPlaybackLock(true);
            this.rebuild(this.playback.position);
            if (this.mode === 'playing' && !this.playback.finished) {
                this.lastFrameTime = performance.now();
                this._raf = requestAnimationFrame(this.tickPlayback);
            }
        }

        this.updateUI();

        if (this._interruptedNotice) {
            Utils.showToast('上次录制意外中断，已为你保留已有内容', 'warning');
        }

        // 页面隐藏/关闭前尽量保住已有内容与回放进度
        const flushBeforeHide = () => {
            if (this.isRecording) {
                this.flushCoalescers();
                this.recording.duration = this.elapsed();
                Storage.saveRecording(this.recording);
            }
            if (this.playback.active && this.mode === 'playing') {
                this.persistPlayback();
            }
        };
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushBeforeHide();
        });
        window.addEventListener('pagehide', flushBeforeHide);
    }

    cacheElements() {
        this.el = {
            bar: document.getElementById('recorder-bar'),
            recordBtn: document.getElementById('btn-rec-record'),
            recordLabel: document.getElementById('rec-record-label'),
            playBtn: document.getElementById('btn-rec-play'),
            playIcon: document.getElementById('rec-play-icon'),
            stopBtn: document.getElementById('btn-rec-stop'),
            timeline: document.getElementById('rec-timeline'),
            timeCurrent: document.getElementById('rec-time-current'),
            timeTotal: document.getElementById('rec-time-total'),
            liveBadge: document.getElementById('rec-live-badge'),
            liveElapsed: document.getElementById('rec-live-elapsed'),
            deleteBtn: document.getElementById('btn-rec-delete'),
            playbackBadge: document.getElementById('playback-badge')
        };
    }

    bindEvents() {
        this.el.recordBtn.addEventListener('click', () => this.onRecordButton());
        this.el.playBtn.addEventListener('click', () => this.togglePlayPause());
        this.el.stopBtn.addEventListener('click', () => this.exitPlayback(true));
        this.el.deleteBtn.addEventListener('click', () => this.deleteRecording());

        // 拖动时间轴跳到任意时间点
        this.el.timeline.addEventListener('input', (e) => {
            this.seekTo(parseFloat(e.target.value));
        });
    }

    // ------------------------------------------------------------------
    // 持久化与中断恢复
    // ------------------------------------------------------------------

    persist() {
        if (this.recording) {
            Storage.saveRecording(this.recording);
        }
    }

    persistPlayback() {
        if (!this.playback.active) return;
        Storage.savePlaybackState({
            active: true,
            position: this.playback.position,
            mode: this.mode === 'playing' ? 'playing' : 'paused',
            finished: this.playback.finished
        });
    }

    /**
     * 刷新页面后恢复：录制被标成 interrupted 保留，回放位置单独恢复
     */
    recover() {
        const rec = Storage.loadRecording();
        if (rec && Array.isArray(rec.events) && rec.initialState) {
            if (rec.status === 'recording') {
                // 录到一半中断：保住已有内容，补全时长与结束快照。
                // 最后一个事件后可能还有来不及合并/落盘的修改，按合并窗口预留时间，
                // 保证已落入时间轴的最后一次操作一定包含在可回放范围内。
                rec.status = 'interrupted';
                const lastT = rec.events.length ? rec.events[rec.events.length - 1].t : 0;
                rec.duration = lastT + RecorderManager.COALESCE_IDLE + 50;
                if (!rec.finalState) {
                    rec.finalState = this.computeStateAt(rec, rec.duration).state;
                }
                Storage.saveRecording(rec);
                this._interruptedNotice = true;
            }
            this.recording = rec;
        } else if (rec) {
            Storage.removeRecording();
        }

        const pb = Storage.loadPlaybackState();
        if (pb && pb.active && this.recording) {
            this.playback.active = true;
            this.playback.finished = !!pb.finished;
            this.playback.position = Utils.clamp(
                pb.position || 0, 0, this.recording.duration || 0
            );
            this.mode = pb.mode === 'playing' ? 'playing' : 'paused';
        }
    }

    // ------------------------------------------------------------------
    // 录制
    // ------------------------------------------------------------------

    /**
     * 录制按钮：开始 / 停止
     */
    onRecordButton() {
        if (this.isRecording) {
            this.stopRecording();
            return;
        }
        this.startRecording();
    }

    startRecording() {
        // 测验模式中画布被题目占用，不允许开始录制
        const app = document.getElementById('app');
        if (app && app.classList.contains('quiz-mode')) {
            Utils.showToast('请先退出测验模式，再开始录制', 'warning');
            return;
        }

        // 回放中开始新录制：先退出回放，画布恢复到录制结束状态后再录
        if (this.playback.active) {
            this.exitPlayback(true);
        }

        if (this.recording) {
            if (!window.confirm('开始新的录制将覆盖已有的录制内容，确定继续吗？')) return;
            Storage.removeRecording();
            Storage.removePlaybackState();
            this.recording = null;
        }

        this.playback = { active: false, position: 0, finished: false };
        this.coalescers.clear();
        this._lastLensId = null;

        this.recording = {
            version: 1,
            createdAt: Date.now(),
            finishedAt: null,
            status: 'recording',
            duration: 0,
            initialState: this.canvasManager.getStateSnapshot(),
            finalState: null,
            events: []
        };

        this.mode = 'recording';
        this.startTime = performance.now();
        this._lastPersistTick = 0;
        this.persist();

        this._tickTimer = setInterval(() => this.recordTick(), 200);
        this.updateUI();
        Utils.showToast('开始录制，操作过程将被记录', 'info');
    }

    stopRecording() {
        if (!this.isRecording) return;

        clearInterval(this._tickTimer);
        this._tickTimer = null;

        // 收尾：把尚未落入时间轴的“最终生效值”补齐
        this.flushCoalescers();

        this.recording.duration = this.elapsed();
        this.recording.status = 'finished';
        this.recording.finishedAt = Date.now();
        this.recording.finalState = this.canvasManager.getStateSnapshot();

        this.mode = 'idle';
        this.persist();
        this.updateUI();
        Utils.showToast('录制完成，可点击播放查看回放', 'success');
    }

    recordTick() {
        this.recording.duration = this.elapsed();
        this.el.liveElapsed.textContent = this.formatTime(this.recording.duration);
        if (this.recording.duration - this._lastPersistTick >= 1000) {
            this._lastPersistTick = this.recording.duration;
            this.persist();
        }
    }

    elapsed() {
        return this.isRecording ? performance.now() - this.startTime : 0;
    }

    /**
     * 向时间轴插入一个事件（按时间有序）
     */
    addEvent(event) {
        event.id = Utils.generateId();
        let i = this.recording.events.length;
        while (i > 0 && this.recording.events[i - 1].t > event.t) i--;
        this.recording.events.splice(i, 0, event);
        this.persist();
    }

    /**
     * 合并连续修改：
     * - 第一次修改立即保留（回放时能看到变化的开始）
     * - 连续调整时每隔一段时间保留一个中间点
     * - 停顿后补入最终生效的那一次（与已落入时间轴的最后值相同则不重复）
     */
    coalesce(key, value, push) {
        let c = this.coalescers.get(key);
        if (!c) {
            const t = this.elapsed();
            c = { lastValue: value, lastPushed: value, lastPushT: t, timer: null, push };
            this.coalescers.set(key, c);
            push(t, value);
        }

        c.lastValue = value;
        const now = this.elapsed();
        if (value !== c.lastPushed && now - c.lastPushT >= RecorderManager.COALESCE_CHECKPOINT) {
            push(now, value);
            c.lastPushed = value;
            c.lastPushT = now;
        }

        clearTimeout(c.timer);
        c.timer = setTimeout(() => {
            // 停顿后把“最终生效值”落入时间轴（值没变则无需新事件）
            if (c.lastValue !== c.lastPushed) {
                c.push(this.elapsed(), c.lastValue);
            }
            this.coalescers.delete(key);
        }, RecorderManager.COALESCE_IDLE);
    }

    /**
     * 停止录制/页面前，把所有等待中的最终值立即落入时间轴
     */
    flushCoalescers() {
        this.coalescers.forEach((c) => {
            clearTimeout(c.timer);
            if (c.lastValue !== c.lastPushed) {
                c.push(this.elapsed(), c.lastValue);
            }
        });
        this.coalescers.clear();
    }

    // ------------------------------------------------------------------
    // 录制埋点（由 CanvasManager / InteractionManager 调用）
    // ------------------------------------------------------------------

    recordLightToggle(running) {
        if (!this.isRecording) return;
        this.addEvent({ t: this.elapsed(), type: 'lightToggle', running });
    }

    recordLightMode(mode) {
        if (!this.isRecording) return;
        this.addEvent({ t: this.elapsed(), type: 'lightMode', mode });
    }

    recordCanvasReset() {
        if (!this.isRecording) return;
        this.addEvent({ t: this.elapsed(), type: 'canvasReset' });
    }

    recordLensAdd(lens) {
        if (!this.isRecording) return;
        this._lastLensId = lens.id;
        this.addEvent({ t: this.elapsed(), type: 'lensAdd', lens: lens.toJSON() });
    }

    recordLensRemove(lensId) {
        if (!this.isRecording) return;
        if (this._lastLensId === lensId) this._lastLensId = null;
        this.addEvent({ t: this.elapsed(), type: 'lensRemove', lensId });
    }

    recordLensParam(lensId, param, value) {
        if (!this.isRecording) return;
        this._lastLensId = lensId;
        this.coalesce(`param:${lensId}:${param}`, value, (t, v) => {
            this.addEvent({ t, type: 'lensParam', lensId, param, value: v });
        });
    }

    recordLensMove(lensId, x, y) {
        if (!this.isRecording) return;
        this._lastLensId = lensId;
        const key = `move:${lensId}`;
        this.coalesce(key, `${x}|${y}`, (t, v) => {
            const [sx, sy] = v.split('|');
            this.addEvent({
                t, type: 'lensMove', lensId,
                x: parseFloat(sx), y: parseFloat(sy)
            });
        });
    }

    recordLensMaterial(lens) {
        if (!this.isRecording) return;
        this._lastLensId = lens.id;
        this.addEvent({
            t: this.elapsed(),
            type: 'lensMaterial',
            lensId: lens.id,
            material: lens.material,
            refractiveIndex: lens.refractiveIndex,
            dispersion: lens.dispersion
        });
    }

    recordLensReset(lens) {
        if (!this.isRecording) return;
        this._lastLensId = lens.id;
        this.addEvent({
            t: this.elapsed(),
            type: 'lensReset',
            lensId: lens.id,
            refractiveIndex: lens.refractiveIndex,
            size: lens.size,
            curvature: lens.curvature,
            material: lens.material,
            dispersion: lens.dispersion
        });
    }

    // ------------------------------------------------------------------
    // 回放
    // ------------------------------------------------------------------

    togglePlayPause() {
        if (!this.recording || this.isRecording) return;

        if (!this.playback.active) {
            this.enterPlayback(0);
            return;
        }

        if (this.mode === 'playing') {
            this.pausePlayback();
        } else if (this.playback.finished) {
            this.enterPlayback(0);
        } else {
            this.resumePlayback();
        }
    }

    enterPlayback(position) {
        this.playback.active = true;
        this.playback.finished = false;
        this.setPlaybackLock(true);
        this.rebuild(position);
        this.mode = 'playing';
        this.lastFrameTime = performance.now();
        this._lastPersistFrame = 0;
        cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(this.tickPlayback);
        this.updateUI();
        this.persistPlayback();
    }

    resumePlayback() {
        if (this.playback.finished) {
            this.enterPlayback(0);
            return;
        }
        this.mode = 'playing';
        this.lastFrameTime = performance.now();
        cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(this.tickPlayback);
        this.updateUI();
        this.persistPlayback();
    }

    pausePlayback() {
        if (this.mode !== 'playing') return;
        cancelAnimationFrame(this._raf);
        this._raf = null;
        this.mode = 'paused';
        // 暂停时同步一次选中透镜与参数面板
        this.rebuild(this.playback.position);
        this.updateUI();
        this.persistPlayback();
    }

    /**
     * 跳到任意时间点（暂停态查看）
     */
    seekTo(position) {
        if (!this.recording || this.isRecording) return;

        if (!this.playback.active) {
            this.playback.active = true;
            this.playback.finished = false;
            this.setPlaybackLock(true);
        }

        cancelAnimationFrame(this._raf);
        this._raf = null;
        this.mode = 'paused';
        this.playback.finished = false;
        this.rebuild(position);
        this.updateUI();
        this.persistPlayback();
    }

    tickPlayback = (now) => {
        if (this.mode !== 'playing' || !this.recording) return;

        const dt = now - (this.lastFrameTime || now);
        this.lastFrameTime = now;

        const duration = this.recording.duration;
        const newPosition = Math.min(duration, this.playback.position + dt);
        this.applyRange(this.playback.position, newPosition);
        this.playback.position = newPosition;
        this.updateProgress();

        if (now - this._lastPersistFrame >= 1000) {
            this._lastPersistFrame = now;
            this.persistPlayback();
        }

        if (newPosition >= duration) {
            this.finishPlayback();
            return;
        }

        this._raf = requestAnimationFrame(this.tickPlayback);
    }

    /**
     * 回放结束：画布恢复到录制结束时的状态
     */
    finishPlayback() {
        cancelAnimationFrame(this._raf);
        this._raf = null;
        this.mode = 'paused';
        this.playback.finished = true;
        this.playback.position = this.recording.duration;
        this.appliedIndex = this.recording.events.length;
        this._lastLensId = null;

        this.canvasManager.restoreState(this.recording.finalState);
        this.syncToolbar(this.recording.finalState);

        this.setPlaybackLock(true);
        this.updateUI();
        this.persistPlayback();
    }

    /**
     * 退出回放：画布同样恢复到录制结束时的状态
     */
    exitPlayback(restore = true) {
        cancelAnimationFrame(this._raf);
        this._raf = null;

        const wasActive = this.playback.active;
        this.playback = { active: false, position: 0, finished: false };
        this.mode = 'idle';
        this.appliedIndex = 0;
        this._lastLensId = null;
        this.setPlaybackLock(false);

        if (restore && wasActive && this.recording && this.recording.finalState) {
            this.canvasManager.restoreState(this.recording.finalState);
            this.syncToolbar(this.recording.finalState);
        }

        Storage.removePlaybackState();
        this.updateUI();
    }

    deleteRecording() {
        if (!this.recording || this.isRecording) return;
        if (!window.confirm('确定删除这段录制吗？删除后无法恢复。')) return;

        // 回放中删除：先停止引擎并解锁，但不改动当前画布
        if (this.playback.active) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
            this.playback = { active: false, position: 0, finished: false };
            this.mode = 'idle';
            this.setPlaybackLock(false);
        }

        Storage.removeRecording();
        Storage.removePlaybackState();
        this.recording = null;
        this.coalescers.clear();
        this.updateUI();
        Utils.showToast('录制已删除', 'info');
    }

    /**
     * 重建到指定时间点的完整状态（用于跳转、暂停、刷新恢复）
     */
    rebuild(position) {
        const pos = Utils.clamp(position, 0, this.recording.duration || 0);
        const { state, lastLensId } = this.computeStateAt(this.recording, pos);

        let index = this.recording.events.findIndex(ev => ev.t > pos);
        this.appliedIndex = index === -1 ? this.recording.events.length : index;
        this._lastLensId = lastLensId;
        this.playback.position = pos;

        this.canvasManager.restoreState(state, { selectLensId: lastLensId });
        this.syncToolbar(state);
        this.updateProgress();
    }

    /**
     * 正向播放时，只增量应用 (from, to] 之间的事件
     */
    applyRange(from, to) {
        const events = this.recording.events;
        while (this.appliedIndex < events.length && events[this.appliedIndex].t <= to) {
            this.applyEventLive(events[this.appliedIndex]);
            this.appliedIndex++;
        }
    }

    /**
     * 纯数据回放：从录制初始状态计算任意时间点的画布状态
     */
    computeStateAt(recording, position) {
        const state = {
            lenses: (recording.initialState.lenses || []).map(l => ({ ...l })),
            lightMode: recording.initialState.lightMode || CONFIG.LIGHT_DEFAULTS.mode,
            running: !!recording.initialState.running
        };

        let lastLensId = null;
        for (const ev of recording.events) {
            if (ev.t > position) break;
            this.applyEventData(state, ev);
            if (ev.lensId) lastLensId = ev.lensId;
            if (ev.type === 'lensAdd') lastLensId = ev.lens.id;
        }

        return { state, lastLensId };
    }

    /**
     * 纯数据：应用单个事件到状态对象
     */
    applyEventData(state, ev) {
        switch (ev.type) {
            case 'lightToggle':
                state.running = ev.running;
                break;
            case 'lightMode':
                state.lightMode = ev.mode;
                break;
            case 'canvasReset':
                state.lenses = [];
                break;
            case 'lensAdd':
                state.lenses.push({ ...ev.lens });
                break;
            case 'lensRemove':
                state.lenses = state.lenses.filter(l => l.id !== ev.lensId);
                break;
            case 'lensParam': {
                const lens = state.lenses.find(l => l.id === ev.lensId);
                if (lens) lens[ev.param] = ev.value;
                break;
            }
            case 'lensMove': {
                const lens = state.lenses.find(l => l.id === ev.lensId);
                if (lens) { lens.x = ev.x; lens.y = ev.y; }
                break;
            }
            case 'lensMaterial': {
                const lens = state.lenses.find(l => l.id === ev.lensId);
                if (lens) {
                    lens.material = ev.material;
                    lens.refractiveIndex = ev.refractiveIndex;
                    lens.dispersion = ev.dispersion;
                }
                break;
            }
            case 'lensReset': {
                const lens = state.lenses.find(l => l.id === ev.lensId);
                if (lens) {
                    lens.refractiveIndex = ev.refractiveIndex;
                    lens.size = ev.size;
                    lens.curvature = ev.curvature;
                    lens.material = ev.material;
                    lens.dispersion = ev.dispersion;
                }
                break;
            }
        }
    }

    /**
     * 正向播放：把单个事件应用到真实画布
     */
    applyEventLive(ev) {
        const cm = this.canvasManager;

        switch (ev.type) {
            case 'lightToggle':
                cm.getRenderer().setRunning(ev.running);
                this.syncRunningButton(ev.running);
                break;

            case 'lightMode':
                cm.getRenderer().setLightMode(ev.mode);
                this.syncModeSelect(ev.mode);
                break;

            case 'canvasReset':
                cm.clear();
                break;

            case 'lensAdd': {
                const lens = Lens.fromJSON(ev.lens);
                cm.addLens(lens);
                this._lastLensId = lens.id;
                break;
            }

            case 'lensRemove': {
                const lens = cm.lenses.find(l => l.id === ev.lensId);
                if (lens) cm.removeLens(lens);
                if (this._lastLensId === ev.lensId) this._lastLensId = null;
                break;
            }

            case 'lensParam': {
                const lens = cm.lenses.find(l => l.id === ev.lensId);
                if (lens) {
                    lens[ev.param] = ev.value;
                    cm.getRenderer().render();
                }
                this._lastLensId = ev.lensId;
                break;
            }

            case 'lensMove': {
                const lens = cm.lenses.find(l => l.id === ev.lensId);
                if (lens) {
                    lens.x = ev.x;
                    lens.y = ev.y;
                    cm.getRenderer().render();
                }
                this._lastLensId = ev.lensId;
                break;
            }

            case 'lensMaterial': {
                const lens = cm.lenses.find(l => l.id === ev.lensId);
                if (lens) {
                    lens.applyMaterial(ev.material);
                    lens.refractiveIndex = ev.refractiveIndex;
                    lens.dispersion = ev.dispersion;
                    cm.getRenderer().render();
                }
                this._lastLensId = ev.lensId;
                break;
            }

            case 'lensReset': {
                const lens = cm.lenses.find(l => l.id === ev.lensId);
                if (lens) {
                    lens.refractiveIndex = ev.refractiveIndex;
                    lens.size = ev.size;
                    lens.curvature = ev.curvature;
                    lens.material = ev.material;
                    lens.dispersion = ev.dispersion;
                    cm.getRenderer().render();
                }
                this._lastLensId = ev.lensId;
                break;
            }
        }
    }

    // ------------------------------------------------------------------
    // UI 同步
    // ------------------------------------------------------------------

    syncToolbar(state) {
        this.syncModeSelect(state.lightMode);
        this.syncRunningButton(!!state.running);
    }

    syncModeSelect(mode) {
        const select = document.getElementById('select-light-mode');
        if (select) select.value = mode || CONFIG.LIGHT_DEFAULTS.mode;
    }

    syncRunningButton(running) {
        if (this.interactionManager && this.interactionManager.updateLightButtonState) {
            this.interactionManager.updateLightButtonState(running);
        }
    }

    setPlaybackLock(locked) {
        const app = document.getElementById('app');
        if (app) app.classList.toggle('playback-mode', locked);
    }

    updateProgress() {
        if (!this.recording) {
            this.el.timeline.value = 0;
            this.el.timeCurrent.textContent = this.formatTime(0);
            return;
        }
        this.el.timeline.value = this.playback.active ? this.playback.position : 0;
        this.el.timeCurrent.textContent = this.formatTime(
            this.isRecording ? this.recording.duration : this.playback.position
        );
    }

    updateUI() {
        const hasRecording = !!this.recording;
        const recording = this.isRecording;
        const playing = this.mode === 'playing';
        const finished = this.playback.finished;

        // 录制按钮
        this.el.recordBtn.disabled = this.playback.active;
        this.el.recordBtn.classList.toggle('active', recording);
        this.el.recordLabel.textContent = recording ? '停止录制' : '录制';
        this.el.liveBadge.classList.toggle('hidden', !recording);

        // 播放/暂停/重播按钮
        this.el.playBtn.disabled = !hasRecording || recording;
        this.el.playBtn.title = finished ? '重新回放' : playing ? '暂停' : '播放';
        if (playing) {
            this.el.playIcon.innerHTML =
                '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        } else {
            this.el.playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
        }

        // 退出回放按钮
        this.el.stopBtn.disabled = !this.playback.active;

        // 时间轴
        const duration = hasRecording ? this.recording.duration : 0;
        this.el.timeline.disabled = !hasRecording || recording;
        this.el.timeline.max = duration;
        this.el.timeline.value = this.playback.active ? this.playback.position : 0;

        // 时间显示
        this.el.timeCurrent.textContent = this.formatTime(
            recording ? this.recording.duration : (this.playback.active ? this.playback.position : 0)
        );
        this.el.timeTotal.textContent = this.formatTime(duration);
        if (recording) this.el.liveElapsed.textContent = this.formatTime(this.recording.duration);

        // 删除按钮：回放中也可删除（会先退出回放）
        this.el.deleteBtn.classList.toggle('hidden', !hasRecording || recording);

        // 回放状态徽标：初始化后一眼能看出是否处于回放中
        const badge = this.el.playbackBadge;
        if (this.playback.active) {
            badge.classList.remove('hidden');
            if (finished) {
                badge.textContent = '✓ 回放完成';
                badge.classList.add('is-finished');
                badge.classList.remove('is-paused');
            } else if (playing) {
                badge.textContent = '▶ 回放中';
                badge.classList.remove('is-finished', 'is-paused');
            } else {
                badge.textContent = '⏸ 回放已暂停';
                badge.classList.add('is-paused');
                badge.classList.remove('is-finished');
            }
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('is-finished', 'is-paused');
        }
    }

    formatTime(ms) {
        const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}
