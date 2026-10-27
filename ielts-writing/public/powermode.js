// 打字特效（类似 VS Code 的 Power Mode 插件）：光标处粒子、连击计数、屏幕震动、可选按键音
// 对页面上所有 <textarea> 生效；设置保存在 localStorage 的 ielts.fx 中

(function () {
  const STORE_KEY = 'ielts.fx';
  const COMBO_TIMEOUT = 3000;
  const MILESTONES = { 10: '不错！', 25: '漂亮！', 50: '手感来了！', 100: '势不可挡！', 200: '打字之神！', 300: '雅思 9 分预定！' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let settings = { power: true, sound: false };
  try {
    settings = { ...settings, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch {}

  // ---------- 画布与粒子 ----------
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  const ctx = canvas.getContext('2d');
  let particles = [];
  let running = false;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn(x, y, combo) {
    const count = Math.min(24, 6 + Math.floor(combo / 5));
    const baseHue = (combo * 7) % 360;
    for (let i = 0; i < count; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 5,
        vy: -Math.random() * 4 - 1.5,
        size: Math.random() * 2.5 + 1.5,
        life: 1,
        decay: Math.random() * 0.02 + 0.018,
        color: `hsl(${(baseHue + Math.random() * 90) % 360}, 85%, 60%)`,
      });
    }
    if (particles.length > 600) particles = particles.slice(-600);
    if (!running) {
      running = true;
      requestAnimationFrame(draw);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.vy += 0.15;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    if (particles.length) requestAnimationFrame(draw);
    else running = false;
  }

  // ---------- 计算 textarea 中光标的屏幕坐标（镜像 div 法） ----------
  const MIRROR_PROPS = ['boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize'];
  const mirror = document.createElement('div');
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', borderStyle: 'solid' });

  function caretPoint(ta) {
    const cs = getComputedStyle(ta);
    MIRROR_PROPS.forEach((p) => (mirror.style[p] = cs[p]));
    const pos = ta.selectionEnd;
    mirror.textContent = ta.value.slice(0, pos);
    const marker = document.createElement('span');
    marker.textContent = ta.value.slice(pos, pos + 1) || '.';
    mirror.appendChild(marker);
    if (!mirror.isConnected) document.body.appendChild(mirror);
    const rect = ta.getBoundingClientRect();
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    const x = rect.left + parseFloat(cs.borderLeftWidth) + marker.offsetLeft - ta.scrollLeft;
    const y = rect.top + parseFloat(cs.borderTopWidth) + marker.offsetTop - ta.scrollTop + lineHeight / 2;
    // 光标被滚出可视区域时，把粒子限制在输入框内
    return { x: Math.min(Math.max(x, rect.left), rect.right), y: Math.min(Math.max(y, rect.top), rect.bottom) };
  }

  // ---------- 连击 ----------
  const comboEl = document.createElement('div');
  comboEl.className = 'fx-combo';
  comboEl.innerHTML = '<small>COMBO</small><b>0</b><i></i>';
  let combo = 0;
  let lastKey = 0;
  let resetTimer = null;

  function bumpCombo(ta) {
    combo += 1;
    lastKey = Date.now();
    const rect = ta.getBoundingClientRect();
    comboEl.style.left = rect.right - 14 + 'px';
    comboEl.style.top = Math.max(rect.top, 60) + 10 + 'px';
    comboEl.querySelector('b').textContent = combo;
    comboEl.classList.add('show');
    comboEl.classList.remove('pop');
    void comboEl.offsetWidth; // 重启动画
    comboEl.classList.add('pop');
    const bar = comboEl.querySelector('i');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = `width ${COMBO_TIMEOUT}ms linear`;
    bar.style.width = '0%';

    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      combo = 0;
      comboEl.classList.remove('show');
    }, COMBO_TIMEOUT);

    if (MILESTONES[combo]) shout(MILESTONES[combo], rect);
    return MILESTONES[combo] ? 'milestone' : '';
  }

  function shout(text, rect) {
    const el = document.createElement('div');
    el.className = 'fx-shout';
    el.textContent = text;
    el.style.left = rect.right - 14 + 'px';
    el.style.top = Math.max(rect.top, 60) + 92 + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  function shake(ta, strong) {
    if (reduceMotion) return;
    const target = ta.closest('.card') || ta;
    const amp = strong ? 7 : Math.min(3, combo / 30);
    if (amp < 0.8) return;
    const dx = (Math.random() - 0.5) * 2 * amp;
    const dy = (Math.random() - 0.5) * 2 * amp;
    target.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: strong ? 260 : 110, easing: 'ease-out' });
  }

  // ---------- 按键音 ----------
  let audio = null;
  function click() {
    try {
      audio = audio || new AudioContext();
      const t = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = 1400 + Math.random() * 500;
      gain.gain.setValueAtTime(0.025, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch {}
  }

  // ---------- 事件 ----------
  function onType(ta) {
    if (!settings.power && !settings.sound) return;
    if (settings.sound) click();
    if (!settings.power) return;
    const { x, y } = caretPoint(ta);
    const milestone = bumpCombo(ta);
    spawn(x, y, combo);
    shake(ta, milestone === 'milestone');
  }

  document.addEventListener('input', (e) => {
    const ta = e.target;
    if (!(ta instanceof HTMLTextAreaElement) || e.isComposing) return;
    if (!e.inputType || e.inputType.startsWith('insert')) onType(ta);
  });
  // 中文输入法：上屏时触发一次
  document.addEventListener('compositionend', (e) => {
    if (e.target instanceof HTMLTextAreaElement) onType(e.target);
  });
  // 换页或滚动时隐藏连击框
  window.addEventListener('hashchange', () => {
    combo = 0;
    comboEl.classList.remove('show');
  });
  window.addEventListener('scroll', () => Date.now() - lastKey > 300 && comboEl.classList.remove('show'), { passive: true });
  window.addEventListener('resize', resize);

  function mount() {
    resize();
    document.body.append(canvas, comboEl);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.PowerMode = {
    get: () => ({ ...settings }),
    set(partial) {
      settings = { ...settings, ...partial };
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(settings));
      } catch {}
      if (!settings.power) {
        combo = 0;
        comboEl.classList.remove('show');
      }
    },
  };
})();
