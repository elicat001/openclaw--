import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { cancelJob } from "@/lib/job-runner";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await cancelJob(id);
  if (!ok) {
    return NextResponse.json({ error: "Cannot cancel job" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
