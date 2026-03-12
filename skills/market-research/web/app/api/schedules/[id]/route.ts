import { CronExpressionParser } from "cron-parser";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { schedules } from "@/db/schema";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if (body.params !== undefined) updates.params = JSON.stringify(body.params);
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  if (body.cronExpr !== undefined) {
    try {
      CronExpressionParser.parse(body.cronExpr);
      updates.cronExpr = body.cronExpr;
      const interval = CronExpressionParser.parse(body.cronExpr);
      updates.nextRunAt = interval.next().toDate();
    } catch {
      return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
    }
  }

  await db.update(schedules).set(updates).where(eq(schedules.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(schedules).where(eq(schedules.id, id));
  return NextResponse.json({ ok: true });
}
