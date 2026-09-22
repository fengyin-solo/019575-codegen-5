// 核心逻辑冒烟测试（Node 环境，不依赖 DOM）
// 运行：node tests/test-logic.js
const assert = require('assert');
const path = require('path');

// ---- 最小浏览器环境桩 ----
const storage = {};
global.localStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
};
global.performance = { now: () => Date.now() };
let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };
global.document = {
    readyState: 'complete',
    addEventListener: () => {},
    getElementById: () => null,
    visibilityState: 'visible'
};
global.window = { addEventListener: () => {}, confirm: () => true };
global.CustomEvent = class {};
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;

global.CONFIG = {
    LIGHT_DEFAULTS: { mode: 'parallel' },
    LENS_TYPES: { CONVEX: 'convex' }
};
global.Utils = {
    generateId: () => 'id' + Math.random().toString(36).slice(2),
    clamp: (v, a, b) => Math.min(Math.max(v, a), b),
    showToast: () => {}
};
global.Storage = {
    saveRecording: (r) => localStorage.setItem('rec', JSON.stringify(r)),
    loadRecording: () => { try { return JSON.parse(localStorage.getItem('rec')); } catch { return null; } },
    removeRecording: () => localStorage.removeItem('rec'),
    savePlaybackState: (s) => localStorage.setItem('pb', JSON.stringify(s)),
    loadPlaybackState: () => { try { return JSON.parse(localStorage.getItem('pb')); } catch { return null; } },
    removePlaybackState: () => localStorage.removeItem('pb')
};
global.Lens = { fromJSON: (j) => ({ ...j }) };

// DOM 元素桩：只暴露 recorder.js 用到的接口
function elStub() {
    return {
        classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
        addEventListener(){},
        set innerHTML(v) {}, get innerHTML() { return ''; },
        set textContent(v) {}, get textContent() { return ''; },
        set value(v) {}, get value() { return '0'; },
        set max(v) {}, get max() { return '0'; },
        set disabled(v) {}, get disabled() { return false; },
        set title(v) {}, get title() { return ''; }
    };
}
global.document.getElementById = () => elStub();

// CanvasManager / InteractionManager 桩：记录真实操作
class CanvasStub {
    constructor() {
        this.lenses = [];
        this.selectedLens = null;
        this.renderer = { isRunning: false, lightMode: 'parallel', render(){}, setRunning(v){ this.isRunning = v; }, setLightMode(m){ this.lightMode = m; } };
        this.calls = [];
        this.recorder = null;
    }
    getRenderer() { return this.renderer; }
    getStateSnapshot() {
        return { lenses: this.lenses.map(l => ({ ...l })), running: this.renderer.isRunning, lightMode: this.renderer.lightMode };
    }
    restoreState(state, opts = {}) {
        this.lenses = (state.lenses || []).map(l => ({ ...l }));
        this.renderer.isRunning = !!state.running;
        this.renderer.lightMode = state.lightMode;
        this.calls.push(['restore', JSON.stringify(state)]);
    }
    addLens(l) { this.lenses.push(l); if (this.recorder) this.recorder.recordLensAdd(l); }
    removeLens(l) {
        const i = this.lenses.indexOf(l);
        if (i > -1) this.lenses.splice(i, 1);
        if (this.recorder) this.recorder.recordLensRemove(l.id);
    }
    clear() {
        this.lenses = [];
        if (this.recorder) this.recorder.recordCanvasReset();
    }
    selectLens(l) { this.selectedLens = l; }
}
const InteractionStub = class { updateLightButtonState(){} };

// 加载被测类
const ROOT = path.join(__dirname, '..');
// recorder.js 使用 class 声明，module.exports 不存在 -> 用 eval 方式加载
const code = require('fs').readFileSync(path.join(ROOT, 'js/recorder.js'), 'utf8');
const Recorder = eval(code + '\n;RecorderManager');

// 时间可控：覆盖 performance.now
let now = 1_000_000;
global.performance.now = () => now;
const advance = (ms) => { now += ms; };

let passed = 0;
const check = (name, cond) => { assert(cond, name); passed++; console.log('  ✓ ' + name); };

// ---- 测试 1：录制 + 同参数合并 + 最终值 ----
{
    const cm = new CanvasStub();
    const im = new InteractionStub();
    const rec = new Recorder(cm, im);
    rec.startRecording();

    // 添加透镜（真实流程）
    const lens = { id: 'L1', type: 'convex', x: 100, y: 200, refractiveIndex: 1.5, size: 100, curvature: 50, material: 'normal', dispersion: 0.4, toJSON(){ return { id:this.id,type:this.type,x:this.x,y:this.y,refractiveIndex:this.refractiveIndex,size:this.size,curvature:this.curvature,material:this.material,dispersion:this.dispersion }; } };
    cm.addLens(lens);

    // 模拟连续拖动 RI 滑块：1.50 -> 1.51 -> ... -> 1.60（100ms 一格，共 1 秒）
    // 真实交互中每次 input 都会先改透镜参数，再录制
    for (let i = 1; i <= 10; i++) {
        advance(100);
        lens.refractiveIndex = 1.5 + i * 0.01;
        rec.recordLensParam('L1', 'refractiveIndex', lens.refractiveIndex);
    }
    // 停顿 500ms，触发最终值落地
    advance(500);

    // 启动光路（真实交互中先切换渲染器，再录制事件）
    cm.renderer.setRunning(true);
    rec.recordLightToggle(true);
    advance(300);

    // 停止录制
    rec.stopRecording();

    const r = rec.recording;
    check('录制已完成', r.status === 'finished');
    check('总时长约 1.8s', Math.abs(r.duration - 1800) < 50, 'duration=' + r.duration);

    const riEvents = r.events.filter(e => e.type === 'lensParam' && e.param === 'refractiveIndex');
    check('RI 事件被合并（<10 条，>1 条）', riEvents.length < 10 && riEvents.length >= 2, 'ri count=' + riEvents.length);
    check('RI 最终生效值是 1.60', Math.abs(riEvents[riEvents.length - 1].value - 1.6) < 1e-9,
        'last=' + riEvents[riEvents.length - 1].value);
    check('RI 第一次值是 1.51', Math.abs(riEvents[0].value - 1.51) < 1e-9);
    check('含启动光路事件', r.events.some(e => e.type === 'lightToggle' && e.running === true));
    check('含添加透镜事件', r.events.some(e => e.type === 'lensAdd'));
    check('事件按时间有序', r.events.every((e, i) => i === 0 || r.events[i-1].t <= e.t));

    // 最终快照与真实状态一致
    check('最终快照包含透镜', r.finalState.lenses.length === 1);
    check('最终快照 RI=1.60', Math.abs(r.finalState.lenses[0].refractiveIndex - 1.6) < 1e-9);
    check('最终快照光路运行中', r.finalState.running === true);
}

// ---- 测试 2：跳转 / 纯数据回放任意时间点 ----
{
    const cm = new CanvasStub();
    const im = new InteractionStub();
    const rec = new Recorder(cm, im);
    rec.startRecording();
    const L = (id, x) => ({ id, x, y: 100, refractiveIndex: 1.5, size: 100, curvature: 50, material: 'normal', dispersion: 0.4, toJSON(){ const {toJSON,...rest}=this; return {...rest}; } });
    cm.addLens(L('A', 100)); advance(500);
    cm.addLens(L('B', 200)); advance(500);
    rec.recordLensParam('A', 'size', 120); advance(500);
    rec.stopRecording();

    // 第一个事件发生在 t≈0，因此用初始状态快照直接验证起点为空
    check('录制初始状态为空', rec.recording.initialState.lenses.length === 0);

    const atMid = rec.computeStateAt(rec.recording, 250).state;
    check('t=250 只有透镜 A', atMid.lenses.length === 1 && atMid.lenses[0].id === 'A');

    const atB = rec.computeStateAt(rec.recording, 750).state;
    check('t=750 有 A、B 且 A 未改尺寸',
        atB.lenses.length === 2 && atB.lenses.find(l => l.id === 'A').size === 100);

    const atEnd = rec.computeStateAt(rec.recording, rec.recording.duration).state;
    check('结束时有 A、B 两个透镜', atEnd.lenses.length === 2);
    check('A 的 size 已更新为 120', atEnd.lenses.find(l => l.id === 'A').size === 120);

    // 删除事件
    const cm2 = new CanvasStub();
    const rec2 = new Recorder(cm2, new InteractionStub());
    rec2.startRecording();
    cm2.addLens(L('C', 100)); advance(300);
    const cLens = cm2.lenses[0];
    cm2.removeLens(cLens); advance(300);
    rec2.stopRecording();
    check('删除后最终状态为空', rec2.recording.finalState.lenses.length === 0);
    check('删除前时刻透镜仍存在', rec2.computeStateAt(rec2.recording, 200).state.lenses.length === 1);
}

// ---- 测试 3：录制中断（刷新页面）后内容保留 ----
{
    // 先模拟一段录到一半的状态已落盘
    const cm = new CanvasStub();
    const rec = new Recorder(cm, new InteractionStub());
    rec.startRecording();
    cm.addLens({ id: 'X', x: 1, y: 2, refractiveIndex: 1.5, size: 100, curvature: 50, material: 'normal', dispersion: 0.4, toJSON(){ const {toJSON,...rest}=this; return {...rest}; } });
    advance(400);
    cm.renderer.setRunning(true);
    rec.recordLightToggle(true);
    advance(400);
    // 不调用 stopRecording，直接“刷新”：新建实例（status 仍是 recording）

    const cm3 = new CanvasStub();
    const rec3 = new Recorder(cm3, new InteractionStub());
    check('中断录制被保留', rec3.recording !== null);
    check('状态被标记为 interrupted', rec3.recording.status === 'interrupted');
    check('中断内容包含透镜事件', rec3.recording.events.some(e => e.type === 'lensAdd'));
    check('中断内容补全了 finalState', !!rec3.recording.finalState);
    check('finalState 光路运行中', rec3.recording.finalState.running === true);
    check('可继续播放中断内容', rec3.recording.duration > 0);
}

// ---- 测试 4：回放位置持久化与恢复同步 ----
{
    const cm = new CanvasStub();
    const rec = new Recorder(cm, new InteractionStub());
    rec.startRecording();
    advance(1000);
    cm.renderer.setRunning(true); rec.recordLightToggle(true);
    advance(1000); cm.renderer.setRunning(false); rec.recordLightToggle(false);
    advance(1000);
    rec.stopRecording();

    // 开始回放并跳到 1500ms
    rec.enterPlayback(0);
    rec.seekTo(1500);
    const savedPb = Storage.loadPlaybackState();
    check('回放位置已持久化', savedPb && Math.abs(savedPb.position - 1500) < 1, 'pos=' + (savedPb && savedPb.position));
    check('持久化状态为 paused', savedPb.mode === 'paused');

    // “刷新”：新实例恢复
    const cm2 = new CanvasStub();
    const rec2 = new Recorder(cm2, new InteractionStub());
    check('刷新后处于回放中', rec2.isPlaybackActive === true);
    check('刷新后回放位置同步', Math.abs(rec2.playback.position - 1500) < 1);
    check('刷新后画布恢复到该时刻状态', cm2.renderer.isRunning === true, 'running=' + cm2.renderer.isRunning);
}

// ---- 测试 5：回放结束恢复到录制结束状态 ----
{
    const cm = new CanvasStub();
    const rec = new Recorder(cm, new InteractionStub());
    rec.startRecording();
    const L = (id, x) => ({ id, x, y: 100, refractiveIndex: 1.5, size: 100, curvature: 50, material: 'normal', dispersion: 0.4, toJSON(){ const {toJSON,...rest}=this; return {...rest}; } });
    cm.addLens(L('F', 100)); advance(500);
    cm.renderer.setRunning(true); rec.recordLightToggle(true); advance(500);
    rec.stopRecording();

    rec.enterPlayback(0);
    // 手动把时间推到结尾（模拟 rAF）
    rec.playback.position = rec.recording.duration - 1;
    now += 50;
    rafCb = null;
    rec.tickPlayback(now);
    check('回放结束标记', rec.playback.finished === true);
    check('回放结束画布=录制结束（透镜数）', cm.lenses.length === 1);
    check('回放结束画布=录制结束（光路开启）', cm.renderer.isRunning === true);

    // 结束后 rAF 不再继续调度
    check('结束后停止调度动画帧', rafCb === null);

    // 退出回放后仍保持结束状态
    rec.exitPlayback(true);
    check('退出回放后仍为结束状态（透镜）', cm.lenses.length === 1);
    check('退出回放后未锁定', rec.isPlaybackActive === false);
}

console.log(`\n全部 ${passed} 项断言通过 ✅`);
process.exit(0);
