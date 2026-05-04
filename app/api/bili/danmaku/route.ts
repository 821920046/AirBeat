import { NextRequest } from "next/server";
import { getVideoInfo, getDanmaku } from "@/app/lib/bili";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const bvid = req.nextUrl.searchParams.get("bvid")?.trim();

  if (!bvid) {
    return Response.json({ error: "bvid is required" }, { status: 400 });
  }

  try {
    const { cid } = await getVideoInfo(bvid);
    const danmaku = await getDanmaku(cid);
    return Response.json({ bvid, cid, danmaku });
  } catch (err) {
    return Response.json(
      { error: String(err), bvid, danmaku: [] },
      { status: 502 }
    );
  }
}
