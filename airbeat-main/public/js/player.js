import { resolveAudio, streamUrl, findAlternative } from './api.js';

export const audio = document.getElementById('audio');
export const MODES = ['🔁', '🔂', '🔀']; // 列表循环 / 单曲循环 / 随机

const state = { queue: [], index: -1, mode: 0 };
const listeners = new Set();
let failStreak = 0;
let skipReason = ''; // error 事件没有提供具体原因，我们跟踪容错状态

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
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => prev());
  navigator.mediaSession.setActionHandler('nexttrack', () => next(true));
  navigator.mediaSession.setActionHandler('seekto', (d) => {
    if (d.seekTime != null) audio.currentTime = d.seekTime;
  });
}
// 播放状态同步
audio.addEventListener('play', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });

/* ==================== 核心播放逻辑 ==================== */
export function onTrackChange(fn) { listeners.add(fn); }
export function current() { return state.queue[state.index] || null; }
export function mode() { return state.mode; }
export function cycleMode() { state.mode = (state.mode + 1) % 3; return state.mode; }

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
  const url = await resolveAudio(t).catch(() => '');
  if (!url) return skip('无可用音频');
  audio.src = streamUrl(url);
  listeners.forEach((fn) => fn(t));
  updateMediaSession(t);
  recordTrack(t);
  try {
    await audio.play();
    failStreak = 0;
  } catch { /* 自动播放被拦截,由 error 事件处理 */ }
}

/** 跨源回退：用歌名+歌手在其他音源搜完整版 */
async function tryFallback(failed) {
  if (!failed || !failed.title) return null;
  const alt = await findAlternative(failed).catch(() => null);
  if (!alt) return null;
  // 替换当前队列项的音频
  const idx = state.index;
  if (idx < 0 || idx >= state.queue.length) return null;
  const t = state.queue[idx];
  if (t.source !== failed.source || t.trackId !== failed.trackId) return null; // 歌曲已变，放弃
  t.altSource = alt.source;           // 标记替代来源（UI 可展示）
  t.altDuration = alt.duration;
  t.audioUrl = alt.audioUrl;
  return alt;
}

async function skip(reason) {
  failStreak++;
  skipReason = reason || '';
  if (state.index >= 0 && state.queue.length) {
    const failed = state.queue[state.index];
    // 只有单曲失败才尝试回退（不在 skip 循环里反复回退）
    if (failStreak === 1) {
      const alt = await tryFallback(failed);
      if (alt) {
        // 用替代音频重新加载
        const url = await resolveAudio(state.queue[state.index]).catch(() => '');
        if (url) {
          audio.src = streamUrl(url);
          listeners.forEach((fn) => fn(state.queue[state.index]));
          try { await audio.play(); failStreak = 0; return; } catch { /* 回退也失败，继续 skip */ }
        }
      }
    }
  }
  if (failStreak < state.queue.length && failStreak < 5) next(true);
}
audio.addEventListener('error', () => skip('播放错误'));

export function toggle() {
  if (!audio.src) return;
  if (audio.paused) audio.play(); else audio.pause();
}

export function next(auto = false) {
  if (!state.queue.length) return;
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

export function prev() {
  if (!state.queue.length) return;
  state.index = (state.index - 1 + state.queue.length) % state.queue.length;
  failStreak = 0;
  skipReason = '';
  load();
}

audio.addEventListener('ended', () => {
  if (state.mode === 1) {
    audio.currentTime = 0;
    audio.play();
  } else {
    next(true);
  }
});
