import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { createAndStartJob } from "@/lib/job-runner";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  let query = db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit);

  if (status) {
    query = query.where(eq(jobs.status, status)) as typeof query;
  }
  if (type) {
    query = query.where(eq(jobs.type, type)) as typeof query;
  }

  const result = await query;
  return NextResponse.json({ jobs: result });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { type, params } = body;

  if (!type || !params) {
    return NextResponse.json({ error: "type and params required" }, { status: 400 });
  }

  if (!["crawl", "discover", "pipeline"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const id = await createAndStartJob(type, params);
  return NextResponse.json({ id, status: "pending" }, { status: 201 });
}
