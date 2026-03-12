import { CronExpressionParser } from "cron-parser";
import { desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { schedules } from "@/db/schema";

export async function GET() {
  const result = await db.select().from(schedules).orderBy(desc(schedules.createdAt));
  return NextResponse.json({ schedules: result });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, type, params, cronExpr } = body;

  if (!name || !type || !params || !cronExpr) {
    return NextResponse.json({ error: "name, type, params, cronExpr required" }, { status: 400 });
  }

  // Validate cron expression
  try {
    CronExpressionParser.parse(cronExpr);
  } catch {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  const id = nanoid();
  const interval = CronExpressionParser.parse(cronExpr);
  const nextRun = interval.next().toDate();

  await db.insert(schedules).values({
    id,
    name,
    type,
    params: JSON.stringify(params),
    cronExpr,
    enabled: true,
    nextRunAt: nextRun,
    createdAt: new Date(),
  });

  return NextResponse.json({ id }, { status: 201 });
}
