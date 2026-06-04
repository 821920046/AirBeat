/**
 * Cloudflare Pages Function for /api/bili/proxy
 * Proxies Bilibili audio/video streams with proper CORS and headers.
 */

const BILI_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com/",
  Origin: "https://www.bilibili.com",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
};

export const onRequestOptions = () => {
  return new Response(null, { headers: CORS });
};

export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl?.trim()) {
    return new Response(
      JSON.stringify({ error: "url parameter is required" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  try {
    const resp = await fetch(targetUrl, { headers: BILI_HEADERS });

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream returned ${resp.status}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const headers = new Headers(CORS);
    headers.set("Content-Type", resp.headers.get("Content-Type") || "audio/mp4");
    const contentLength = resp.headers.get("Content-Length");
    if (contentLength) headers.set("Content-Length", contentLength);
    headers.set("Accept-Ranges", "bytes");

    return new Response(resp.body, { status: 200, headers });
  } catch (err) {
    console.error("bili proxy error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
};
