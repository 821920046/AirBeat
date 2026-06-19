const proxy = (p) => '/api/proxy/' + p;
export const streamUrl = (u) => (u ? '/api/proxy/stream?url=' + encodeURIComponent(u) : '');
const proxy = (p) => '/api/proxy/' + p;
export const streamUrl = (u) => (u ? '/api/proxy/stream?url=' + encodeURIComponent(u) : '');

/* ============== 会话级熔断器 ============== */
// 一旦某音源 501(未配置)或连续 3 次 5xx/530,本会话内不再请求它
const _disabledSources = new Set();
const _failCounts = new Map();
const FAIL_THRESHOLD = 3;

export function isSourceDisabled(name) {
  return _disabledSources.has(name);
}
export function disableSource(name, reason) {
  if (!name || _disabledSources.has(name)) return;
  _disabledSources.add(name);
  console.warn('[音源熔断] ' + name + ' 已禁用: ' + (reason || ''));
  try {
    window.dispatchEvent(new CustomEvent('source-disabled', { detail: { name, reason } }));
  } catch {}
}
export function resetDisabledSources() {
  _disabledSources.clear();
  _failCounts.clear();
}
export function listDisabledSources() {
  return Array.from(_disabledSources);
}

async function get(p, sourceName) {
  // 已熔断 → 立即抛错,不发请求,避免请求风暴
  if (sourceName && _disabledSources.has(sourceName)) {
    throw new Error('source disabled: ' + sourceName);
  }
  const r = await fetch(proxy(p));
  if (!r.ok) {
    if (sourceName) {
      if (r.status === 501) {
        // 未配置 Key → 直接禁用本会话
        disableSource(sourceName, '未配置 (501)');
      } else if (r.status === 530 || r.status >= 500) {
        const n = (_failCounts.get(sourceName) || 0) + 1;
        _failCounts.set(sourceName, n);
        if (n >= FAIL_THRESHOLD) {
          disableSource(sourceName, '上游连续失败 ' + n + ' 次');
        }
      }
    }
    throw new Error('proxy ' + p + ' ' + r.status);
  }
  if (sourceName) _failCounts.delete(sourceName); // 成功重置计数
  return r.json();
}

/** Subsonic 消息摘要：MD5(password + salt) — 纯 JS 实现，零依赖 */
// https://github.com/blueimp/JavaScript-MD5 (MIT) — 精简版
function md5(string) {
  function rotateLeft(lValue, iShiftBits) { return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits)); }
  function addUnsigned(lX, lY) { var lX4, lY4, lX8, lY8, lResult; lX8 = (lX & 0x80000000); lY8 = (lY & 0x80000000); lX4 = (lX & 0x40000000); lY4 = (lY & 0x40000000); lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF); if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8; if (lX4 | lY4) { if (lResult & 0x40000000) return lResult ^ 0xC0000000 ^ lX8 ^ lY8; else return lResult ^ 0x40000000 ^ lX8 ^ lY8; } else return lResult ^ lX8 ^ lY8; }
  function fF(x, y, z) { return (x & y) | ((~x) & z); }
  function fG(x, y, z) { return (x & z) | (y & (~z)); }
  function fH(x, y, z) { return (x ^ y ^ z); }
  function fI(x, y, z) { return (y ^ (x | (~z))); }
  function ff(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(fF(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function gg(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(fG(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function hh(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(fH(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function ii(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(fI(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function convertToWordArray(string) { var lWordCount, lMessageLength = string.length, lNumberOfWordsTemp1 = lMessageLength + 8, lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64, lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16, lWordArray = Array(lNumberOfWords - 1), lBytePosition = 0, lByteCount = 0; while (lByteCount < lMessageLength) { lWordCount = (lByteCount - (lByteCount % 4)) / 4; lBytePosition = (lByteCount % 4) * 8; lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition)); lByteCount++; } lWordCount = (lByteCount - (lByteCount % 4)) / 4; lBytePosition = (lByteCount % 4) * 8; lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition); lWordArray[lNumberOfWords - 2] = lMessageLength << 3; lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29; return lWordArray; }
  var x = convertToWordArray(string), a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  for (var k = 0; k < x.length; k += 16) { var AA = a, BB = b, CC = c, DD = d;
    a = ff(a, b, c, d, x[k + 0], 7, 0xD76AA478); d = ff(d, a, b, c, x[k + 1], 12, 0xE8C7B756); c = ff(c, d, a, b, x[k + 2], 17, 0x242070DB); b = ff(b, c, d, a, x[k + 3], 22, 0xC1BDCEEE);
    a = ff(a, b, c, d, x[k + 4], 7, 0xF57C0FAF); d = ff(d, a, b, c, x[k + 5], 12, 0x4787C62A); c = ff(c, d, a, b, x[k + 6], 17, 0xA8304613); b = ff(b, c, d, a, x[k + 7], 22, 0xFD469501);
    a = ff(a, b, c, d, x[k + 8], 7, 0x698098D8); d = ff(d, a, b, c, x[k + 9], 12, 0x8B44F7AF); c = ff(c, d, a, b, x[k + 10], 17, 0xFFFF5BB1); b = ff(b, c, d, a, x[k + 11], 22, 0x895CD7BE);
    a = ff(a, b, c, d, x[k + 12], 7, 0x6B901122); d = ff(d, a, b, c, x[k + 13], 12, 0xFD987193); c = ff(c, d, a, b, x[k + 14], 17, 0xA679438E); b = ff(b, c, d, a, x[k + 15], 22, 0x49B40821);
    a = gg(a, b, c, d, x[k + 1], 5, 0xF61E2562); d = gg(d, a, b, c, x[k + 6], 9, 0xC040B340); c = gg(c, d, a, b, x[k + 11], 14, 0x265E5A51); b = gg(b, c, d, a, x[k + 0], 20, 0xE9B6C7AA);
    a = gg(a, b, c, d, x[k + 5], 5, 0xD62F105D); d = gg(d, a, b, c, x[k + 10], 9, 0x2441453); c = gg(c, d, a, b, x[k + 15], 14, 0xD8A1E681); b = gg(b, c, d, a, x[k + 4], 20, 0xE7D3FBC8);
    a = gg(a, b, c, d, x[k + 9], 5, 0x21E1CDE6); d = gg(d, a, b, c, x[k + 14], 9, 0xC33707D6); c = gg(c, d, a, b, x[k + 3], 14, 0xF4D50D87); b = gg(b, c, d, a, x[k + 8], 20, 0x455A14ED);
    a = gg(a, b, c, d, x[k + 13], 5, 0xA9E3E905); d = gg(d, a, b, c, x[k + 2], 9, 0xFCEFA3F8); c = gg(c, d, a, b, x[k + 7], 14, 0x676F02D9); b = gg(b, c, d, a, x[k + 12], 20, 0x8D2A4C8A);
    a = hh(a, b, c, d, x[k + 5], 4, 0xFFFA3942); d = hh(d, a, b, c, x[k + 8], 11, 0x8771F681); c = hh(c, d, a, b, x[k + 11], 16, 0x6D9D6122); b = hh(b, c, d, a, x[k + 14], 23, 0xFDE5380C);
    a = hh(a, b, c, d, x[k + 1], 4, 0xA4BEEA44); d = hh(d, a, b, c, x[k + 4], 11, 0x4BDECFA9); c = hh(c, d, a, b, x[k + 7], 16, 0xF6BB4B60); b = hh(b, c, d, a, x[k + 10], 23, 0xBEBFBC70);
    a = hh(a, b, c, d, x[k + 13], 4, 0x289B7EC6); d = hh(d, a, b, c, x[k + 0], 11, 0xEAA127FA); c = hh(c, d, a, b, x[k + 3], 16, 0xD4EF3085); b = hh(b, c, d, a, x[k + 6], 23, 0x4881D05);
    a = hh(a, b, c, d, x[k + 9], 4, 0xD9D4D039); d = hh(d, a, b, c, x[k + 12], 11, 0xE6DB99E5); c = hh(c, d, a, b, x[k + 15], 16, 0x1FA27CF8); b = hh(b, c, d, a, x[k + 2], 23, 0xC4AC5665);
    a = ii(a, b, c, d, x[k + 0], 6, 0xF4292244); d = ii(d, a, b, c, x[k + 7], 10, 0x432AFF97); c = ii(c, d, a, b, x[k + 14], 15, 0xAB9423A7); b = ii(b, c, d, a, x[k + 5], 21, 0xFC93A039);
    a = ii(a, b, c, d, x[k + 12], 6, 0x655B59C3); d = ii(d, a, b, c, x[k + 3], 10, 0x8F0CCC92); c = ii(c, d, a, b, x[k + 10], 15, 0xFFEFF47D); b = ii(b, c, d, a, x[k + 1], 21, 0x85845DD1);
    a = ii(a, b, c, d, x[k + 8], 6, 0x6FA87E4F); d = ii(d, a, b, c, x[k + 15], 10, 0xFE2CE6E0); c = ii(c, d, a, b, x[k + 6], 15, 0xA3014314); b = ii(b, c, d, a, x[k + 13], 21, 0x4E0811A1);
    a = ii(a, b, c, d, x[k + 4], 6, 0xF7537E82); d = ii(d, a, b, c, x[k + 11], 10, 0xBD3AF235); c = ii(c, d, a, b, x[k + 2], 15, 0x2AD7D2BB); b = ii(b, c, d, a, x[k + 9], 21, 0xEB86D391);
    a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD); }
  function wordToHex(lValue) { var wordToHexValue = '', wordToHexValueTemp = '', lByte, lCount; for (lCount = 0; lCount <= 3; lCount++) { lByte = (lValue >>> (lCount * 8)) & 255; wordToHexValueTemp = '0' + lByte.toString(16); wordToHexValue = wordToHexValue + wordToHexValueTemp.substr(wordToHexValueTemp.length - 2, 2); } return wordToHexValue; }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}

function subsonicToken(password, salt) {
  return md5(password + salt);
}

function buildSubsonicAdapter(cfg) {
  if (!cfg.subsonicUrl || !cfg.subsonicUser) return null;
  const base = cfg.subsonicUrl.replace(/\/+$/, '') + '/rest';
  const makeParams = (extra) => {
    const p = new URLSearchParams({
      u: cfg.subsonicUser,
      f: 'json',
      v: '1.16.1',
      c: 'AirBeat',
      ...extra,
    });
    if (cfg.subsonicPassword) {
      // 用 MD5(密码+随机盐) 认证
      const salt = Math.random().toString(36).slice(2, 12);
      p.set('t', subsonicToken(cfg.subsonicPassword, salt));
      p.set('s', salt);
    }
    return p.toString();
  };

  return {
    label: (cfg.subsonicName || 'Subsonic') + ' · 自建曲库',
    custom: true,
    search: async (q) => {
      const url = base + '/search3?' + makeParams({ query: q, songCount: '20' });
      const r = await fetch('/api/proxy/stream?url=' + encodeURIComponent(url));
      if (!r.ok) throw new Error('subsonic ' + r.status);
      const j = await r.json();
      const songs = j['subsonic-response']?.searchResult3?.song || [];
      return songs.map((s) => ({
        source: 'subsonic',
        trackId: String(s.id),
        title: s.title || '未知标题',
        artist: s.artist || '',
        cover: s.coverArt ? base + '/getCoverArt?' + makeParams({ id: s.coverArt }) : '',
        audioUrl: base + '/stream?' + makeParams({ id: s.id }),
        duration: s.duration || 0,
        album: s.album || '',
      })).filter((t) => t.audioUrl);
    },
    trending: async () => {
      const url = base + '/getAlbumList2?' + makeParams({ type: 'newest', size: '20' });
      const r = await fetch('/api/proxy/stream?url=' + encodeURIComponent(url));
      if (!r.ok) throw new Error('subsonic chart ' + r.status);
      const j = await r.json();
      const albums = j['subsonic-response']?.albumList2?.album || [];
      // 取专辑列表中的第一首歌作为上榜展示
      const tracks = [];
      for (const a of albums.slice(0, 6)) {
        const sid = (a.song || [])[0]?.id;
        if (sid) {
          tracks.push({
            source: 'subsonic',
            trackId: String(sid),
            title: (a.song || [])[0]?.title || a.name || '未知标题',
            artist: a.artist || '',
            cover: a.coverArt ? base + '/getCoverArt?' + makeParams({ id: a.coverArt }) : '',
            audioUrl: base + '/stream?' + makeParams({ id: sid }),
            duration: (a.song || [])[0]?.duration || 0,
            album: a.name || '',
          });
        }
      }
      return tracks;
    },
    // 额外：浏览目录（按文件夹浏览，Navidrome 特有）
    browse: async (id) => {
      const url = base + '/getMusicDirectory?' + makeParams({ id: String(id) });
      const r = await fetch('/api/proxy/stream?url=' + encodeURIComponent(url));
      if (!r.ok) throw new Error('subsonic browse ' + r.status);
      const j = await r.json();
      const dir = j['subsonic-response']?.directory;
      if (!dir) return { dirs: [], songs: [] };
      const dirs = (dir.child || []).filter((c) => c.isDir).map((d) => ({ id: String(d.id), name: d.title }));
      const songs = (dir.child || []).filter((c) => !c.isDir).map((s) => ({
        source: 'subsonic',
        trackId: String(s.id),
        title: s.title || '未知标题',
        artist: s.artist || '',
        cover: s.coverArt ? base + '/getCoverArt?' + makeParams({ id: s.coverArt }) : '',
        audioUrl: base + '/stream?' + makeParams({ id: s.id }),
        duration: s.duration || 0,
        album: s.album || '',
      }));
      return { dirs, songs };
    },
    getPlaylists: async () => {
      const url = base + '/getPlaylists?' + makeParams();
      const r = await fetch('/api/proxy/stream?url=' + encodeURIComponent(url));
      if (!r.ok) throw new Error('subsonic getPlaylists ' + r.status);
      const j = await r.json();
      const list = j['subsonic-response']?.playlists?.playlist || [];
      return (Array.isArray(list) ? list : [list]).filter(p => p && p.id).map(p => ({
        id: String(p.id),
        name: p.name || '未命名歌单',
        songCount: p.songCount || 0
      }));
    },
    getPlaylistSongs: async (id) => {
      const url = base + '/getPlaylist?' + makeParams({ id: String(id) });
      const r = await fetch('/api/proxy/stream?url=' + encodeURIComponent(url));
      if (!r.ok) throw new Error('subsonic getPlaylist ' + r.status);
      const j = await r.json();
      const songs = j['subsonic-response']?.playlist?.entry || [];
      return (Array.isArray(songs) ? songs : [songs]).filter(s => s && s.id).map(s => ({
        source: 'subsonic',
        trackId: String(s.id),
        title: s.title || '未知标题',
        artist: s.artist || '',
        cover: s.coverArt ? base + '/getCoverArt?' + makeParams({ id: s.coverArt }) : '',
        audioUrl: base + '/stream?' + makeParams({ id: s.id }),
        duration: s.duration || 0,
        album: s.album || ''
      }));
    },
    getAlbums: async (type = 'newest', size = 20) => {
      const url = base + '/getAlbumList2?' + makeParams({ type, size: String(size) });
      const r = await fetch('/api/proxy/stream?url=' + encodeURIComponent(url));
      if (!r.ok) throw new Error('subsonic getAlbumList2 ' + r.status);
      const j = await r.json();
      const albums = j['subsonic-response']?.albumList2?.album || [];
      return (Array.isArray(albums) ? albums : [albums]).filter(a => a && a.id).map(a => ({
        id: String(a.id),
        name: a.name || '未知专辑',
        artist: a.artist || '',
        cover: a.coverArt ? base + '/getCoverArt?' + makeParams({ id: a.coverArt }) : '',
        songCount: a.songCount || 0
      }));
    },
    getAlbumSongs: async (id) => {
      const url = base + '/getAlbum?' + makeParams({ id: String(id) });
      const r = await fetch('/api/proxy/stream?url=' + encodeURIComponent(url));
      if (!r.ok) throw new Error('subsonic getAlbum ' + r.status);
      const j = await r.json();
      const songs = j['subsonic-response']?.album?.song || [];
      return (Array.isArray(songs) ? songs : [songs]).filter(s => s && s.id).map(s => ({
        source: 'subsonic',
        trackId: String(s.id),
        title: s.title || '未知标题',
        artist: s.artist || '',
        cover: s.coverArt ? base + '/getCoverArt?' + makeParams({ id: s.coverArt }) : '',
        audioUrl: base + '/stream?' + makeParams({ id: s.id }),
        duration: s.duration || 0,
        album: s.album || ''
      }));
    }
  };
}

const AUDIUS_BASE = 'https://discoveryprovider.audius.co/v1';

// ─────────────── 数据映射器 ───────────────
const mapJamendo = (t) => ({ source: 'jamendo', trackId: t.id, title: t.name, artist: t.artist_name, cover: t.image, audioUrl: t.audio, duration: +t.duration || 0 });
const mapAudius = (t) => ({ source: 'audius', trackId: t.id, title: t.title, artist: t.user && t.user.name, cover: t.artwork && (t.artwork['480x480'] || t.artwork['150x150']), audioUrl: AUDIUS_BASE + '/tracks/' + t.id + '/stream?app_name=airbeat', duration: t.duration || 0 });

const mapArchive = (d) => ({ source: 'archive', trackId: d.identifier, title: d.title || d.identifier, artist: Array.isArray(d.creator) ? d.creator[0] : (d.creator || 'Internet Archive'), cover: 'https://archive.org/services/img/' + d.identifier, audioUrl: '', duration: 0 });
const mapRadio = (s) => ({ source: 'radio', trackId: s.stationuuid, title: s.name, artist: (s.country || '') + (s.tags ? ' · ' + s.tags.split(',')[0] : ''), cover: s.favicon, audioUrl: s.url_resolved, duration: 0 });

/** Spotify 曲目映射 — 使用 30s preview_url，无 preview 则 audioUrl 为空（依赖跨源回退） */
const mapSpotify = (t) => ({
  source: 'spotify',
  trackId: t.id,
  title: t.name,
  artist: (t.artists || []).map(a => a.name).join(', '),
  cover: t.album && t.album.images && (t.album.images[0]?.url || ''),
  audioUrl: t.preview_url || '',
  duration: t.preview_url ? 30 : Math.round((t.duration_ms || 0) / 1000),
  album: t.album?.name || '',
});

/** Last.fm 曲目映射 — 无音频直链，依赖跨源回退 */
const mapLastfm = (t) => ({
  source: 'lastfm',
  trackId: t.mbid || (t.artist?.mbid + ':' + t.name),
  title: t.name,
  artist: typeof t.artist === 'string' ? t.artist : (t.artist?.name || ''),
  cover: (t.image || []).find(i => i.size === 'extralarge')?.['#text'] ||
         (t.image || []).slice(-1)[0]?.['#text'] || '',
  audioUrl: '', // Last.fm 无直链，触发跨源回退
  duration: +t.duration || 0,
});

/** MusicBrainz 曲目映射 — 无音频直链，作为元数据补全源 */
const mapMusicBrainz = (r) => ({
  source: 'musicbrainz',
  trackId: r.id,
  title: r.title,
  artist: (r['artist-credit'] || []).map(a => a.artist?.name || a.name || '').filter(Boolean).join(', '),
  cover: '',  // MusicBrainz 无封面（需额外请求 CAA），置空触发默认图标
  audioUrl: '', // 无直链，触发跨源回退
  duration: r.length ? Math.round(r.length / 1000) : 0,
});

/** JioSaavn 曲目映射 — 有完整播放 URL */
const mapJioSaavn = (s) => {
  // 下载链接：优先 320kbps > 160kbps > 96kbps
  const downloadUrls = s.downloadUrl || [];
  const best = downloadUrls.find(u => u.quality === '320kbps') ||
               downloadUrls.find(u => u.quality === '160kbps') ||
               downloadUrls[downloadUrls.length - 1];
  return {
    source: 'jiosaavn',
    trackId: s.id,
    title: s.name || s.title || '未知标题',
    artist: Array.isArray(s.artists?.primary)
      ? s.artists.primary.map(a => a.name).join(', ')
      : (s.primaryArtists || s.subtitle || ''),
    cover: s.image?.find?.(i => i.quality === '500x500')?.url ||
           (Array.isArray(s.image) ? s.image.slice(-1)[0]?.url : s.image) || '',
    audioUrl: best?.url || '',
    duration: +s.duration || 0,
  };
};

/** 网易云音乐曲目映射 */
const mapNetease = (s) => ({
  source: 'netease',
  trackId: String(s.id),
  title: s.name || '未知标题',
  artist: (s.ar || s.artists || []).map(a => a.name).join(', '),
  cover: (s.al || s.album)?.picUrl || (s.al || s.album)?.blurPicUrl || '',
  audioUrl: '', // 网易云无免费直链，触发跨源回退
  duration: s.dt ? Math.round(s.dt / 1000) : (s.duration || 0),
  album: (s.al || s.album)?.name || '',
});

/** QQ 音乐曲目映射 */
const mapQQMusic = (s) => {
 /* ─────────────── GD音乐台聚合源 · 通用 mapper ─────────────── */
// Meting 标准返回:{ id, name, artist:[], album, pic_id, url_id, lyric_id, source }
function mapGDStudio(s, subSource) {
  const artist = Array.isArray(s.artist) ? s.artist.join(', ') : (s.artist || '');
  // 封面经代理懒加载,避免 N+1 请求阻塞
  const cover = s.pic_id
    ? '/api/proxy/gdstudio?types=pic&source=' + subSource
        + '&id=' + encodeURIComponent(s.pic_id) + '&size=300'
    : '';
  return {
    source: 'gdstudio_' + subSource,
    trackId: subSource + ':' + s.url_id,
    title: s.name || '未知标题',
    artist,
    album: s.album || '',
    cover,
    // 播放时由代理解析真实直链
    audioUrl: '/api/proxy/gdurl?source=' + subSource
      + '&id=' + encodeURIComponent(s.url_id) + '&br=320',
    duration: 0,
    _gd: { sub: subSource, urlId: s.url_id, lyricId: s.lyric_id },
  };
}

function makeGDSource(subSource, label) {
  const key = 'gdstudio_' + subSource;
  return {
    label,
    search: async (q) => {
      const list = await get(
        'gdstudio?types=search&source=' + subSource
          + '&name=' + encodeURIComponent(q) + '&count=12&pages=1',
        key,
      );
      return (Array.isArray(list) ? list : []).map(s => mapGDStudio(s, subSource));
    },
    trending: async () => {
      // GD 无统一榜单接口,用一个热门关键词代替(可自定义)
      const list = await get(
        'gdstudio?types=search&source=' + subSource
          + '&name=' + encodeURIComponent('华语流行') + '&count=12&pages=1',
        key,
      );
      return (Array.isArray(list) ? list : []).map(s => mapGDStudio(s, subSource));
    },
  };
}

function buildGDSources() {
  return {
    gdstudio_netease: makeGDSource('netease', 'GD-网易云 · 华语主力'),
    gdstudio_kugou:   makeGDSource('kugou',   'GD-酷狗'),
    gdstudio_migu:    makeGDSource('migu',    'GD-咪咕'),
    gdstudio_baidu:   makeGDSource('baidu',   'GD-百度'),
    gdstudio_ytmusic: makeGDSource('ytmusic', 'GD-YouTube Music'),
    gdstudio_tidal:   makeGDSource('tidal',   'GD-Tidal · 高音质'),
    gdstudio_qobuz:   makeGDSource('qobuz',   'GD-Qobuz · 母带'),
  };
}
// ─────────────── 内置音源适配器 ───────────────
export const adapters = {
  jamendo: {
    label: 'Jamendo · 正版 CC 曲库',
    search:   async (q) => (((await get('jamendo/tracks/?format=json&limit=12&search=' + encodeURIComponent(q), 'jamendo')).results) || []).map(mapJamendo),
    trending: async ()  => (((await get('jamendo/tracks/?format=json&limit=12&order=popularity_week', 'jamendo')).results) || []).map(mapJamendo),
  },
  audius: {
    label: 'Audius · 独立音乐',
    search:   async (q) => (((await get('audius/tracks/search?query=' + encodeURIComponent(q), 'audius')).data) || []).slice(0, 12).map(mapAudius),
    trending: async ()  => (((await get('audius/tracks/trending?limit=12', 'audius')).data) || []).slice(0, 12).map(mapAudius),
  },
  archive: {
    label: 'Internet Archive · 公有领域',
    search: async (q) => {
      const j = await get('archive/advancedsearch.php?output=json&rows=12&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&q=' + encodeURIComponent(q + ' AND mediatype:(audio) AND format:(MP3)'), 'archive');
      return (((j || {}).response || {}).docs || []).map(mapArchive);
    },
  },
  // ─────────────── A类:官方稳定 API ───────────────
  spotify: {
    label: 'Spotify · 全球最大流媒体',
    search: async (q) => {
      const j = await get('spotify/search?q=' + encodeURIComponent(q) + '&type=track&limit=12&market=CN', 'spotify');
      return ((j.tracks || {}).items || []).map(mapSpotify);
    },
    trending: async () => {
      const j = await get('spotify/browse/new-releases?country=CN&limit=12', 'spotify');
      const albums = ((j.albums || {}).items || []);
      return albums.map((a) => ({
        source: 'spotify',
        trackId: a.id,
        title: a.name,
        artist: (a.artists || []).map(x => x.name).join(', '),
        cover: a.images?.[0]?.url || '',
        audioUrl: '',
        duration: 0,
        album: a.name,
      }));
    },
  },
  lastfm: {
    label: 'Last.fm · 全球音乐图谱',
    search:   async (q) => (((await get('lastfm?method=track.search&track=' + encodeURIComponent(q) + '&limit=12', 'lastfm')).results?.trackmatches?.track) || []).map(mapLastfm),
    trending: async ()  => (((await get('lastfm?method=chart.gettoptracks&limit=12', 'lastfm')).tracks?.track) || []).map(mapLastfm),
  },
  musicbrainz: {
    label: 'MusicBrainz · 开放音乐数据库',
    search: async (q) => ((await get('musicbrainz/recording?query=' + encodeURIComponent(q) + '&limit=12', 'musicbrainz')).recordings || []).map(mapMusicBrainz),
  },
  // ─────────────── B类:增强曲库 API ───────────────
  jiosaavn: {
    label: 'JioSaavn · 完整播放源',
    search:   async (q) => (((await get('jiosaavn/search/songs?query=' + encodeURIComponent(q) + '&limit=12', 'jiosaavn')).data?.results) || []).map(mapJioSaavn).filter(t => t.audioUrl),
    trending: async ()  => (((await get('jiosaavn/playlists?id=1134543960&limit=12', 'jiosaavn')).data?.songs) || []).map(mapJioSaavn).filter(t => t.audioUrl),
  },
  netease: {
    label: '网易云音乐 · 中文曲库(非官方)',
    search: async (q) => {
      const j = await get('netease/search?q=' + encodeURIComponent(q) + '&limit=12', 'netease');
      return ((j.result?.songs) || []).map(mapNetease);
    },
    trending: async () => {
      const j = await get('netease/trending', 'netease');
      const tracks = (j.result?.playlist?.tracks) || (j.playlist?.tracks) || [];
      return tracks.slice(0, 12).map(mapNetease);
    },
  },
  qqmusic: {
    label: 'QQ音乐 · 中文曲库(非官方)',
    search: async (q) => {
      const j = await get('qqmusic/search?q=' + encodeURIComponent(q) + '&num=12', 'qqmusic');
      const songs = (j.req_1?.data?.body?.song?.list) || [];
      return songs.map(mapQQMusic);
    },
    trending: async () => {
      const j = await get('qqmusic/trending', 'qqmusic');
      const songs = (j.songlist) || [];
      return songs.slice(0, 12).map(s => mapQQMusic(s.data || s));
    },
  },

  // ─────────────── C类:GD音乐台(免Key,华语主力)───────────────
  ...buildGDSources(),
};
// ─────────────── 内置音源适配器 ───────────────
export const adapters = {
  jamendo: {
    label: 'Jamendo · 正版 CC 曲库',
    search: async (q) => ((await get('jamendo/tracks/?format=json&limit=12&search=' + encodeURIComponent(q))).results || []).map(mapJamendo),
    trending: async () => ((await get('jamendo/tracks/?format=json&limit=12&order=popularity_week')).results || []).map(mapJamendo),
  },
  audius: {
    label: 'Audius · 独立音乐',
    search: async (q) => (((await get('audius/tracks/search?query=' + encodeURIComponent(q))).data) || []).slice(0, 12).map(mapAudius),
    trending: async () => (((await get('audius/tracks/trending?limit=12')).data) || []).slice(0, 12).map(mapAudius),
  },
  archive: {
    label: 'Internet Archive · 公有领域',
    search: async (q) => {
      const j = await get('archive/advancedsearch.php?output=json&rows=12&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&q=' + encodeURIComponent(q + ' AND mediatype:(audio) AND format:(MP3)'));
      return (((j || {}).response || {}).docs || []).map(mapArchive);
    },
  },

  // ─────────────── A类：官方稳定 API ───────────────

  spotify: {
    label: 'Spotify · 全球最大流媒体',
    search: async (q) => {
      const j = await get('spotify/search?q=' + encodeURIComponent(q) + '&type=track&limit=12&market=CN');
      return ((j.tracks || {}).items || []).map(mapSpotify);
    },
    trending: async () => {
      // Spotify 新发行专辑 → 取前12首代表曲
      const j = await get('spotify/browse/new-releases?country=CN&limit=12');
      const albums = ((j.albums || {}).items || []);
      return albums.map((a) => ({
        source: 'spotify',
        trackId: a.id,
        title: a.name,
        artist: (a.artists || []).map(x => x.name).join(', '),
        cover: a.images?.[0]?.url || '',
        audioUrl: '',
        duration: 0,
        album: a.name,
      }));
    },
  },

  lastfm: {
    label: 'Last.fm · 全球音乐图谱',
    search: async (q) => {
      const j = await get('lastfm?method=track.search&track=' + encodeURIComponent(q) + '&limit=12');
      return ((j.results?.trackmatches?.track) || []).map(mapLastfm);
    },
    trending: async () => {
      const j = await get('lastfm?method=chart.gettoptracks&limit=12');
      return ((j.tracks?.track) || []).map(mapLastfm);
    },
  },

  musicbrainz: {
    label: 'MusicBrainz · 开放音乐数据库',
    search: async (q) => {
      const j = await get('musicbrainz/recording?query=' + encodeURIComponent(q) + '&limit=12');
      return (j.recordings || []).map(mapMusicBrainz);
    },
    // MusicBrainz 无热榜，不提供 trending
  },

  // ─────────────── B类：增强曲库 API ───────────────

  jiosaavn: {
    label: 'JioSaavn · 完整播放源',
    search: async (q) => {
      const j = await get('jiosaavn/search/songs?query=' + encodeURIComponent(q) + '&limit=12');
      return ((j.data?.results) || []).map(mapJioSaavn).filter(t => t.audioUrl);
    },
    trending: async () => {
      // JioSaavn 印度热榜
      const j = await get('jiosaavn/playlists?id=1134543960&limit=12');
      return ((j.data?.songs) || []).map(mapJioSaavn).filter(t => t.audioUrl);
    },
  },

  netease: {
    label: '网易云音乐 · 中文曲库（非官方）',
    search: async (q) => {
      const j = await get('netease/search?q=' + encodeURIComponent(q) + '&limit=12');
      const songs = (j.result?.songs) || [];
      return songs.map(mapNetease);
    },
    trending: async () => {
      const j = await get('netease/trending');
      // 飙升榜歌曲列表
      const tracks = (j.result?.playlist?.tracks) || (j.playlist?.tracks) || [];
      return tracks.slice(0, 12).map(mapNetease);
    },
  },

  qqmusic: {
    label: 'QQ音乐 · 中文曲库（非官方）',
    search: async (q) => {
      const j = await get('qqmusic/search?q=' + encodeURIComponent(q) + '&num=12');
      const songs = (j.req_1?.data?.body?.song?.list) || [];
      return songs.map(mapQQMusic);
    },
    trending: async () => {
      const j = await get('qqmusic/trending');
      // QQ 热歌榜
      const songs = (j.songlist) || [];
      return songs.slice(0, 12).map(s => mapQQMusic(s.data || s));
    },
  },
};

const SRC_KEY = 'airbeat:sources';
export function getSourceConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(SRC_KEY)) || {};
    return { disabled: c.disabled || [], custom: c.custom || [] };
  } catch {
    return { disabled: [], custom: [] };
  }
}
export function saveSourceConfig(cfg) {
  localStorage.setItem(SRC_KEY, JSON.stringify(cfg));
}

function pick(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function buildCustomAdapter(c) {
  return {
    label: c.name + ' · 自定义',
    custom: true,
    search: async (q, page = 1) => {
      let url = c.searchUrl.replaceAll('{q}', encodeURIComponent(q));
      // 分页：支持 {page} 和 {offset}（offset=(page-1)*limit）
      if (c.limit) {
        const limit = +c.limit || 20;
        url = url.replaceAll('{page}', String(page)).replaceAll('{limit}', String(limit)).replaceAll('{offset}', String((page - 1) * limit));
      }
      const headers = {};
      if (c.headers) {
        for (const line of c.headers.split(/\n/)) {
          const i = line.indexOf(':');
          if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
      }
      const r = await fetch('/api/proxy/stream?url=' + encodeURIComponent(url), { headers: Object.keys(headers).length ? headers : undefined });
      if (!r.ok) throw new Error('custom ' + r.status);
      const j = await r.json();
      const list = c.listPath ? pick(j, c.listPath) : j;
      return (Array.isArray(list) ? list : []).slice(0, c.limit ? +c.limit : 20).map((it, i) => ({
        source: 'custom:' + c.id,
        trackId: pick(it, c.idField) != null ? pick(it, c.idField) : i,
        title: pick(it, c.titleField) || '未知标题',
        artist: pick(it, c.artistField) || '',
        cover: pick(it, c.coverField) || '',
        audioUrl: pick(it, c.audioField) || '',
        duration: +pick(it, c.durationField) || 0,
      })).filter((t) => t.audioUrl);
    },
    // 榜单支持
    trending: c.chartUrl ? (async () => {
      let url = c.chartUrl;
      const headers = {};
      if (c.headers) {
        for (const line of c.headers.split(/\n/)) {
          const i = line.indexOf(':');
          if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
      }
      const r = await fetch('/api/proxy/stream?url=' + encodeURIComponent(url), { headers: Object.keys(headers).length ? headers : undefined });
      if (!r.ok) throw new Error('custom chart ' + r.status);
      const j = await r.json();
      const list = c.chartListPath ? pick(j, c.chartListPath) : j;
      return (Array.isArray(list) ? list : []).slice(0, 20).map((it, i) => ({
        source: 'custom:' + c.id,
        trackId: pick(it, c.idField) != null ? pick(it, c.idField) : i,
        title: pick(it, c.titleField) || '未知标题',
        artist: pick(it, c.artistField) || '',
        cover: pick(it, c.coverField) || '',
        audioUrl: pick(it, c.audioField) || '',
        duration: +pick(it, c.durationField) || 0,
      })).filter((t) => t.audioUrl);
    }) : null,
  };
}

export function allSources() {
  const map = { ...adapters };
  for (const c of getSourceConfig().custom) {
    if (c.type === 'subsonic') {
      const sub = buildSubsonicAdapter(c);
      if (sub) map['subsonic'] = sub;
    } else {
      map['custom:' + c.id] = buildCustomAdapter(c);
    }
  }
  return map;
}

export function enabledSources() {
  const disabled = getSourceConfig().disabled;
  const all = allSources();
  return Object.keys(all).filter((k) => !disabled.includes(k) && !isSourceDisabled(k));
}

export async function searchAll(q) {
  const all = allSources();
  const names = enabledSources().filter((n) => all[n].search);
  const settled = await Promise.allSettled(names.map((n) => all[n].search(q)));
  return names.map((n, i) => ({ source: n, label: all[n].label, tracks: settled[i].status === 'fulfilled' ? settled[i].value : [] }));
}

export async function discover() {
  const all = allSources();
  const names = enabledSources().filter((n) => all[n].trending);
  const settled = await Promise.allSettled(names.map((n) => all[n].trending()));
  return names.map((n, i) => ({ source: n, label: all[n].label, tracks: settled[i].status === 'fulfilled' ? settled[i].value : [] }));
}

export async function radioTop() {
  return ((await get('radio/stations/topvote/24')) || []).map(mapRadio);
}
export async function radioSearch(q) {
  return ((await get('radio/stations/search?limit=24&hidebroken=true&name=' + encodeURIComponent(q))) || []).map(mapRadio);
}

export async function resolveAudio(t) {
  if (t.audioUrl) return t.audioUrl;
  if (t.source === 'archive') {
    const meta = await get('archive/metadata/' + encodeURIComponent(t.trackId));
    const files = meta.files || [];
    const f = files.find((x) => /\.mp3$/i.test(x.name)) || files.find((x) => /\.(ogg|flac|wav)$/i.test(x.name));
    if (f) {
      t.audioUrl = 'https://archive.org/download/' + t.trackId + '/' + encodeURIComponent(f.name);
      return t.audioUrl;
    }
  }
  return '';
}

// 同曲跨源回退：歌名标准化（去括号、去标点、转小写）
function normalizeTitle(s) {
  return String(s || '').toLowerCase()
    .replace(/[\(\[（].*?[\)\]）]/g, '')   // 去掉括号内容（feat / remix 等）
    .replace(/[^a-z0-9一-鿿]/g, '') // 只保留字母数字和中文
    .trim();
}

// 每日推荐：基于播放历史的歌手/标签频次
export function dailyRecommend(history, n = 12) {
  if (!history || !history.length) return [];
  // 统计歌手频次
  const freq = {};
  for (const h of history) {
    const artist = (h.artist || '') + ''; // 确保字符串
    if (artist) freq[artist] = (freq[artist] || 0) + 1;
  }
  // 排序取 top 5 歌手
  const topArtists = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
  // 从历史中构建推荐种子（去重），扩展到 n 首
  const seen = new Set();
  const recs = [];
  for (const [artist] of topArtists) {
    const byArtist = history.filter((h) => h.artist === artist);
    for (const h of byArtist) {
      const k = h.source + ':' + h.trackId;
      if (!seen.has(k)) { seen.add(k); recs.push(h); }
      if (recs.length >= n) return recs;
    }
  }
  // 不够用历史补
  for (const h of history) {
    const k = h.source + ':' + h.trackId;
    if (!seen.has(k)) { seen.add(k); recs.push(h); }
    if (recs.length >= n) return recs;
  }
  return recs;
}

/** 在当前音源外的已启用音源中，搜索同名完整版（优先时长最长） */
export async function findAlternative(track) {
  const all = allSources();
  // 优先在有直链的音源中找（排除 lastfm / musicbrainz / netease / qqmusic 这些无直链源）
  const NO_AUDIO_SOURCES = new Set(['lastfm', 'musicbrainz', 'netease', 'qqmusic']);
  const enabled = enabledSources().filter((k) => k !== track.source && !NO_AUDIO_SOURCES.has(k));
  if (!enabled.length) return null;
  const q = (track.title || '') + ' ' + (track.artist || '');
  const settled = await Promise.allSettled(
    enabled.map((k) => (all[k].search ? all[k].search(q) : Promise.resolve([]))),
  );
  const titleNorm = normalizeTitle(track.title);
  if (!titleNorm) return null;
  const candidates = [];
  for (let i = 0; i < enabled.length; i++) {
    if (settled[i].status !== 'fulfilled') continue;
    for (const t of settled[i].value) {
      if (!t.audioUrl) continue;
      const tNorm = normalizeTitle(t.title);
      if (tNorm === titleNorm || (titleNorm.length >= 4 && tNorm.includes(titleNorm)) || (tNorm.length >= 4 && titleNorm.includes(tNorm))) {
        candidates.push(t);
      }
    }
  }
  // 优先取时长最长的（完整版 > 试听片段）
  candidates.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  return candidates[0] || null;
}

export async function fetchLyrics(t) {
  try {
    const list = await get('lrclib/search?track_name=' + encodeURIComponent(t.title || '') + '&artist_name=' + encodeURIComponent(t.artist || ''));
    const hit = (list || []).find((x) => x.syncedLyrics);
    return hit ? hit.syncedLyrics : null;
  } catch {
    return null;
  }
}
