// Quill · 雅思与学术写作练习（原生 JS，无需构建）
// 依赖加载顺序：i18n.js → content/*.js → effects.js → app.js

const PASS_SCORE = 70;
const app = document.getElementById('app');
let cleanups = [];
let serverStatus = { hasKey: false };

// ---------- 小工具 ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const countWords = (text) => (String(text).match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
const fmtTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const fmtDate = (ts) => new Date(ts).toLocaleString(getLang() === 'en' ? 'en-GB' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const stripThink = (s) => String(s).replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// 本地存储（隐私模式下可能不可用，全部 try/catch）
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

const prefs = () => ({ theme: 'auto', fbLang: 'auto', ...store.get('prefs', {}) });
const setPrefs = (p) => store.set('prefs', { ...prefs(), ...p });

const ALL_UNITS = window.TRACKS.flatMap((track) => track.stages.flatMap((stage) => stage.units.map((u) => ({ ...u, track, stage }))));
const findUnit = (id) => ALL_UNITS.find((u) => u.id === id);
const findTrack = (id) => window.TRACKS.find((tr) => tr.id === id) || window.TRACKS[0];
const trackUnits = (trackId) => ALL_UNITS.filter((u) => u.track.id === trackId);

// 极简 Markdown：段落、列表、表格、标题、粗体、斜体、行内代码
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
      while (i < lines.length && lines[i].trim() && !isTable(lines[i]) && !isUl(lines[i]) && !isOl(lines[i]) && !isHead(lines[i])) para.push(inline(lines[i++]));
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
  const data = await res.json().catch(() => ({ error: t('err.server', { status: res.status }) }));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data.content;
}

function parseJSON(text) {
  let s = stripThink(text);
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(t('err.notJson'));
  return JSON.parse(s.slice(start, end + 1));
}

// 要求 AI 输出 JSON；解析失败时让它自己修正一次
async function callJSON(messages, temperature) {
  const content = await callAI(messages, { temperature });
  try {
    return parseJSON(content);
  } catch {
    const fixed = await callAI(
      [...messages, { role: 'assistant', content }, { role: 'user', content: 'Your output was not valid JSON. Output it again as one valid JSON object only, with no other text.' }],
      { temperature: 0 },
    );
    return parseJSON(fixed);
  }
}

// ---------- 提示词 ----------
function feedbackLang() {
  const p = prefs().fbLang;
  return p === 'auto' ? getLang() : p;
}

function langRule() {
  return {
    zh: 'Language rule: write all explanations, comments, hints and summaries in Simplified Chinese. Keep English examples, corrections and rewrites in English.',
    en: 'Language rule: write everything in clear English suitable for an upper-intermediate learner. Do not use Chinese, except when quoting the student or when a task explicitly needs Chinese source sentences.',
    both: 'Language rule: write explanations bilingually: English first, then a Simplified Chinese version in brackets. Keep examples, corrections and rewrites in English.',
  }[feedbackLang()];
}

const system = () => `You are an experienced IELTS writing examiner and a patient one-to-one academic writing tutor. Your student is a native Chinese speaker improving their IELTS and academic English writing.
- Judge strictly by the official IELTS writing band descriptors (Task Achievement/Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy).
- Every point you make must be specific and actionable, and should explain the rule behind it.
- Be encouraging, but never let an error slide.
${langRule()}`;

function questionMessages(ex, title, recent) {
  const avoid = recent.length ? `\nDo not repeat any of these recent exercises:\n${recent.map((r) => '- ' + r.slice(0, 150).replace(/\n/g, ' ')).join('\n')}\n` : '';
  return [
    { role: 'system', content: system() },
    {
      role: 'user',
      content: `Create a new exercise for the unit "${title}".
Requirements (written in Chinese; follow them exactly): ${ex.gen}
${avoid}
Output only one JSON object:
{"prompt": "the exercise shown to the student (Markdown allowed; write line breaks as \\n)", "hint": "a hint, or an empty string", "reference": "a reference answer, or an empty string"}
Keep Chinese source sentences in Chinese when the task is translation. hint and reference follow the language rule.`,
    },
  ];
}

function feedbackMessages(ex, title, question, answer) {
  const words = countWords(answer);
  const isEssay = ex.type === 'essay';
  const trName = ex.task === 'task1' ? 'Task Achievement' : 'Task Response';
  const rules = [
    `List ${isEssay ? 'the 20 most important' : 'every single'} language error. errors[].original MUST be copied verbatim from the student's answer and be as short as possible (just the faulty word or phrase) so it can be located in the text. Use an empty array if there are none.`,
    ex.type === 'sentence' ? 'sentence_analysis: analyse every sentence the student wrote.' : 'sentence_analysis: pick the 3-4 most representative sentences (include both strong and weak ones).',
    isEssay
      ? `criteria must contain exactly four items: ${trName}, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy, each with a band (0-9 in steps of 0.5, as a number) and a comment. The overall band is the mean of the four, rounded the IELTS way (.25 rounds up to .5, .75 rounds up to the next whole band). Penalise ${trName} if the answer has fewer than ${ex.minWords} words.`
      : 'criteria: use an empty array [].',
    'band: your estimate of the student\'s current writing level, as a string such as "6.0".',
    isEssay ? 'score: integer 0-100 equal to round(overall band / 9 * 100).' : `score: integer 0-100 for how well this attempt meets the unit goal; ${PASS_SCORE} or above means the unit is mastered.`,
    'improved_version: rewrite the answer at a higher band while keeping the student\'s ideas and structure.',
    'Sound like a patient private tutor: strict about problems, specific about what was done well.',
  ];
  return [
    { role: 'system', content: system() },
    {
      role: 'user',
      content: `Assess the student's exercise.
[Unit] ${title}
[Exercise type] ${ex.kind}${ex.task ? ' (' + ex.task.replace('task', 'IELTS Task ') + ')' : ''}
[Instructions] ${L(ex.instruction, 'en')}
[Focus (in Chinese)] ${ex.focus}
[Exercise]
${question.prompt}
${question.hint ? '[Hint shown to student] ' + question.hint + '\n' : ''}[Student answer] (${words} words${ex.minWords ? `, minimum ${ex.minWords}` : ''})
"""
${answer}
"""

Rules:
${rules.map((r) => '- ' + r).join('\n')}

Output only one JSON object and nothing else:
{
  "score": 75,
  "band": "6.0",
  "summary": "1-2 sentence overall comment",
  "criteria": [{"name": "${trName}", "band": 6.0, "comment": "..."}],
  "errors": [{"original": "faulty text copied from the answer", "correction": "corrected text", "type": "one of: grammar, spelling, word choice, collocation, punctuation, article, tense, agreement, Chinglish, logic", "explanation": "why it is wrong and the rule"}],
  "sentence_analysis": [{"sentence": "the student's sentence", "structure": "its structure, e.g. subject + verb + object, with a non-defining relative clause", "comment": "strength or problem", "upgrade": "a better version in English"}],
  "improved_version": "higher-band version in English",
  "strengths": ["what was done well"],
  "next_steps": ["1-3 concrete things to practise next"]
}`,
    },
  ];
}

// ---------- 进度、记录与成长数据 ----------
const getProgress = () => store.get('progress', {});
const getHistory = () => store.get('history', []);

function xpFor(item) {
  if (item.exercise.type === 'copy') return 5 + Math.round(Math.min(item.fb.wpm || 0, 120) / 10) + Math.round((item.fb.accuracy || 0) / 20);
  return 5 + Math.round((Number(item.fb.score) || 0) / 10) + Math.min(30, Math.round(countWords(item.answer) / 10));
}

function stats() {
  const history = getHistory();
  const days = new Set(history.map((h) => dayKey(h.ts)));
  let streak = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const xp = history.reduce((sum, h) => sum + xpFor(h), 0);
  const level = Math.floor(Math.sqrt(xp / 40)) + 1;
  const levelStart = 40 * (level - 1) ** 2;
  const levelEnd = 40 * level ** 2;
  return {
    streak,
    xp,
    level,
    levelPct: Math.round(((xp - levelStart) / (levelEnd - levelStart)) * 100),
    words: history.reduce((sum, h) => sum + countWords(h.answer), 0),
    sessions: history.length,
    practicedToday: days.has(dayKey(Date.now())),
    bestCombo: window.Effects?.getBest() || 0,
  };
}

function recordAttempt({ key, unitId, title, exercise, question, answer, fb }) {
  const history = getHistory();
  const item = { id: Date.now().toString(36), ts: Date.now(), key, unitId, title, exercise, question, answer, fb };
  history.unshift(item);
  store.set('history', history.slice(0, 300));
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
const nextUnitIn = (trackId) => trackUnits(trackId).find((u) => !getProgress()[u.id]?.done);
const kindLabel = (kind) => t('kind.' + kind);
const unitTitle = (u) => L(u.title);

// ---------- 外壳：顶栏、主题、语言 ----------
function applyTheme() {
  const theme = prefs().theme;
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function renderTopbar() {
  const theme = prefs().theme;
  const themeIcon = {
    auto: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  }[theme];
  $('#topbar').innerHTML = `
    <a class="brand" href="#/"><span class="brand-mark">Q</span><span>Quill<small>${t('brand.sub')}</small></span></a>
    <nav class="nav">
      <a href="#/" data-nav="home">${t('nav.home')}</a>
      <a href="#/tracks" data-nav="tracks">${t('nav.tracks')}</a>
      <a href="#/mock" data-nav="mock">${t('nav.mock')}</a>
      <a href="#/analyze" data-nav="analyze">${t('nav.analyze')}</a>
      <a href="#/journal" data-nav="journal">${t('nav.journal')}</a>
    </nav>
    <div class="top-actions">
      <button class="icon-btn" data-act="lang" title="${t('top.lang')}">${getLang() === 'zh' ? 'EN' : '中'}</button>
      <button class="icon-btn" data-act="theme" title="${t('top.theme.' + theme)}">${themeIcon}</button>
      <button class="icon-btn" data-act="settings" title="${t('top.settings')}">⚙</button>
    </div>`;
  $('#topbar').onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'lang') {
      setLang(getLang() === 'zh' ? 'en' : 'zh');
      renderTopbar();
      route();
    }
    if (act === 'theme') {
      const order = ['auto', 'light', 'dark'];
      setPrefs({ theme: order[(order.indexOf(prefs().theme) + 1) % 3] });
      applyTheme();
      renderTopbar();
      markNav();
    }
    if (act === 'settings') openSettings();
  };
  markNav();
}

function markNav() {
  const view = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  const map = { unit: 'tracks', '': 'home' };
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (map[view] || view)));
}

function configBanner() {
  if (serverStatus.hasKey || store.get('config', {}).apiKey) return '';
  return `<div class="banner">${t('banner.noKey')} <button class="link" data-open-settings>${t('banner.openSettings')}</button></div>`;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-settings]')) openSettings();
});

// ---------- 路由 ----------
function route() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  const [view = '', id] = location.hash.replace(/^#\/?/, '').split('/');
  const views = { '': renderHome, tracks: renderTracks, unit: renderUnit, mock: renderMock, analyze: renderAnalyzer, journal: renderJournal };
  app.className = '';
  (views[view] || renderHome)(id ? decodeURIComponent(id) : undefined);
  markNav();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ---------- 首页：仪表盘 ----------
function renderHome() {
  const s = stats();
  const lastTrack = store.get('lastTrack', 'ielts');
  const next = nextUnitIn(lastTrack) || ALL_UNITS.find((u) => !getProgress()[u.id]?.done);
  const hour = new Date().getHours();
  const greet = t(hour < 5 ? 'home.night' : hour < 12 ? 'home.morning' : hour < 18 ? 'home.afternoon' : 'home.evening');
  const progress = getProgress();

  app.innerHTML = `
    ${configBanner()}
    <div class="dash">
      <section class="card hero span-2">
        <p class="eyebrow">${new Date().toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1>${greet}</h1>
        ${
          next
            ? `<p class="muted">${t('home.next')}</p>
               <a class="next-unit" href="#/unit/${next.id}">
                 <span class="next-icon">${next.track.icon}</span>
                 <span><b>${esc(unitTitle(next))}</b><small>${esc(L(next.track.title))} · ${esc(L(next.goal))}</small></span>
                 <span class="arrow">→</span>
               </a>`
            : `<p class="muted">${t('home.allDone')}</p><a class="button" href="#/mock">${t('home.toMock')}</a>`
        }
        <div class="chips">
          <span class="chip">${s.practicedToday ? '🌿' : '🌱'} ${t('home.streak', { n: s.streak })}</span>
          <span class="chip">Lv ${s.level} · ${s.xp} XP</span>
        </div>
      </section>

      <section class="card level">
        <h3>${t('home.growth')}</h3>
        ${ring(s.levelPct, 'Lv ' + s.level)}
        <p class="muted small center">${t('home.toNext', { pct: 100 - s.levelPct })}</p>
        <div class="mini-stats">
          <div><b>${s.words}</b><small>${t('home.words')}</small></div>
          <div><b>${s.sessions}</b><small>${t('home.sessions')}</small></div>
          <div><b>${s.bestCombo}</b><small>${t('home.bestCombo')}</small></div>
        </div>
      </section>

      <section class="card span-2">
        <div class="row between"><h3>${t('home.tracks')}</h3><a href="#/tracks" class="small">${t('home.allTracks')} →</a></div>
        <div class="track-list">
          ${window.TRACKS.map((tr) => {
            const units = trackUnits(tr.id);
            const done = units.filter((u) => progress[u.id]?.done).length;
            return `<a class="track-row" href="#/tracks/${tr.id}">
              <span class="track-icon">${tr.icon}</span>
              <span class="grow"><b>${esc(L(tr.title))}</b><small class="muted">${esc(L(tr.desc))}</small>
                <span class="bar"><i style="width:${(done / units.length) * 100}%"></i></span></span>
              <span class="muted small">${done}/${units.length}</span></a>`;
          }).join('')}
        </div>
      </section>

      <section class="card">
        <h3>${t('home.skills')}</h3>
        ${radar()}
      </section>

      <section class="card">
        <h3>${t('home.errors')}</h3>
        ${topErrors(3)}
      </section>

      <section class="card span-2">
        <h3>${t('home.quick')}</h3>
        <div class="quick">
          <a href="#/unit/t7"><span>⏱</span><b>${t('home.q.sprint')}</b><small>${t('home.q.sprintSub')}</small></a>
          <a href="#/unit/t8"><span>⌨</span><b>${t('home.q.copy')}</b><small>${t('home.q.copySub')}</small></a>
          <a href="#/mock"><span>📝</span><b>${t('home.q.mock')}</b><small>${t('home.q.mockSub')}</small></a>
          <a href="#/analyze"><span>🔍</span><b>${t('home.q.analyze')}</b><small>${t('home.q.analyzeSub')}</small></a>
        </div>
      </section>
    </div>`;
}

function ring(pct, label) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${esc(label)} ${pct}%">
    <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
    <circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="66" text-anchor="middle">${esc(label)}</text></svg>`;
}

// 四项能力雷达图：取最近 6 篇完整作文的分项平均分
function radar() {
  const keyOf = (name) => (/task/i.test(name) ? 'TR' : /coher/i.test(name) ? 'CC' : /lexic/i.test(name) ? 'LR' : /gramm/i.test(name) ? 'GRA' : null);
  const essays = getHistory().filter((h) => h.fb.criteria?.length).slice(0, 6);
  if (!essays.length) return `<p class="muted small">${t('home.skillsEmpty')}</p><a class="small" href="#/unit/u12">${t('home.skillsGo')} →</a>`;
  const sums = { TR: [], CC: [], LR: [], GRA: [] };
  essays.forEach((h) => h.fb.criteria.forEach((c) => keyOf(c.name) && sums[keyOf(c.name)].push(parseFloat(c.band) || 0)));
  const keys = ['TR', 'CC', 'LR', 'GRA'];
  const avg = keys.map((k) => (sums[k].length ? sums[k].reduce((a, b) => a + b, 0) / sums[k].length : 0));
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    const r = (v / 9) * 70;
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  };
  const poly = (v) => keys.map((_, i) => pt(i, typeof v === 'number' ? v : v[i]).join(',')).join(' ');
  const labelPos = [[100, 18], [184, 104], [100, 194], [16, 104]];
  return `<svg class="radar" viewBox="-24 0 248 210" role="img" aria-label="TR ${avg[0].toFixed(1)}, CC ${avg[1].toFixed(1)}, LR ${avg[2].toFixed(1)}, GRA ${avg[3].toFixed(1)}">
    ${[3, 6, 9].map((v) => `<polygon points="${poly(v)}" class="radar-grid"/>`).join('')}
    <polygon points="${poly(avg)}" class="radar-area"/>
    ${keys.map((k, i) => `<text x="${labelPos[i][0]}" y="${labelPos[i][1]}" text-anchor="middle">${k} ${avg[i].toFixed(1)}</text>`).join('')}
  </svg>`;
}

function errorCounts() {
  const counts = {};
  getHistory().forEach((h) => (h.fb.errors || []).forEach((e) => {
    const k = String(e.type || 'other').toLowerCase();
    counts[k] = (counts[k] || 0) + 1;
  }));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function topErrors(n) {
  const top = errorCounts().slice(0, n);
  if (!top.length) return `<p class="muted small">${t('home.errorsEmpty')}</p>`;
  const max = top[0][1];
  return `<div class="bars">${top.map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><span class="bar"><i style="width:${(v / max) * 100}%"></i></span><b>${v}</b></div>`).join('')}</div>`;
}

// ---------- 课程页 ----------
function renderTracks(id) {
  const track = findTrack(id || store.get('lastTrack', 'ielts'));
  store.set('lastTrack', track.id);
  const progress = getProgress();
  const next = nextUnitIn(track.id);
  app.innerHTML = `
    ${configBanner()}
    <div class="track-tabs">
      ${window.TRACKS.map((tr) => `<a href="#/tracks/${tr.id}" class="${tr.id === track.id ? 'active' : ''}">${tr.icon} ${esc(L(tr.title))}</a>`).join('')}
    </div>
    <header class="page-head">
      <h1>${track.icon} ${esc(L(track.title))}</h1>
      <p class="muted">${esc(L(track.desc))}</p>
    </header>
    ${track.stages
      .map(
        (stage, si) => `
      <section class="stage">
        <div class="stage-head"><span class="stage-no">${String(si + 1).padStart(2, '0')}</span><div><h2>${esc(L(stage.title))}</h2><p class="muted">${esc(L(stage.desc))}</p></div></div>
        <div class="unit-grid">
          ${stage.units
            .map((u) => {
              const p = progress[u.id];
              const status = p?.done
                ? `<span class="tag ok">✓ ${t('unit.mastered')} · ${p.best}</span>`
                : p
                  ? `<span class="tag">${t('unit.tries', { n: p.attempts, best: p.best })}</span>`
                  : `<span class="tag dim">${t('unit.new')}</span>`;
              const helps = u.helps ? `<span class="tag gold">IELTS · ${u.helps.join(' ')}</span>` : '';
              const mins = u.minutes ? `<span class="tag dim">${u.minutes} min</span>` : '';
              return `<a class="unit-card ${next?.id === u.id ? 'current' : ''}" href="#/unit/${u.id}">
                <span class="kind">${esc(kindLabel(u.exercise.kind))}</span>
                <b>${esc(L(u.title))}</b>
                <small class="muted">${esc(L(u.goal))}</small>
                <span class="tags">${status}${helps}${mins}</span></a>`;
            })
            .join('')}
        </div>
      </section>`,
      )
      .join('')}`;
}

// ---------- 单元页：左右分栏 ----------
function renderUnit(id) {
  const unit = findUnit(id);
  if (!unit) return renderTracks();
  store.set('lastTrack', unit.track.id);
  app.className = 'ws-mode';
  const idx = ALL_UNITS.indexOf(unit);
  app.innerHTML = `
    <header class="ws-head">
      <div>
        <p class="crumb"><a href="#/tracks/${unit.track.id}">${unit.track.icon} ${esc(L(unit.track.title))}</a> / ${esc(L(unit.stage.title))}</p>
        <h1>${esc(L(unit.title))}</h1>
      </div>
      <div class="row">
        ${unit.helps ? `<span class="tag gold">IELTS · ${unit.helps.join(' ')}</span>` : ''}
        ${idx > 0 ? `<a class="icon-btn" href="#/unit/${ALL_UNITS[idx - 1].id}" title="${t('unit.prev')}">←</a>` : ''}
        ${idx < ALL_UNITS.length - 1 ? `<a class="icon-btn" href="#/unit/${ALL_UNITS[idx + 1].id}" title="${t('unit.next')}">→</a>` : ''}
      </div>
    </header>
    ${configBanner()}
    <div id="ws"></div>`;
  const opts = { key: unit.id, unitId: unit.id, title: L(unit.title, 'en'), exercise: unit.exercise, cards: unit.cards, goal: L(unit.goal), helps: unit.helps };
  if (unit.exercise.type === 'copy') mountCopy($('#ws'), opts);
  else mountWorkspace($('#ws'), opts);
}

// 分栏骨架：左侧标签页 + 可拖动分隔线 + 右侧写作区
function workspaceShell(root, tabs) {
  root.innerHTML = `
    <div class="workspace" style="--split:${store.get('split', 44)}%">
      <aside class="pane pane-left">
        <nav class="tabs" role="tablist">
          ${tabs.map((tab) => `<button role="tab" data-tab="${tab}">${t('tab.' + tab)}<span class="dot"></span></button>`).join('')}
        </nav>
        ${tabs.map((tab) => `<div class="tab-panel" data-panel="${tab}" hidden></div>`).join('')}
      </aside>
      <div class="divider" role="separator" aria-orientation="vertical" title="${t('ws.drag')}"></div>
      <section class="pane pane-right"></section>
    </div>`;
  const ws = $('.workspace', root);

  function show(tab) {
    $$('[data-tab]', ws).forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
      if (on) b.classList.remove('has-news');
    });
    $$('[data-panel]', ws).forEach((p) => (p.hidden = p.dataset.panel !== tab));
  }
  $('.tabs', ws).onclick = (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) show(b.dataset.tab);
  };

  // 拖动分隔线调整左右宽度
  const divider = $('.divider', ws);
  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    ws.classList.add('dragging');
    const move = (ev) => {
      const rect = ws.getBoundingClientRect();
      const pct = Math.min(70, Math.max(26, ((ev.clientX - rect.left) / rect.width) * 100));
      ws.style.setProperty('--split', pct.toFixed(1) + '%');
    };
    const up = () => {
      ws.classList.remove('dragging');
      store.set('split', parseFloat(ws.style.getPropertyValue('--split')));
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', up);
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up);
  });
  divider.addEventListener('dblclick', () => {
    ws.style.setProperty('--split', '44%');
    store.set('split', 44);
  });

  return {
    ws,
    right: $('.pane-right', ws),
    panel: (tab) => $(`[data-panel="${tab}"]`, ws),
    show,
    notify(tab) {
      const b = $(`[data-tab="${tab}"]`, ws);
      if (!b.classList.contains('active')) b.classList.add('has-news');
    },
  };
}

// 教程：一步一张卡片
function renderLesson(panel, cards, { unitId, goal, onDone }) {
  if (!cards?.length) {
    panel.innerHTML = `<p class="muted">${t('lesson.none')}</p>`;
    return;
  }
  const stepKey = 'step.' + unitId;
  let step = Math.min(store.get(stepKey, 0), cards.length - 1);

  function cardHTML(c) {
    if (c.kind === 'compare') {
      return `<h3>${esc(L(c.title))}</h3><div class="compare">${c.rows
        .map(
          ([bad, good, note]) => `<div class="cmp-row">
            <div class="cmp bad"><span>✗</span><p>${bad}</p></div>
            <div class="cmp good"><span>✓</span><p>${good}</p></div>
            ${L(note) ? `<p class="cmp-note">${esc(L(note))}</p>` : ''}</div>`,
        )
        .join('')}</div>`;
    }
    if (c.kind === 'check') {
      return `<h3>✎ ${esc(L(c.title))}</h3><p>${L(c.prompt)}</p>
        <textarea class="check-input" rows="3" placeholder="${t('lesson.checkPh')}"></textarea>
        <div class="row end"><button class="small" data-act="reveal">${t('lesson.reveal')}</button></div>
        <div class="check-answer" hidden><p class="muted small">${t('lesson.model')}</p><p class="model">${esc(c.answer)}</p><p class="muted small">${t('lesson.compare')}</p></div>`;
    }
    return `<h3>${esc(L(c.title))}</h3>${L(c.body)}`;
  }

  function draw() {
    store.set(stepKey, step);
    const last = step === cards.length - 1;
    panel.innerHTML = `
      <div class="lesson">
        ${step === 0 && goal ? `<p class="goal">🎯 ${esc(goal)}</p>` : ''}
        <div class="steps">${cards.map((_, i) => `<button class="step-dot ${i === step ? 'on' : i < step ? 'done' : ''}" data-step="${i}" aria-label="${i + 1}"></button>`).join('')}<span class="muted small">${step + 1} / ${cards.length}</span></div>
        <article class="lesson-card">${cardHTML(cards[step])}</article>
        <div class="row between">
          <button class="ghost small" data-act="prev" ${step === 0 ? 'disabled' : ''}>← ${t('lesson.prev')}</button>
          <button class="small" data-act="${last ? 'start' : 'next'}">${last ? t('lesson.start') : t('lesson.next')} →</button>
        </div>
      </div>`;
  }

  panel.onclick = (e) => {
    const el = e.target.closest('[data-act],[data-step]');
    if (!el) return;
    if (el.dataset.step) step = Number(el.dataset.step);
    else if (el.dataset.act === 'prev') step = Math.max(0, step - 1);
    else if (el.dataset.act === 'next') step = Math.min(cards.length - 1, step + 1);
    else if (el.dataset.act === 'start') return onDone?.();
    else if (el.dataset.act === 'reveal') {
      $('.check-answer', panel).hidden = false;
      return;
    } else return;
    draw();
  };
  draw();
}

// 普通练习（出题 → 打字 → 批改）
function mountWorkspace(root, { key, unitId, title, exercise: ex, cards, goal, helps, tabs = ['lesson', 'hints', 'feedback', 'ask'] }) {
  const shell = workspaceShell(root, tabs);
  const draftKey = 'draft.' + key;
  let draft = store.get(draftKey, null);
  let lastItem = null;

  renderLesson(shell.panel('lesson'), cards, { unitId: key, goal, onDone: () => textarea.focus() });

  shell.right.innerHTML = `
    <div class="editor-head">
      <span class="kind">${esc(kindLabel(ex.kind))}</span>
      <div class="row">
        <button class="ghost small" data-act="custom">${t('ws.custom')}</button>
        <button class="ghost small" data-act="new">${t('ws.new')}</button>
      </div>
    </div>
    <p class="instruction">${esc(L(ex.instruction))}</p>
    <div class="question"></div>
    <textarea class="answer" spellcheck="false" placeholder="${t('ws.placeholder')}"></textarea>
    <div class="editor-bar">
      <span class="muted small"><span class="wc"></span><span class="clock"></span></span>
      <div class="row">${fxSelect()}<button data-act="submit">${t('ws.submit')}</button></div>
    </div>`;

  const qBox = $('.question', shell.right);
  const textarea = $('.answer', shell.right);
  const submitBtn = $('[data-act=submit]', shell.right);
  bindFxSelect(shell.right);

  const saveDraft = () => draft && store.set(draftKey, draft);

  function updateCount() {
    const n = countWords(textarea.value);
    const wc = $('.wc', shell.right);
    wc.textContent = ex.minWords ? t('ws.wordsMin', { n, min: ex.minWords }) : t('ws.words', { n });
    wc.classList.toggle('warn', Boolean(ex.minWords) && n > 0 && n < ex.minWords);
  }

  function tick() {
    const clock = $('.clock', shell.right);
    if (!ex.timeLimit || !draft?.startedAt) return (clock.textContent = ex.timeLimit ? ` · ⏱ ${ex.timeLimit}:00` : '');
    const sec = Math.floor((Date.now() - draft.startedAt) / 1000);
    clock.textContent = ` · ⏱ ${fmtTime(sec)} / ${ex.timeLimit}:00`;
    clock.classList.toggle('warn', sec > ex.timeLimit * 60);
  }

  function renderHints() {
    const q = draft?.question;
    shell.panel('hints').innerHTML = `
      <section class="block"><h3>${t('hints.task')}</h3><p>${esc(L(ex.instruction))}</p>
        ${helps ? `<p class="muted small">${t('hints.helps', { list: helps.join(' · ') })}</p>` : ''}</section>
      ${q?.hint ? `<section class="block"><h3>💡 ${t('hints.hint')}</h3>${md(q.hint)}</section>` : ''}
      ${q?.reference ? `<section class="block"><details><summary>📗 ${t('hints.reference')}</summary><p class="muted small">${t('hints.refWarn')}</p>${md(q.reference)}</details></section>` : ''}
      ${!q?.hint && !q?.reference ? `<p class="muted">${t('hints.none')}</p>` : ''}`;
  }

  function showQuestion() {
    qBox.innerHTML = `<div class="prompt">${md(draft.question.prompt)}</div>`;
    textarea.value = draft.answer || '';
    textarea.disabled = false;
    submitBtn.disabled = false;
    updateCount();
    tick();
    renderHints();
  }

  async function newQuestion() {
    qBox.innerHTML = `<p class="loading">${t('ws.generating')}</p>`;
    textarea.disabled = true;
    submitBtn.disabled = true;
    try {
      const q = await callJSON(questionMessages(ex, title, recentPrompts(key)), 0.9);
      if (!q.prompt) throw new Error(t('err.emptyQuestion'));
      draft = { question: { prompt: String(q.prompt), hint: String(q.hint || ''), reference: String(q.reference || '') }, answer: '' };
      saveDraft();
      showQuestion();
    } catch (err) {
      qBox.innerHTML = `<div class="error">${t('err.generate')}${esc(err.message)}</div>`;
    }
  }

  function customQuestion() {
    qBox.innerHTML = `
      <textarea class="custom-q" placeholder="${t('ws.customPh')}"></textarea>
      <div class="row end"><button class="small" data-act="use-custom">${t('ws.useCustom')}</button></div>`;
    textarea.disabled = true;
    submitBtn.disabled = true;
    $('.custom-q', qBox).focus();
  }

  async function submit() {
    const answer = textarea.value.trim();
    if (!draft || !answer) return textarea.focus();
    const words = countWords(answer);
    if (ex.minWords && words < ex.minWords * 0.6 && !confirm(t('ws.tooShort', { n: words, min: ex.minWords }))) return;
    submitBtn.disabled = true;
    const panel = shell.panel('feedback');
    panel.innerHTML = `<p class="loading">${t('ws.grading')}${ex.type === 'essay' ? t('ws.gradingLong') : ''}</p>`;
    shell.show('feedback');
    try {
      const fb = normalizeFeedback(await callJSON(feedbackMessages(ex, title, draft.question, answer), 0.3), ex);
      lastItem = recordAttempt({ key, unitId, title, exercise: ex, question: draft.question, answer, fb });
      draft.answer = answer;
      saveDraft();
      renderFeedback(panel, lastItem, {
        onRevise: () => textarea.focus(),
        onNext: () => {
          store.remove(draftKey);
          draft = null;
          lastItem = null;
          chat.refresh();
          newQuestion();
          textarea.focus();
        },
      });
      renderHints();
      chat.refresh();
      shell.notify('hints');
    } catch (err) {
      panel.innerHTML = `<div class="error">${t('err.grade')}${esc(err.message)}</div><p class="muted small">${t('ws.kept')}</p>`;
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
  shell.right.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new') newQuestion();
    if (act === 'custom') customQuestion();
    if (act === 'submit') submit();
    if (act === 'use-custom') {
      const text = $('.custom-q', qBox).value.trim();
      if (!text) return;
      draft = { question: { prompt: text, hint: '', reference: '' }, answer: '' };
      saveDraft();
      showQuestion();
    }
  });

  shell.panel('feedback').innerHTML = `<div class="empty"><span>✒</span><p>${t('fb.empty')}</p></div>`;
  const chat = setupChat(shell.panel('ask'), () => ({ title, question: draft?.question, answer: textarea.value, item: lastItem, lesson: cards }));

  const timer = setInterval(tick, 1000);
  cleanups.push(() => clearInterval(timer));

  shell.show(tabs[0]);
  if (draft?.question) showQuestion();
  else {
    updateCount();
    newQuestion();
  }
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
  // 完整作文以 band 为准，避免模型给出前后不一致的分数
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
function renderFeedback(root, item, { onNext, onRevise } = {}) {
  if (item.exercise.type === 'copy') return renderCopyResult(root, item, { onNext });
  const { fb, exercise: ex, answer, unitId } = item;
  const isEssay = ex.type === 'essay';
  const passed = unitId && fb.score >= PASS_SCORE;
  const next = passed ? ALL_UNITS[ALL_UNITS.findIndex((u) => u.id === unitId) + 1] : null;
  const list = (items) => `<ul>${items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
  const tone = fb.score >= PASS_SCORE ? 'good' : fb.score >= 50 ? 'mid' : 'low';

  root.innerHTML = `
    <section class="result-head">
      <div class="score ${tone}"><b>${isEssay ? esc(fb.band || '-') : fb.score}</b><span>${isEssay ? 'Band' : '/ 100'}</span></div>
      <div>
        <div class="chips">${!isEssay && fb.band ? `<span class="chip">${t('fb.level', { band: fb.band })}</span>` : ''}<span class="chip">+${xpFor(item)} XP</span></div>
        <p>${esc(fb.summary)}</p>
        ${passed ? `<p class="ok-text">🌿 ${t('fb.passed')} ${next ? `<a href="#/unit/${next.id}">${t('fb.nextUnit', { title: L(next.title) })} →</a>` : ''}</p>` : ''}
      </div>
    </section>
    ${fb.criteria.length ? `<div class="criteria">${fb.criteria.map((c) => `<div class="criterion"><div class="row between"><b>${esc(c.name)}</b><span class="tag">${esc(c.band)}</span></div><p class="small">${esc(c.comment)}</p></div>`).join('')}</div>` : ''}

    <section class="block">
      <h3>${t('fb.yours')} <span class="muted small">${t('fb.marked', { n: fb.errors.length })}</span></h3>
      <div class="your-answer">${highlight(answer, fb.errors)}</div>
    </section>

    <section class="block">
      <h3>${t('fb.errors')}</h3>
      ${
        fb.errors.length
          ? `<ol class="errors">${fb.errors
              .map(
                (e, i) => `<li id="err-${item.id}-${i}">
                <div><span class="tag">${esc(e.type || '—')}</span> <del>${esc(e.original)}</del> → <ins>${esc(e.correction)}</ins></div>
                <p class="small">${esc(e.explanation)}</p></li>`,
              )
              .join('')}</ol>`
          : `<p>${t('fb.noErrors')}</p>`
      }
    </section>

    ${
      fb.sentence_analysis.length
        ? `<section class="block"><h3>${t('fb.analysis')}</h3>${fb.sentence_analysis
            .map(
              (s) => `<div class="analysis">
                <p class="sent">${esc(s.sentence)}</p>
                <p class="small"><b>${t('fb.structure')}</b> ${esc(s.structure)}</p>
                ${s.comment ? `<p class="small"><b>${t('fb.comment')}</b> ${esc(s.comment)}</p>` : ''}
                ${s.upgrade ? `<p class="small upgrade"><b>${t('fb.upgrade')}</b> ${esc(s.upgrade)}</p>` : ''}
              </div>`,
            )
            .join('')}</section>`
        : ''
    }
    ${fb.improved_version ? `<section class="block"><details open><summary>${t('fb.improved')}</summary><div class="improved">${md(fb.improved_version)}</div></details></section>` : ''}
    <section class="block two-col">
      <div><h3>${t('fb.strengths')}</h3>${fb.strengths.length ? list(fb.strengths) : '<p class="muted">—</p>'}</div>
      <div><h3>${t('fb.next')}</h3>${fb.next_steps.length ? list(fb.next_steps) : '<p class="muted">—</p>'}</div>
    </section>
    ${onNext || onRevise ? `<div class="row end">${onRevise ? `<button class="ghost" data-act="revise">${t('fb.revise')}</button>` : ''}${onNext ? `<button data-act="next">${t('fb.again')} →</button>` : ''}</div>` : ''}`;

  $$('mark[data-err]', root).forEach((m) => {
    m.onclick = () => {
      const target = document.getElementById(`err-${item.id}-${m.dataset.err}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.classList.add('flash');
      setTimeout(() => target?.classList.remove('flash'), 1200);
    };
  });
  if (onNext) $('[data-act=next]', root).onclick = onNext;
  if (onRevise) $('[data-act=revise]', root).onclick = onRevise;
}

// ---------- 追问 ----------
function setupChat(box, getContext) {
  const history = [];
  box.innerHTML = `
    <p class="muted small">${t('ask.intro')}</p>
    <div class="chips ask-chips"></div>
    <div class="messages"></div>
    <div class="chat-input">
      <textarea rows="2" placeholder="${t('ask.placeholder')}"></textarea>
      <button data-act="ask">${t('ask.send')}</button>
    </div>`;
  const msgs = $('.messages', box);
  const input = $('textarea', box);
  const sendBtn = $('[data-act=ask]', box);

  function chips() {
    const done = Boolean(getContext().item);
    const list = done ? ['ask.q.worst', 'ask.q.drills', 'ask.q.band'] : ['ask.q.explain', 'ask.q.hint', 'ask.q.examples'];
    $('.ask-chips', box).innerHTML = list.map((k) => `<button class="ghost small" data-q="${esc(t(k))}">${t(k + '.label')}</button>`).join('');
  }

  function contextText() {
    const c = getContext();
    const lesson = (c.lesson || []).map((card) => L(card.title, 'en')).join('; ');
    let s = `Context for my questions.\n[Unit] ${c.title}${lesson ? `\n[Lesson topics] ${lesson}` : ''}`;
    if (c.question) s += `\n[Exercise] ${c.question.prompt}`;
    if (c.item) {
      s += `\n[My submitted answer] ${c.item.answer}\n[Your feedback summary] ${c.item.fb.summary || ''}\n[Errors you found] ${(c.item.fb.errors || []).map((e) => `${e.original} → ${e.correction}`).join('; ') || 'none'}`;
    } else if (c.answer?.trim()) {
      s += `\n[My current draft (not submitted)] ${c.answer}`;
    }
    return s + '\nAnswer concisely and specifically, with English examples where useful. Markdown (bold, lists) is fine.';
  }

  async function ask(text) {
    text = text.trim();
    if (!text || sendBtn.disabled) return;
    input.value = '';
    history.push({ role: 'user', content: text });
    msgs.insertAdjacentHTML('beforeend', `<div class="msg me">${esc(text)}</div>`);
    const pending = document.createElement('div');
    pending.className = 'msg ai loading';
    pending.textContent = t('ask.thinking');
    msgs.appendChild(pending);
    pending.scrollIntoView({ block: 'nearest' });
    sendBtn.disabled = true;
    try {
      const reply = await callAI(
        [{ role: 'system', content: system() }, { role: 'user', content: contextText() }, { role: 'assistant', content: 'Understood. What would you like to ask?' }, ...history],
        { temperature: 0.5 },
      );
      history.push({ role: 'assistant', content: reply });
      pending.className = 'msg ai';
      pending.innerHTML = md(stripThink(reply));
    } catch (err) {
      history.pop();
      pending.className = 'msg ai error';
      pending.textContent = t('err.generic') + err.message;
    } finally {
      sendBtn.disabled = false;
      chips();
    }
  }

  sendBtn.onclick = () => ask(input.value);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask(input.value);
    }
  });
  box.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) ask(q.dataset.q);
  });
  chips();
  return { refresh: chips };
}

// ---------- 打字特效选择 ----------
function fxSelect() {
  const cur = window.Effects.get().preset;
  return `<label class="fx-pick" title="${t('fx.title')}"><select class="fx-select" aria-label="${t('fx.title')}">${window.Effects.PRESETS.map((p) => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${p.icon} ${L(p.label)}</option>`).join('')}</select></label>`;
}
function bindFxSelect(root) {
  $('.fx-select', root).onchange = (e) => window.Effects.set({ preset: e.target.value });
}

// ---------- 范文跟打 ----------
const normType = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/\s+/g, ' ');

function mountCopy(root, { key, unitId, title, exercise: ex, cards }) {
  const shell = workspaceShell(root, ['lesson', 'hints', 'feedback', 'ask']);
  let passage;
  let startedAt = 0;
  let finished = false;
  let spans = [];
  let lastItem = null;

  renderLesson(shell.panel('lesson'), cards, { unitId: key, onDone: () => input.focus() });
  shell.panel('feedback').innerHTML = `<div class="empty"><span>⌨</span><p>${t('copy.empty')}</p></div>`;

  shell.right.innerHTML = `
    <div class="editor-head">
      <span class="kind">${esc(kindLabel('copy'))}</span>
      <div class="row">
        <button class="ghost small" data-act="ai">${t('copy.ai')}</button>
        <button class="ghost small" data-act="next">${t('copy.next')}</button>
      </div>
    </div>
    <p class="instruction"><span class="copy-topic"></span></p>
    <div class="copy-target" aria-hidden="true"></div>
    <textarea class="answer copy-input" spellcheck="false" autocomplete="off" placeholder="${t('copy.placeholder')}"></textarea>
    <div class="editor-bar">
      <span class="muted small copy-live"></span>
      <div class="row">${fxSelect()}<button class="ghost" data-act="restart">${t('copy.restart')}</button></div>
    </div>`;
  const target = $('.copy-target', shell.right);
  const input = $('.copy-input', shell.right);
  const live = $('.copy-live', shell.right);
  bindFxSelect(shell.right);

  function load(p) {
    passage = { ...p, text: normType(p.text).trim() };
    target.innerHTML = [...passage.text].map((ch) => `<span>${esc(ch)}</span>`).join('');
    spans = $$('span', target);
    $('.copy-topic', shell.right).textContent = `${L(ex.instruction)} · ${L(p.topic)}`;
    shell.panel('hints').innerHTML = `<section class="block"><h3>${t('copy.phrases')}</h3><ul class="phrases">${(p.phrases || []).map((ph) => `<li>${esc(ph)}</li>`).join('')}</ul><p class="muted small">${t('copy.phrasesTip')}</p></section>`;
    restart();
  }

  function restart() {
    input.value = '';
    input.disabled = false;
    startedAt = 0;
    finished = false;
    paint();
    input.focus();
  }

  function paint() {
    const typed = normType(input.value);
    let correct = 0;
    spans.forEach((s, i) => {
      const c = typed[i];
      s.className = c === undefined ? (i === typed.length ? 'cur' : '') : c === passage.text[i] ? 'ok' : 'err';
      if (c !== undefined && c === passage.text[i]) correct++;
    });
    $('.cur', target)?.scrollIntoView({ block: 'nearest' });
    const mins = startedAt ? (Date.now() - startedAt) / 60000 : 0;
    const wpm = mins > 0.05 ? Math.round(correct / 5 / mins) : 0;
    const acc = typed.length ? Math.round((correct / typed.length) * 100) : 100;
    live.textContent = t('copy.live', { pct: Math.round((Math.min(typed.length, passage.text.length) / passage.text.length) * 100), wpm, acc });
    if (!finished && typed.length >= passage.text.length) finish(typed, correct);
  }

  function finish(typed, correct) {
    finished = true;
    input.disabled = true;
    const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const accuracy = Math.round((correct / passage.text.length) * 100);
    const wpm = Math.round(correct / 5 / (secs / 60));
    const want = passage.text.split(' ');
    const got = typed.slice(0, passage.text.length).split(' ');
    const typos = want.map((w, i) => (got[i] !== w ? { expected: w, typed: got[i] || '' } : null)).filter(Boolean).slice(0, 20);
    const fb = { score: accuracy, accuracy, wpm, secs, typos, phrases: passage.phrases || [], errors: [], criteria: [] };
    lastItem = recordAttempt({ key, unitId, title, exercise: ex, question: { prompt: passage.text, hint: L(passage.topic), reference: '' }, answer: input.value, fb });
    renderCopyResult(shell.panel('feedback'), lastItem, { onNext: nextPassage, onAgain: restart });
    shell.show('feedback');
  }

  function nextPassage() {
    const list = window.PASSAGES;
    const idx = (store.get('copy.idx', -1) + 1) % list.length;
    store.set('copy.idx', idx);
    load(list[idx]);
  }

  async function aiPassage() {
    target.innerHTML = `<p class="loading">${t('ws.generating')}</p>`;
    input.disabled = true;
    try {
      const data = await callJSON(
        [
          { role: 'system', content: system() },
          { role: 'user', content: `${ex.gen}\nOutput only one JSON object: {"topic": "short topic name", "text": "the paragraph, plain text, straight quotes", "phrases": ["4-5 useful phrases taken verbatim from the paragraph"]}` },
        ],
        0.9,
      );
      if (!data.text) throw new Error(t('err.emptyQuestion'));
      load({ topic: { zh: String(data.topic || 'AI'), en: String(data.topic || 'AI') }, text: String(data.text), phrases: Array.isArray(data.phrases) ? data.phrases.map(String) : [] });
    } catch (err) {
      target.innerHTML = `<div class="error">${t('err.generate')}${esc(err.message)}</div>`;
    }
  }

  input.addEventListener('input', () => {
    if (!startedAt && input.value) startedAt = Date.now();
    paint();
  });
  input.addEventListener('paste', (e) => e.preventDefault());
  shell.right.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') nextPassage();
    if (act === 'ai') aiPassage();
    if (act === 'restart') restart();
  });
  setupChat(shell.panel('ask'), () => ({ title, question: passage && { prompt: passage.text }, answer: '', item: null, lesson: cards }));

  shell.show('lesson');
  const list = window.PASSAGES;
  load(list[Math.max(0, store.get('copy.idx', 0)) % list.length]);
}

function renderCopyResult(root, item, { onNext, onAgain } = {}) {
  const { fb } = item;
  root.innerHTML = `
    <section class="result-head">
      <div class="score ${fb.accuracy >= 95 ? 'good' : fb.accuracy >= 85 ? 'mid' : 'low'}"><b>${fb.wpm}</b><span>WPM</span></div>
      <div>
        <div class="chips"><span class="chip">${t('copy.acc', { acc: fb.accuracy })}</span><span class="chip">⏱ ${fmtTime(fb.secs)}</span><span class="chip">+${xpFor(item)} XP</span></div>
        <p>${t(fb.accuracy >= 95 ? 'copy.great' : fb.accuracy >= 85 ? 'copy.good' : 'copy.slow')}</p>
      </div>
    </section>
    ${fb.typos.length ? `<section class="block"><h3>${t('copy.typos')}</h3><ul class="typos">${fb.typos.map((x) => `<li><del>${esc(x.typed || '∅')}</del> → <ins>${esc(x.expected)}</ins></li>`).join('')}</ul></section>` : ''}
    <section class="block"><h3>${t('copy.phrases')}</h3><ul class="phrases">${fb.phrases.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>
    <section class="block"><h3>${t('copy.text')}</h3><p class="improved">${esc(item.question.prompt)}</p></section>
    ${onNext || onAgain ? `<div class="row end">${onAgain ? `<button class="ghost" data-act="again">${t('copy.again')}</button>` : ''}${onNext ? `<button data-act="next-p">${t('copy.next')} →</button>` : ''}</div>` : ''}`;
  if (onAgain) $('[data-act=again]', root).onclick = onAgain;
  if (onNext) $('[data-act=next-p]', root).onclick = onNext;
}

// ---------- 模考 ----------
function renderMock(task) {
  if (task !== 'task1' && task !== 'task2') {
    app.innerHTML = `
      ${configBanner()}
      <header class="page-head"><h1>${t('mock.title')}</h1><p class="muted">${t('mock.desc')}</p></header>
      <div class="mock-grid">
        <a class="card mock-card" href="#/mock/task2"><span class="mock-no">2</span><b>${t('mock.t2')}</b><small class="muted">${t('mock.t2sub')}</small></a>
        <a class="card mock-card" href="#/mock/task1"><span class="mock-no">1</span><b>${t('mock.t1')}</b><small class="muted">${t('mock.t1sub')}</small></a>
      </div>`;
    return;
  }
  app.className = 'ws-mode';
  const title = t(task === 'task2' ? 'mock.t2' : 'mock.t1');
  app.innerHTML = `
    <header class="ws-head"><div><p class="crumb"><a href="#/mock">${t('mock.title')}</a></p><h1>${esc(title)}</h1></div></header>
    ${configBanner()}
    <div id="ws"></div>`;
  mountWorkspace($('#ws'), { key: 'mock-' + task, unitId: null, title: 'Mock exam · ' + task.replace('task', 'Task '), exercise: window.MOCK_EXERCISES[task], cards: window.MOCK_TIPS[task], tabs: ['lesson', 'feedback', 'ask'] });
}

// ---------- 句子分析 ----------
function renderAnalyzer() {
  app.innerHTML = `
    ${configBanner()}
    <header class="page-head"><h1>${t('an.title')}</h1><p class="muted">${t('an.desc')}</p></header>
    <div class="analyzer">
      <section class="card">
        <textarea class="answer short" placeholder="${t('an.placeholder')}"></textarea>
        <div class="row end">${fxSelect()}<button data-act="analyze">${t('an.go')}</button></div>
      </section>
      <div class="analysis-result"><div class="card empty"><span>🔍</span><p>${t('an.empty')}</p></div></div>
    </div>`;
  const input = $('textarea', app);
  const btn = $('[data-act=analyze]', app);
  const out = $('.analysis-result', app);
  bindFxSelect(app);
  input.value = store.get('draft.analyze', '');
  input.oninput = () => store.set('draft.analyze', input.value);

  btn.onclick = async () => {
    const text = input.value.trim();
    if (!text) return input.focus();
    btn.disabled = true;
    out.innerHTML = `<section class="card"><p class="loading">${t('an.working')}</p></section>`;
    try {
      const data = await callJSON(
        [
          { role: 'system', content: system() },
          {
            role: 'user',
            content: `Analyse the following English text sentence by sentence to help me understand its structure and find problems:
"""
${text}
"""
Output only one JSON object:
{"sentences": [{
  "original": "the sentence",
  "is_correct": true,
  "corrected": "corrected sentence if there are errors, otherwise identical",
  "main": "the core clause (subject + verb + object/complement) in English",
  "parts": [{"text": "a fragment of the sentence", "role": "its function, e.g. subject / verb / object / complement / adverbial / relative clause / noun clause / participle phrase"}],
  "grammar_points": ["grammar points involved"],
  "explanation": "how to read this structure and what, if anything, is wrong",
  "upgrade": "a more natural or more academic version"
}]}`,
          },
        ],
        0.2,
      );
      const sentences = Array.isArray(data.sentences) ? data.sentences : [];
      out.innerHTML =
        sentences
          .map(
            (s) => `<section class="card">
            <p class="sent">${s.is_correct === false ? '✗' : '✓'} ${esc(s.original)}</p>
            ${s.is_correct === false ? `<p><b>${t('an.fixed')}</b> <ins>${esc(s.corrected)}</ins></p>` : ''}
            <p><b>${t('an.core')}</b> ${esc(s.main)}</p>
            <div class="parts">${(s.parts || []).map((p) => `<span class="part"><span>${esc(p.text)}</span><small>${esc(p.role)}</small></span>`).join('')}</div>
            ${(s.grammar_points || []).length ? `<p class="small"><b>${t('an.points')}</b> ${s.grammar_points.map(esc).join(' · ')}</p>` : ''}
            <p class="small">${esc(s.explanation)}</p>
            ${s.upgrade ? `<p class="small upgrade"><b>${t('fb.upgrade')}</b> ${esc(s.upgrade)}</p>` : ''}
          </section>`,
          )
          .join('') || `<section class="card"><p class="muted">${t('an.nothing')}</p></section>`;
    } catch (err) {
      out.innerHTML = `<section class="card"><div class="error">${t('err.generic')}${esc(err.message)}</div></section>`;
    } finally {
      btn.disabled = false;
    }
  };
}

// ---------- 写作日志（记录） ----------
function renderJournal(id) {
  const history = getHistory();
  if (id) {
    const item = history.find((h) => h.id === id);
    if (!item) return renderJournal();
    app.innerHTML = `
      <div class="narrow">
        <p class="crumb"><a href="#/journal">${t('nav.journal')}</a> / ${fmtDate(item.ts)}</p>
        <h1>${esc(item.unitId ? L(findUnit(item.unitId)?.title || item.title) : item.title)}</h1>
        <section class="card"><h3>${t('jr.question')}</h3>${md(item.question.prompt)}</section>
        <section class="card" id="fb"></section>
        <section class="card"><h3>${t('tab.ask')}</h3><div id="ask"></div></section>
        ${item.unitId ? `<div class="row end"><a class="button" href="#/unit/${item.unitId}">${t('jr.back')} →</a></div>` : ''}
      </div>`;
    renderFeedback($('#fb'), item);
    setupChat($('#ask'), () => ({ title: item.title, question: item.question, answer: item.answer, item }));
    return;
  }

  const s = stats();
  app.innerHTML = `
    <div class="narrow">
      <header class="page-head"><h1>${t('nav.journal')}</h1><p class="muted">${t('jr.desc', { n: s.sessions, words: s.words })}</p></header>
      ${
        history.length
          ? `<section class="card">
              <div class="row between"><h3>${t('home.errors')}</h3><button class="small" data-act="weak">${t('jr.ai')}</button></div>
              ${topErrors(8)}
              <div class="weak-result"></div>
            </section>
            <section class="card">
              <div class="list">${history
                .map((h) => {
                  const unit = h.unitId && findUnit(h.unitId);
                  const score = h.exercise.type === 'essay' ? 'Band ' + esc(h.fb.band) : h.exercise.type === 'copy' ? h.fb.wpm + ' WPM' : h.fb.score;
                  return `<a class="list-item" href="#/journal/${h.id}">
                    <span><b>${esc(unit ? L(unit.title) : h.title)}</b><br><span class="muted small">${fmtDate(h.ts)} · ${esc(h.question.prompt.slice(0, 70).replace(/[#*|\n]/g, ' '))}…</span></span>
                    <span class="tag ${h.fb.score >= PASS_SCORE ? 'ok' : ''}">${score}</span></a>`;
                })
                .join('')}</div>
              <div class="row end"><button class="ghost small" data-act="clear">${t('jr.clear')}</button></div>
            </section>`
          : `<section class="card empty"><span>📓</span><p>${t('jr.empty')}</p><a href="#/">${t('jr.start')} →</a></section>`
      }
    </div>`;

  $('[data-act=clear]', app)?.addEventListener('click', () => {
    if (!confirm(t('jr.confirmClear'))) return;
    store.remove('history');
    store.remove('progress');
    renderJournal();
  });

  $('[data-act=weak]', app)?.addEventListener('click', async (e) => {
    const box = $('.weak-result', app);
    e.target.disabled = true;
    box.innerHTML = `<p class="loading">${t('jr.analyzing')}</p>`;
    const errors = history.slice(0, 30).flatMap((h) => (h.fb.errors || []).map((er) => `[${er.type}] ${er.original} → ${er.correction}`)).slice(0, 80);
    const scores = history.slice(0, 15).map((h) => `${h.title}: ${h.exercise.type === 'essay' ? 'Band ' + h.fb.band : h.exercise.type === 'copy' ? h.fb.wpm + ' WPM' : h.fb.score + '/100'}`);
    const units = ALL_UNITS.map((u) => `${u.id}: ${L(u.title, 'en')} (${L(u.track.title, 'en')})`).join('\n');
    try {
      const reply = await callAI(
        [
          { role: 'system', content: system() },
          {
            role: 'user',
            content: `Here is my recent practice data. Diagnose my writing weaknesses and suggest a plan for the next week.
[Recent scores]
${scores.join('\n')}
[Recent errors]
${errors.join('\n') || 'none'}
[Available units]
${units}

Reply in Markdown with: 1) my 3 main weaknesses, each with a concrete example from my errors; 2) how to fix each; 3) which units to practise next (use the unit names).`,
          },
        ],
        { temperature: 0.4 },
      );
      box.innerHTML = `<div class="ai-text">${md(stripThink(reply))}</div>`;
    } catch (err) {
      box.innerHTML = `<div class="error">${t('err.generic')}${esc(err.message)}</div>`;
    } finally {
      e.target.disabled = false;
    }
  });
}

// ---------- 设置 ----------
function openSettings() {
  const dialog = $('#settings');
  const cfg = store.get('config', {});
  const p = prefs();
  const fx = window.Effects.get();
  const opt = (value, label, cur) => `<option value="${value}" ${value === cur ? 'selected' : ''}>${label}</option>`;
  dialog.innerHTML = `
    <form method="dialog" class="settings-form">
      <h2>${t('set.title')}</h2>
      <fieldset>
        <legend>${t('set.api')}</legend>
        <p class="muted small">${t('set.apiDesc')}</p>
        <p class="muted small">${t('set.server', { url: esc(serverStatus.baseUrl || '-'), model: esc(serverStatus.model || '-'), key: serverStatus.hasKey ? t('set.yes') : t('set.no') })}</p>
        <label>${t('set.baseUrl')}<input name="baseUrl" list="base-presets" value="${esc(cfg.baseUrl || '')}" placeholder="https://api.deepseek.com/v1"></label>
        <datalist id="base-presets">
          <option value="https://api.deepseek.com/v1">DeepSeek</option>
          <option value="https://api.moonshot.cn/v1">Kimi</option>
          <option value="https://dashscope.aliyuncs.com/compatible-mode/v1">Qwen</option>
          <option value="https://open.bigmodel.cn/api/paas/v4">GLM</option>
          <option value="https://api.openai.com/v1">OpenAI</option>
        </datalist>
        <label>API Key<input name="apiKey" type="password" autocomplete="off" value="${esc(cfg.apiKey || '')}" placeholder="sk-..."></label>
        <label>${t('set.model')}<input name="model" value="${esc(cfg.model || '')}" placeholder="deepseek-chat / qwen-plus / gpt-4o-mini"></label>
        <div class="row"><button type="button" class="ghost small" data-act="test">${t('set.test')}</button><span class="muted small test-result"></span></div>
      </fieldset>
      <fieldset class="grid-2">
        <legend>${t('set.appearance')}</legend>
        <label>${t('set.lang')}<select name="lang">${opt('zh', '中文', getLang())}${opt('en', 'English', getLang())}</select></label>
        <label>${t('set.fbLang')}<select name="fbLang">${opt('auto', t('set.fbAuto'), p.fbLang)}${opt('zh', '中文', p.fbLang)}${opt('en', 'English', p.fbLang)}${opt('both', t('set.fbBoth'), p.fbLang)}</select></label>
        <label>${t('set.theme')}<select name="theme">${opt('auto', t('top.theme.auto'), p.theme)}${opt('light', t('top.theme.light'), p.theme)}${opt('dark', t('top.theme.dark'), p.theme)}</select></label>
        <label>${t('fx.title')}<select name="preset">${window.Effects.PRESETS.map((x) => opt(x.id, `${x.icon} ${L(x.label)}`, fx.preset)).join('')}</select></label>
        <label>${t('set.sound')}<select name="sound">${opt('off', t('set.soundOff'), fx.sound)}${opt('soft', t('set.soundSoft'), fx.sound)}${opt('typewriter', t('set.soundType'), fx.sound)}</select></label>
      </fieldset>
      <div class="row end">
        <button value="cancel" class="ghost">${t('set.cancel')}</button>
        <button value="save">${t('set.save')}</button>
      </div>
    </form>`;
  const form = $('form', dialog);
  const read = () => Object.fromEntries(['baseUrl', 'apiKey', 'model'].map((k) => [k, form.elements[k].value.trim()]));
  $('[data-act=test]', form).onclick = async () => {
    const out = $('.test-result', form);
    out.textContent = t('set.testing');
    try {
      const reply = await callAI([{ role: 'user', content: 'Reply with exactly: OK' }], { temperature: 0, config: read() });
      out.textContent = '✓ ' + t('set.ok') + stripThink(reply).slice(0, 40);
    } catch (err) {
      out.textContent = '✗ ' + err.message;
    }
  };
  form.elements.preset.onchange = (e) => window.Effects.set({ preset: e.target.value });
  form.elements.sound.onchange = (e) => window.Effects.set({ sound: e.target.value });
  dialog.onclose = () => {
    if (dialog.returnValue !== 'save') return;
    store.set('config', read());
    setPrefs({ fbLang: form.elements.fbLang.value, theme: form.elements.theme.value });
    setLang(form.elements.lang.value);
    applyTheme();
    renderTopbar();
    route();
  };
  dialog.returnValue = '';
  dialog.showModal();
}

// ---------- 启动 ----------
(async function init() {
  applyTheme();
  renderTopbar();
  try {
    serverStatus = await (await fetch('/api/status')).json();
  } catch {}
  route();
})();
