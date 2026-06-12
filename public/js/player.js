import { resolveAudio, streamUrl, findAlternative } from './api.js';

export const audio = document.getElementById('audio');
export const MODES = ['🔁', '🔂', '🔀']; // 列表循环 / 单曲循环 / 随机

const state = { queue: [], index: -1, mode: 0 };
const listeners = new Set();
let failStreak = 0;
let skipReason = ''; // error 事件没有提供具体原因，我们跟踪容错状态

/* ==================== 渐入渐出 (Crossfade) 与音量管理 ==================== */
let fadeInterval = null;
let isFading = false;
let userVolume = 0.8;

export function setVolume(v) {
  userVolume = Math.max(0, Math.min(1, v));
  if (!isFading) audio.volume = userVolume;
}
export function getVolume() { return userVolume; }

function fadeTo(target, duration = 300) {
  if (fadeInterval) clearInterval(fadeInterval);
  isFading = true;
  const start = audio.volume;
  const diff = target - start;
  if (Math.abs(diff) < 0.01) {
    audio.volume = target;
    isFading = false;
    return Promise.resolve();
  }
  const stepTime = 16;
  const steps = duration / stepTime;
  let step = 0;
  return new Promise((resolve) => {
    fadeInterval = setInterval(() => {
      step++;
      audio.volume = Math.max(0, Math.min(1, start + diff * (step / steps)));
      if (step >= steps) {
        clearInterval(fadeInterval);
        audio.volume = target;
        isFading = false;
        resolve();
      }
    }, stepTime);
  });
}

/* ==================== 播放历史 (localStorage) ==================== */
const HIST_KEY = 'airbeat:history';
const HIST_MAX = 200;

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch { return []; }
}
function saveHistory(list) {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX))); } catch { /* quota exceeded */ }
}
function recordTrack(t) {
  if (!t || !t.title) return;
  const list = readHistory().filter((h) => h.source !== t.source || h.trackId !== t.trackId);
  list.unshift({ source: t.source, trackId: t.trackId, title: t.title, artist: t.artist || '', cover: t.cover || '', audioUrl: t.audioUrl || '', duration: t.duration || 0, playedAt: Date.now() });
  saveHistory(list);
}
export function getHistory() { return readHistory(); }

/* ==================== MediaSession ==================== */
function updateMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title || '未知标题',
    artist: t.artist || 'AirBeat',
    album: 'AirBeat',
    artwork: t.cover ? [{ src: streamUrl(t.cover), sizes: '512x512', type: 'image/jpeg' }] : [],
  });
  navigator.mediaSession.setActionHandler('play', () => toggle());
  navigator.mediaSession.setActionHandler('pause', () => toggle());
  navigator.mediaSession.setActionHandler('previoustrack', () => prev());
  navigator.mediaSession.setActionHandler('nexttrack', () => next(true));
  navigator.mediaSession.setActionHandler('seekto', (d) => {
    if (d.seekTime != null) audio.currentTime = d.seekTime;
  });
}
// 播放状态同步
audio.addEventListener('play', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });

/* ==================== 预加载 (Preload) 下一首 ==================== */
let preloadedTrackKey = '';
const preloadAudio = document.createElement('audio');
preloadAudio.preload = 'auto';
preloadAudio.volume = 0; // 静音

function getNextIndex() {
  if (!state.queue.length) return -1;
  if (state.mode === 2 && state.queue.length > 1) {
    // 随机模式，只能猜测一首
    return Math.floor(Math.random() * state.queue.length);
  }
  return (state.index + 1) % state.queue.length;
}

export function checkPreload(currentTime, duration) {
  if (!duration || duration < 15) return;
  // 播放进度到 90% 且距离结束不到 30 秒时触发预载
  if (currentTime / duration > 0.90 || (duration - currentTime) < 25) {
    const nextIdx = getNextIndex();
    if (nextIdx < 0) return;
    const nextTrack = state.queue[nextIdx];
    const key = nextTrack.source + ':' + nextTrack.trackId;
    if (preloadedTrackKey === key) return;
    preloadedTrackKey = key;

    resolveAudio(nextTrack).then((url) => {
      if (url) {
        preloadAudio.src = streamUrl(url);
        preloadAudio.load();
      }
    }).catch(() => {});
  }
}

/* ==================== 核心播放逻辑与队列操作 ==================== */
export function onTrackChange(fn) { listeners.add(fn); }
export function current() { return state.queue[state.index] || null; }
export function mode() { return state.mode; }
export function cycleMode() { state.mode = (state.mode + 1) % 3; return state.mode; }
export function getQueue() { return state.queue; }
export function getIndex() { return state.index; }
export function setIndex(i) {
  if (i >= 0 && i < state.queue.length) {
    state.index = i;
    failStreak = 0;
    skipReason = '';
    load();
  }
}
export function removeFromQueue(idx) {
  if (idx < 0 || idx >= state.queue.length) return;
  state.queue.splice(idx, 1);
  if (state.index === idx) {
    // 删除了正在播放的歌
    if (!state.queue.length) {
      audio.pause();
      audio.src = '';
      state.index = -1;
      listeners.forEach((fn) => fn(null));
    } else {
      state.index = state.index % state.queue.length;
      load();
    }
  } else if (state.index > idx) {
    state.index--;
  }
}
export function clearQueue() {
  state.queue = [];
  state.index = -1;
  audio.pause();
  audio.src = '';
  listeners.forEach((fn) => fn(null));
}

export async function playQueue(tracks, index = 0) {
  state.queue = tracks.slice();
  state.index = index;
  failStreak = 0;
  skipReason = '';
  await load();
}

async function load() {
  const t = current();
  if (!t) return;
  
  if (!audio.paused) {
    await fadeTo(0, 150); // 切歌前快速淡出
  }
  
  const url = await resolveAudio(t).catch(() => '');
  if (!url) return skip('无可用音频');
  
  audio.src = streamUrl(url);
  listeners.forEach((fn) => fn(t));
  updateMediaSession(t);
  recordTrack(t);
  
  try {
    audio.volume = 0;
    await audio.play();
    failStreak = 0;
    fadeTo(userVolume, 400); // 播放成功淡入
  } catch { /* 自动播放被拦截,由 error 事件处理 */ }
}

/** 跨源回退：用歌名+歌手在其他音源搜完整版 */
async function tryFallback(failed) {
  if (!failed || !failed.title) return null;
  const alt = await findAlternative(failed).catch(() => null);
  if (!alt) return null;
  // 替换当前队列项 of 音频
  const idx = state.index;
  if (idx < 0 || idx >= state.queue.length) return null;
  const t = state.queue[idx];
  if (t.source !== failed.source || t.trackId !== failed.trackId) return null; // 歌曲已变，放弃
  t.altSource = alt.source;           // 标记替代来源
  t.altDuration = alt.duration;
  t.audioUrl = alt.audioUrl;
  return alt;
}

async function skip(reason) {
  failStreak++;
  skipReason = reason || '';
  if (state.index >= 0 && state.queue.length) {
    const failed = state.queue[state.index];
    if (failStreak === 1) {
      const alt = await tryFallback(failed);
      if (alt) {
        const url = await resolveAudio(state.queue[state.index]).catch(() => '');
        if (url) {
          audio.src = streamUrl(url);
          listeners.forEach((fn) => fn(state.queue[state.index]));
          try {
            audio.volume = 0;
            await audio.play();
            failStreak = 0;
            fadeTo(userVolume, 400);
            return;
          } catch { /* 回退也失败，继续 skip */ }
        }
      }
    }
  }
  if (failStreak < state.queue.length && failStreak < 5) next(true);
}
audio.addEventListener('error', () => skip('播放错误'));

export async function toggle() {
  if (!audio.src) return;
  if (audio.paused) {
    audio.volume = 0;
    try {
      await audio.play();
      fadeTo(userVolume, 300);
    } catch {}
  } else {
    await fadeTo(0, 250);
    audio.pause();
    audio.volume = userVolume;
  }
}

export async function next(auto = false) {
  if (!state.queue.length) return;
  if (!audio.paused) {
    await fadeTo(0, 150);
  }
  if (state.mode === 2 && state.queue.length > 1) {
    let r;
    do { r = Math.floor(Math.random() * state.queue.length); } while (r === state.index);
    state.index = r;
  } else {
    state.index = (state.index + 1) % state.queue.length;
  }
  failStreak = 0;
  skipReason = '';
  load();
}

export async function prev() {
  if (!state.queue.length) return;
  if (!audio.paused) {
    await fadeTo(0, 150);
  }
  state.index = (state.index - 1 + state.queue.length) % state.queue.length;
  failStreak = 0;
  skipReason = '';
  load();
}

audio.addEventListener('ended', async () => {
  if (state.mode === 1) {
    audio.currentTime = 0;
    try {
      audio.volume = 0;
      await audio.play();
      fadeTo(userVolume, 300);
    } catch {}
  } else {
    next(true);
  }
});
