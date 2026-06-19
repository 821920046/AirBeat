import * as api from './api.js';
import * as player from './player.js';
import { getHistory } from './player.js';
import * as store from './store.js';
import * as auth from './auth.js';
import * as viz from './visualizer.js';
import { parseLRC, currentLine } from './lyrics.js';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const audio = player.audio;
const authModal = $('#auth-modal');
const pickerModal = $('#picker-modal');
const fs = $('#fullscreen');

let groups = [];
let lyricLines = [];
let lyricIdx = -1;
let pendingQuery = '';
let currentPlId = null;
let pickerTrack = null;
let authMode = 'login';
let lyricOffset = 0;
const OFFSET_KEY = 'airbeat:lyric-offsets';

function getLyricOffset(t) {
  if (!t) return 0;
  try {
    const map = JSON.parse(localStorage.getItem(OFFSET_KEY)) || {};
    return map[t.source + ':' + t.trackId] || 0;
  } catch { return 0; }
}

function saveLyricOffset(t, offset) {
  if (!t) return;
  try {
    const map = JSON.parse(localStorage.getItem(OFFSET_KEY)) || {};
    map[t.source + ':' + t.trackId] = offset;
    localStorage.setItem(OFFSET_KEY, JSON.stringify(map));
  } catch {}
}

function updateOffsetUI() {
  const el = $('#lyric-offset-val');
  if (el) el.textContent = `歌词偏移: ${lyricOffset > 0 ? '+' : ''}${lyricOffset.toFixed(1)}s`;
}

const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
const esc = (s) => String(s == null ? '' : s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function toast(msg) {
  const d = document.createElement('div');
  d.className = 'toast glass';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2200);
}

const skeletonGrid = () => `<div class='grid'>` + Array.from({ length: 6 }, () => `<div class='card glass skeleton'></div>`).join('') + `</div>`;

const coverHtml = (t) => (t.cover ? `<img loading='lazy' src='${esc(t.cover)}' alt=''>` : '🎵');

function trackCard(t, g, i) {
  return `<div class='card glass' data-g='${g}' data-i='${i}'>
    <div class='cover-wrap'>${coverHtml(t)}<button class='play-overlay' data-act='play'>▶</button></div>
    <div class='card-title' title='${esc(t.title)}'>${esc(t.title)}</div>
    <div class='card-artist'>${esc(t.artist || '')}</div>
    <div class='card-actions'>
      <button data-act='fav' class='icon-btn small' title='收藏'>♡</button>
      <button data-act='add' class='icon-btn small' title='加入歌单'>＋</button>
    </div>
  </div>`;
}

function trackRow(t, g, i, removeAct) {
  return `<div class='row glass' data-g='${g}' data-i='${i}'>
    <div class='row-cover'>${coverHtml(t)}</div>
    <div class='row-main'>
      <div class='row-title'>${esc(t.title)}</div>
      <div class='muted' style='font-size:12px'>${esc(t.artist || '')} · ${esc(t.source)}</div>
    </div>
    <button class='icon-btn small' data-act='add' title='加入歌单'>＋</button>
    <button class='icon-btn small' data-act='${removeAct}' title='移除'>✕</button>
  </div>`;
}

function renderGroups(data) {
  groups = data.map((d) => d.tracks);
  const html = data.map((d, g) => d.tracks.length
    ? `<h2>${esc(d.label)}</h2><div class='grid'>` + d.tracks.map((t, i) => trackCard(t, g, i)).join('') + `</div>`
    : '').join('');
  return html || `<p class='muted'>暂无内容,可能部分音源未配置或暂时不可用</p>`;
}

async function renderDiscover() {
  const hist = getHistory();
  const recs = api.dailyRecommend(hist, 12);
  const recHtml = recs.length ? `<h2>🎯 每日推荐（基于你的播放习惯）</h2><div class='grid'>${recs.map((t, i) => trackCard(t, -1, i)).join('')}</div>` : '';
  view.innerHTML = `<h1>发现</h1>` + recHtml + `<div id='discover-trending'>` + skeletonGrid() + `</div>`;
  // 推荐曲目单独存到 groups[-1]
  if (recs.length) groups[-1] = recs;
  const data = await api.discover();
  document.getElementById('discover-trending').innerHTML = renderGroups(data);
}

async function renderSearch() {
  view.innerHTML = `<h1>搜索</h1>
    <form id='search-form' class='searchbar glass'>
      <input id='search-input' placeholder='搜索歌曲、歌手…' value='${esc(pendingQuery)}' autocomplete='off'>
      <button class='btn'>搜索</button>
    </form>
    <div id='search-results'></div>`;
  const form = $('#search-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const q = $('#search-input').value.trim();
    if (!q) return;
    $('#search-results').innerHTML = skeletonGrid();
    const data = await api.searchAll(q);
    $('#search-results').innerHTML = renderGroups(data);
  };
  if (pendingQuery) { pendingQuery = ''; form.requestSubmit(); }
}

async function renderRadio() {
  view.innerHTML = `<h1>电台</h1>
    <form id='radio-form' class='searchbar glass'>
      <input id='radio-input' placeholder='搜索电台名称…' autocomplete='off'>
      <button class='btn'>搜索</button>
    </form>
    <div id='radio-list'>` + skeletonGrid() + `</div>`;
  const render = (stations) => {
    groups = [stations];
    $('#radio-list').innerHTML = stations.length
      ? `<div class='grid'>` + stations.map((t, i) => trackCard(t, 0, i)).join('') + `</div>`
      : `<p class='muted'>没有找到电台</p>`;
  };
  $('#radio-form').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('#radio-input').value.trim();
    $('#radio-list').innerHTML = skeletonGrid();
    render(q ? await api.radioSearch(q) : await api.radioTop());
  };
  render(await api.radioTop());
}

async function renderFavorites() {
  view.innerHTML = `<h1>收藏</h1>` + skeletonGrid();
  const favs = await store.getFavorites().catch(() => []);
  groups = [favs];
  view.innerHTML = `<h1>收藏</h1>` + (favs.length
    ? `<div class='list'>` + favs.map((t, i) => trackRow(t, 0, i, 'remove-fav')).join('') + `</div>`
    : `<p class='muted'>还没有收藏,去发现页听听吧</p>`);
}

async function renderPlaylists() {
  view.innerHTML = `<h1>我的歌单</h1>` + skeletonGrid();
  const pls = await store.getPlaylists().catch(() => []);
  view.innerHTML = `<h1>我的歌单</h1>
    <div class='searchbar' style='gap:8px;margin-bottom:18px;max-width:none;flex-wrap:wrap;'>
      <button class='btn ghost' id='pl-export'>📤 导出歌单</button>
      <button class='btn ghost' id='pl-import'>📥 导入歌单</button>
      <button class='btn ghost' id='pl-import-external'>🧩 导入网易/QQ歌单</button>
      <button class='btn ghost' id='pl-webdav'>☁️ WebDAV 同步</button>
    </div>
    <form id='pl-form' class='searchbar glass'>
      <input id='pl-name' placeholder='新歌单名称…'>
      <button class='btn'>创建</button>
    </form>
    <div class='list'>` + (pls.map((p) => `<div class='row glass' data-pl='${esc(p.id)}'>
      <div class='row-cover'>📚</div>
      <div class='row-main'>
        <div class='row-title'>${esc(p.name)}</div>
        <div class='muted' style='font-size:12px'>${p.song_count || 0} 首</div>
      </div>
      <button class='icon-btn small' data-act='rename' title='重命名'>✏️</button>
      <button class='icon-btn small' data-act='del' title='删除'>🗑</button>
    </div>`).join('') || `<p class='muted'>还没有歌单,在上方创建一个吧</p>`) + `</div>`;
    
  // 导入外部歌单弹窗
  $('#pl-import-external').onclick = () => {
    $('#import-external-error').textContent = '';
    $('#import-external-url').value = '';
    $('#import-external-modal').showModal();
  };
  
  // WebDAV 弹窗
  $('#pl-webdav').onclick = () => {
    $('#webdav-error').textContent = '';
    const cfg = store.getWebDAVConfig();
    if (cfg) {
      $('#webdav-url').value = cfg.url || '';
      $('#webdav-user').value = cfg.user || '';
      $('#webdav-pass').value = cfg.pass || '';
    }
    $('#webdav-modal').showModal();
  };

  $('#pl-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#pl-name').value.trim();
    if (name) { await store.createPlaylist(name); toast('歌单已创建'); renderPlaylists(); }
  };
  // 导出：获取所有歌单完整数据 → JSON 下载
  $('#pl-export').onclick = async () => {
    const list = [];
    for (const p of pls) {
      const detail = await store.getPlaylist(p.id).catch(() => null);
      if (detail) list.push({ name: detail.name, songs: (detail.songs || []).map((s) => ({ source: s.source, trackId: s.trackId, title: s.title, artist: s.artist, cover: s.cover, audioUrl: s.audioUrl, duration: s.duration })) });
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, playlists: list }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'airbeat-playlists-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    toast('歌单已导出');
  };
  // 导入：读取 JSON → 逐个创建歌单 + 添加歌曲
  $('#pl-import').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = async () => {
      const file = inp.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.playlists || !Array.isArray(data.playlists)) { toast('文件格式不正确'); return; }
        let count = 0;
        for (const pl of data.playlists) {
          const created = await store.createPlaylist(pl.name).catch(() => null);
          if (created && pl.songs) {
            for (const s of pl.songs) await store.addToPlaylist(created.id, s).catch(() => {});
          }
          count++;
        }
        toast('已导入 ' + count + ' 个歌单');
        renderPlaylists();
      } catch { toast('解析失败，请检查文件'); }
    };
    inp.click();
  };
}

async function renderPlaylistDetail(id) {
  currentPlId = id;
  view.innerHTML = skeletonGrid();
  const pl = await store.getPlaylist(id).catch(() => null);
  if (!pl) { view.innerHTML = `<p class='muted'>歌单不存在</p>`; return; }
  const songs = pl.songs || [];
  groups = [songs];
  view.innerHTML = `<h1>${esc(pl.name)}</h1>
    <button class='btn' id='pl-playall' ${songs.length ? '' : 'disabled'}>▶ 播放全部(${songs.length})</button>
    <div class='list' style='margin-top:16px'>` +
    (songs.map((t, i) => trackRow(t, 0, i, 'remove-song')).join('') || `<p class='muted'>歌单还是空的</p>`) + `</div>`;
  $('#pl-playall').onclick = () => player.playQueue(groups[0], 0);
}

function renderRecent() {
  view.innerHTML = `<h1>最近播放</h1>` + skeletonGrid();
  const hist = getHistory();
  groups = [hist];
  view.innerHTML = `<h1>最近播放</h1>` + (hist.length
    ? `<div class='list'>` + hist.map((t, i) => {
      const displayT = { ...t, source: t.source + (t.altSource ? ' → ' + t.altSource : '') };
      return trackRow(displayT, 0, i, 'remove-hist');
    }).join('') + `</div>`
    : `<p class='muted'>还没有播放记录</p>`);
}

function renderRecognize() {
  view.innerHTML = `<h1>听歌识曲</h1>
    <div class='recognize glass'>
      <button id='rec-btn' class='btn big'>🎙️ 开始识曲(录音 8 秒)</button>
      <div id='rec-out' class='rec-out muted'>点击按钮,把设备靠近声源</div>
    </div>`;
  $('#rec-btn').onclick = async () => {
    const out = $('#rec-out');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        out.textContent = '识别中…';
        const fd = new FormData();
        fd.set('file', new Blob(chunks, { type: rec.mimeType }), 'clip.webm');
        try {
          const r = await fetch('/api/recognize', { method: 'POST', body: fd });
          const j = await r.json();
          if (j.error) { out.textContent = j.error; return; }
          out.innerHTML = `<div class='rec-result'>
            ${j.cover ? `<img src='${esc(j.cover)}' alt=''>` : ''}
            <div style='text-align:left'>
              <div class='row-title'>${esc(j.title)}</div>
              <div class='muted'>${esc(j.artist)}</div>
            </div>
            <button class='btn' id='rec-search'>去搜索播放</button>
          </div>`;
          $('#rec-search').onclick = () => {
            pendingQuery = j.title + ' ' + j.artist;
            location.hash = '#/search';
          };
        } catch { out.textContent = '识别请求失败,请重试'; }
      };
      rec.start();
      out.textContent = '正在录音(8 秒)…请靠近声源';
      setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 8000);
    } catch { out.textContent = '无法访问麦克风,请检查浏览器权限'; }
  };
}

function renderSources() {
  const cfg = api.getSourceConfig();
  const all = api.allSources();
  const srcRow = (k, label, custom) => {
    const on = !cfg.disabled.includes(k);
    return `<div class='row glass'>
      <div class='row-cover'>${custom ? '🧩' : '🎵'}</div>
      <div class='row-main'><div class='row-title'>${esc(label)}</div></div>
      <button class='btn ${on ? '' : 'ghost'}' data-toggle-src='${esc(k)}'>${on ? '已启用' : '已停用'}</button>
      ${custom ? `<button class='icon-btn small' data-del-src='${esc(k)}' title='删除'>🗑</button>` : ''}
    </div>`;
  };
  const builtin = Object.entries(all).filter(([, a]) => !a.custom);
  const customs = cfg.custom || [];
  view.innerHTML = `<h1>音源管理</h1>
    <p class='muted' style='margin-bottom:14px'>可启用/停用任意音源,也可接入你自己的音乐源 API,或连接 Subsonic/Navidrome 自建曲库，配置保存在本机浏览器</p>
    <h2>内置音源</h2>
    <div class='list'>` + builtin.map(([k, a]) => srcRow(k, a.label, false)).join('') + `</div>
    <h2>自定义音源</h2>
    <div class='list'>` + (customs.map((c) => srcRow(c.type === 'subsonic' ? 'subsonic' : 'custom:' + c.id, c.type === 'subsonic' ? (c.subsonicName || 'Subsonic') : c.name, true)).join('') || `<p class='muted'>暂无自定义音源</p>`) + `</div>
    <h2>添加自定义音源</h2>
    <form id='src-form' class='src-form glass'>
      <input name='name' placeholder='音源名称(必填)'>
      <input name='type' placeholder='类型: 留空=普通API, subsonic=Navidrome/Airsonic'>
      <input name='searchUrl' placeholder='搜索接口 URL,{q} 代表关键词,例: https://my-api.com/search?keyword={q}'>
      <input name='subsonicUrl' placeholder='Subsonic 服务器地址,例: https://music.example.com'>
      <input name='subsonicUser' placeholder='Subsonic 用户名'>
      <input name='subsonicPassword' placeholder='Subsonic 密码'>
      <input name='subsonicName' placeholder='Subsonic 音源显示名称,例: 我的 Navidrome'>
      <input name='listPath' placeholder='结果列表字段路径,例: data.songs(返回本身是数组则留空)'>
      <input name='idField' placeholder='ID 字段,例: id(可留空)'>
      <input name='titleField' placeholder='歌名字段,例: name'>
      <input name='artistField' placeholder='歌手字段,例: artist.name'>
      <input name='coverField' placeholder='封面字段,例: album.picUrl'>
      <input name='audioField' placeholder='音频直链字段,例: url'>
      <input name='durationField' placeholder='时长字段(秒),可留空'>
      <input name='chartUrl' placeholder='榜单 URL(可选),例: https://my-api.com/top'>
      <input name='chartListPath' placeholder='榜单列表字段路径,例: data.rankingList'>
      <input name='headers' placeholder='自定义请求头(可选),一行一个,格式 Key: Value'>
      <input name='limit' placeholder='每页数量(可选),例: 20. 支持 {page}/{limit}/{offset} 占位'>
      <button class='btn'>保存音源</button>
    </form>`;
  $('#src-form').onsubmit = (e) => {
    e.preventDefault();
    const c = Object.fromEntries(new FormData(e.target).entries());
    c.id = Date.now().toString(36);
    cfg.custom = customs.concat([c]);
    api.saveSourceConfig(cfg);
    toast('音源已添加,可在搜索页使用');
    renderSources();
  };
  view.querySelectorAll('[data-toggle-src]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.toggleSrc;
      const i = cfg.disabled.indexOf(k);
      if (i >= 0) cfg.disabled.splice(i, 1); else cfg.disabled.push(k);
      api.saveSourceConfig(cfg);
      renderSources();
    };
  });
  view.querySelectorAll('[data-del-src]').forEach((b) => {
    b.onclick = () => {
      if (!confirm('删除该自定义音源?')) return;
      cfg.custom = customs.filter((c) => 'custom:' + c.id !== b.dataset.delSrc);
      cfg.disabled = cfg.disabled.filter((k) => k !== b.dataset.delSrc);
      api.saveSourceConfig(cfg);
      renderSources();
    };
  });
}

function updateSubsonicNav() {
  const enabled = api.enabledSources();
  const hasSubsonic = enabled.includes('subsonic');
  const nav = $('#nav-subsonic');
  if (nav) nav.style.display = hasSubsonic ? 'block' : 'none';
}

async function renderSubsonic(viewMode, targetId) {
  const sub = api.allSources()['subsonic'];
  if (!sub) {
    view.innerHTML = `<h1>☁️ 自建曲库</h1><p class='muted'>未配置或未启用 Subsonic/Navidrome 音源，请前往「🧩 音源」页面配置</p>`;
    return;
  }
  
  // 专辑歌曲列表详情
  if (viewMode === 'album' && targetId) {
    view.innerHTML = `<h1>自建专辑详情</h1>` + skeletonGrid();
    try {
      const songs = await sub.getAlbumSongs(targetId);
      groups = [songs];
      view.innerHTML = `<h1>💿 专辑歌曲</h1>
        <div style='margin-bottom:12px'><a href='#/subsonic' class='btn ghost small'>← 返回自建库</a></div>
        <button class='btn' id='sub-playall' ${songs.length ? '' : 'disabled'}>▶ 播放全部(${songs.length})</button>
        <div class='list' style='margin-top:16px'>` +
        (songs.map((t, i) => trackRow(t, 0, i, 'remove-song-disabled')).join('') || `<p class='muted'>该专辑没有歌曲</p>`) + `</div>`;
      $('#sub-playall').onclick = () => player.playQueue(groups[0], 0);
      view.querySelectorAll("[data-act='remove-song-disabled']").forEach(btn => btn.remove());
    } catch (err) {
      view.innerHTML = `<p class='error'>加载专辑失败: ${err.message}</p>`;
    }
    return;
  }
  
  // 歌单歌曲列表详情
  if (viewMode === 'playlist' && targetId) {
    view.innerHTML = `<h1>自建歌单详情</h1>` + skeletonGrid();
    try {
      const songs = await sub.getPlaylistSongs(targetId);
      groups = [songs];
      view.innerHTML = `<h1>📚 歌单歌曲</h1>
        <div style='margin-bottom:12px'><a href='#/subsonic' class='btn ghost small'>← 返回自建库</a></div>
        <button class='btn' id='sub-playall' ${songs.length ? '' : 'disabled'}>▶ 播放全部(${songs.length})</button>
        <div class='list' style='margin-top:16px'>` +
        (songs.map((t, i) => trackRow(t, 0, i, 'remove-song-disabled')).join('') || `<p class='muted'>该歌单为空</p>`) + `</div>`;
      $('#sub-playall').onclick = () => player.playQueue(groups[0], 0);
      view.querySelectorAll("[data-act='remove-song-disabled']").forEach(btn => btn.remove());
    } catch (err) {
      view.innerHTML = `<p class='error'>加载歌单失败: ${err.message}</p>`;
    }
    return;
  }
  
  // 目录深度浏览
  if (viewMode === 'browse') {
    const dirId = targetId || '';
    view.innerHTML = `<h1>自建库目录浏览</h1>` + skeletonGrid();
    try {
      const { dirs, songs } = await sub.browse(dirId);
      groups = [songs];
      
      const dirHtml = dirs.map(d => `<div class='row glass' data-dir-id='${d.id}'>
        <div class='row-cover'>📁</div>
        <div class='row-main'><div class='row-title'>${esc(d.name)}</div></div>
      </div>`).join('');
      
      const songHtml = songs.map((t, i) => trackRow(t, 0, i, 'remove-song-disabled')).join('');
      
      view.innerHTML = `<h1>📁 目录浏览</h1>
        <div style='margin-bottom:12px'>
          <a href='#/subsonic' class='btn ghost small'>← 返回自建库</a>
          ${dirId ? `<button id='btn-dir-up' class='btn ghost small'>↑ 返回上级</button>` : ''}
        </div>
        <div class='list'>
          ${dirHtml}
          ${songHtml || (dirs.length ? '' : `<p class='muted'>该目录下没有任何内容</p>`)}
        </div>`;
      
      view.querySelectorAll("[data-act='remove-song-disabled']").forEach(btn => btn.remove());
      
      view.querySelectorAll('[data-dir-id]').forEach(el => {
        el.onclick = () => {
          location.hash = `#/subsonic/browse/${el.dataset.dirId}`;
        };
      });
      
      const btnUp = $('#btn-dir-up');
      if (btnUp) {
        btnUp.onclick = () => history.back();
      }
    } catch (err) {
      view.innerHTML = `<p class='error'>加载目录失败: ${err.message}</p>`;
    }
    return;
  }
  
  // 首页：Tab 切换自建歌单与自建专辑
  view.innerHTML = `<h1>☁️ 自建曲库</h1>
    <div style='display:flex;gap:8px;margin-bottom:18px'>
      <button class='btn' id='sub-tab-pls'>自建歌单</button>
      <button class='btn ghost' id='sub-tab-albums'>最新专辑</button>
      <a href='#/subsonic/browse' class='btn ghost'>浏览目录</a>
    </div>
    <div id='subsonic-container'>` + skeletonGrid() + `</div>`;
    
  const container = $('#subsonic-container');
  
  const loadPlaylists = async () => {
    container.innerHTML = skeletonGrid();
    try {
      const pls = await sub.getPlaylists();
      container.innerHTML = pls.length
        ? `<div class='list'>` + pls.map(p => `<div class='row glass' data-sub-pl-id='${p.id}'>
            <div class='row-cover'>📚</div>
            <div class='row-main'>
              <div class='row-title'>${esc(p.name)}</div>
              <div class='muted' style='font-size:12px'>${p.songCount} 首歌曲</div>
            </div>
          </div>`).join('') + `</div>`
        : `<p class='muted'>你在自建库中还没有创建过歌单</p>`;
      
      container.querySelectorAll('[data-sub-pl-id]').forEach(el => {
        el.onclick = () => {
          location.hash = `#/subsonic/playlist/${el.dataset.subPlId}`;
        };
      });
    } catch (err) {
      container.innerHTML = `<p class='error'>加载歌单失败: ${err.message}</p>`;
    }
  };
  
  const loadAlbums = async () => {
    container.innerHTML = skeletonGrid();
    try {
      const albums = await sub.getAlbums();
      container.innerHTML = albums.length
        ? `<div class='grid'>` + albums.map(a => `<div class='card glass' data-sub-alb-id='${a.id}'>
            <div class='cover-wrap'>${a.cover ? `<img loading='lazy' src='${esc(a.cover)}'>` : '💿'}</div>
            <div class='card-title' title='${esc(a.name)}'>${esc(a.name)}</div>
            <div class='card-artist'>${esc(a.artist)}</div>
          </div>`).join('') + `</div>`
        : `<p class='muted'>未找到专辑</p>`;
        
      container.querySelectorAll('[data-sub-alb-id]').forEach(el => {
        el.onclick = () => {
          location.hash = `#/subsonic/album/${el.dataset.subAlbId}`;
        };
      });
    } catch (err) {
      container.innerHTML = `<p class='error'>加载专辑失败: ${err.message}</p>`;
    }
  };
  
  $('#sub-tab-pls').onclick = () => {
    $('#sub-tab-pls').classList.remove('ghost');
    $('#sub-tab-albums').classList.add('ghost');
    loadPlaylists();
  };
  
  $('#sub-tab-albums').onclick = () => {
    $('#sub-tab-pls').classList.add('ghost');
    $('#sub-tab-albums').classList.remove('ghost');
    loadAlbums();
  };
  
  loadPlaylists();
}

const routes = { discover: renderDiscover, search: renderSearch, radio: renderRadio, recognize: renderRecognize, playlists: renderPlaylists, favorites: renderFavorites, recent: renderRecent, sources: renderSources };

function route() {
  const hash = location.hash.slice(2) || 'discover';
  const [name, arg1, arg2] = hash.split('/');
  
  updateSubsonicNav();
  
  document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  if (name === 'playlist' && arg1) return renderPlaylistDetail(arg1);
  if (name === 'subsonic') return renderSubsonic(arg1, arg2);
  (routes[name] || renderDiscover)();
}
window.addEventListener('hashchange', route);

view.addEventListener('click', async (e) => {
  const actBtn = e.target.closest('[data-act]');
  const act = actBtn ? actBtn.dataset.act : null;
  const plEl = e.target.closest('[data-pl]');
  if (plEl) {
    const id = plEl.dataset.pl;
    if (act === 'rename') {
      const name = prompt('新的歌单名');
      if (name && name.trim()) { await store.renamePlaylist(id, name.trim()); renderPlaylists(); }
    } else if (act === 'del') {
      if (confirm('确定删除该歌单?')) { await store.deletePlaylist(id); renderPlaylists(); }
    } else {
      location.hash = '#/playlist/' + id;
    }
    return;
  }
  const card = e.target.closest('[data-g]');
  if (!card) return;
const grp = groups[+card.dataset.g];
if (!grp) return;
  const track = grp[+card.dataset.i];
  if (!track) return;
  if (!act || act === 'play') { player.playQueue(grp, +card.dataset.i); return; }
  if (act === 'fav') {
    const added = await store.toggleFavorite(track).catch(() => null);
    if (added !== null) { actBtn.textContent = added ? '❤' : '♡'; toast(added ? '已收藏' : '已取消收藏'); }
  }
  if (act === 'add') openPicker(track);
  if (act === 'remove-fav') { await store.toggleFavorite(track); renderFavorites(); }
  if (act === 'remove-song') { await store.removeFromPlaylist(currentPlId, track); renderPlaylistDetail(currentPlId); }
  if (act === 'remove-hist') {
    // 从历史中删除此条
    const hist = getHistory().filter((h) => !(h.source === track.source && h.trackId === track.trackId));
    try { localStorage.setItem('airbeat:history', JSON.stringify(hist.slice(0, 200))); } catch { /* ignore */ }
    renderRecent();
  }
});

async function openPicker(track) {
  pickerTrack = track;
  const pls = await store.getPlaylists().catch(() => []);
  $('#picker-list').innerHTML = pls.map((p) => `<button class='picker-item' data-pick='${esc(p.id)}'>📚 ${esc(p.name)}</button>`).join('') || `<p class='muted'>暂无歌单,在下方创建</p>`;
  pickerModal.showModal();
}
pickerModal.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pick]');
  if (b) {
    await store.addToPlaylist(b.dataset.pick, pickerTrack).catch(() => {});
    pickerModal.close();
    toast('已加入歌单');
  }
});
$('#picker-create').onclick = async () => {
  const name = $('#picker-name').value.trim();
  if (!name) return;
  const pl = await store.createPlaylist(name);
  await store.addToPlaylist(pl.id, pickerTrack).catch(() => {});
  $('#picker-name').value = '';
  pickerModal.close();
  toast('已创建并加入');
};

// 导入外部歌单
$('#import-external-close').onclick = () => $('#import-external-modal').close();
$('#import-external-form').onsubmit = async (e) => {
  e.preventDefault();
  const errEl = $('#import-external-error');
  errEl.textContent = '';
  const url = $('#import-external-url').value.trim();
  if (!url) return;
  const submitBtn = $('#import-external-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = '解析中…';
  
  try {
    const r = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || '解析失败');
    
    const pl = await store.createPlaylist(data.name);
    for (const song of data.songs) {
      await store.addToPlaylist(pl.id, song).catch(() => {});
    }
    
    toast(`已导入歌单「${data.name}」，含 ${data.songs.length} 首歌曲`);
    $('#import-external-modal').close();
    renderPlaylists();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '解析并导入';
  }
};

// WebDAV 备份同步
$('#webdav-close').onclick = () => $('#webdav-modal').close();
$('#webdav-upload').onclick = async () => {
  const url = $('#webdav-url').value.trim();
  const userCred = $('#webdav-user').value.trim();
  const passCred = $('#webdav-pass').value;
  const errEl = $('#webdav-error');
  errEl.textContent = '';
  
  if (!url || !userCred || !passCred) {
    errEl.textContent = '请完整填写配置信息';
    return;
  }
  
  const btn = $('#webdav-upload');
  btn.disabled = true;
  btn.textContent = '上传中…';
  try {
    await store.uploadWebDAV(url, userCred, passCred);
    toast('备份上传成功！');
    $('#webdav-modal').close();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '上传备份';
  }
};

$('#webdav-download').onclick = async () => {
  const url = $('#webdav-url').value.trim();
  const userCred = $('#webdav-user').value.trim();
  const passCred = $('#webdav-pass').value;
  const errEl = $('#webdav-error');
  errEl.textContent = '';
  
  if (!url || !userCred || !passCred) {
    errEl.textContent = '请完整填写配置信息';
    return;
  }
  
  if (!confirm('从云端下载同步将合并数据，是否继续？')) return;
  
  const btn = $('#webdav-download');
  btn.disabled = true;
  btn.textContent = '下载中…';
  try {
    const importCount = await store.downloadWebDAV(url, userCred, passCred);
    toast(`同步完成！导入了 ${importCount} 个歌单，并合并了收藏列表。`);
    $('#webdav-modal').close();
    renderPlaylists();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '下载同步';
  }
};

$('#auth-switch').onclick = () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  $('#auth-title').textContent = authMode === 'login' ? '登录' : '注册';
  $('#auth-submit').textContent = authMode === 'login' ? '登录' : '注册';
  $('#auth-switch').textContent = authMode === 'login' ? '没有账号?去注册' : '已有账号?去登录';
};
$('#auth-close').onclick = () => authModal.close();
$('#auth-form').onsubmit = async (e) => {
  e.preventDefault();
  $('#auth-error').textContent = '';
  try {
    const fn = authMode === 'login' ? auth.login : auth.register;
    const u = await fn($('#auth-email').value.trim(), $('#auth-password').value);
    store.setUser(u);
    await store.mergeLocal().catch(() => {});
    updateAuthBtn(u);
    authModal.close();
    toast('欢迎,' + u.email);
    route();
  } catch (err) {
    $('#auth-error').textContent = err.message;
  }
};
$('#auth-btn').onclick = async () => {
  if (store.getUser()) {
    if (confirm('退出登录?')) {
      await auth.logout().catch(() => {});
      store.setUser(null);
      updateAuthBtn(null);
      route();
    }
  } else {
    authModal.showModal();
  }
};
function updateAuthBtn(u) {
  $('#auth-btn').textContent = u ? u.email.split('@')[0] : '登录';
}

const seek = $('#seek');
let seeking = false;
audio.addEventListener('timeupdate', () => {
  if (!seeking && audio.duration) seek.value = (audio.currentTime / audio.duration) * 1000;
  $('#t-cur').textContent = fmt(audio.currentTime);
  $('#t-dur').textContent = fmt(audio.duration);
  syncLyrics();
  if (audio.duration) player.checkPreload(audio.currentTime, audio.duration);
});
seek.addEventListener('input', () => { seeking = true; });
seek.addEventListener('change', () => {
  if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
  seeking = false;
});
$('#volume').oninput = (e) => { player.setVolume(e.target.value / 100); };
$('#btn-play').onclick = () => player.toggle();
$('#btn-prev').onclick = () => player.prev();
$('#btn-next').onclick = () => player.next();
$('#btn-mode').onclick = () => { $('#btn-mode').textContent = player.MODES[player.cycleMode()]; };
audio.addEventListener('play', () => {
  $('#btn-play').textContent = '⏸';
  viz.resume();
  $('#fs-cover').classList.add('rotating');
});
audio.addEventListener('pause', () => {
  $('#btn-play').textContent = '▶';
  $('#fs-cover').classList.remove('rotating');
});

$('#btn-full').onclick = () => {
  if (!player.current()) { toast('先播放一首歌'); return; }
  fs.classList.remove('hidden');
  viz.initAudioGraph(audio);
  viz.initEQ(audio);
  renderEQ();
  viz.resume();
  viz.start($('#fs-canvas'));
};
$('#fs-close').onclick = () => { fs.classList.add('hidden'); viz.stop(); };
$('#viz-style').onclick = () => viz.toggleStyle();

/* ==================== 均衡器 UI ==================== */
function renderEQ() {
  const bands = viz.getEQBands();
  const gains = viz.getEQGains();
  const html = bands.map((freq, i) => {
    const label = freq >= 1000 ? (freq / 1000).toFixed(0) + 'k' : String(freq);
    return `<div class='eq-band'>
      <input type='range' min='-12' max='12' value='${gains[i]}' step='1' data-eq='${i}' title='${freq}Hz'>
      <label>${label}</label>
    </div>`;
  }).join('');
  document.getElementById('eq-bands').innerHTML = html;
  document.querySelectorAll('#eq-bands input').forEach((inp) => {
    inp.oninput = () => viz.setEQBand(+inp.dataset.eq, +inp.value);
  });
}
$('#eq-toggle').onclick = () => {
  viz.initEQ(audio);
  renderEQ();
  document.getElementById('eq-panel').classList.toggle('hidden');
};
$('#eq-close').onclick = () => {
  document.getElementById('eq-panel').classList.add('hidden');
};
$('#eq-preset').onchange = function () {
  if (!this.value) return;
  viz.applyEQPreset(this.value);
  renderEQ();
  this.value = '';
};
$('#eq-reset').onclick = () => {
  viz.resetEQ();
  renderEQ();
};

function setAccentFrom(src) {
  if (!src) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, 2, 2);
      const d = x.getImageData(0, 0, 2, 2).data;
      const c1 = `rgb(${d[0]},${d[1]},${d[2]})`;
      const c2 = `rgb(${d[4]},${d[5]},${d[6]})`;
      const c3 = `rgb(${d[8]},${d[9]},${d[10]})`;
      document.documentElement.style.setProperty('--accent', c1);
      document.documentElement.style.setProperty('--glow1', c1);
      document.documentElement.style.setProperty('--glow2', c2);
      document.documentElement.style.setProperty('--glow3', c3);
    } catch {
      // 跨域受限时从当前 --accent 变换颜色
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b5cf6';
      document.documentElement.style.setProperty('--glow1', accent);
      document.documentElement.style.setProperty('--glow2', '#0c1b3a');
      document.documentElement.style.setProperty('--glow3', '#1a1330');
    }
  };
}

async function loadLyrics(t) {
  lyricLines = [];
  lyricIdx = -1;
  const box = $('#fs-lyrics');
  box.innerHTML = `<p class='muted'>歌词加载中…</p>`;
  const lrc = t.source === 'radio' ? null : await api.fetchLyrics(t);
  if (player.current() !== t) return;
  if (!lrc) { box.innerHTML = `<p class='muted'>暂无歌词</p>`; return; }
  lyricLines = parseLRC(lrc);
  box.innerHTML = lyricLines.map((l, i) => `<p data-l='${i}'>${esc(l.text)}</p>`).join('');
  box.onclick = (e) => {
    const p = e.target.closest('[data-l]');
    if (p) audio.currentTime = lyricLines[+p.dataset.l].time;
  };
}

function syncLyrics() {
  if (!lyricLines.length || fs.classList.contains('hidden')) return;
  const curTime = audio.currentTime + lyricOffset;
  const i = currentLine(lyricLines, curTime);
  if (i === lyricIdx) return;
  lyricIdx = i;
  document.querySelectorAll('#fs-lyrics p').forEach((p) => p.classList.remove('active'));
  const el = document.querySelector(`#fs-lyrics p[data-l='${i}']`);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function onTrack(t) {
  if (!t) {
    $('#pb-cover').src = '';
    $('#pb-cover').style.visibility = 'hidden';
    $('#pb-title').textContent = '未在播放';
    $('#pb-artist').textContent = '';
    $('#fs-cover').src = '';
    $('#fs-title').textContent = '';
    $('#fs-artist').textContent = '';
    document.title = 'AirBeat · 在线音乐播放器';
    $('#fs-lyrics').innerHTML = `<p class='muted'>暂无歌词</p>`;
    if ($('#queue-drawer').classList.contains('show')) renderQueueList();
    return;
  }
  $('#pb-cover').src = t.cover || '';
  $('#pb-cover').style.visibility = t.cover ? 'visible' : 'hidden';
  $('#pb-title').textContent = t.title;
  $('#pb-artist').textContent = t.artist || '';
  $('#fs-cover').src = t.cover ? api.streamUrl(t.cover) : '';
  $('#fs-title').textContent = t.title;
  $('#fs-artist').textContent = t.artist || '';
  document.title = t.title + ' · AirBeat';
  setAccentFrom(t.cover ? api.streamUrl(t.cover) : '');
  lyricOffset = getLyricOffset(t);
  updateOffsetUI();
  loadLyrics(t);
  if ($('#queue-drawer').classList.contains('show')) renderQueueList();
}

const savedTheme = localStorage.getItem('airbeat:theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$('#theme-toggle').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  localStorage.setItem('airbeat:theme', t);
};

// 歌词偏移微调事件绑定
$('#lyric-offset-dec').onclick = () => {
  lyricOffset -= 0.5;
  updateOffsetUI();
  saveLyricOffset(player.current(), lyricOffset);
  // 清空 lyricIdx 强迫 syncLyrics 重新计算滚动
  lyricIdx = -1;
  syncLyrics();
};
$('#lyric-offset-inc').onclick = () => {
  lyricOffset += 0.5;
  updateOffsetUI();
  saveLyricOffset(player.current(), lyricOffset);
  lyricIdx = -1;
  syncLyrics();
};
$('#lyric-offset-reset').onclick = () => {
  lyricOffset = 0;
  updateOffsetUI();
  saveLyricOffset(player.current(), lyricOffset);
  lyricIdx = -1;
  syncLyrics();
};

/* ==================== 播放队列抽屉 (Queue Drawer) 逻辑 ==================== */
function renderQueueList() {
  const q = player.getQueue();
  const currentIdx = player.getIndex();
  const listEl = $('#queue-list');
  if (!listEl) return;
  
  listEl.innerHTML = q.map((t, i) => {
    const isActive = i === currentIdx;
    return `<div class='queue-item ${isActive ? 'active' : ''}' data-q-idx='${i}'>
      <div class='queue-item-main'>
        <div class='queue-title' title='${esc(t.title)}'>${esc(t.title)}</div>
        <div class='queue-artist'>${esc(t.artist || '')} · ${esc(t.source)}</div>
      </div>
      <button class='icon-btn small' data-queue-act='remove' data-q-idx='${i}' title='移除'>✕</button>
    </div>`;
  }).join('') || `<p class='muted' style='text-align:center;padding:20px 0;font-size:12px;'>队列为空</p>`;
  
  // 绑定点击列表项切歌
  listEl.querySelectorAll('.queue-item').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('[data-queue-act="remove"]')) return;
      const idx = +el.dataset.qIdx;
      player.setIndex(idx);
    };
  });
  
  // 绑定删除按钮
  listEl.querySelectorAll('[data-queue-act="remove"]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.qIdx;
      player.removeFromQueue(idx);
      renderQueueList();
    };
  });
}

$('#btn-queue').onclick = (e) => {
  e.stopPropagation();
  const drawer = $('#queue-drawer');
  drawer.classList.toggle('show');
  if (drawer.classList.contains('show')) {
    renderQueueList();
  }
};
$('#queue-close').onclick = () => {
  $('#queue-drawer').classList.remove('show');
};
$('#queue-clear').onclick = () => {
  if (confirm('确定清空播放队列？')) {
    player.clearQueue();
    renderQueueList();
    $('#queue-drawer').classList.remove('show');
  }
};
// 点击抽屉外部自动关闭抽屉
document.addEventListener('click', (e) => {
  const drawer = $('#queue-drawer');
  if (drawer.classList.contains('show') && !e.target.closest('#queue-drawer') && !e.target.closest('#btn-queue')) {
    drawer.classList.remove('show');
  }
});

/* ==================== 键盘快捷键 ==================== */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  switch (e.key) {
    case ' ': e.preventDefault(); player.toggle(); break;
    case 'ArrowLeft': e.preventDefault(); audio.currentTime = Math.max(0, audio.currentTime - 5); break;
    case 'ArrowRight': e.preventDefault(); audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); break;
    case 'ArrowUp': e.preventDefault(); { const v = Math.min(1, player.getVolume() + 0.05); player.setVolume(v); $('#volume').value = Math.round(v * 100); } break;
    case 'ArrowDown': e.preventDefault(); { const v = Math.max(0, player.getVolume() - 0.05); player.setVolume(v); $('#volume').value = Math.round(v * 100); } break;
  }
});

(async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  player.setVolume(0.8);
  $('#volume').value = 80;
  player.onTrackChange(onTrack);
  const u = await auth.me().catch(() => null);
  if (u) store.setUser(u);
  updateAuthBtn(u);
  route();
})();
