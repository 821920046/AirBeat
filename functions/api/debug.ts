interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }

export const onRequestGet = async ({ env }: { env: Env }) => {
  let keys: string[] = [];
  try { const raw = await env.CACHE.get("api_keys"); if (raw) keys = JSON.parse(raw); } catch {}
  if (keys.length === 0 && env.OPENROUTER_API_KEY) keys = [env.OPENROUTER_API_KEY];
  if (keys.length === 0) return new Response(JSON.stringify({ error: "no keys" }), { headers: { "Content-Type": "application/json" } });

  const key = keys[0];
  const models = [
    "deepseek/deepseek-v4-flash:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-4-26b-a4b-it:free",
    "moonshotai/kimi-k2.6:free",
    "openai/gpt-oss-20b:free",
    "qwen/qwen3-coder:free",
  ];

  const results: Array<{ model: string; status: number; ok: boolean; body: string }> = [];
  for (const model of models) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": "https://airbeat-8mo.pages.dev", "X-Title": "AirBeat" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "say hi" }], max_tokens: 10 }),
      });
      const body = await resp.text();
      results.push({ model, status: resp.status, ok: resp.ok, body: body.slice(0, 150) });
    } catch (err) {
      results.push({ model, status: 0, ok: false, body: String(err) });
    }
  }
  return new Response(JSON.stringify({ results }, null, 2), { headers: { "Content-Type": "application/json" } });
};
