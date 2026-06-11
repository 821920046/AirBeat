let ctx = null;
let analyser = null;
let raf = 0;
let style = 0;

/* ==================== 均衡器 ==================== */
const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]; // 10 段 ISO 标准
const EQ_PRESETS = {
  pop:    [ 3,  2,  1,  0, -1,  0,  2,  3,  3,  2],
  rock:   [ 4,  3,  0, -1, -2,  1,  3,  4,  4,  4],
  vocal:  [-2, -1,  0,  2,  4,  3,  1,  0, -1, -2],
  classical: [4, 3, 2, 1, 0, 0, 0, 1, 2, 3],
  electronic: [5, 4, 0, -2, -3, 0, 2, 4, 5, 5],
};
let eqFilters = [];   // BiquadFilterNode 数组
let eqGains = EQ_BANDS.map(() => 0); // dB

/** 创建 10 段 peaking EQ + 节点串联 */
export function initEQ(audio) {
  if (!ctx) initAudioGraph(audio);
  if (eqFilters.length) return; // 已创建
  const src = eqGetSource(audio);
  if (!src) return;
  // 断开原有 src→analyser 链，插入 EQ
  src.disconnect();
  let prev = src;
  for (let i = 0; i < EQ_BANDS.length; i++) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = EQ_BANDS[i];
    filter.Q.value = 1.0;
    filter.gain.value = eqGains[i];
    prev.connect(filter);
    prev = filter;
    eqFilters.push(filter);
  }
  prev.connect(analyser);
  analyser.connect(ctx.destination);
}

function eqGetSource(audio) {
  if (!ctx) return null;
  // ctx 中第一个节点就是 MediaElementSource
  // 如果有 eqFilters，src 已经连到了第一个 filter
  if (eqFilters.length) return null; // 已串好
  // 需要找到 MediaElementSource —— 在 initAudioGraph 中创建后存在 ctx 上
  return ctx._src || null;
}

export function setEQBand(index, db) {
  if (index < 0 || index >= eqFilters.length) return;
  eqGains[index] = db;
  eqFilters[index].gain.value = db;
}
export function getEQGains() { return eqGains.slice(); }
export function getEQBands() { return EQ_BANDS; }

export function applyEQPreset(name) {
  const preset = EQ_PRESETS[name];
  if (!preset) return;
  eqGains = preset.slice();
  for (let i = 0; i < eqFilters.length; i++) {
    eqFilters[i].gain.value = preset[i];
  }
}
export function resetEQ() {
  eqGains = EQ_BANDS.map(() => 0);
  for (let i = 0; i < eqFilters.length; i++) {
    eqFilters[i].gain.value = 0;
  }
}

/* ==================== 可视化 ==================== */
export function initAudioGraph(audio) {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  const src = ctx.createMediaElementSource(audio);
  ctx._src = src;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  analyser.connect(ctx.destination);
}

export function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function toggleStyle() {
  style = (style + 1) % 2;
}

export function start(canvas) {
  stop();
  const c = canvas.getContext('2d');
  const draw = () => {
    raf = requestAnimationFrame(draw);
    const w = (canvas.width = canvas.clientWidth || 300);
    const h = (canvas.height = canvas.clientHeight || 300);
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    c.clearRect(0, 0, w, h);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b5cf6';
    if (style === 0) {
      const n = 64;
      const bw = w / n;
      c.fillStyle = accent;
      for (let i = 0; i < n; i++) {
        const v = data[Math.floor((i / n) * data.length)] / 255;
        c.globalAlpha = 0.3 + v * 0.7;
        const bh = v * h * 0.55;
        c.fillRect(i * bw + bw * 0.15, h - bh, bw * 0.7, bh);
      }
      c.globalAlpha = 1;
    } else {
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.2;
      const n = 96;
      c.strokeStyle = accent;
      c.lineWidth = 2;
      c.globalAlpha = 0.8;
      for (let i = 0; i < n; i++) {
        const v = data[Math.floor((i / n) * data.length)] / 255;
        const a = (i / n) * Math.PI * 2;
        const r2 = base + v * Math.min(w, h) * 0.22;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * base, cy + Math.sin(a) * base);
        c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        c.stroke();
      }
      c.globalAlpha = 1;
    }
  };
  draw();
}

export function stop() {
  cancelAnimationFrame(raf);
}
