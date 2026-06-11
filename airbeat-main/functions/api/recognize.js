import { json } from './_utils.js';

export async function onRequestPost({ request, env }) {
  if (!env.AUDD_KEY) {
    return json({ error: '识曲服务未配置:请在 Cloudflare 环境变量中设置 AUDD_KEY(可在 audd.io 免费申请)' }, 501);
  }
  const form = await request.formData().catch(() => null);
  const file = form && form.get('file');
  if (!file) return json({ error: '缺少音频文件' }, 400);

  const fd = new FormData();
  fd.set('api_token', env.AUDD_KEY);
  fd.set('file', file);
  fd.set('return', 'apple_music,deezer');
  const res = await fetch('https://api.audd.io/', { method: 'POST', body: fd });
  const out = await res.json().catch(() => ({}));

  if (out.status === 'success' && out.result) {
    const r = out.result;
    const cover =
      (r.apple_music && r.apple_music.artwork && r.apple_music.artwork.url
        ? r.apple_music.artwork.url.replace('{w}x{h}', '600x600')
        : '') ||
      (r.deezer && r.deezer.album ? r.deezer.album.cover_xl : '') || '';
    return json({ title: r.title, artist: r.artist, album: r.album || '', cover });
  }
  return json({ error: '未能识别出歌曲,请靠近声源换个片段再试' }, 404);
}
