interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }

function jr(d: unknown, s = 200): Response { return new Response(JSON.stringify(d), { s, headers: { "Content-Type": "application/json" } } as ResponseInit); }

// GET /api/keys — 查看当前 key 数量
export const onRequestGet = async ({ env }: { env: Env }) => {
  try {
    const raw = await env.CACHE.get("api_keys");
    const keys: string[] = raw ? JSON.parse(raw) : [];
    return jr({ count: keys.length, keys: keys.map((k, i) => `${i + 1}. ${k.slice(0, 12)}...`) });
  } catch { return jr({ count: 0, keys: [] }); }
};

// POST /api/keys — 批量设置 key 池
// body: { keys: ["sk-or-xxx", "sk-or-yyy"] }
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  try {
    const body = (await request.json()) as { keys?: unknown };
    if (!Array.isArray(body.keys) || body.keys.length === 0) return jr({ error: "keys must be a non-empty array" }, 400);
    const keys = (body.keys as unknown[]).filter((k): k is string => typeof k === "string" && k.length > 0);
    if (keys.length === 0) return jr({ error: "no valid keys provided" }, 400);
    await env.CACHE.put("api_keys", JSON.stringify(keys));
    return jr({ success: true, count: keys.length, message: `已设置 ${keys.length} 个 API key` });
  } catch (err) { return jr({ error: String(err) }, 500); }
};

// DELETE /api/keys — 清空 key 池
export const onRequestDelete = async ({ env }: { env: Env }) => {
  await env.CACHE.delete("api_keys");
  return jr({ success: true, message: "已清空 key 池，将使用环境变量 fallback" });
};
