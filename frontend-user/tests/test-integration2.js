// 补充集成测试：透镜拖动录制、录制中断恢复、参数面板联动
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/jsdom-env/node_modules/jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;

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
window.confirm = () => true;
window.devicePixelRatio = 1;
window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 500, right: 800, bottom: 500 };
};

const scripts = [
    'js/config.js', 'js/utils.js', 'js/storage.js', 'js/physics.js', 'js/lens.js',
    'js/renderer.js', 'js/canvas.js', 'js/quiz.js', 'js/interaction.js',
    'js/recorder.js', 'js/guide.js', 'js/app.js'
];
const bundle = scripts.map(s => fs.readFileSync(path.join(ROOT, s), 'utf8')).join('\n;\n')
    + '\n;window.__app = app; window.__Lens = Lens; window.__RecorderManager = RecorderManager;';
window.eval(bundle);

let ok = 0;
const check = (name, cond) => { if (!cond) throw new Error('断言失败: ' + name); ok++; console.log('  ✓ ' + name); };

setTimeout(() => {
    try {
        const w = window, doc = w.document;
        const app = w.__app, rec = app.recorderManager, cm = app.canvasManager;

        // ============ 场景 1：拖动透镜只产生一次移动事件（最终落点） ============
        rec.startRecording();
        const lens = new w.__Lens({ type: 'convex', x: 300, y: 250 });
        cm.addLens(lens);

        const canvas = doc.getElementById('optics-canvas');
        // 模拟 mousedown -> 多次 mousemove -> mouseup
        canvas.dispatchEvent(new w.MouseEvent('mousedown', { clientX: 300, clientY: 250, bubbles: true }));
        for (let i = 1; i <= 10; i++) {
            canvas.dispatchEvent(new w.MouseEvent('mousemove', { clientX: 300 + i * 5, clientY: 250, bubbles: true }));
        }
        canvas.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true }));

        check('透镜位置更新到最终落点', Math.abs(lens.x - 350) < 1, 'x=' + lens.x);
        const moveEvents = rec.recording.events.filter(e => e.type === 'lensMove');
        check('拖动只产生 0 或 1 个 move 事件（一次拖动）', moveEvents.length <= 1, 'moves=' + moveEvents.length);

        // 等合并计时结束
        setTimeout(() => {
            const moveEvents2 = rec.recording.events.filter(e => e.type === 'lensMove');
            check('停顿后 move 事件记录最终落点', moveEvents2.length === 1 && moveEvents2[0].x >= 349,
                JSON.stringify(moveEvents2));

            // ============ 场景 2：参数面板滑块联动录制 ============
            cm.selectLens(lens);
            const riSlider = doc.getElementById('param-ri');
            riSlider.value = '1.70';
            riSlider.dispatchEvent(new w.Event('input', { bubbles: true }));
            check('滑块真实修改了透镜 RI', Math.abs(lens.refractiveIndex - 1.70) < 1e-9);
            check('滑块操作被录制', rec.recording.events.some(e => e.type === 'lensParam' && e.param === 'refractiveIndex'));

            setTimeout(() => {
                rec.stopRecording();

                // 回放到末尾：参数应恢复
                rec.enterPlayback(0);
                rec.seekTo(rec.recording.duration);
                check('回放末尾 RI 恢复为 1.70', cm.lenses.length === 1 && Math.abs(cm.lenses[0].refractiveIndex - 1.70) < 1e-9);
                check('回放末尾透镜位置为最终落点', Math.abs(cm.lenses[0].x - 350) < 1);
                rec.exitPlayback(true);

                // ============ 场景 3：录到一半“刷新” -> 内容保留 ============
                const recMgr2 = (() => {
                    const r = w.__app.recorderManager;
                    return r;
                })();
                recMgr2.startRecording();
                const l2 = new w.__Lens({ type: 'concave', x: 150, y: 250 });
                cm.addLens(l2);

                // “刷新页面”：旧实例的计时器随页面销毁而停止（真实刷新时必然如此）
                clearInterval(recMgr2._tickTimer);

                // 直接“刷新”：不停止录制，新建 RecorderManager（localStorage 中 status='recording'）
                const rec3 = new w.__RecorderManager(cm, app.interactionManager);
                check('中断录制被识别为 interrupted', rec3.recording && rec3.recording.status === 'interrupted');
                check('中断前的添加透镜事件保留', rec3.recording.events.some(e => e.type === 'lensAdd'));
                check('中断提示标志已设置', rec3._interruptedNotice === true);
                check('中断录像可播放（末尾事件在时长范围内）',
                    rec3.recording.events[rec3.recording.events.length - 1].t <= rec3.recording.duration);

                // 播放中断录像
                rec3.enterPlayback(0);
                rec3.seekTo(rec3.recording.duration);
                // 中断前画布上已有上一段录像结束态的 lens，加上本次添加的 l2
                const l2restored = cm.lenses.find(l => l.id === l2.id);
                check('中断录像结束态包含新添加的透镜', !!l2restored);
                rec3.exitPlayback(true);

                // ============ 场景 4：删除录制 ============
                w.confirm = () => true;
                doc.getElementById('btn-rec-delete').click();
                check('录制已删除', !rec3.recording);
                check('localStorage 录制已清除', w.localStorage.getItem('optics_experiment_recording') === null);
                check('时间轴归零', doc.getElementById('rec-timeline').max === '0');

                console.log(`\n补充集成测试全部 ${ok} 项通过 ✅`);
                process.exit(0);
            }, 600);
        }, 600);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}, 100);
