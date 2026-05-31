const BILI_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com/", Origin: "https://www.bilibili.com",
};

function er(m: string, s = 500): Response { return new Response(JSON.stringify({ error: m }), { s, headers: { "Content-Type": "application/json" } } as ResponseInit); }

export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url); const targetUrl = url.searchParams.get("url");
  if (!targetUrl?.trim()) return er("url is required", 400);
  try {
    const resp = await fetch(targetUrl, { headers: BILI_HEADERS });
    if (!resp.ok) return er(`Upstream returned ${resp.status}`, 502);
    const headers = new Headers({ "Access-Control-Allow-Origin": "*" });
    headers.set("Content-Type", resp.headers.get("Content-Type") || "audio/mp4");
    const cl = resp.headers.get("Content-Length"); if (cl) headers.set("Content-Length", cl);
    headers.set("Accept-Ranges", "bytes");
    return new Response(resp.body, { status: 200, headers });
  } catch (err) { console.error("bili proxy error:", err); return er(String(err), 502); }
};
