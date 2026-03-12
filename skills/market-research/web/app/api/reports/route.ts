import { desc, like } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reports } from "@/db/schema";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  let query = db
    .select({
      id: reports.id,
      jobId: reports.jobId,
      type: reports.type,
      title: reports.title,
      keyword: reports.keyword,
      category: reports.category,
      summary: reports.summary,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .orderBy(desc(reports.createdAt))
    .limit(limit);

  if (search) {
    query = query.where(like(reports.title, `%${search}%`)) as typeof query;
  }

  const result = await query;
  return NextResponse.json({ reports: result });
}
