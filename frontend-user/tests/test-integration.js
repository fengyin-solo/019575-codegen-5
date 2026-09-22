// 集成冒烟测试：在 jsdom 中加载真实 HTML 与全部脚本，模拟一次完整的录制->刷新->回放流程
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/jsdom-env/node_modules/jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/'
});

const { window } = dom;

// ---- 浏览器 API 桩 ----
window.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({}, {
        get(t, prop) {
            if (prop === 'measureText') return () => ({ width: 10 });
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
                return () => ({ addColorStop() {} });
            }
            if (typeof prop === 'string') {
                // 任意属性返回 noop 函数或合理默认值
                return typeof prop === 'string' && ['fillStyle','strokeStyle','lineWidth','font','textAlign','setLineDash','shadowColor','shadowBlur'].includes(prop)
                    ? undefined
                    : () => {};
            }
            return undefined;
        },
        set() { return true; }
    });
};
window.HTMLCanvasElement.prototype.getContext = function () {
    const noop = () => {};
    return {
        scale: noop, fillRect: noop, clearRect: noop, beginPath: noop, moveTo: noop,
        lineTo: noop, stroke: noop, fill: noop, arc: noop, fillText: noop,
        quadraticCurveTo: noop, bezierCurveTo: noop, rect: noop, closePath: noop,
        save: noop, restore: noop, setLineDash: noop, measureText: () => ({ width: 10 }),
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
        shadowColor: '', shadowBlur: 0
    };
};
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.devicePixelRatio = 1;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){} }));

// getBoundingClientRect 给画布一个尺寸
window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'optics-canvas' || this.id === 'canvas-wrapper') {
        return { left: 0, top: 0, width: 800, height: 500, right: 800, bottom: 500 };
    }
    return { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40 };
};

const scripts = [
    'js/config.js', 'js/utils.js', 'js/storage.js', 'js/physics.js', 'js/lens.js',
    'js/renderer.js', 'js/canvas.js', 'js/quiz.js', 'js/interaction.js',
    'js/recorder.js', 'js/guide.js', 'js/app.js'
];

let ok = 0;
const check = (name, cond) => {
    if (!cond) throw new Error('断言失败: ' + name);
    ok++;
    console.log('  ✓ ' + name);
};

// 所有脚本共享同一作用域（模拟浏览器中多个 <script> 标签）
const bundle = scripts.map(s => fs.readFileSync(path.join(ROOT, s), 'utf8')).join('\n;\n')
    + '\n;window.__app = app; window.__Lens = Lens; window.__RecorderManager = RecorderManager;';
window.eval(bundle);

// app.js 在 eval 时会 new App()（DOMContentLoaded 已完成 -> 同步 setup）
setTimeout(() => {
    try {
        const w = window;
        const doc = w.document;
        const app = w.__app;

        check('应用已初始化', !!app);
        check('录制器已创建', !!app.recorderManager);
        const rec = app.recorderManager;
        const cm = app.canvasManager;

        check('初始不在回放中', rec.isPlaybackActive === false);
        check('回放徽标初始隐藏', doc.getElementById('playback-badge').classList.contains('hidden'));

        // ---- 录制一段实验 ----
        rec.startRecording();
        check('进入录制态', rec.isRecording);

        // 添加一个凸透镜
        const lens = new w.__Lens({ type: 'convex', x: 300, y: 250, material: 'normal' });
        cm.addLens(lens);
        check('透镜已加入画布', cm.lenses.length === 1);
        check('添加事件已记录', rec.recording.events.some(e => e.type === 'lensAdd'));

        // 调整折射率（直接调用真实交互路径：设置 lens 属性 + 录制）
        lens.refractiveIndex = 1.62;
        rec.recordLensParam(lens.id, 'refractiveIndex', 1.62);

        // 启动光路（模拟点击按钮 -> InteractionManager 路径）
        doc.getElementById('btn-toggle-light').click();
        check('光路已启动', cm.getRenderer().isRunning === true);
        check('启动光路事件已记录', rec.recording.events.some(e => e.type === 'lightToggle' && e.running === true));

        // 删除透镜（经 InteractionManager 的删除按钮路径）
        cm.selectLens(lens);
        doc.getElementById('btn-delete-lens').click();
        check('透镜已删除', cm.lenses.length === 0);
        check('删除事件已记录', rec.recording.events.some(e => e.type === 'lensRemove'));

        // 等合并计时器落地后停止
        setTimeout(() => {
            rec.stopRecording();
            check('录制完成', rec.recording.status === 'finished');
            check('录制内容已持久化', !!w.localStorage.getItem('optics_experiment_recording'));
            check('结束快照为空画布', rec.recording.finalState.lenses.length === 0);
            check('结束快照光路开启', rec.recording.finalState.running === true);

            // ---- 回放 ----
            rec.enterPlayback(0);
            check('进入回放（徽标可见）', !doc.getElementById('playback-badge').classList.contains('hidden'));
            check('回放时画布被锁定', doc.getElementById('app').classList.contains('playback-mode'));

            // 跳到中段：此时透镜应存在且光路按当时状态
            const addT = rec.recording.events.find(e => e.type === 'lensAdd').t;
            const delT = rec.recording.events.find(e => e.type === 'lensRemove').t;
            const midT = (addT + delT) / 2;
            rec.seekTo(midT);
            check('跳转后透镜被重建', cm.lenses.length === 1);
            check('跳转后位置同步', Math.abs(rec.playback.position - midT) < 1);

            // 模拟刷新：重建整个 JSDOM 太重，改为直接重新初始化 RecorderManager
            const RecorderCtor = w.__RecorderManager;
            // 把当前画布恢复到别的内容，验证恢复会覆盖
            cm.lenses = [];
            const rec2 = new RecorderCtor(cm, app.interactionManager);
            check('刷新后自动识别为回放中', rec2.isPlaybackActive === true);
            check('刷新后位置保持同步', Math.abs(rec2.playback.position - midT) < 1);
            check('刷新后画布重建为该时刻状态', cm.lenses.length === 1);

            // 快进到结束
            rec2.seekTo(rec2.recording.duration);
            check('跳到结尾透镜为空（结束状态）', cm.lenses.length === 0);
            check('跳到结尾光路为开启（结束状态）', cm.getRenderer().isRunning === true);

            // 退出回放 -> 画布仍为结束状态、解锁
            rec2.exitPlayback(true);
            check('退出回放后解锁', !doc.getElementById('app').classList.contains('playback-mode'));
            check('退出后画布仍是结束状态', cm.lenses.length === 0 && cm.getRenderer().isRunning === true);
            check('退出后徽标隐藏', doc.getElementById('playback-badge').classList.contains('hidden'));

            console.log(`\n集成测试全部 ${ok} 项通过 ✅`);
            process.exit(0);
        }, 600);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}, 100);
