import { NextRequest } from "next/server";
import { scanTracks } from "@/app/lib/tracks";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 20;

  const all = await scanTracks();
  const tracks = q
    ? all.filter((t) => {
        const hay = `${t.title} ${t.author} ${t.filename}`.toLowerCase();
        return hay.includes(q);
      })
    : all;

  const result = tracks.slice(0, limit);

  return Response.json({ total: result.length, tracks: result });
}
