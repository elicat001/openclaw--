import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ── Jobs: every crawl/discover/pipeline execution ──

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "crawl" | "discover" | "pipeline"
  status: text("status").notNull().default("pending"), // "pending" | "running" | "done" | "failed" | "cancelled"
  params: text("params").notNull(), // JSON blob
  outputDir: text("output_dir"),
  reportId: text("report_id"),
  error: text("error"),
  progress: integer("progress").default(0), // 0-100
  currentStep: text("current_step"),
  logPath: text("log_path"),
  scheduleId: text("schedule_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ── Reports: generated markdown analysis reports ──

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  type: text("type").notNull(), // "market-analysis" | "opportunity" | "discovery"
  title: text("title").notNull(),
  keyword: text("keyword"),
  category: text("category"),
  content: text("content").notNull(), // Full markdown
  summary: text("summary"), // JSON: { verdict, marginPct, blueOcean, ... }
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Products: denormalized crawl results ──

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id").notNull(),
  platform: text("platform").notNull(), // "amazon-us" | "amazon-br" | "meli"
  name: text("name").notNull(),
  price: real("price"),
  currency: text("currency").default("BRL"),
  rating: real("rating"),
  reviews: integer("reviews"),
  link: text("link"),
  imageUrl: text("image_url"),
  keyword: text("keyword"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Schedules: cron-like recurring jobs ──

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "crawl" | "discover" | "pipeline"
  params: text("params").notNull(), // JSON
  cronExpr: text("cron_expr").notNull(), // e.g. "0 3 * * *"
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Type exports
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type Product = typeof products.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
