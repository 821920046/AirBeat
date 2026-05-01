import { NextRequest } from "next/server";
import { searchVideos } from "@/app/lib/bili";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get("keyword")?.trim();
  const page = Number(req.nextUrl.searchParams.get("page")) || 1;

  if (!keyword) {
    return Response.json({ error: "keyword is required" }, { status: 400 });
  }

  try {
    const result = await searchVideos(keyword, page);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: String(err), total: 0, videos: [] },
      { status: 502 }
    );
  }
}
