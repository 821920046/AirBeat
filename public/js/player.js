import { resolveAudio, streamUrl, findAlternative, isSourceDisabled } from './api.js';

export const audio = document.getElementById('audio');
export const MODES = ['🔁', '🔂', '🔀']; // 列表循环 / 单曲循环 / 随机

const state = { queue: [], index: -1, mode: 0 };
const listeners = new Set();

// 单首歌的跨源回退次数上限,超出即放弃这首跳下一首
const MAX_FALLBACK_ATTEMPTS = 3;
// 整个队列连续失败上限,到达即停止自动跳,避免长队列里大批不可播放歌曲触发请求风暴
const MAX_QUEUE_STREAK = 5;
let queueFailStreak = 0;
let trackFallbackCount = 0; // 当前正在播放的这首已经尝试了几次回退
let skipReason = '';

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
  try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX))); } catch {}
}
function recordTrack(t) {
  if (!t || !t.title) return;
  const list = readHistory().filter((h) => h.source !== t.source || h.trackId !== t.trackId);
  list.unshift({
    source: t.source, trackId: t.trackId, title: t.title,
    artist: t.artist || '', cover: t.cover || '', audioUrl: t.audioUrl || '',
    duration: t.duration || 0, playedAt: Date.now(),
  });
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
audio.addEventListener('play',  () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });

/* ==================== 预加载下一首 ==================== */
let preloadedTrackKey = '';
const preloadAudio = document.createElement('audio');
preloadAudio.preload = 'auto';
preloadAudio.volume = 0;

function getNextIndex() {
  if (!state.queue.length) return -1;
  if (state.mode === 2 && state.queue.length > 1) {
    return Math.floor(Math.random() * state.queue.length);
  }
  return (state.index + 1) % state.queue.length;
}

export function checkPreload(currentTime, duration) {
  if (!duration || duration < 15) return;
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

function resetTrackFailState() {
  trackFallbackCount = 0;
  skipReason = '';
}

export function setIndex(i) {
  if (i >= 0 && i < state.queue.length) {
    state.index = i;
    queueFailStreak = 0;
    resetTrackFailState();
    load();
  }
}

export function removeFromQueue(idx) {
  if (idx < 0 || idx >= state.queue.length) return;
  state.queue.splice(idx, 1);
  if (state.index === idx) {
    if (!state.queue.length) {
      audio.pause();
      audio.src = '';
      state.index = -1;
      listeners.forEach((fn) => fn(null));
    } else {
      state.index = state.index % state.queue.length;
      resetTrackFailState();
      load();
    }
  } else if (state.index > idx) {
    state.index--;
  }
}

export function clearQueue() {
  state.queue = [];
  state.index = -1;
  queueFailStreak = 0;
  resetTrackFailState();
  audio.pause();
  audio.src = '';
  listeners.forEach((fn) => fn(null));
}

export async function playQueue(tracks, index = 0) {
  state.queue = tracks.slice();
  state.index = index;
  queueFailStreak = 0;
  resetTrackFailState();
  await load();
}

async function load() {
  const t = current();
  if (!t) return;
  // 当前歌的源整个都熔断了 → 直接跳过,不浪费请求
  if (t.source && isSourceDisabled(t.source) && !t._gd) {
    return skip('音源已禁用: ' + t.source);
  }
  if (!audio.paused) {
    await fadeTo(0, 150);
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
    // 播放成功 → 重置失败计数
    queueFailStreak = 0;
    resetTrackFailState();
    fadeTo(userVolume, 400);
  } catch { /* error 事件接管 */ }
}

/** 跨源回退:用歌名+歌手在其他音源搜完整版 */
async function tryFallback(failed) {
  if (!failed || !failed.title) return null;
  if (trackFallbackCount >= MAX_FALLBACK_ATTEMPTS) {
    console.warn('[player] 跨源回退超上限,放弃:', failed.title);
    return null;
  }
  trackFallbackCount++;
  const alt = await findAlternative(failed).catch(() => null);
  if (!alt) return null;
  const idx = state.index;
  if (idx < 0 || idx >= state.queue.length) return null;
  const t = state.queue[idx];
  if (t.source !== failed.source || t.trackId !== failed.trackId) return null;
  t.altSource = alt.source;
  t.altDuration = alt.duration;
  t.audioUrl = alt.audioUrl;
  return alt;
}

async function skip(reason) {
  skipReason = reason || '';
  if (state.index >= 0 && state.queue.length) {
    const failed = state.queue[state.index];
    // 单首歌:有 fallback 机会就先 fallback
    if (trackFallbackCount < MAX_FALLBACK_ATTEMPTS) {
      const alt = await tryFallback(failed);
      if (alt) {
        const url = await resolveAudio(state.queue[state.index]).catch(() => '');
        if (url) {
          audio.src = streamUrl(url);
          listeners.forEach((fn) => fn(state.queue[state.index]));
          try {
            audio.volume = 0;
            await audio.play();
            queueFailStreak = 0;
            resetTrackFailState();
            fadeTo(userVolume, 400);
            return;
          } catch { /* 回退也失败,继续往下走 */ }
        }
      }
    }
  }
  // 这首彻底失败 → 计入队列连续失败计数,准备跳下一首
  queueFailStreak++;
  resetTrackFailState();

  if (queueFailStreak >= MAX_QUEUE_STREAK || queueFailStreak >= state.queue.length) {
    console.warn('[player] 队列连续失败 ' + queueFailStreak + ' 首,停止自动跳');
    try { window.dispatchEvent(new CustomEvent('queue-stalled', { detail: { reason: skipReason } })); } catch {}
    queueFailStreak = 0;
    return;
  }
  next(true);
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
  resetTrackFailState();
  load();
}

export async function prev() {
  if (!state.queue.length) return;
  if (!audio.paused) {
    await fadeTo(0, 150);
  }
  state.index = (state.index - 1 + state.queue.length) % state.queue.length;
  resetTrackFailState();
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
