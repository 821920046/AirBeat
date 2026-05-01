import { NextRequest } from "next/server";
import { createReadStream, statSync } from "fs";
import { resolveMusicPath } from "@/app/lib/tracks";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const relativePath = segments.map(decodeURIComponent).join("/");
  const fullPath = resolveMusicPath(relativePath);

  if (!fullPath) {
    return new Response("forbidden", { status: 403 });
  }

  let fileStat;
  try {
    fileStat = statSync(fullPath);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const range = req.headers.get("range");
  const total = fileStat.size;

  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : total - 1;
      const chunkSize = end - start + 1;

      const stream = createReadStream(fullPath, { start, end });
      const webStream = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk: string | Buffer) => controller.enqueue(chunk));
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
        },
        cancel() {
          stream.destroy();
        },
      });

      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(chunkSize),
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  const stream = createReadStream(fullPath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: string | Buffer) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new Response(webStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
    },
  });
}
