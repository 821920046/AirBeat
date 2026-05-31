interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export const onRequestOptions = () => new Response(null, { headers: CORS });

// 测试端点：检查从浏览器直接调 B站 API 是否可行
export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const test = url.searchParams.get("test") || "nav";

  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  if (test === "nav") {
    // 测试 B站 nav API 是否返回 CORS 头
    try {
      const resp = await fetch("https://api.bilibili.com/x/web-interface/nav", {
        headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/" },
      });
      const acao = resp.headers.get("Access-Control-Allow-Origin");
      const status = resp.status;
      const body = await resp.text();
      return new Response(JSON.stringify({ status, cors: acao, body: body.slice(0, 300) }, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ error: "unknown test" }), { headers: { ...CORS, "Content-Type": "application/json" } });
};
