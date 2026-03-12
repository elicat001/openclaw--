/**
 * In-process scheduler — runs inside the Next.js server.
 * Loads enabled schedules from DB, registers setTimeout timers,
 * and creates jobs when timers fire.
 */
import { CronExpressionParser } from "cron-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { createAndStartJob } from "./job-runner";

class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    console.log("[scheduler] Initializing...");
    const active = await db.select().from(schedules).where(eq(schedules.enabled, true));

    for (const s of active) {
      this.register(s);
    }
    console.log(`[scheduler] Registered ${active.length} schedules`);
  }

  register(schedule: { id: string; cronExpr: string; type: string; params: string }) {
    this.unregister(schedule.id);

    try {
      const interval = CronExpressionParser.parse(schedule.cronExpr);
      const next = interval.next().toDate();
      const delay = next.getTime() - Date.now();

      if (delay < 0) {
        // Next run is in the past (shouldn't happen but be safe)
        this.scheduleNext(schedule);
        return;
      }

      console.log(
        `[scheduler] ${schedule.id}: next run at ${next.toISOString()} (in ${Math.round(delay / 60000)}min)`,
      );

      // Update nextRunAt in DB
      db.update(schedules).set({ nextRunAt: next }).where(eq(schedules.id, schedule.id)).run();

      const timer = setTimeout(async () => {
        console.log(`[scheduler] Firing ${schedule.id}`);
        try {
          const params = JSON.parse(schedule.params);
          await createAndStartJob(schedule.type, params, schedule.id);

          // Update lastRunAt
          await db
            .update(schedules)
            .set({ lastRunAt: new Date() })
            .where(eq(schedules.id, schedule.id));
        } catch (err) {
          console.error(`[scheduler] Error firing ${schedule.id}:`, err);
        }

        // Schedule next execution
        this.scheduleNext(schedule);
      }, delay);

      this.timers.set(schedule.id, timer);
    } catch (err) {
      console.error(`[scheduler] Invalid cron for ${schedule.id}:`, err);
    }
  }

  private scheduleNext(schedule: { id: string; cronExpr: string; type: string; params: string }) {
    // Re-register to compute the next firing time
    this.register(schedule);
  }

  unregister(scheduleId: string) {
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }
  }

  /** Call when a schedule is created, updated, or toggled */
  async reload(scheduleId: string) {
    const [s] = await db.select().from(schedules).where(eq(schedules.id, scheduleId));
    if (!s || !s.enabled) {
      this.unregister(scheduleId);
    } else {
      this.register(s);
    }
  }
}

export const scheduler = new Scheduler();
