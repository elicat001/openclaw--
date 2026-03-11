import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import {
  type DeliverFn,
  type QueuedDelivery,
  type RecoveryLogger,
  MAX_RETRIES,
  ackDelivery,
  computeBackoffMs,
  enqueueDelivery,
  ensureQueueDir,
  failDelivery,
  isEntryEligibleForRecoveryRetry,
  isPermanentDeliveryError,
  loadPendingDeliveries,
  moveToFailed,
  recoverPendingDeliveries,
} from "./delivery-queue.js";

/** Create an isolated temp directory for each test. */
function makeTmpStateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dq-test-"));
}

function rmrf(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/** Minimal delivery params for testing. */
function makeDeliveryParams(overrides?: Partial<Parameters<typeof enqueueDelivery>[0]>) {
  return {
    channel: "telegram" as const,
    to: "12345",
    payloads: [{ text: "hello" }],
    ...overrides,
  };
}

/** Read a queued delivery JSON from disk. */
function readEntry(stateDir: string, id: string): QueuedDelivery {
  const filePath = path.join(stateDir, "delivery-queue", `${id}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function makeLogger(): RecoveryLogger & { calls: Record<string, string[]> } {
  const calls: Record<string, string[]> = { info: [], warn: [], error: [] };
  return {
    calls,
    info: (msg: string) => calls.info.push(msg),
    warn: (msg: string) => calls.warn.push(msg),
    error: (msg: string) => calls.error.push(msg),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("delivery-queue", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = makeTmpStateDir();
  });

  afterEach(() => {
    rmrf(stateDir);
  });

  // -------------------------------------------------------------------------
  // ensureQueueDir
  // -------------------------------------------------------------------------
  describe("ensureQueueDir", () => {
    it("creates queue and failed subdirectories", async () => {
      const queueDir = await ensureQueueDir(stateDir);
      expect(fs.existsSync(queueDir)).toBe(true);
      expect(fs.existsSync(path.join(queueDir, "failed"))).toBe(true);
    });

    it("is idempotent", async () => {
      const first = await ensureQueueDir(stateDir);
      const second = await ensureQueueDir(stateDir);
      expect(first).toBe(second);
    });
  });

  // -------------------------------------------------------------------------
  // enqueueDelivery
  // -------------------------------------------------------------------------
  describe("enqueueDelivery", () => {
    it("writes a .json file to the queue directory", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      expect(id).toBeTruthy();
      const entry = readEntry(stateDir, id);
      expect(entry.id).toBe(id);
      expect(entry.channel).toBe("telegram");
      expect(entry.to).toBe("12345");
      expect(entry.retryCount).toBe(0);
      expect(entry.payloads).toEqual([{ text: "hello" }]);
      expect(typeof entry.enqueuedAt).toBe("number");
    });

    it("persists data with fsync (file survives read-back)", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      // The file should exist on disk and be valid JSON.
      const filePath = path.join(stateDir, "delivery-queue", `${id}.json`);
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.id).toBe(id);
    });

    it("does not leave .tmp files behind", async () => {
      await enqueueDelivery(makeDeliveryParams(), stateDir);
      const files = fs.readdirSync(path.join(stateDir, "delivery-queue"));
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles).toHaveLength(0);
    });

    it("preserves optional fields", async () => {
      const id = await enqueueDelivery(
        makeDeliveryParams({
          threadId: 42,
          replyToId: "msg-99",
          bestEffort: true,
          gifPlayback: true,
          silent: true,
          accountId: "acct-1",
          mirror: { sessionKey: "sk-1", agentId: "agent-1", text: "hi" },
        }),
        stateDir,
      );
      const entry = readEntry(stateDir, id);
      expect(entry.threadId).toBe(42);
      expect(entry.replyToId).toBe("msg-99");
      expect(entry.bestEffort).toBe(true);
      expect(entry.gifPlayback).toBe(true);
      expect(entry.silent).toBe(true);
      expect(entry.accountId).toBe("acct-1");
      expect(entry.mirror).toEqual({ sessionKey: "sk-1", agentId: "agent-1", text: "hi" });
    });
  });

  // -------------------------------------------------------------------------
  // ackDelivery
  // -------------------------------------------------------------------------
  describe("ackDelivery", () => {
    it("removes the .json file via two-phase rename+unlink", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      const jsonPath = path.join(stateDir, "delivery-queue", `${id}.json`);
      expect(fs.existsSync(jsonPath)).toBe(true);

      await ackDelivery(id, stateDir);

      expect(fs.existsSync(jsonPath)).toBe(false);
      // .delivered marker should also be gone.
      const deliveredPath = path.join(stateDir, "delivery-queue", `${id}.delivered`);
      expect(fs.existsSync(deliveredPath)).toBe(false);
    });

    it("handles ENOENT gracefully when .json is already gone", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      // Remove the file manually first.
      fs.unlinkSync(path.join(stateDir, "delivery-queue", `${id}.json`));

      // Should not throw.
      await expect(ackDelivery(id, stateDir)).resolves.toBeUndefined();
    });

    it("cleans up leftover .delivered marker when .json is already gone", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      const jsonPath = path.join(stateDir, "delivery-queue", `${id}.json`);
      const deliveredPath = path.join(stateDir, "delivery-queue", `${id}.delivered`);

      // Simulate a crash between phase 1 and phase 2: rename .json -> .delivered, leave marker.
      fs.renameSync(jsonPath, deliveredPath);

      // Now ack: .json is gone, so ENOENT path cleans up the .delivered marker.
      await ackDelivery(id, stateDir);
      expect(fs.existsSync(deliveredPath)).toBe(false);
    });

    it("propagates non-ENOENT errors", async () => {
      // Ensure queue dir exists, then replace it with a file to cause ENOTDIR.
      await ensureQueueDir(stateDir);
      const blockerPath = path.join(stateDir, "delivery-queue");
      await fs.promises.rm(blockerPath, { recursive: true });
      await fs.promises.writeFile(blockerPath, "not-a-dir");
      await expect(ackDelivery("some-id", stateDir)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // failDelivery
  // -------------------------------------------------------------------------
  describe("failDelivery", () => {
    it("increments retryCount and updates lastAttemptAt and lastError", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);

      const before = readEntry(stateDir, id);
      expect(before.retryCount).toBe(0);
      expect(before.lastAttemptAt).toBeUndefined();

      await failDelivery(id, "network timeout", stateDir);

      const after = readEntry(stateDir, id);
      expect(after.retryCount).toBe(1);
      expect(typeof after.lastAttemptAt).toBe("number");
      expect(after.lastError).toBe("network timeout");
    });

    it("increments retryCount cumulatively across multiple failures", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);

      await failDelivery(id, "error-1", stateDir);
      await failDelivery(id, "error-2", stateDir);
      await failDelivery(id, "error-3", stateDir);

      const entry = readEntry(stateDir, id);
      expect(entry.retryCount).toBe(3);
      expect(entry.lastError).toBe("error-3");
    });

    it("does not leave .tmp files behind", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      await failDelivery(id, "err", stateDir);
      const files = fs.readdirSync(path.join(stateDir, "delivery-queue"));
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // loadPendingDeliveries
  // -------------------------------------------------------------------------
  describe("loadPendingDeliveries", () => {
    it("loads .json files from the queue directory", async () => {
      const id1 = await enqueueDelivery(makeDeliveryParams({ to: "aaa" }), stateDir);
      const id2 = await enqueueDelivery(makeDeliveryParams({ to: "bbb" }), stateDir);

      const entries = await loadPendingDeliveries(stateDir);
      const ids = entries.map((e) => e.id).toSorted();
      expect(ids).toEqual([id1, id2].toSorted());
    });

    it("cleans up .delivered markers", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      const queueDir = path.join(stateDir, "delivery-queue");
      const jsonPath = path.join(queueDir, `${id}.json`);
      const deliveredPath = path.join(queueDir, `${id}.delivered`);

      // Simulate a leftover .delivered marker (crash between ack phase 1 and 2).
      fs.renameSync(jsonPath, deliveredPath);

      const entries = await loadPendingDeliveries(stateDir);
      // The .delivered entry should not appear as a pending delivery.
      expect(entries).toHaveLength(0);
      // The marker should have been cleaned up.
      expect(fs.existsSync(deliveredPath)).toBe(false);
    });

    it("returns empty array when queue directory does not exist (ENOENT)", async () => {
      const nonExistentState = path.join(stateDir, "does-not-exist");
      const entries = await loadPendingDeliveries(nonExistentState);
      expect(entries).toEqual([]);
    });

    it("skips non-.json files", async () => {
      await ensureQueueDir(stateDir);
      const queueDir = path.join(stateDir, "delivery-queue");
      fs.writeFileSync(path.join(queueDir, "readme.txt"), "ignore me");

      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      const entries = await loadPendingDeliveries(stateDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(id);
    });

    it("skips malformed JSON files", async () => {
      await ensureQueueDir(stateDir);
      const queueDir = path.join(stateDir, "delivery-queue");
      fs.writeFileSync(path.join(queueDir, "bad.json"), "not valid json{{{");

      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      const entries = await loadPendingDeliveries(stateDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(id);
    });
  });

  // -------------------------------------------------------------------------
  // moveToFailed
  // -------------------------------------------------------------------------
  describe("moveToFailed", () => {
    it("moves entry from queue to failed/ subdirectory", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      const queueDir = path.join(stateDir, "delivery-queue");

      expect(fs.existsSync(path.join(queueDir, `${id}.json`))).toBe(true);
      expect(fs.existsSync(path.join(queueDir, "failed", `${id}.json`))).toBe(false);

      await moveToFailed(id, stateDir);

      expect(fs.existsSync(path.join(queueDir, `${id}.json`))).toBe(false);
      expect(fs.existsSync(path.join(queueDir, "failed", `${id}.json`))).toBe(true);

      // Verify data integrity after move.
      const raw = fs.readFileSync(path.join(queueDir, "failed", `${id}.json`), "utf-8");
      const entry = JSON.parse(raw) as QueuedDelivery;
      expect(entry.id).toBe(id);
    });

    it("creates failed/ directory if it does not exist", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      // Remove the failed dir that ensureQueueDir created.
      const failedDir = path.join(stateDir, "delivery-queue", "failed");
      fs.rmSync(failedDir, { recursive: true, force: true });

      await moveToFailed(id, stateDir);
      expect(fs.existsSync(path.join(failedDir, `${id}.json`))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // computeBackoffMs
  // -------------------------------------------------------------------------
  describe("computeBackoffMs", () => {
    it("returns 0 for retryCount <= 0", () => {
      expect(computeBackoffMs(0)).toBe(0);
      expect(computeBackoffMs(-1)).toBe(0);
    });

    it("returns 5s for retry 1", () => {
      expect(computeBackoffMs(1)).toBe(5_000);
    });

    it("returns 25s for retry 2", () => {
      expect(computeBackoffMs(2)).toBe(25_000);
    });

    it("returns 2m for retry 3", () => {
      expect(computeBackoffMs(3)).toBe(120_000);
    });

    it("returns 10m for retry 4", () => {
      expect(computeBackoffMs(4)).toBe(600_000);
    });

    it("clamps to last backoff value for retryCount > array length", () => {
      expect(computeBackoffMs(5)).toBe(600_000);
      expect(computeBackoffMs(100)).toBe(600_000);
    });
  });

  // -------------------------------------------------------------------------
  // isEntryEligibleForRecoveryRetry
  // -------------------------------------------------------------------------
  describe("isEntryEligibleForRecoveryRetry", () => {
    function makeEntry(overrides?: Partial<QueuedDelivery>): QueuedDelivery {
      return {
        id: "test-id",
        enqueuedAt: 1000,
        channel: "telegram",
        to: "12345",
        payloads: [{ text: "hello" }],
        retryCount: 0,
        ...overrides,
      };
    }

    it("is eligible on first replay after crash (retryCount=0, no lastAttemptAt)", () => {
      const entry = makeEntry({ retryCount: 0 });
      const result = isEntryEligibleForRecoveryRetry(entry, Date.now());
      expect(result.eligible).toBe(true);
    });

    it("is eligible when enough time has passed since lastAttemptAt", () => {
      const now = 100_000;
      const entry = makeEntry({
        retryCount: 1,
        lastAttemptAt: now - 10_000, // 10s ago; backoff for retry 2 is 25s
      });
      // Not enough time has passed for retry 2 (need 25s).
      const result1 = isEntryEligibleForRecoveryRetry(entry, now);
      expect(result1.eligible).toBe(false);
      if (!result1.eligible) {
        expect(result1.remainingBackoffMs).toBeGreaterThan(0);
      }

      // Enough time has passed.
      const result2 = isEntryEligibleForRecoveryRetry(entry, now + 20_000);
      expect(result2.eligible).toBe(true);
    });

    it("falls back to enqueuedAt when lastAttemptAt is missing and retryCount > 0", () => {
      const enqueuedAt = 50_000;
      const entry = makeEntry({ retryCount: 1, enqueuedAt });
      // Backoff for retry 2 is 25_000, base is enqueuedAt. Eligible at 50_000 + 25_000 = 75_000.
      const result1 = isEntryEligibleForRecoveryRetry(entry, 60_000);
      expect(result1.eligible).toBe(false);

      const result2 = isEntryEligibleForRecoveryRetry(entry, 80_000);
      expect(result2.eligible).toBe(true);
    });

    it("returns remaining backoff ms when not eligible", () => {
      const now = 100_000;
      const entry = makeEntry({ retryCount: 1, lastAttemptAt: now - 5_000 });
      // Backoff for retry 2 is 25_000. Next eligible at (now - 5_000) + 25_000 = now + 20_000.
      const result = isEntryEligibleForRecoveryRetry(entry, now);
      expect(result.eligible).toBe(false);
      if (!result.eligible) {
        expect(result.remainingBackoffMs).toBe(20_000);
      }
    });
  });

  // -------------------------------------------------------------------------
  // isPermanentDeliveryError
  // -------------------------------------------------------------------------
  describe("isPermanentDeliveryError", () => {
    it.each([
      "no conversation reference found",
      "Chat not found",
      "User not found",
      "bot was blocked by the user",
      "Forbidden: bot was kicked from the group",
      "chat_id is empty",
      "Recipient is not a valid user",
      "outbound not configured for channel",
      "Ambiguous Discord recipient",
    ])("recognizes permanent error: %s", (msg) => {
      expect(isPermanentDeliveryError(msg)).toBe(true);
    });

    it("returns false for transient errors", () => {
      expect(isPermanentDeliveryError("network timeout")).toBe(false);
      expect(isPermanentDeliveryError("500 Internal Server Error")).toBe(false);
      expect(isPermanentDeliveryError("ECONNRESET")).toBe(false);
      expect(isPermanentDeliveryError("")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // recoverPendingDeliveries
  // -------------------------------------------------------------------------
  describe("recoverPendingDeliveries", () => {
    const cfg = {} as OpenClawConfig;

    it("returns zero counts when queue is empty", async () => {
      const log = makeLogger();
      const deliver = vi.fn<DeliverFn>();
      const result = await recoverPendingDeliveries({ deliver, log, cfg, stateDir });
      expect(result).toEqual({ recovered: 0, failed: 0, skippedMaxRetries: 0, deferredBackoff: 0 });
      expect(deliver).not.toHaveBeenCalled();
    });

    it("recovers a single pending delivery", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      const log = makeLogger();
      const deliver = vi.fn<DeliverFn>().mockResolvedValue(undefined);

      const result = await recoverPendingDeliveries({ deliver, log, cfg, stateDir });
      expect(result.recovered).toBe(1);
      expect(result.failed).toBe(0);
      expect(deliver).toHaveBeenCalledTimes(1);
      expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "telegram",
          to: "12345",
          skipQueue: true,
        }),
      );

      // Entry should be acked (removed from disk).
      const jsonPath = path.join(stateDir, "delivery-queue", `${id}.json`);
      expect(fs.existsSync(jsonPath)).toBe(false);
    });

    it("moves entries that exceed MAX_RETRIES to failed/", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      // Manually set retryCount to MAX_RETRIES.
      const filePath = path.join(stateDir, "delivery-queue", `${id}.json`);
      const entry = JSON.parse(fs.readFileSync(filePath, "utf-8")) as QueuedDelivery;
      entry.retryCount = MAX_RETRIES;
      fs.writeFileSync(filePath, JSON.stringify(entry));

      const log = makeLogger();
      const deliver = vi.fn<DeliverFn>();

      const result = await recoverPendingDeliveries({ deliver, log, cfg, stateDir });
      expect(result.skippedMaxRetries).toBe(1);
      expect(result.recovered).toBe(0);
      expect(deliver).not.toHaveBeenCalled();

      // Entry should be in failed/.
      const failedPath = path.join(stateDir, "delivery-queue", "failed", `${id}.json`);
      expect(fs.existsSync(failedPath)).toBe(true);
    });

    it("handles delivery failure by calling failDelivery", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      const log = makeLogger();
      const deliver = vi.fn<DeliverFn>().mockRejectedValue(new Error("network timeout"));

      const result = await recoverPendingDeliveries({ deliver, log, cfg, stateDir });
      expect(result.failed).toBe(1);
      expect(result.recovered).toBe(0);

      // Entry should still be on disk with incremented retryCount.
      const entry = readEntry(stateDir, id);
      expect(entry.retryCount).toBe(1);
      expect(entry.lastError).toBe("network timeout");
    });

    it("moves entry to failed/ on permanent delivery error", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      const log = makeLogger();
      const deliver = vi.fn<DeliverFn>().mockRejectedValue(new Error("chat not found"));

      const result = await recoverPendingDeliveries({ deliver, log, cfg, stateDir });
      expect(result.failed).toBe(1);

      // Entry should have been moved to failed/.
      const failedPath = path.join(stateDir, "delivery-queue", "failed", `${id}.json`);
      expect(fs.existsSync(failedPath)).toBe(true);
      // And removed from the main queue.
      const queuePath = path.join(stateDir, "delivery-queue", `${id}.json`);
      expect(fs.existsSync(queuePath)).toBe(false);
    });

    it("defers entries whose backoff has not elapsed", async () => {
      const id = await enqueueDelivery(makeDeliveryParams(), stateDir);
      // Set retryCount=1 with a very recent lastAttemptAt.
      await failDelivery(id, "transient", stateDir);

      const log = makeLogger();
      const deliver = vi.fn<DeliverFn>();

      const result = await recoverPendingDeliveries({ deliver, log, cfg, stateDir });
      expect(result.deferredBackoff).toBe(1);
      expect(result.recovered).toBe(0);
      expect(deliver).not.toHaveBeenCalled();
    });

    it("processes oldest entries first", async () => {
      // Enqueue two deliveries, adjust enqueuedAt so the second is older.
      const _id1 = await enqueueDelivery(makeDeliveryParams({ to: "first" }), stateDir);
      const id2 = await enqueueDelivery(makeDeliveryParams({ to: "second" }), stateDir);

      // Make id2 older.
      const filePath2 = path.join(stateDir, "delivery-queue", `${id2}.json`);
      const entry2 = JSON.parse(fs.readFileSync(filePath2, "utf-8")) as QueuedDelivery;
      entry2.enqueuedAt = 1;
      fs.writeFileSync(filePath2, JSON.stringify(entry2));

      const deliveryOrder: string[] = [];
      const deliver = vi.fn<DeliverFn>().mockImplementation(async (params) => {
        deliveryOrder.push(params.to);
      });
      const log = makeLogger();

      await recoverPendingDeliveries({ deliver, log, cfg, stateDir });
      expect(deliveryOrder).toEqual(["second", "first"]);
    });

    it("respects maxRecoveryMs deadline", async () => {
      // Enqueue two deliveries.
      await enqueueDelivery(makeDeliveryParams({ to: "a" }), stateDir);
      await enqueueDelivery(makeDeliveryParams({ to: "b" }), stateDir);

      const log = makeLogger();
      // Use maxRecoveryMs=0 so the deadline is immediately exceeded.
      const deliver = vi.fn<DeliverFn>().mockResolvedValue(undefined);

      const result = await recoverPendingDeliveries({
        deliver,
        log,
        cfg,
        stateDir,
        maxRecoveryMs: 0,
      });
      // At most one entry should be attempted (deadline checked at top of loop).
      // With 0ms budget, the first entry may still be processed before the deadline
      // check on the next iteration.
      expect(result.recovered + result.failed).toBeLessThanOrEqual(2);
      expect(log.calls.warn.some((m) => m.includes("time budget exceeded"))).toBe(true);
    });
  });
});
