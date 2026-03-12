/**
 * Job runner — manages job lifecycle, progress tracking, and SSE events.
 * Concurrent limit: 1 crawl job at a time (Camoufox is resource-intensive).
 */
import { EventEmitter } from "events";
import { existsSync, readFileSync, readdirSync, appendFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { jobs, reports, products } from "@/db/schema";
import { runCrawl, runDiscover, runOpportunity, type ScriptHandle } from "./scripts";

export type ProgressEvent = {
  jobId: string;
  progress: number;
  step: string;
  line: string;
  done?: boolean;
  error?: string;
  reportId?: string;
};

// In-memory event emitters for SSE streaming (one per active job)
const jobEmitters = new Map<string, EventEmitter>();
// Job queue for concurrency control
const jobQueue: string[] = [];
let runningJobId: string | null = null;

export function getJobEmitter(jobId: string): EventEmitter {
  if (!jobEmitters.has(jobId)) {
    jobEmitters.set(jobId, new EventEmitter());
  }
  return jobEmitters.get(jobId)!;
}

function emitProgress(jobId: string, event: Partial<ProgressEvent>) {
  const emitter = jobEmitters.get(jobId);
  if (emitter) {
    emitter.emit("progress", { jobId, progress: 0, step: "", line: "", ...event });
  }
}

// ── Progress parsing from stdout ──

function parseProgress(
  jobType: string,
  line: string,
  currentProgress: number,
): { progress: number; step: string } {
  if (jobType === "discover") {
    // Bestseller crawl
    if (line.includes("Step 1:")) return { progress: 5, step: "爬取 Bestseller" };
    if (line.includes("Got") && line.includes("bestseller"))
      return { progress: 15, step: "Bestseller 完成" };
    // Keyword extraction
    if (line.includes("Step 2:")) return { progress: 18, step: "提取关键词" };
    if (line.includes("Extracted")) return { progress: 20, step: "关键词提取完成" };
    // Per-keyword analysis [i/n]
    const kwMatch = line.match(/\[(\d+)\/(\d+)\]/);
    if (kwMatch) {
      const [, i, n] = kwMatch;
      const pct = 20 + (parseInt(i) / parseInt(n)) * 75;
      return { progress: Math.round(pct), step: `分析关键词 ${i}/${n}` };
    }
    // Report
    if (line.includes("Step 4:")) return { progress: 96, step: "生成报告" };
    if (line.includes("Report written")) return { progress: 100, step: "完成" };
  }

  if (jobType === "crawl") {
    // Phase 1 search pages
    if (line.includes("Phase 1:"))
      return { progress: Math.min(currentProgress + 5, 30), step: "搜索页爬取" };
    if (line.includes("Phase 2:"))
      return { progress: Math.min(currentProgress + 10, 55), step: "详情页爬取" };
    if (line.includes("Done:"))
      return { progress: Math.min(currentProgress + 15, 60), step: "爬取完成" };
    // Pipeline stages
    if (line.includes("Cleaning")) return { progress: 65, step: "数据清洗" };
    if (line.includes("Analyzing")) return { progress: 75, step: "市场分析" };
    if (line.includes("Opportunity")) return { progress: 85, step: "选品分析" };
    if (line.includes("Report written")) return { progress: 100, step: "完成" };
  }

  return { progress: currentProgress, step: "" };
}

// ── Job execution ──

async function executeJob(jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job || job.status === "cancelled") {
    processQueue();
    return;
  }

  const params = JSON.parse(job.params);
  let handle: ScriptHandle;

  try {
    if (job.type === "crawl") {
      handle = runCrawl(params);
    } else if (job.type === "discover") {
      handle = runDiscover(params);
    } else if (job.type === "pipeline") {
      handle = runOpportunity(params);
    } else {
      throw new Error(`Unknown job type: ${job.type}`);
    }
  } catch (err) {
    await db
      .update(jobs)
      .set({
        status: "failed",
        error: String(err),
        completedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    emitProgress(jobId, { done: true, error: String(err) });
    runningJobId = null;
    processQueue();
    return;
  }

  // Update to running
  await db
    .update(jobs)
    .set({
      status: "running",
      startedAt: new Date(),
      outputDir: handle.outputDir,
    })
    .where(eq(jobs.id, jobId));

  runningJobId = jobId;
  let currentProgress = 0;

  // Ensure log directory exists
  const logDir = resolve(process.cwd(), "..", "data", "logs");
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const logPath = resolve(logDir, `${jobId}.log`);
  await db.update(jobs).set({ logPath }).where(eq(jobs.id, jobId));

  // Stream stdout
  handle.process.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    appendFileSync(logPath, text);

    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const { progress, step } = parseProgress(job.type, line, currentProgress);
      if (progress > currentProgress) {
        currentProgress = progress;
        db.update(jobs).set({ progress, currentStep: step }).where(eq(jobs.id, jobId)).run();
      }
      emitProgress(jobId, { progress: currentProgress, step, line: line.trim() });
    }
  });

  // Stream stderr
  handle.process.stderr?.on("data", (chunk: Buffer) => {
    appendFileSync(logPath, chunk.toString());
  });

  // Handle exit
  handle.process.on("close", async (code) => {
    if (code === 0) {
      // Ingest results
      const reportId = await ingestResults(jobId, job.type, params, handle.outputDir);
      await db
        .update(jobs)
        .set({
          status: "done",
          progress: 100,
          currentStep: "完成",
          completedAt: new Date(),
          reportId,
        })
        .where(eq(jobs.id, jobId));
      emitProgress(jobId, {
        progress: 100,
        step: "完成",
        done: true,
        reportId: reportId || undefined,
      });
    } else {
      await db
        .update(jobs)
        .set({
          status: "failed",
          error: `Process exited with code ${code}`,
          completedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
      emitProgress(jobId, { done: true, error: `Process exited with code ${code}` });
    }

    // Clean up emitter after a delay (let SSE clients catch the final event)
    setTimeout(() => {
      jobEmitters.delete(jobId);
    }, 30_000);

    runningJobId = null;
    processQueue();
  });
}

// ── Result ingestion ──

async function ingestResults(
  jobId: string,
  jobType: string,
  params: Record<string, unknown>,
  outputDir: string,
): Promise<string | null> {
  try {
    // Find markdown reports
    if (!existsSync(outputDir)) return null;

    const files = readdirSync(outputDir);
    let reportFile: string | null = null;
    let reportType = "market-analysis";

    if (jobType === "discover") {
      reportFile = files.find((f) => f === "discovery-report.md") || null;
      reportType = "discovery";
    } else {
      reportFile =
        files.find((f) => f === "opportunity-report.md") ||
        files.find((f) => f === "report.md") ||
        files.find((f) => f.endsWith(".md")) ||
        null;
      reportType = reportFile?.includes("opportunity") ? "opportunity" : "market-analysis";
    }

    if (reportFile) {
      const content = readFileSync(join(outputDir, reportFile), "utf-8");
      const reportId = nanoid();
      const keyword = typeof params.keyword === "string" ? params.keyword : undefined;
      const category = typeof params.category === "string" ? params.category : undefined;

      await db.insert(reports).values({
        id: reportId,
        jobId,
        type: reportType,
        title:
          jobType === "discover"
            ? `品类发现: ${category || "unknown"}`
            : `选品分析: ${keyword || "unknown"}`,
        keyword,
        category,
        content,
        createdAt: new Date(),
      });

      return reportId;
    }

    // Ingest product JSON files
    const jsonFiles = files.filter(
      (f) => f.endsWith(".json") && !f.includes("keywords") && !f.includes("bestsellers"),
    );
    for (const jsonFile of jsonFiles) {
      try {
        const data = JSON.parse(readFileSync(join(outputDir, jsonFile), "utf-8"));
        if (!Array.isArray(data)) continue;
        const platform = jsonFile.replace(".json", "");
        const keyword = typeof params.keyword === "string" ? params.keyword : undefined;

        for (const p of data.slice(0, 200)) {
          // Cap at 200 per file
          await db.insert(products).values({
            jobId,
            platform,
            name: p.name || "",
            price:
              typeof p.price === "number"
                ? p.price
                : parseFloat(String(p.price || "0").replace(/[^\d.]/g, "")) || null,
            rating: parseFloat(p.rating) || null,
            reviews: parseInt(String(p.reviews || "0").replace(/\D/g, "")) || null,
            link: p.link || null,
            imageUrl: p.images?.[0] || null,
            keyword,
            createdAt: new Date(),
          });
        }
      } catch {
        // Skip unparseable files
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Queue management ──

function processQueue() {
  if (runningJobId || jobQueue.length === 0) return;
  const nextId = jobQueue.shift()!;
  executeJob(nextId);
}

export async function createAndStartJob(
  type: string,
  params: Record<string, unknown>,
  scheduleId?: string,
): Promise<string> {
  const id = nanoid();

  await db.insert(jobs).values({
    id,
    type,
    status: "pending",
    params: JSON.stringify(params),
    scheduleId: scheduleId || null,
    createdAt: new Date(),
  });

  // Create emitter before queuing
  getJobEmitter(id);

  jobQueue.push(id);
  processQueue();

  return id;
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) return false;

  if (job.status === "pending") {
    const idx = jobQueue.indexOf(jobId);
    if (idx >= 0) jobQueue.splice(idx, 1);
    await db
      .update(jobs)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(eq(jobs.id, jobId));
    return true;
  }

  // Can't cancel running jobs cleanly (would need to kill the child process)
  return false;
}
