export async function onRequestPost({ request }) {
  try {
    const { url } = await request.json();
    if (!url) return new Response(JSON.stringify({ error: '请提供歌单链接' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    
    let id = '';
    let platform = '';
    
    // 网易云
    const neteaseMatch = url.match(/playlist\?id=(\d+)/) || url.match(/playlist\/(\d+)/);
    if (neteaseMatch) {
      id = neteaseMatch[1];
      platform = 'netease';
    }
    
    // QQ音乐
    const qqMatch = url.match(/playlist\/(\d+)/) || url.match(/disstid=(\d+)/) || url.match(/id=(\d+)/) || url.match(/playlist\/([a-zA-Z0-9_]+)/);
    if (!platform && (url.includes('qq.com') || url.includes('y.qq.com')) && qqMatch) {
      id = qqMatch[1];
      platform = 'qq';
    }
    
    if (!platform || !id) {
      // 兼容直接输入纯数字作为网易云歌单ID
      if (/^\d+$/.test(url.trim())) {
        id = url.trim();
        platform = 'netease';
      } else {
        return new Response(JSON.stringify({ error: '未能识别的歌单链接（仅支持网易云和QQ音乐公开歌单链接，或直接输入网易云歌单ID）' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }
    
    if (platform === 'netease') {
      const apiUrl = `https://music.163.com/api/v1/playlist/detail?id=${id}`;
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://music.163.com/'
        }
      });
      if (!res.ok) throw new Error('网易云接口请求失败');
      const data = await res.json();
      const pl = data.playlist || {};
      const songs = (pl.tracks || []).map(t => ({
        source: 'netease',
        trackId: String(t.id),
        title: t.name,
        artist: (t.ar || []).map(a => a.name).join(' / '),
        cover: t.al ? t.al.picUrl : '',
        audioUrl: '', // 留空，播放时依靠跨源回退
        duration: Math.round(t.dt / 1000) || 0
      }));
      return new Response(JSON.stringify({ name: pl.name || '网易云导入歌单', songs }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (platform === 'qq') {
      const apiUrl = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${id}&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`;
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://y.qq.com/'
        }
      });
      if (!res.ok) throw new Error('QQ音乐接口请求失败');
      const data = await res.json();
      const cd = (data.cdlist || [])[0] || {};
      const songs = (cd.songlist || []).map(t => ({
        source: 'qqmusic',
        trackId: String(t.songmid || t.songid),
        title: t.songname,
        artist: (t.singer || []).map(s => s.name).join(' / '),
        cover: t.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${t.albummid}.jpg` : '',
        audioUrl: '',
        duration: t.interval || 0
      }));
      return new Response(JSON.stringify({ name: cd.dissname || 'QQ音乐导入歌单', songs }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || '解析失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
