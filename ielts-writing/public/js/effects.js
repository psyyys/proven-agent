// 打字特效：落叶（默认，安静）、墨迹、微光、火花（原 Power Mode）、关闭；可选按键音
// 对页面上所有 <textarea> 生效；设置保存在 localStorage 的 ielts.fx 中

(function () {
  const STORE_KEY = 'ielts.fx';
  const BEST_KEY = 'ielts.fx.best';
  const COMBO_TIMEOUT = 3000;
  const MILESTONES = { 10: B('不错！', 'Nice!'), 25: B('漂亮！', 'Lovely!'), 50: B('手感来了！', 'In the flow!'), 100: B('势不可挡！', 'Unstoppable!'), 200: B('打字之神！', 'Legendary!'), 300: B('雅思 9 分预定！', 'Band 9 incoming!') };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PRESETS = [
    { id: 'leaf', icon: '🍃', label: B('落叶', 'Leaves') },
    { id: 'ink', icon: '🖋', label: B('墨迹', 'Ink') },
    { id: 'dust', icon: '✨', label: B('微光', 'Glow') },
    { id: 'spark', icon: '⚡', label: B('火花', 'Sparks') },
    { id: 'off', icon: '○', label: B('关闭', 'Off') },
  ];

  const read = (k, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };

  // 兼容旧版设置 {power: bool, sound: bool}
  let settings = { preset: 'leaf', sound: 'off', ...read(STORE_KEY, {}) };
  if (typeof settings.power === 'boolean') {
    settings = { preset: settings.power ? 'leaf' : 'off', sound: settings.sound === true ? 'soft' : 'off' };
    write(STORE_KEY, settings);
  }
  let best = Number(read(BEST_KEY, 0)) || 0;

  const isDark = () => {
    const theme = document.documentElement.dataset.theme;
    return theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  // ---------- 画布 ----------
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  const ctx = canvas.getContext('2d');
  let particles = [];
  let running = false;
  let frame = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  function spawn(preset, x, y) {
    const dark = isDark();
    if (preset === 'leaf') {
      const n = Math.random() < 0.25 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        particles.push({
          kind: 'leaf',
          x: x + rand(-3, 3),
          y: y + rand(-4, 2),
          vx: rand(-0.5, 0.5),
          vy: rand(-0.5, 0.1),
          size: rand(3.5, 6.5),
          rot: rand(0, Math.PI * 2),
          vr: rand(-0.05, 0.05),
          phase: rand(0, Math.PI * 2),
          life: 1,
          decay: rand(0.007, 0.011),
          color: `hsl(${rand(88, 150)}, ${rand(28, 45)}%, ${dark ? rand(52, 66) : rand(36, 50)}%)`,
        });
      }
    } else if (preset === 'ink') {
      particles.push({ kind: 'ink', x, y: y + 2, r: rand(1, 2), grow: rand(0.12, 0.2), life: 1, decay: rand(0.02, 0.028), color: dark ? '236,230,218' : '42,39,35' });
      if (Math.random() < 0.3) particles.push({ kind: 'ink', x: x + rand(-8, 8), y: y + rand(-5, 7), r: 0.6, grow: 0.04, life: 0.8, decay: 0.03, color: dark ? '236,230,218' : '42,39,35' });
    } else if (preset === 'dust') {
      for (let i = 0; i < 2; i++) {
        particles.push({ kind: 'dust', x: x + rand(-4, 4), y, vx: rand(-0.25, 0.25), vy: rand(-0.9, -0.35), size: rand(1, 2.2), life: 1, decay: rand(0.012, 0.02), hue: rand(38, 52) });
      }
    } else if (preset === 'spark') {
      const count = Math.min(24, 6 + Math.floor(combo / 5));
      const baseHue = (combo * 7) % 360;
      for (let i = 0; i < count; i++) {
        particles.push({ kind: 'spark', x, y, vx: rand(-2.5, 2.5), vy: rand(-5.5, -1.5), size: rand(1.5, 4), life: 1, decay: rand(0.018, 0.038), color: `hsl(${(baseHue + rand(0, 90)) % 360}, 85%, 60%)` });
      }
    }
    if (particles.length > 500) particles = particles.slice(-500);
    if (!running) {
      running = true;
      requestAnimationFrame(draw);
    }
  }

  function draw() {
    frame++;
    // 落叶模式留下淡淡的拖尾：不是整屏清空，而是让上一帧逐渐褪去
    const trails = particles.some((p) => p.kind === 'leaf');
    if (trails) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.restore();
    } else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }

    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.life -= p.decay;
      const a = Math.max(p.life, 0);
      if (p.kind === 'leaf') {
        p.vy = Math.min(p.vy + 0.018, 0.9);
        p.x += p.vx + (reduceMotion ? 0 : Math.sin(frame * 0.05 + p.phase) * 0.45);
        p.y += reduceMotion ? 0 : p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a * 0.35;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.lineTo(p.size * 1.3, 0);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'ink') {
        p.r += p.grow;
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(${p.color},${a * 0.28})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'dust') {
        p.x += p.vx;
        p.y += reduceMotion ? 0 : p.vy;
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = `hsl(${p.hue}, 70%, ${isDark() ? 70 : 52}%)`;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        p.vy += 0.15;
        p.x += p.vx;
        p.y += p.vy;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    if (particles.length) requestAnimationFrame(draw);
    else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      running = false;
    }
  }

  // ---------- textarea 中光标的屏幕坐标（镜像 div 法） ----------
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
    return { x: Math.min(Math.max(x, rect.left), rect.right), y: Math.min(Math.max(y, rect.top), rect.bottom) };
  }

  // ---------- 连击 ----------
  const comboEl = document.createElement('div');
  comboEl.className = 'fx-combo';
  comboEl.innerHTML = '<small>COMBO</small><b>0</b><i></i>';
  let combo = 0;
  let lastKey = 0;
  let resetTimer = null;

  function bumpCombo(ta, loud) {
    combo += 1;
    lastKey = Date.now();
    if (combo > best) {
      best = combo;
      write(BEST_KEY, best);
    }
    const rect = ta.getBoundingClientRect();
    comboEl.classList.toggle('quiet', !loud);
    comboEl.style.left = rect.right - 14 + 'px';
    comboEl.style.top = (loud ? Math.max(rect.top, 60) + 10 : rect.bottom - 44) + 'px';
    comboEl.querySelector('b').textContent = combo;
    comboEl.classList.add('show');
    if (loud) {
      comboEl.classList.remove('pop');
      void comboEl.offsetWidth;
      comboEl.classList.add('pop');
    }
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
    if (loud && MILESTONES[combo]) {
      shout(L(MILESTONES[combo]), rect);
      return true;
    }
    return false;
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
    const target = ta.closest('.pane, .card') || ta;
    const amp = strong ? 7 : Math.min(3, combo / 30);
    if (amp < 0.8) return;
    const dx = rand(-amp, amp);
    const dy = rand(-amp, amp);
    target.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: strong ? 260 : 110, easing: 'ease-out' });
  }

  // ---------- 按键音 ----------
  let audio = null;
  let noise = null;
  function keySound() {
    try {
      audio = audio || new AudioContext();
      const now = audio.currentTime;
      if (settings.sound === 'soft') {
        if (!noise) {
          noise = audio.createBuffer(1, audio.sampleRate * 0.05, audio.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
        }
        const src = audio.createBufferSource();
        src.buffer = noise;
        src.playbackRate.value = rand(0.85, 1.15);
        const filter = audio.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1600;
        const gain = audio.createGain();
        gain.gain.value = 0.22;
        src.connect(filter).connect(gain).connect(audio.destination);
        src.start(now);
      } else {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'square';
        osc.frequency.value = rand(1400, 1900);
        gain.gain.setValueAtTime(0.025, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
        osc.connect(gain).connect(audio.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      }
    } catch {}
  }

  // ---------- 事件 ----------
  function onType(ta) {
    if (settings.sound !== 'off') keySound();
    const preset = settings.preset;
    if (preset === 'off') return;
    const loud = preset === 'spark';
    const { x, y } = caretPoint(ta);
    const milestone = bumpCombo(ta, loud);
    spawn(preset, x, y);
    if (loud) shake(ta, milestone);
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
  const hideCombo = () => {
    combo = 0;
    comboEl.classList.remove('show');
  };
  // 换页时立刻清掉粒子和连击，不留残影
  window.addEventListener('hashchange', () => {
    particles = [];
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    comboEl.style.transition = 'none';
    hideCombo();
    void comboEl.offsetWidth;
    comboEl.style.transition = '';
  });
  document.addEventListener('scroll', () => Date.now() - lastKey > 300 && comboEl.classList.remove('show'), { passive: true, capture: true });
  window.addEventListener('resize', resize);

  function mount() {
    resize();
    document.body.append(canvas, comboEl);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.Effects = {
    PRESETS,
    get: () => ({ ...settings }),
    getBest: () => best,
    set(partial) {
      settings = { ...settings, ...partial };
      write(STORE_KEY, settings);
      if (settings.preset === 'off') hideCombo();
    },
  };
})();
