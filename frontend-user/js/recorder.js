/**
 * 实验录制与回放管理器
 *
 * 录制内容：
 * - 录制开始时的画布快照（透镜、光路状态、光源模式、标注）
 * - 之后的增量操作事件（增删透镜、移动、参数修改、光路启停、重置等）
 *
 * 参数合并：
 * - 同一透镜同一参数在连续调节（如拖动滑块）过程中只保留最终生效的一次
 * - 停顿后再次调节会形成新的一次修改（"最终生效的那几次"）
 *
 * 持久化：
 * - 录制与回放状态都实时写入 localStorage
 * - 录制到一半刷新/关闭页面，已有内容不丢失，下次打开可继续或结束保存
 */
class RecorderManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.renderer = canvasManager.getRenderer();

        // recording: 是否处于录制中（含暂停）
        this.recording = false;
        this.recordPaused = false;
        this.record = null;            // { startedAt, finished, snapshot, events[] }
        // 连续调节中尚未落盘的参数修改：key -> { event, timer }
        this.pendingParams = new Map();

        // 回放状态
        this.isPlaying = false;
        this.playTime = 0;             // 当前回放位置（相对录制时间线，毫秒）
        this.playTimer = null;
        this._lastTick = 0;
        // 已应用到画布的事件下标，播放时增量应用
        this._appliedCount = 0;

        this.PARAM_MERGE_DELAY = 600;  // 停顿超过该时长视为新一轮修改
        this.PLAY_INTERVAL = 50;

        this.init();
    }

    init() {
        this.cacheElements();
        this.bindRecordEvents();
        this.bindUIEvents();
        this.bindLifecycleEvents();
        this.restoreFromStorage();
    }

    /* ======================== 元素与 UI ======================== */

    cacheElements() {
        this.el = {
            bar: document.getElementById('recorder-bar'),
            btnRecord: document.getElementById('btn-record'),
            recordDot: document.getElementById('record-dot'),
            recordLabel: document.getElementById('record-label'),
            recordTime: document.getElementById('record-time'),
            btnPlayback: document.getElementById('btn-playback'),
            playControls: document.getElementById('playback-controls'),
            btnPlayPause: document.getElementById('btn-play-pause'),
            btnPlayStart: document.getElementById('btn-play-start'),
            btnPlayPrev: document.getElementById('btn-play-prev'),
            btnPlayNext: document.getElementById('btn-play-next'),
            btnPlayEnd: document.getElementById('btn-play-end'),
            btnExitPlayback: document.getElementById('btn-exit-playback'),
            timeline: document.getElementById('playback-timeline'),
            timeCurrent: document.getElementById('playback-time-current'),
            timeTotal: document.getElementById('playback-time-total'),
            badge: document.getElementById('playback-badge')
        };
    }

    bindUIEvents() {
        // 开始 / 暂停 / 继续 / 结束录制
        this.el.btnRecord.addEventListener('click', () => this.onRecordButtonClick());
        this.el.btnPlayback.addEventListener('click', () => this.enterPlayback());

        // 回放控制
        this.el.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
        this.el.btnPlayStart.addEventListener('click', () => this.seekTo(0));
        this.el.btnPlayPrev.addEventListener('click', () => this.stepEvent(-1));
        this.el.btnPlayNext.addEventListener('click', () => this.stepEvent(1));
        this.el.btnPlayEnd.addEventListener('click', () => this.seekToEnd());
        this.el.btnExitPlayback.addEventListener('click', () => this.exitPlayback());

        // 时间轴跳转
        this.el.timeline.addEventListener('input', (e) => {
            this.seekTo(parseInt(e.target.value, 10));
        });
    }

    bindLifecycleEvents() {
        // 录制中意外关闭/刷新：落盘未落定的参数修改，保住已有内容
        const flush = () => {
            if (this.recording) {
                this.flushPendingParams();
                this.persistRecording();
            }
            if (this.isPlaying) {
                this.persistPlayback();
            }
        };
        window.addEventListener('beforeunload', flush);
        window.addEventListener('pagehide', flush);

        // 录制计时器显示
        setInterval(() => this.updateRecordClock(), 500);
    }

    /* ======================== 录制事件监听 ======================== */

    bindRecordEvents() {
        // 仅在录制进行中（非暂停）时记录
        const on = (name, handler) => window.addEventListener(name, (e) => {
            if (!this.recording || this.recordPaused) return;
            handler(e.detail || {});
        });

        on('lensAdded', (data) => {
            this.pushEvent('addLens', Utils.deepClone(data));
        });

        on('lensRemoved', (data) => {
            // 透镜被删除时，悬而未决的参数修改不再需要
            this.cancelPendingParams(data.id);
            this.pushEvent('removeLens', { id: data.id });
        });

        on('lensMoved', (data) => {
            // 一次拖拽的最终位置只记一条
            this.pushEvent('moveLens', { id: data.id, x: data.x, y: data.y });
        });

        on('lensParamChanged', (data) => {
            this.handleParamChange(data.id, data.changes);
        });

        on('lightToggled', (data) => {
            this.pushEvent('lightToggle', { running: !!data.running });
        });

        on('lightModeChanged', (data) => {
            this.pushEvent('lightMode', { mode: data.mode });
        });

        on('labelsToggled', (data) => {
            this.pushEvent('toggleLabels', { show: !!data.show });
        });

        on('canvasCleared', () => {
            // 重置画布前，先把未落定的参数修改按其时间点保留
            this.flushPendingParams();
            this.pushEvent('clear', {});
        });
    }

    /* ======================== 录制控制 ======================== */

    onRecordButtonClick() {
        if (!this.recording) {
            // 回放中点录制：先退出回放（画布保持当前状态）再开始
            if (this.playbackActive) {
                this.exitPlayback();
            }
            this.startRecording();
        } else if (this.recordPaused) {
            this.resumeRecording();
        } else {
            // 录制中 → 暂停并询问是否结束
            this.pauseRecording();
            if (confirm('录制已暂停。\n\n确定 = 结束并保存本次录制\n取消 = 继续录制')) {
                this.stopRecording();
            }
        }
    }

    startRecording() {
        // 已有有效录制内容需确认覆盖；无效残留直接忽略
        const existing = Storage.getJSON(CONFIG.STORAGE_KEYS.RECORDING);
        if (this.isValidRecord(existing)) {
            if (!confirm('已存在一段录制，开始新录制将覆盖它。确定继续吗？')) {
                return;
            }
        }

        this.flushPendingParams();
        this.recording = true;
        this.recordPaused = false;
        this.record = {
            version: 1,
            startedAt: Date.now(),
            finished: false,
            duration: 0,
            snapshot: this.canvasManager.getStateSnapshot(),
            events: []
        };
        this.persistRecording();
        this.refreshUI();
        Utils.showToast('开始录制实验', 'success');
    }

    pauseRecording() {
        if (!this.recording || this.recordPaused) return;
        // 先结算未落定修改与已录时长（此时仍按运行态计时），再置暂停标志
        this.flushPendingParams();
        this.record.duration = this.currentRecordElapsed();
        this.recordPaused = true;
        this.persistRecording();
        this.refreshUI();
        Utils.showToast('录制已暂停', 'info');
    }

    resumeRecording() {
        if (!this.recording || !this.recordPaused) return;
        this.recordPaused = false;
        // 以"已录时长 + 当前时刻"作为新的计时基准
        this.record.startedAt = Date.now() - this.record.duration;
        this.persistRecording();
        this.refreshUI();
        Utils.showToast('继续录制', 'success');
    }

    stopRecording() {
        if (!this.recording) return;
        this.flushPendingParams();
        this.record.finished = true;
        this.record.duration = this.currentRecordElapsed();
        this.persistRecording();

        this.recording = false;
        this.recordPaused = false;
        this.refreshUI();
        Utils.showToast('录制已保存，可点击回放查看', 'success');
    }

    /**
     * 录制开始至今经过的时间（毫秒，不含暂停）。
     * 操作事件至少在 1ms，保证 t=0 永远是纯快照状态，便于从头回放。
     */
    currentRecordElapsed() {
        if (!this.record) return 0;
        if (this.recordPaused) return this.record.duration;
        return Math.max(1, Date.now() - this.record.startedAt);
    }

    /* ======================== 事件写入与参数合并 ======================== */

    pushEvent(type, data) {
        if (!this.recording || !this.record) return;
        this.record.events.push({
            t: this.currentRecordElapsed(),
            type,
            data
        });
        // 每次增量写入，录到一半中断也能保住已有内容
        this.persistRecording();
    }

    /**
     * 处理参数修改：同一透镜同一参数的连续修改只保留最后一次。
     * 不同参数、不同透镜的修改各自独立。
     */
    handleParamChange(lensId, changes) {
        Object.keys(changes).forEach(key => {
            const value = changes[key];
            const mapKey = lensId + '|' + key;
            const existing = this.pendingParams.get(mapKey);

            if (existing) {
                // 仍在同一轮连续调节中：只更新值与时间，事件条数不增加
                existing.event.data[key] = value;
                existing.event.t = this.currentRecordElapsed();
                clearTimeout(existing.timer);
            } else {
                const event = {
                    t: this.currentRecordElapsed(),
                    type: 'updateLens',
                    data: Object.assign({ id: lensId }, { [key]: value })
                };
                const entry = { event, timer: null, lensId, key };
                this.pendingParams.set(mapKey, entry);
            }

            // 停顿超时后该值"最终生效"，结算为一条事件
            const entry = this.pendingParams.get(mapKey);
            entry.timer = setTimeout(() => {
                this.commitPending(mapKey);
            }, this.PARAM_MERGE_DELAY);
        });
    }

    commitPending(mapKey) {
        const entry = this.pendingParams.get(mapKey);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pendingParams.delete(mapKey);
        this.record.events.push(entry.event);
        // 保持事件按时间有序
        this.record.events.sort((a, b) => a.t - b.t);
        this.persistRecording();
    }

    flushPendingParams(lensId = null) {
        Array.from(this.pendingParams.keys()).forEach(key => {
            if (lensId === null || key.startsWith(lensId + '|')) {
                this.commitPending(key);
            }
        });
    }

    /**
     * 放弃某透镜所有未落定的参数修改（透镜已被删除）
     */
    cancelPendingParams(lensId) {
        Array.from(this.pendingParams.keys()).forEach(key => {
            if (key.startsWith(lensId + '|')) {
                clearTimeout(this.pendingParams.get(key).timer);
                this.pendingParams.delete(key);
            }
        });
    }

    /* ======================== 回放 ======================== */

    /**
     * 进入回放模式（从时间轴起点或上次位置开始）
     */
    enterPlayback() {
        if (!this.record) {
            Utils.showToast('还没有录制内容，先录制一次实验吧', 'info');
            return;
        }
        if (this.recording) {
            Utils.showToast('请先结束当前录制', 'warning');
            return;
        }

        // 进入回放前清理可能残留的播放定时器（如刷新后恢复的场景）
        if (this.playTimer) {
            clearInterval(this.playTimer);
            this.playTimer = null;
        }
        this.isPlaying = false;

        this.playbackActive = true;
        this.playTime = 0;
        this._appliedCount = 0;
        document.body.classList.add('playback-mode');
        this.canvasManager.restoreState(
            this.record.snapshot,
            this.record.events,
            0
        );
        this.updateTimeline();
        this.persistPlayback();
        this.refreshUI();
        this.play();
        Utils.showToast('回放中…', 'info');
    }

    play() {
        if (!this.playbackActive || this.isPlaying) return;
        this.isPlaying = true;
        this._lastTick = performance.now();
        this.playTimer = setInterval(() => this.tick(), this.PLAY_INTERVAL);
        this.refreshPlayPauseButton();
        this.persistPlayback();
    }

    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        clearInterval(this.playTimer);
        this.playTimer = null;
        this.refreshPlayPauseButton();
        this.persistPlayback();
    }

    togglePlayPause() {
        if (!this.playbackActive) return;
        // 已播放到结尾再次点击：从头播放
        if (!this.isPlaying && this.playTime >= this.getDuration()) {
            this.seekTo(0);
            this.play();
            return;
        }
        this.isPlaying ? this.pause() : this.play();
    }

    tick() {
        const now = performance.now();
        const delta = now - this._lastTick;
        this._lastTick = now;
        this.seekTo(this.playTime + delta, true);
    }

    /**
     * 跳到时间轴任意时间点，画布重建为该时刻状态
     */
    seekTo(time, fromTick = false) {
        if (!this.playbackActive || !this.record) return;
        const duration = this.getDuration();
        this.playTime = Utils.clamp(time, 0, duration);

        this.canvasManager.restoreState(
            this.record.snapshot,
            this.record.events,
            this.playTime
        );
        this._appliedCount = this.record.events.filter(e => e.t <= this.playTime).length;
        this.updateTimeline();

        // 自然播放到结尾才提示"回放结束"；手动跳转不打断用户
        if (this.playTime >= duration && this.isPlaying && fromTick) {
            this.pause();
            Utils.showToast('回放结束', 'success');
        }
        this.persistPlayback();
    }

    seekToEnd() {
        this.pause();
        this.seekTo(this.getDuration());
    }

    /**
     * 跳到上一个/下一个操作点
     */
    stepEvent(direction) {
        if (!this.record) return;
        this.pause();
        const times = this.record.events.map(e => e.t);
        if (direction > 0) {
            const next = times.find(t => t > this.playTime + 1);
            this.seekTo(next === undefined ? this.getDuration() : next);
        } else {
            const passed = times.filter(t => t < this.playTime - 1);
            this.seekTo(passed.length ? passed[passed.length - 1] : 0);
        }
    }

    exitPlayback() {
        if (!this.playbackActive) return;
        this.pause();
        this.playbackActive = false;
        document.body.classList.remove('playback-mode');
        // 画布恢复为录制结束时的状态
        this.canvasManager.restoreState(
            this.record.snapshot,
            this.record.events,
            this.getDuration()
        );
        this.canvasManager.unlockAfterPlayback();
        Storage.remove(CONFIG.STORAGE_KEYS.PLAYBACK);
        this.refreshUI();
    }

    getDuration() {
        if (!this.record) return 0;
        const lastEvent = this.record.events.length
            ? this.record.events[this.record.events.length - 1].t
            : 0;
        return Math.max(this.record.duration || 0, lastEvent);
    }

    /* ======================== 持久化与恢复 ======================== */

    persistRecording() {
        if (this.record) {
            Storage.setJSON(CONFIG.STORAGE_KEYS.RECORDING, this.record);
        }
    }

    persistPlayback() {
        if (!this.record) return;
        Storage.setJSON(CONFIG.STORAGE_KEYS.PLAYBACK, {
            active: !!this.playbackActive,
            playing: !!this.isPlaying,
            time: this.playTime
        });
    }

    /**
     * 应用初始化时恢复：刷新后录制内容、回放位置均保留
     */
    restoreFromStorage() {
        this.record = Storage.getJSON(CONFIG.STORAGE_KEYS.RECORDING);
        const playbackState = Storage.getJSON(CONFIG.STORAGE_KEYS.PLAYBACK);

        if (this.isValidRecord(this.record)) {
            if (!this.record.finished) {
                // 录到一半中断：保住已有内容，以暂停态恢复，由用户决定继续或结束
                this.recording = true;
                this.recordPaused = true;
                // 基准时间平移到"现在 - 已录时长"，继续录制时时间轴可正确衔接
                this.record.startedAt = Date.now() - (this.record.duration || 0);
                setTimeout(() => {
                    Utils.showToast('上次录制未完成，已保留进度，可继续录制或结束保存', 'warning', 4000);
                }, 800);
            } else if (playbackState && playbackState.active) {
                // 刷新前处于回放中：恢复到同一回放位置，初始化即可看出处于回放
                this.playbackActive = true;
                this.playTime = Utils.clamp(
                    playbackState.time || 0, 0, this.getDuration()
                );
                document.body.classList.add('playback-mode');
                this.canvasManager.restoreState(
                    this.record.snapshot,
                    this.record.events,
                    this.playTime
                );
                if (playbackState.playing) {
                    this.play();
                } else {
                    this.isPlaying = false;
                }
            }
        } else {
            this.record = null;
        }

        this.refreshUI();
    }

    isValidRecord(record) {
        return !!(record && typeof record === 'object' &&
            typeof record.startedAt === 'number' &&
            record.snapshot && Array.isArray(record.events));
    }

    /* ======================== UI 刷新 ======================== */

    refreshUI() {
        const hasRecord = !!this.record;

        // 有录制内容（含未完成的录制）时才显示控制条
        this.el.bar.classList.toggle('hidden', !hasRecord);

        // 录制按钮状态
        this.el.btnPlayback.disabled = !hasRecord || this.recording;

        if (this.recording) {
            this.el.bar.classList.add('recording');
            this.el.btnRecord.classList.add('active');
            this.el.recordDot.style.display = '';
            this.el.recordLabel.textContent = this.recordPaused ? '继续录制' : '结束录制';
            this.el.recordDot.classList.toggle('paused', this.recordPaused);
        } else {
            this.el.bar.classList.remove('recording');
            this.el.btnRecord.classList.remove('active');
            this.el.recordDot.style.display = 'none';
            this.el.recordLabel.textContent = hasRecord ? '重新录制' : '开始录制';
        }

        // 回放控制条
        this.el.playControls.style.display = this.playbackActive ? 'flex' : 'none';
        this.el.btnPlayback.classList.toggle('active', !!this.playbackActive);
        this.el.badge.classList.toggle('hidden', !this.playbackActive);

        this.updateRecordClock();
        this.updateTimeline();
        this.refreshPlayPauseButton();
    }

    refreshPlayPauseButton() {
        if (!this.el.btnPlayPause) return;
        this.el.btnPlayPause.textContent = this.isPlaying ? '⏸ 暂停' : '▶ 播放';
    }

    updateRecordClock() {
        if (!this.el.recordTime) return;
        if (this.recording && this.record) {
            const label = this.recordPaused ? '已暂停 · ' : '录制中 · ';
            this.el.recordTime.textContent = label + this.formatTime(this.currentRecordElapsed());
        } else if (this.record) {
            this.el.recordTime.textContent = '时长 ' + this.formatTime(this.getDuration());
        } else {
            this.el.recordTime.textContent = '';
        }
    }

    updateTimeline() {
        if (!this.el.timeline) return;
        const duration = this.getDuration();
        const max = Math.max(duration, 1);
        this.el.timeline.max = max;
        this.el.timeline.value = this.playTime;
        this.el.timeCurrent.textContent = this.formatTime(this.playTime);
        this.el.timeTotal.textContent = this.formatTime(duration);
    }

    formatTime(ms) {
        const totalSec = Math.floor(ms / 1000);
        const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
        const sec = String(totalSec % 60).padStart(2, '0');
        return `${min}:${sec}`;
    }
}
