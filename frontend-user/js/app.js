/**
 * 应用入口
 */
class App {
    constructor() {
        this.canvasManager = null;
        this.interactionManager = null;
        this.guideManager = null;
        this.quizManager = null;
        this.recorderManager = null;

        this.init();
    }
    
    /**
     * 初始化应用
     */
    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }
    
    /**
     * 设置应用
     */
    setup() {
        console.log('光学设计实验室 v' + CONFIG.VERSION);
        
        // 初始化画布管理器
        this.canvasManager = new CanvasManager();
        
        // 初始化交互管理器
        this.interactionManager = new InteractionManager(this.canvasManager);
        
        // 初始化引导系统
        this.guideManager = new GuideManager();
        
        // 初始化测验管理器
        this.quizManager = new QuizManager(this.canvasManager);

        // 初始化实验录制与回放管理器（恢复已保存的录制/回放状态）
        this.recorderManager = new RecorderManager(this.canvasManager);

        // 初始化知识点提示
        this.initKnowledgeTips();
        
        // 初始化测验模式事件
        this.initQuizMode();
        
        console.log('应用初始化完成');
    }
    
    /**
     * 初始化知识点提示
     */
    initKnowledgeTips() {
        const tipText = document.querySelector('.tip-text');
        if (!tipText) return;
        
        const showRandomTip = () => {
            tipText.textContent = Utils.getRandomTip();
        };
        
        showRandomTip();
        setInterval(showRandomTip, 30000);
        
        const knowledgeTip = document.getElementById('knowledge-tip');
        if (knowledgeTip) {
            knowledgeTip.addEventListener('click', showRandomTip);
        }
    }
    
    /**
     * 初始化测验模式
     */
    initQuizMode() {
        // 测验模式按钮
        const btnQuizMode = document.getElementById('btn-quiz-mode');
        if (btnQuizMode) {
            btnQuizMode.addEventListener('click', () => this.toggleQuizMode());
        }
        
        // 关闭测验面板
        const btnQuizClose = document.getElementById('btn-quiz-close');
        if (btnQuizClose) {
            btnQuizClose.addEventListener('click', () => this.stopQuizMode());
        }
        
        // 提示按钮
        const btnQuizHint = document.getElementById('btn-quiz-hint');
        if (btnQuizHint) {
            btnQuizHint.addEventListener('click', () => this.showQuizHint());
        }
        
        // 提交答案
        const btnQuizSubmit = document.getElementById('btn-quiz-submit');
        if (btnQuizSubmit) {
            btnQuizSubmit.addEventListener('click', () => this.submitQuizAnswer());
        }
        
        // 跳过题目
        const btnQuizSkip = document.getElementById('btn-quiz-skip');
        if (btnQuizSkip) {
            btnQuizSkip.addEventListener('click', () => this.skipQuizQuestion());
        }
        
        // 结果模态框 - 下一题
        const btnQuizNext = document.getElementById('btn-quiz-next');
        if (btnQuizNext) {
            btnQuizNext.addEventListener('click', () => this.nextQuizQuestion());
        }
        
        // 结果模态框 - 退出测验
        const btnQuizExit = document.getElementById('btn-quiz-exit');
        if (btnQuizExit) {
            btnQuizExit.addEventListener('click', () => this.exitQuizFromResult());
        }
        
        // 监听题目变化事件
        window.addEventListener('questionChanged', (e) => {
            this.updateQuizPanel(e.detail);
        });
        
        // 监听测验停止事件
        window.addEventListener('quizStopped', () => {
            this.hideQuizPanel();
        });
    }
    
    /**
     * 切换测验模式
     */
    toggleQuizMode() {
        if (this.quizManager.isQuizMode) {
            this.stopQuizMode();
        } else {
            this.startQuizMode();
        }
    }
    
    /**
     * 开始测验模式
     */
    startQuizMode() {
        // 回放中画布只读，不允许进入测验
        if (this.canvasManager.playbackLocked) {
            Utils.showToast('请先退出回放再开始测验', 'warning');
            return;
        }
        // 清空画布
        this.canvasManager.clear();
        
        // 启动测验
        this.quizManager.startQuizMode();
        
        // 更新UI
        const btnQuizMode = document.getElementById('btn-quiz-mode');
        if (btnQuizMode) {
            btnQuizMode.classList.add('active');
            btnQuizMode.querySelector('span').textContent = '退出测验';
        }
        
        // 显示测验面板
        const quizPanel = document.getElementById('quiz-panel');
        if (quizPanel) {
            quizPanel.classList.remove('hidden');
        }
        
        // 添加测验模式类
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.classList.add('quiz-mode');
        }
        
        Utils.showToast('测验模式已开启，祝你好运！', 'success');
    }
    
    /**
     * 停止测验模式
     */
    stopQuizMode() {
        if (!this.quizManager.isQuizMode) return;
        
        const score = this.quizManager.getScore();
        this.quizManager.stopQuizMode();
        
        // 更新UI
        const btnQuizMode = document.getElementById('btn-quiz-mode');
        if (btnQuizMode) {
            btnQuizMode.classList.remove('active');
            btnQuizMode.querySelector('span').textContent = '测验模式';
        }
        
        // 隐藏测验面板
        const quizPanel = document.getElementById('quiz-panel');
        if (quizPanel) {
            quizPanel.classList.add('hidden');
        }
        
        // 移除测验模式类
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.classList.remove('quiz-mode');
        }
        
        // 隐藏结果模态框
        const resultModal = document.getElementById('quiz-result-modal');
        if (resultModal) {
            resultModal.classList.add('hidden');
        }
        
        // 清空画布
        this.canvasManager.clear();
        
        Utils.showToast(
            `测验结束！得分：${score.score}分，正确率：${score.accuracy}%`,
            score.accuracy >= 60 ? 'success' : 'warning'
        );
    }
    
    /**
     * 隐藏测验面板
     */
    hideQuizPanel() {
        const quizPanel = document.getElementById('quiz-panel');
        if (quizPanel) {
            quizPanel.classList.add('hidden');
        }
        
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.classList.remove('quiz-mode');
        }
    }
    
    /**
     * 更新测验面板内容
     */
    updateQuizPanel(question) {
        // 更新题目标题和描述
        const titleEl = document.getElementById('quiz-question-title');
        const descEl = document.getElementById('quiz-question-desc');
        
        if (titleEl) titleEl.textContent = question.title;
        if (descEl) descEl.textContent = question.description;
        
        // 隐藏提示
        const hintText = document.getElementById('quiz-hint-text');
        if (hintText) {
            hintText.classList.add('hidden');
            hintText.textContent = '';
        }
        
        // 启用提示按钮
        const btnHint = document.getElementById('btn-quiz-hint');
        if (btnHint) {
            btnHint.disabled = false;
        }
        
        // 更新得分显示
        this.updateScoreDisplay();
    }
    
    /**
     * 更新得分显示
     */
    updateScoreDisplay() {
        const score = this.quizManager.getScore();
        
        const scoreValue = document.getElementById('quiz-score-value');
        const scoreTotal = document.getElementById('quiz-score-total');
        
        if (scoreValue) scoreValue.textContent = score.score;
        if (scoreTotal) scoreTotal.textContent = score.totalQuestions * 10;
    }
    
    /**
     * 显示测验提示
     */
    showQuizHint() {
        const hint = this.quizManager.getHint();
        if (!hint) return;
        
        const hintText = document.getElementById('quiz-hint-text');
        if (hintText) {
            hintText.textContent = '💡 ' + hint;
            hintText.classList.remove('hidden');
        }
        
        // 禁用提示按钮
        const btnHint = document.getElementById('btn-quiz-hint');
        if (btnHint) {
            btnHint.disabled = true;
        }
        
        Utils.showToast('已使用提示，本题正确只得5分', 'warning');
    }
    
    /**
     * 提交测验答案
     */
    submitQuizAnswer() {
        if (!this.quizManager.isQuizMode || !this.quizManager.currentQuestion) {
            Utils.showToast('请先开始测验', 'warning');
            return;
        }
        
        // 确保光路已启动，以便检查效果
        const renderer = this.canvasManager.getRenderer();
        if (!renderer.isRunning) {
            Utils.showToast('请先启动光路，观察光线效果后再提交', 'warning');
            return;
        }
        
        const result = this.quizManager.submitAnswer();
        this.showQuizResult(result);
    }
    
    /**
     * 显示测验结果
     */
    showQuizResult(result) {
        const modal = document.getElementById('quiz-result-modal');
        if (!modal) return;
        
        // 更新图标
        const iconEl = document.getElementById('quiz-result-icon');
        if (iconEl) {
            iconEl.textContent = result.isCorrect ? '🎉' : '😅';
        }
        
        // 更新标题
        const titleEl = document.getElementById('quiz-result-title');
        if (titleEl) {
            titleEl.textContent = result.isCorrect ? '回答正确！' : '再想想...';
        }
        
        // 更新得分
        const scoreEl = document.getElementById('quiz-result-score');
        if (scoreEl) {
            scoreEl.textContent = result.isCorrect ? `+${result.score}` : '+0';
        }
        
        // 更新解释
        const explanationEl = document.getElementById('quiz-result-explanation');
        if (explanationEl) {
            explanationEl.textContent = result.explanation;
        }
        
        // 更新详细检查项
        const detailsEl = document.getElementById('quiz-result-details');
        if (detailsEl) {
            if (result.details && result.details.length > 0) {
                detailsEl.innerHTML = result.details.map(detail => `
                    <div class="result-detail-item">
                        <span class="result-detail-name">${detail.name}</span>
                        <div class="result-detail-values">
                            <span class="result-detail-expected">期望：${detail.expected}</span>
                            <span class="result-detail-arrow">→</span>
                            <span class="result-detail-actual">实际：${detail.actual}</span>
                            <span class="result-detail-status ${detail.correct ? 'correct' : 'incorrect'}">
                                ${detail.correct ? '✓' : '✗'}
                            </span>
                        </div>
                    </div>
                `).join('');
                detailsEl.style.display = 'flex';
            } else {
                detailsEl.style.display = 'none';
            }
        }
        
        // 更新统计数据
        const score = this.quizManager.getScore();
        const totalScoreEl = document.getElementById('quiz-total-score');
        const accuracyEl = document.getElementById('quiz-accuracy');
        const answeredEl = document.getElementById('quiz-answered');
        
        if (totalScoreEl) totalScoreEl.textContent = score.score;
        if (accuracyEl) accuracyEl.textContent = `${score.accuracy}%`;
        if (answeredEl) answeredEl.textContent = score.totalQuestions;
        
        // 显示模态框
        modal.classList.remove('hidden');
    }
    
    /**
     * 跳过当前题目
     */
    skipQuizQuestion() {
        if (!this.quizManager.isQuizMode) return;
        
        // 记录跳过（不扣分，但计入总题数）
        this.quizManager.totalQuestions++;
        this.quizManager.questionHistory.push({
            questionId: this.quizManager.currentQuestion.id,
            title: this.quizManager.currentQuestion.title,
            isCorrect: false,
            score: 0,
            hintUsed: false,
            skipped: true,
            timestamp: Date.now()
        });
        
        // 更新得分显示
        this.updateScoreDisplay();
        
        // 下一题
        this.quizManager.nextQuestion();
        
        // 清空画布
        this.canvasManager.clear();
        
        Utils.showToast('已跳过本题', 'info');
    }
    
    /**
     * 下一题
     */
    nextQuizQuestion() {
        // 隐藏结果模态框
        const resultModal = document.getElementById('quiz-result-modal');
        if (resultModal) {
            resultModal.classList.add('hidden');
        }
        
        // 清空画布
        this.canvasManager.clear();
        
        // 下一题
        this.quizManager.nextQuestion();
    }
    
    /**
     * 从结果模态框退出测验
     */
    exitQuizFromResult() {
        // 隐藏结果模态框
        const resultModal = document.getElementById('quiz-result-modal');
        if (resultModal) {
            resultModal.classList.add('hidden');
        }
        
        // 停止测验
        this.stopQuizMode();
    }
}

// 启动应用
const app = new App();
