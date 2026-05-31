import { jsonResponse, errorResponse, CORS_HEADERS, handleOptions } from "../../_lib/cors";
import { insertTrack } from "../../_lib/db";
import type { Env } from "../../_lib/types";

export const onRequestOptions = ({ request }: { request: Request }) => handleOptions(request);

function sanitizeFilename(s: string): string {
  return s
    .replace(/[-|]/g, "_")
    .replace(/[【】「」:\/\\*?"<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export const onRequestPost = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const title = (formData.get("title") as string) || "untitled";
    const author = (formData.get("author") as string) || "";
    const bvid = (formData.get("bvid") as string) || undefined;

    if (!file || !(file instanceof File)) {
      return errorResponse("file is required", 400);
    }

    const ts = Date.now();
    const safeTitle = sanitizeFilename(title);
    const r2Key = `audio/${ts}_${safeTitle}.mp3`;

    // 上传到 R2
    const arrayBuffer = await file.arrayBuffer();
    await env.AUDIO_BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: "audio/mpeg" },
    });

    // 写入 D1
    const track = await insertTrack(env, {
      title,
      author,
      bvid,
      r2_key: r2Key,
      file_size: arrayBuffer.byteLength,
    });

    return jsonResponse(track);
  } catch (err) {
    console.error("upload error:", err);
    return errorResponse(String(err), 500);
  }
};
