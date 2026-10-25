// 雅思写作练习 · 前端逻辑（原生 JS，无需构建）

const PASS_SCORE = 70;
const app = document.getElementById('app');
let cleanups = [];
let serverStatus = { hasKey: false };

// ---------- 小工具 ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const countWords = (text) => (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
const fmtTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const fmtDate = (ts) => new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// 本地存储（浏览器隐私模式下可能不可用，所以全部 try/catch）
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('ielts.' + key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('ielts.' + key, JSON.stringify(value));
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem('ielts.' + key);
    } catch {}
  },
};

const ALL_UNITS = window.CURRICULUM.flatMap((stage) => stage.units.map((u) => ({ ...u, stage })));
const findUnit = (id) => ALL_UNITS.find((u) => u.id === id);

// 极简 Markdown 渲染：段落、列表、表格、标题、粗体、斜体、行内代码
function md(src) {
  const lines = String(src ?? '').replace(/\r/g, '').split('\n');
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>');
  const isTable = (l) => /^\s*\|/.test(l);
  const isUl = (l) => /^\s*[-*•]\s+/.test(l);
  const isOl = (l) => /^\s*\d+[.)、]\s*/.test(l);
  const isHead = (l) => /^#{1,6}\s/.test(l);
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (isTable(line)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const data = rows.map(cells).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      const [head, ...body] = data;
      out += '<div class="table-wrap"><table><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr>';
      out += body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</table></div>';
    } else if (isUl(line)) {
      out += '<ul>';
      while (i < lines.length && isUl(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*[-*•]\s+/, ''))}</li>`;
      out += '</ul>';
    } else if (isOl(line)) {
      out += '<ol>';
      while (i < lines.length && isOl(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*\d+[.)、]\s*/, ''))}</li>`;
      out += '</ol>';
    } else if (isHead(line)) {
      out += `<h4>${inline(line.replace(/^#+\s*/, ''))}</h4>`;
      i++;
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !isTable(lines[i]) && !isUl(lines[i]) && !isOl(lines[i]) && !isHead(lines[i])) {
        para.push(inline(lines[i++]));
      }
      out += `<p>${para.join('<br>')}</p>`;
    }
  }
  return out;
}

// ---------- 调用 AI ----------
async function callAI(messages, { temperature = 0.4, config } = {}) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, temperature, config: config || store.get('config', {}) }),
  });
  const data = await res.json().catch(() => ({ error: `服务没有正常响应（HTTP ${res.status}），请确认 node server.js 正在运行。` }));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data.content;
}

function parseJSON(text) {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1];
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('AI 没有返回 JSON');
  return JSON.parse(t.slice(start, end + 1));
}

// 要求 AI 输出 JSON；解析失败时让它自己修正一次
async function callJSON(messages, temperature) {
  const content = await callAI(messages, { temperature });
  try {
    return parseJSON(content);
  } catch {
    const fixed = await callAI(
      [...messages, { role: 'assistant', content }, { role: 'user', content: '你上面的输出不是合法的 JSON。请重新输出，只包含一个合法的 JSON 对象，不要任何其他文字。' }],
      { temperature: 0 },
    );
    return parseJSON(fixed);
  }
}

// ---------- 提示词 ----------
const SYSTEM = `你是一位资深的雅思写作考官，同时是一对一的私人写作教练。你的学生是中文母语者，目标是提高雅思写作分数。
- 严格依据雅思官方写作评分标准（Task Achievement/Response、Coherence and Cohesion、Lexical Resource、Grammatical Range and Accuracy）。
- 讲解用中文，英文例句和改写保持英文。
- 指出的每个问题都要具体、可操作，并说明背后的规则；语气耐心、鼓励，但不放过任何错误。`;

const TYPE_LABEL = { sentence: '句子练习', paragraph: '段落练习', essay: '完整作文' };

function questionMessages(ex, title, recent) {
  const avoid = recent.length ? `\n不要与这些最近做过的题目重复：\n${recent.map((r) => '- ' + r.slice(0, 150).replace(/\n/g, ' ')).join('\n')}\n` : '';
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `请为练习单元「${title}」出一道新题。
出题要求：${ex.gen}
${avoid}
只输出一个 JSON 对象，格式：
{"prompt": "展示给学生的题目（可使用 Markdown，换行写成 \\n）", "hint": "中文提示（没有就写空字符串）", "reference": "参考答案（没有就写空字符串）"}`,
    },
  ];
}

function feedbackMessages(ex, title, question, answer) {
  const words = countWords(answer);
  const isEssay = ex.type === 'essay';
  const trName = ex.task === 'task1' ? 'Task Achievement' : 'Task Response';
  const rules = [
    `找出所有语言错误${isEssay ? '（最多列出最重要的 20 处）' : '，一个都不要漏'}。errors[].original 必须从学生答案中逐字复制，越短越好（只包含出错的词或短语），方便在原文中定位。没有错误就给空数组。`,
    ex.type === 'sentence'
      ? 'sentence_analysis：对学生写的每一句都做分析。'
      : 'sentence_analysis：选出 3-4 个最有代表性的句子（写得好的和有问题的都要有）做分析。',
    isEssay
      ? `criteria 必须包含四项：${trName}、Coherence and Cohesion、Lexical Resource、Grammatical Range and Accuracy，每项给出 band（0-9，以 0.5 为单位的数字）和中文点评。总 band 为四项平均，按雅思规则取整（.25 进到 .5，.75 进到下一个整数）。字数不足 ${ex.minWords} 词要在 ${trName} 中扣分。`
      : 'criteria 给空数组 []。',
    `band：你对学生当前水平的估计（字符串，如 "6.0"）。`,
    isEssay
      ? 'score：0-100 的整数，等于 round(总band ÷ 9 × 100)。'
      : `score：0-100 的整数，表示本次练习对单元目标的掌握程度，${PASS_SCORE} 分及以上表示已掌握。`,
    'improved_version：在保留学生原意和结构的基础上，改写成更高分的版本。',
    '语气像耐心的私教：严格指出问题，也要具体肯定做得好的地方。',
  ];
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `请批改学生的练习。
【练习单元】${title}
【练习类型】${TYPE_LABEL[ex.type]}${ex.task ? '（' + ex.task.replace('task', 'Task ') + '）' : ''}
【练习要求】${ex.instruction}
【批改重点】${ex.focus}
【题目】
${question.prompt}
${question.hint ? '【题目提示】' + question.hint + '\n' : ''}【学生答案】（共 ${words} 词${ex.minWords ? `，要求至少 ${ex.minWords} 词` : ''}）
"""
${answer}
"""

批改要求：
${rules.map((r) => '- ' + r).join('\n')}

只输出一个 JSON 对象，不要任何其他文字，格式如下：
{
  "score": 75,
  "band": "6.0",
  "summary": "一两句中文总评",
  "criteria": [{"name": "${trName}", "band": 6.0, "comment": "中文点评"}],
  "errors": [{"original": "学生原文中出错的片段", "correction": "改正后的写法", "type": "语法/拼写/用词/搭配/标点/冠词/时态/主谓一致/中式英语/逻辑 之一", "explanation": "中文解释：为什么错、规则是什么"}],
  "sentence_analysis": [{"sentence": "学生原句", "structure": "中文说明句子结构，如：主语 X + 谓语 Y + 宾语 Z，含 which 引导的非限制性定语从句", "comment": "这句的优点或问题", "upgrade": "更好的英文写法"}],
  "improved_version": "改写后的高分版本（英文）",
  "strengths": ["做得好的地方"],
  "next_steps": ["接下来最该练的 1-3 件事，具体可操作"]
}`,
    },
  ];
}

// ---------- 进度与记录 ----------
const getProgress = () => store.get('progress', {});
const getHistory = () => store.get('history', []);

function recordAttempt(key, unitId, title, exercise, question, answer, fb) {
  const history = getHistory();
  const item = { id: Date.now().toString(36), ts: Date.now(), key, unitId, title, exercise, question, answer, fb };
  history.unshift(item);
  store.set('history', history.slice(0, 200));
  if (unitId) {
    const progress = getProgress();
    const p = progress[unitId] || { attempts: 0, best: 0, done: false };
    p.attempts += 1;
    p.best = Math.max(p.best, Number(fb.score) || 0);
    p.done = p.done || p.best >= PASS_SCORE;
    progress[unitId] = p;
    store.set('progress', progress);
  }
  return item;
}

const recentPrompts = (key) => getHistory().filter((h) => h.key === key).slice(0, 6).map((h) => h.question.prompt);
const nextUnit = () => ALL_UNITS.find((u) => !getProgress()[u.id]?.done);

// ---------- 路由 ----------
function route() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  const [view = '', id] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (view === 'unit' ? 'home' : view || 'home')));
  const views = { '': renderHome, unit: renderUnit, mock: renderMock, analyze: renderAnalyzer, history: renderHistory };
  (views[view] || renderHome)(id);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function configBanner() {
  const local = store.get('config', {});
  if (serverStatus.hasKey || local.apiKey) return '';
  return `<div class="banner">还没有配置 API。请点击右上角 <b>⚙️ 设置</b> 填写接口地址、Key 和模型名，或在项目的 <code>.env</code> 文件中配置。</div>`;
}

// ---------- 首页：学习路线 ----------
function renderHome() {
  const progress = getProgress();
  const doneCount = ALL_UNITS.filter((u) => progress[u.id]?.done).length;
  const next = nextUnit();
  app.innerHTML = `
    ${configBanner()}
    <section class="card hero">
      <div>
        <h2>你的雅思写作学习路线</h2>
        <p class="muted">从句子到完整作文，每个单元都是「读教程 → 打字练习 → AI 批改 → 追问」。单元得分 ≥ ${PASS_SCORE} 即为掌握，建议按顺序学习。</p>
        <div class="progress"><div style="width:${(doneCount / ALL_UNITS.length) * 100}%"></div></div>
        <p class="muted small">已掌握 ${doneCount} / ${ALL_UNITS.length} 个单元</p>
      </div>
      ${next ? `<a class="button" href="#/unit/${next.id}">继续学习：${esc(next.title)} →</a>` : `<a class="button" href="#/mock">🎉 全部掌握！去模考 →</a>`}
    </section>
    ${window.CURRICULUM.map(
      (stage) => `
      <section class="stage">
        <h3>${esc(stage.title)}</h3>
        <p class="muted">${esc(stage.desc)}</p>
        <div class="units">
          ${stage.units
            .map((u) => {
              const p = progress[u.id];
              const status = p?.done ? `<span class="tag ok">✓ 已掌握 · 最高 ${p.best}</span>` : p ? `<span class="tag">练习 ${p.attempts} 次 · 最高 ${p.best}</span>` : `<span class="tag dim">未开始</span>`;
              return `<a class="unit ${next?.id === u.id ? 'current' : ''}" href="#/unit/${u.id}">
                <div><b>${esc(u.title)}</b><p class="muted small">${esc(u.goal)}</p></div>${status}</a>`;
            })
            .join('')}
        </div>
      </section>`,
    ).join('')}`;
}

// ---------- 单元页 ----------
function renderUnit(id) {
  const unit = findUnit(id);
  if (!unit) return renderHome();
  const p = getProgress()[unit.id];
  app.innerHTML = `
    ${configBanner()}
    <p class="crumb"><a href="#/">学习路线</a> / ${esc(unit.stage.title)}</p>
    <h2>${esc(unit.title)}</h2>
    <p class="muted">🎯 ${esc(unit.goal)}</p>
    <details class="card lesson" ${p ? '' : 'open'}>
      <summary>📖 教程${p ? '（点击展开复习）' : ''}</summary>
      <div class="lesson-body">${unit.lesson}</div>
    </details>
    <div id="practice"></div>`;
  mountPractice($('#practice'), { key: unit.id, unitId: unit.id, title: unit.title, exercise: unit.exercise });
}

// ---------- 练习组件：出题 → 打字 → 批改 ----------
function mountPractice(root, { key, unitId, title, exercise: ex }) {
  const draftKey = 'draft.' + key;
  let draft = store.get(draftKey, null);
  let timer = null;

  root.innerHTML = `
    <section class="card">
      <div class="row between">
        <h3>✏️ 练习</h3>
        <div class="row">
          <button class="ghost small" data-act="custom">使用自己的题目</button>
          <button class="ghost small" data-act="new">换一题</button>
        </div>
      </div>
      <p class="muted">${esc(ex.instruction)}</p>
      <div class="question"></div>
      <textarea class="answer" spellcheck="false" placeholder="在这里用英文作答…（Ctrl/⌘ + Enter 提交）"></textarea>
      <div class="row between bar">
        <span class="muted small"><span class="wc">0 词</span><span class="clock"></span></span>
        <div class="row">
          <button class="ghost small fx-toggle" data-act="fx" title="打字特效开关">⚡ 特效</button>
          <button data-act="submit">提交批改</button>
        </div>
      </div>
    </section>
    <div class="feedback"></div>`;

  const qBox = $('.question', root);
  const textarea = $('.answer', root);
  const fbBox = $('.feedback', root);
  const submitBtn = $('[data-act=submit]', root);

  const saveDraft = () => draft && store.set(draftKey, draft);

  function updateCount() {
    const n = countWords(textarea.value);
    $('.wc', root).textContent = ex.minWords ? `${n} / ${ex.minWords} 词` : `${n} 词`;
    $('.wc', root).classList.toggle('warn', Boolean(ex.minWords) && n > 0 && n < ex.minWords);
  }

  function tick() {
    if (!ex.timeLimit || !draft?.startedAt) return ($('.clock', root).textContent = '');
    const sec = Math.floor((Date.now() - draft.startedAt) / 1000);
    const clock = $('.clock', root);
    clock.textContent = ` · ⏱ ${fmtTime(sec)} / ${ex.timeLimit}:00`;
    clock.classList.toggle('warn', sec > ex.timeLimit * 60);
  }

  function showQuestion() {
    const q = draft.question;
    qBox.innerHTML = `<div class="prompt">${md(q.prompt)}</div>${q.hint ? `<details class="hint"><summary>💡 提示</summary>${md(q.hint)}</details>` : ''}`;
    textarea.value = draft.answer || '';
    textarea.disabled = false;
    submitBtn.disabled = false;
    updateCount();
    tick();
  }

  async function newQuestion() {
    fbBox.innerHTML = '';
    qBox.innerHTML = `<p class="loading">AI 正在出题…</p>`;
    textarea.disabled = true;
    submitBtn.disabled = true;
    try {
      const q = await callJSON(questionMessages(ex, title, recentPrompts(key)), 0.9);
      if (!q.prompt) throw new Error('AI 返回的题目为空');
      draft = { question: { prompt: String(q.prompt), hint: String(q.hint || ''), reference: String(q.reference || '') }, answer: '' };
      saveDraft();
      showQuestion();
    } catch (err) {
      qBox.innerHTML = `<div class="error">出题失败：${esc(err.message)}</div>`;
    }
  }

  function customQuestion() {
    fbBox.innerHTML = '';
    qBox.innerHTML = `
      <textarea class="custom-q" placeholder="把你的题目粘贴到这里（例如真题集里的 Task 2 题目）"></textarea>
      <div class="row end"><button class="small" data-act="use-custom">使用这道题</button></div>`;
    textarea.disabled = true;
    submitBtn.disabled = true;
    $('[data-act=use-custom]', qBox).onclick = () => {
      const text = $('.custom-q', qBox).value.trim();
      if (!text) return;
      draft = { question: { prompt: text, hint: '', reference: '' }, answer: '' };
      saveDraft();
      showQuestion();
    };
  }

  async function submit() {
    const answer = textarea.value.trim();
    if (!draft || !answer) return textarea.focus();
    const words = countWords(answer);
    if (ex.minWords && words < ex.minWords * 0.6 && !confirm(`现在只有 ${words} 词，要求至少 ${ex.minWords} 词。确定要提交吗？`)) return;
    submitBtn.disabled = true;
    fbBox.innerHTML = `<section class="card"><p class="loading">AI 老师正在批改…${ex.type === 'essay' ? '（完整作文可能需要 30-90 秒）' : ''}</p></section>`;
    fbBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const fb = normalizeFeedback(await callJSON(feedbackMessages(ex, title, draft.question, answer), 0.3), ex);
      const item = recordAttempt(key, unitId, title, ex, draft.question, answer, fb);
      store.remove(draftKey);
      renderFeedback(fbBox, item, () => {
        fbBox.innerHTML = '';
        newQuestion();
        root.scrollIntoView({ behavior: 'smooth' });
      });
    } catch (err) {
      fbBox.innerHTML = `<section class="card"><div class="error">批改失败：${esc(err.message)}</div><p class="muted small">你的答案已保留，可以直接再次提交。</p></section>`;
    } finally {
      submitBtn.disabled = false;
    }
  }

  textarea.addEventListener('input', () => {
    if (!draft) return;
    if (!draft.startedAt) draft.startedAt = Date.now();
    draft.answer = textarea.value;
    saveDraft();
    updateCount();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
  });
  const fxBtn = $('[data-act=fx]', root);
  const syncFx = () => fxBtn.classList.toggle('on', window.PowerMode.get().power);
  syncFx();

  root.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (act === 'fx') {
      window.PowerMode.set({ power: !window.PowerMode.get().power });
      syncFx();
      textarea.focus();
    }
    if (act === 'new') newQuestion();
    if (act === 'custom') customQuestion();
    if (act === 'submit') submit();
  });

  timer = setInterval(tick, 1000);
  cleanups.push(() => clearInterval(timer));

  if (draft?.question) showQuestion();
  else newQuestion();
}

function normalizeFeedback(fb, ex) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  const out = {
    score: Math.max(0, Math.min(100, Math.round(Number(fb.score) || 0))),
    band: fb.band != null ? String(fb.band) : '',
    summary: String(fb.summary || ''),
    criteria: arr(fb.criteria),
    errors: arr(fb.errors).filter((e) => e && (e.original || e.correction)),
    sentence_analysis: arr(fb.sentence_analysis),
    improved_version: String(fb.improved_version || ''),
    strengths: arr(fb.strengths),
    next_steps: arr(fb.next_steps),
  };
  // 完整作文的分数以 band 为准，避免模型给出前后不一致的数字
  if (ex.type === 'essay' && parseFloat(out.band)) out.score = Math.round((parseFloat(out.band) / 9) * 100);
  return out;
}

// 在原文中标出错误位置
function highlight(answer, errors) {
  const ranges = [];
  errors.forEach((e, i) => {
    const needle = String(e.original || '').trim();
    if (!needle) return;
    let idx = answer.indexOf(needle);
    while (idx !== -1 && ranges.some((r) => idx < r.end && idx + needle.length > r.start)) idx = answer.indexOf(needle, idx + 1);
    if (idx !== -1) ranges.push({ start: idx, end: idx + needle.length, i });
  });
  ranges.sort((a, b) => a.start - b.start);
  let html = '';
  let pos = 0;
  for (const r of ranges) {
    html += esc(answer.slice(pos, r.start));
    html += `<mark data-err="${r.i}" title="${esc(errors[r.i].correction)}">${esc(answer.slice(r.start, r.end))}<sup>${r.i + 1}</sup></mark>`;
    pos = r.end;
  }
  return html + esc(answer.slice(pos));
}

// ---------- 批改结果 ----------
function renderFeedback(root, item, onNext) {
  const { fb, exercise: ex, question, answer, unitId } = item;
  const isEssay = ex.type === 'essay';
  const passed = unitId && fb.score >= PASS_SCORE;
  const next = unitId && passed ? ALL_UNITS[ALL_UNITS.findIndex((u) => u.id === unitId) + 1] : null;
  const list = (items) => `<ul>${items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;

  root.innerHTML = `
    <section class="card result">
      <div class="score-head">
        <div class="score ${fb.score >= PASS_SCORE ? 'good' : fb.score >= 50 ? 'mid' : 'low'}">
          <b>${isEssay ? esc(fb.band || '-') : fb.score}</b><span>${isEssay ? 'Band' : '/ 100'}</span>
        </div>
        <div>
          ${!isEssay && fb.band ? `<span class="tag">估计水平 Band ${esc(fb.band)}</span>` : ''}
          <p>${esc(fb.summary)}</p>
          ${passed ? `<p class="ok-text">🎉 已掌握本单元！${next ? `<a href="#/unit/${next.id}">进入下一单元：${esc(next.title)} →</a>` : ''}</p>` : ''}
        </div>
      </div>
      ${
        fb.criteria.length
          ? `<div class="criteria">${fb.criteria
              .map((c) => `<div class="criterion"><div class="row between"><b>${esc(c.name)}</b><span class="tag">${esc(c.band)}</span></div><p class="small">${esc(c.comment)}</p></div>`)
              .join('')}</div>`
          : ''
      }
    </section>

    <section class="card">
      <h3>📝 你的答案 <span class="muted small">（标出 ${fb.errors.length} 处问题，点击可跳转）</span></h3>
      <div class="your-answer">${highlight(answer, fb.errors)}</div>
    </section>

    ${
      fb.errors.length
        ? `<section class="card"><h3>🔍 纠错</h3><ol class="errors">${fb.errors
            .map(
              (e, i) => `<li id="err-${item.id}-${i}">
                <div><span class="tag">${esc(e.type || '问题')}</span> <del>${esc(e.original)}</del> → <ins>${esc(e.correction)}</ins></div>
                <p class="small">${esc(e.explanation)}</p></li>`,
            )
            .join('')}</ol></section>`
        : `<section class="card"><h3>🔍 纠错</h3><p>没有发现语言错误，很棒！</p></section>`
    }

    ${
      fb.sentence_analysis.length
        ? `<section class="card"><h3>🧩 句子分析</h3>${fb.sentence_analysis
            .map(
              (s) => `<div class="analysis">
                <p class="sent">${esc(s.sentence)}</p>
                <p class="small"><b>结构：</b>${esc(s.structure)}</p>
                ${s.comment ? `<p class="small"><b>点评：</b>${esc(s.comment)}</p>` : ''}
                ${s.upgrade ? `<p class="small upgrade"><b>升级：</b>${esc(s.upgrade)}</p>` : ''}
              </div>`,
            )
            .join('')}</section>`
        : ''
    }

    ${fb.improved_version ? `<section class="card"><details open><summary><b>✨ 改进版本</b></summary><div class="improved">${md(fb.improved_version)}</div></details></section>` : ''}
    ${question.reference ? `<section class="card"><details><summary><b>📗 参考答案</b></summary>${md(question.reference)}</details></section>` : ''}

    <section class="card two-col">
      <div><h3>👍 做得好的地方</h3>${fb.strengths.length ? list(fb.strengths) : '<p class="muted">—</p>'}</div>
      <div><h3>🎯 下一步</h3>${fb.next_steps.length ? list(fb.next_steps) : '<p class="muted">—</p>'}</div>
    </section>

    <section class="card chat">
      <h3>💬 追问老师</h3>
      <p class="muted small">对批改有疑问？想知道为什么这样改？直接问。</p>
      <div class="chips">
        <button class="ghost small" data-q="请挑出我这次最严重的一个问题，详细讲讲背后的语法规则，并给我 3 个正确例句。">讲讲最严重的问题</button>
        <button class="ghost small" data-q="根据我这次的错误，给我出 3 道针对性的小练习（先不要给答案）。">出几道针对性练习</button>
        <button class="ghost small" data-q="如果要把这篇提高半分到一分，我最应该改哪三处？">怎么再提高一分</button>
      </div>
      <div class="messages"></div>
      <div class="row chat-input">
        <textarea rows="2" placeholder="输入你的问题…（Enter 发送，Shift+Enter 换行）"></textarea>
        <button data-act="ask">发送</button>
      </div>
    </section>

    ${onNext ? `<div class="row end"><button data-act="next">再练一题 →</button></div>` : ''}`;

  root.querySelectorAll('mark[data-err]').forEach((m) => {
    m.onclick = () => {
      const target = document.getElementById(`err-${item.id}-${m.dataset.err}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.classList.add('flash');
      setTimeout(() => target?.classList.remove('flash'), 1200);
    };
  });
  if (onNext) $('[data-act=next]', root).onclick = onNext;
  setupChat($('.chat', root), item);
}

function setupChat(box, item) {
  const { fb, question, answer, title } = item;
  const history = [];
  const msgs = $('.messages', box);
  const input = $('textarea', box);
  const sendBtn = $('[data-act=ask]', box);
  const context = `以下是我刚完成的练习和你的批改结果，接下来我会就此向你提问。请用中文回答，简洁具体，必要时给英文例句，可以使用 Markdown（加粗、列表）。
【练习】${title}
【题目】${question.prompt}
【我的答案】${answer}
【批改摘要】${fb.summary}
【指出的错误】${fb.errors.map((e) => `${e.original} → ${e.correction}`).join('；') || '无'}`;

  async function ask(text) {
    text = text.trim();
    if (!text || sendBtn.disabled) return;
    input.value = '';
    history.push({ role: 'user', content: text });
    msgs.insertAdjacentHTML('beforeend', `<div class="msg me">${esc(text)}</div>`);
    const pending = document.createElement('div');
    pending.className = 'msg ai loading';
    pending.textContent = '思考中…';
    msgs.appendChild(pending);
    sendBtn.disabled = true;
    try {
      const reply = await callAI(
        [{ role: 'system', content: SYSTEM }, { role: 'user', content: context }, { role: 'assistant', content: '好的，我已经看过你的练习和批改结果，请提问。' }, ...history],
        { temperature: 0.5 },
      );
      history.push({ role: 'assistant', content: reply });
      pending.className = 'msg ai';
      pending.innerHTML = md(reply.replace(/<think>[\s\S]*?<\/think>/g, ''));
    } catch (err) {
      history.pop();
      pending.className = 'msg ai error';
      pending.textContent = '出错了：' + err.message;
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.onclick = () => ask(input.value);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask(input.value);
    }
  });
  box.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => ask(b.dataset.q)));
}

// ---------- 模考 ----------
function renderMock(task) {
  if (task !== 'task1' && task !== 'task2') {
    app.innerHTML = `
      ${configBanner()}
      <h2>模拟考试</h2>
      <p class="muted">按真实考试要求计时写作，AI 按四项评分标准严格打分。建议完成学习路线后再来模考。</p>
      <div class="mock-grid">
        <a class="card unit" href="#/mock/task2"><div><b>Task 2 大作文</b><p class="muted small">40 分钟 · 250 词以上 · 议论文</p></div><span class="tag">开始 →</span></a>
        <a class="card unit" href="#/mock/task1"><div><b>Task 1 小作文</b><p class="muted small">20 分钟 · 150 词以上 · 图表描述</p></div><span class="tag">开始 →</span></a>
      </div>`;
    return;
  }
  const title = task === 'task2' ? '模考 · Task 2 大作文' : '模考 · Task 1 小作文';
  app.innerHTML = `${configBanner()}<p class="crumb"><a href="#/mock">模拟考试</a></p><h2>${title}</h2><div id="practice"></div>`;
  mountPractice($('#practice'), { key: 'mock-' + task, unitId: null, title, exercise: window.MOCK_EXERCISES[task] });
}

// ---------- 句子分析 ----------
function renderAnalyzer() {
  app.innerHTML = `
    ${configBanner()}
    <h2>句子分析</h2>
    <p class="muted">输入任何英文句子（你自己写的，或范文里看不懂的长难句），AI 会拆解句子结构、检查对错并给出升级写法。</p>
    <section class="card">
      <textarea class="answer short" placeholder="例如：Although many people believe that technology has made our lives easier, it has also created problems that previous generations never faced."></textarea>
      <div class="row end"><button data-act="analyze">分析</button></div>
    </section>
    <div class="analysis-result"></div>`;
  const input = $('textarea', app);
  const btn = $('[data-act=analyze]', app);
  const out = $('.analysis-result', app);
  input.value = store.get('draft.analyze', '');
  input.oninput = () => store.set('draft.analyze', input.value);

  async function analyze() {
    const text = input.value.trim();
    if (!text) return input.focus();
    btn.disabled = true;
    out.innerHTML = `<section class="card"><p class="loading">正在分析…</p></section>`;
    try {
      const data = await callJSON(
        [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `请逐句分析下面的英文句子，帮助我理解句子结构并发现问题：
"""
${text}
"""
只输出一个 JSON 对象，格式：
{"sentences": [{
  "original": "原句",
  "is_correct": true,
  "corrected": "如有错误，给出改正后的句子；没有错误则与原句相同",
  "main": "句子主干（主语 + 谓语 + 宾语/表语），用英文写出",
  "parts": [{"text": "原句中的片段", "role": "成分，如：主语/谓语/宾语/表语/定语/状语/定语从句/状语从句/宾语从句/同位语/插入语"}],
  "grammar_points": ["本句涉及的语法点（中文）"],
  "explanation": "中文解析：结构怎么理解、有什么错误",
  "upgrade": "更地道或更适合雅思写作的写法"
}]}`,
          },
        ],
        0.2,
      );
      const sentences = Array.isArray(data.sentences) ? data.sentences : [];
      out.innerHTML = sentences
        .map(
          (s) => `<section class="card">
            <p class="sent">${s.is_correct === false ? '❌' : '✅'} ${esc(s.original)}</p>
            ${s.is_correct === false ? `<p><b>改正：</b><ins>${esc(s.corrected)}</ins></p>` : ''}
            <p><b>主干：</b>${esc(s.main)}</p>
            <div class="parts">${(s.parts || []).map((p) => `<span class="part"><span>${esc(p.text)}</span><small>${esc(p.role)}</small></span>`).join('')}</div>
            ${(s.grammar_points || []).length ? `<p class="small"><b>语法点：</b>${s.grammar_points.map(esc).join('、')}</p>` : ''}
            <p class="small">${esc(s.explanation)}</p>
            ${s.upgrade ? `<p class="small upgrade"><b>升级：</b>${esc(s.upgrade)}</p>` : ''}
          </section>`,
        )
        .join('') || '<section class="card"><p class="muted">没有得到分析结果，请重试。</p></section>';
    } catch (err) {
      out.innerHTML = `<section class="card"><div class="error">分析失败：${esc(err.message)}</div></section>`;
    } finally {
      btn.disabled = false;
    }
  }
  btn.onclick = analyze;
}

// ---------- 记录 ----------
function renderHistory(id) {
  const history = getHistory();
  if (id) {
    const item = history.find((h) => h.id === id);
    if (!item) return renderHistory();
    app.innerHTML = `
      <p class="crumb"><a href="#/history">练习记录</a> / ${fmtDate(item.ts)}</p>
      <h2>${esc(item.title)}</h2>
      <section class="card"><h3>题目</h3>${md(item.question.prompt)}</section>
      <div id="fb"></div>
      ${item.unitId ? `<div class="row end"><a class="button" href="#/unit/${item.unitId}">回到这个单元继续练习 →</a></div>` : ''}`;
    renderFeedback($('#fb'), item, null);
    return;
  }

  const counts = {};
  history.forEach((h) => h.fb.errors.forEach((e) => (counts[e.type || '其他'] = (counts[e.type || '其他'] || 0) + 1)));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = top[0]?.[1] || 1;

  app.innerHTML = `
    <h2>练习记录</h2>
    ${
      history.length
        ? `<section class="card">
            <div class="row between"><h3>📊 我的常见错误</h3><button class="small" data-act="weak">AI 分析我的弱点</button></div>
            <div class="bars">${top.map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><div><i style="width:${(v / max) * 100}%"></i></div><b>${v}</b></div>`).join('') || '<p class="muted">暂无错误数据</p>'}</div>
            <div class="weak-result"></div>
          </section>
          <section class="card">
            <div class="list">${history
              .map(
                (h) => `<a class="list-item" href="#/history/${h.id}">
                  <span><b>${esc(h.title)}</b><br><span class="muted small">${fmtDate(h.ts)} · ${esc(h.question.prompt.slice(0, 60).replace(/[#*|\n]/g, ' '))}…</span></span>
                  <span class="tag ${h.fb.score >= PASS_SCORE ? 'ok' : ''}">${h.exercise.type === 'essay' ? 'Band ' + esc(h.fb.band) : h.fb.score + ' 分'}</span></a>`,
              )
              .join('')}</div>
            <div class="row end"><button class="ghost small" data-act="clear">清空记录与进度</button></div>
          </section>`
        : `<section class="card"><p>还没有练习记录。<a href="#/">从学习路线开始 →</a></p></section>`
    }`;

  $('[data-act=clear]', app)?.addEventListener('click', () => {
    if (!confirm('确定清空所有练习记录和学习进度吗？此操作不可恢复。')) return;
    store.remove('history');
    store.remove('progress');
    renderHistory();
  });

  $('[data-act=weak]', app)?.addEventListener('click', async (e) => {
    const box = $('.weak-result', app);
    e.target.disabled = true;
    box.innerHTML = `<p class="loading">正在分析你最近的练习…</p>`;
    const errors = history
      .slice(0, 30)
      .flatMap((h) => h.fb.errors.map((er) => `[${er.type}] ${er.original} → ${er.correction}`))
      .slice(0, 80);
    const scores = history.slice(0, 15).map((h) => `${h.title}：${h.exercise.type === 'essay' ? 'Band ' + h.fb.band : h.fb.score + '分'}`);
    const units = ALL_UNITS.map((u) => `${u.id}：${u.title}`).join('\n');
    try {
      const reply = await callAI(
        [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `这是我最近的练习数据，请帮我诊断写作弱点，并给出接下来一周的练习建议。
【最近成绩】
${scores.join('\n')}
【最近的错误】
${errors.join('\n') || '无'}
【可用的学习单元】
${units}

请用中文、Markdown 格式回答，包括：1) 我最主要的 3 个弱点（附具体例子）；2) 每个弱点的改进方法；3) 推荐我接下来练习哪些单元（写出单元名）。`,
          },
        ],
        { temperature: 0.4 },
      );
      box.innerHTML = `<div class="ai-text">${md(reply.replace(/<think>[\s\S]*?<\/think>/g, ''))}</div>`;
    } catch (err) {
      box.innerHTML = `<div class="error">分析失败：${esc(err.message)}</div>`;
    } finally {
      e.target.disabled = false;
    }
  });
}

// ---------- 设置 ----------
function setupSettings() {
  const dialog = $('#settings');
  const form = $('.settings-form', dialog);
  const fill = () => {
    const cfg = store.get('config', {});
    ['baseUrl', 'apiKey', 'model'].forEach((k) => (form.elements[k].value = cfg[k] || ''));
    $('#test-result').textContent = '';
    $('#server-status').innerHTML = `服务器 .env 配置：${esc(serverStatus.baseUrl || '-')} · 模型 ${esc(serverStatus.model || '-')} · Key ${serverStatus.hasKey ? '已配置' : '<b>未配置</b>'}`;
  };
  const read = () => Object.fromEntries(['baseUrl', 'apiKey', 'model'].map((k) => [k, form.elements[k].value.trim()]));

  $('#open-settings').onclick = () => {
    fill();
    const fx = window.PowerMode.get();
    $('#fx-power').checked = fx.power;
    $('#fx-sound').checked = fx.sound;
    dialog.showModal();
  };
  // 特效开关即时生效，不需要点保存
  $('#fx-power').onchange = (e) => window.PowerMode.set({ power: e.target.checked });
  $('#fx-sound').onchange = (e) => window.PowerMode.set({ sound: e.target.checked });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'save') {
      store.set('config', read());
      route();
    }
  });
  $('#test-conn').onclick = async () => {
    const out = $('#test-result');
    out.textContent = '正在测试…';
    try {
      const reply = await callAI([{ role: 'user', content: 'Reply with exactly: OK' }], { temperature: 0, config: read() });
      out.textContent = '✅ 连接成功，模型回复：' + reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 40);
    } catch (err) {
      out.textContent = '❌ ' + err.message;
    }
  };
}

// ---------- 启动 ----------
(async function init() {
  try {
    serverStatus = await (await fetch('/api/status')).json();
  } catch {}
  setupSettings();
  route();
})();
