/** Pages Functions 全局中间件 — 处理 CORS */
export async function onRequest(context: {
  request: Request;
  next: () => Promise<Response>;
}) {
  // 处理 OPTIONS 预检
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
      },
    });
  }

  const response = await context.next();

  // 给所有响应加 CORS 头
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

  return response;
}
