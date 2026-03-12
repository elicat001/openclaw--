import { eq, sql, and, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { jobs, reports, schedules } from "@/db/schema";

export async function GET() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalJobs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(gte(jobs.createdAt, weekAgo));

  const [runningJobs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(eq(jobs.status, "running"));

  const [totalReports] = await db.select({ count: sql<number>`count(*)` }).from(reports);

  const [activeSchedules] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schedules)
    .where(eq(schedules.enabled, true));

  return NextResponse.json({
    jobsThisWeek: totalJobs?.count || 0,
    runningJobs: runningJobs?.count || 0,
    totalReports: totalReports?.count || 0,
    activeSchedules: activeSchedules?.count || 0,
  });
}
