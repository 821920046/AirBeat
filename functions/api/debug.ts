interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }

export const onRequestGet = async ({ env }: { env: Env }) => {
  // 读取 key 池
  let keys: string[] = [];
  try { const raw = await env.CACHE.get("api_keys"); if (raw) keys = JSON.parse(raw); } catch {}
  if (keys.length === 0 && env.OPENROUTER_API_KEY) keys = [env.OPENROUTER_API_KEY];
  
  const model = env.OPENROUTER_MODEL || "qwen/qwen3-coder:free";
  const results: Array<{ index: number; keyPrefix: string; status: number; body: string }> = [];

  // 测试前 3 个 key
  for (let i = 0; i < Math.min(3, keys.length); i++) {
    const key = keys[i];
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": "https://airbeat-8mo.pages.dev", "X-Title": "AirBeat" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 10 }),
      });
      const body = await resp.text();
      results.push({ index: i + 1, keyPrefix: key.slice(0, 15) + "...", status: resp.status, body: body.slice(0, 200) });
    } catch (err) {
      results.push({ index: i + 1, keyPrefix: key.slice(0, 15) + "...", status: 0, body: String(err) });
    }
  }

  return new Response(JSON.stringify({ model, keyCount: keys.length, results }, null, 2), { headers: { "Content-Type": "application/json" } });
};
